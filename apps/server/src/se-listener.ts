import { recordTip, parseTip } from "@wolfathon/api/streamelements";
import { createDb } from "@wolfathon/db";
import { DurableObject } from "cloudflare:workers";

/**
 * StreamElements realtime listener (Durable Object).
 *
 * Holds ONE persistent socket.io (Engine.IO v3) connection to StreamElements'
 * realtime gateway, authenticates with the channel JWT, and applies every tip to
 * the timer + goals via {@link recordTip}. The timer itself stays timestamp-based
 * and DO-free; this DO exists only because a long-lived outbound socket can't.
 *
 * Lifecycle: the server Worker's cron pings `/ensure` every minute and the DO's
 * own alarm re-arms — together they (re)connect and keep the socket alive across
 * evictions. Nothing starts until `SE_JWT` is present.
 *
 * ⚠️ The Engine.IO framing + SE auth/event message shapes below follow SE's
 * documented socket.io v2 protocol but are UNVERIFIED against the live gateway —
 * validate once SE_JWT is set, then adjust the packet handling if needed.
 */

type Env = {
	DB: D1Database;
	SE_JWT?: string;
	SE_CHANNEL_ID?: string;
};

// socket.io v2 = Engine.IO v3.
const SE_REALTIME = "https://realtime.streamelements.com/socket.io/?EIO=3&transport=websocket";
const KEEPALIVE_MS = 20_000;
const SEEN_MAX = 300;

export class SEListener extends DurableObject<Env> {
	private ws: WebSocket | null = null;
	private connecting = false;
	private seen: string[] = []; // recently-applied tip ids (dedupe replays)

	async fetch(req: Request): Promise<Response> {
		const path = new URL(req.url).pathname;
		if (path.endsWith("/status")) {
			return Response.json({
				connected: this.ws?.readyState === WebSocket.READY_STATE_OPEN,
				hasJwt: Boolean(this.env.SE_JWT),
			});
		}
		if (path.endsWith("/stop")) {
			this.ws?.close();
			this.ws = null;
			await this.ctx.storage.deleteAlarm();
			return Response.json({ ok: true });
		}
		await this.ensureConnected();
		return Response.json({ ok: true });
	}

	async alarm(): Promise<void> {
		if (!this.env.SE_JWT) return;
		if (this.ws?.readyState === WebSocket.READY_STATE_OPEN) {
			this.sendRaw("2"); // Engine.IO ping
		} else {
			await this.openSocket();
		}
		await this.ctx.storage.setAlarm(Date.now() + KEEPALIVE_MS);
	}

	private async ensureConnected(): Promise<void> {
		if (!this.env.SE_JWT) return;
		const open = this.ws?.readyState;
		if (open === WebSocket.READY_STATE_OPEN || this.connecting) return;
		await this.openSocket();
		await this.ctx.storage.setAlarm(Date.now() + KEEPALIVE_MS);
	}

	private async openSocket(): Promise<void> {
		if (this.connecting) return;
		this.connecting = true;
		try {
			// Cloudflare outbound WebSocket: fetch with Upgrade, then take resp.webSocket.
			const resp = await fetch(SE_REALTIME, { headers: { Upgrade: "websocket" } });
			const ws = resp.webSocket;
			if (!ws) return;
			ws.accept();
			this.ws = ws;
			ws.addEventListener("message", (e) =>
				this.onMessage(typeof e.data === "string" ? e.data : ""),
			);
			const drop = () => {
				if (this.ws === ws) this.ws = null;
			};
			ws.addEventListener("close", drop);
			ws.addEventListener("error", drop);
		} catch {
			this.ws = null;
		} finally {
			this.connecting = false;
		}
	}

	private sendRaw(data: string): void {
		try {
			this.ws?.send(data);
		} catch {
			this.ws = null;
		}
	}

	/** Emit a socket.io event: Engine.IO message(4) + socket.io event(2) + payload. */
	private emit(name: string, payload: unknown): void {
		this.sendRaw(`42${JSON.stringify([name, payload])}`);
	}

	private onMessage(data: string): void {
		if (!data) return;
		const eio = data[0]; // Engine.IO packet type
		if (eio === "0") return; // open handshake — wait for socket.io connect ("40")
		if (eio === "1") {
			this.ws = null;
			return;
		}
		if (eio === "2") {
			this.sendRaw("3"); // ping → pong
			return;
		}
		if (eio === "3") return; // pong
		if (eio !== "4") return; // only socket.io messages past here

		const sio = data[1]; // socket.io packet type
		if (sio === "0") {
			// connected to the namespace → authenticate with the channel JWT.
			this.emit("authenticate", { method: "jwt", token: this.env.SE_JWT });
			return;
		}
		if (sio !== "2") return; // only events

		let frame: unknown;
		try {
			frame = JSON.parse(data.slice(2));
		} catch {
			return;
		}
		if (!Array.isArray(frame)) return;
		const [event, payload] = frame as [string, unknown];
		if (typeof event !== "string" || !event.startsWith("event")) return; // "event" / "event:test"

		const tip = parseTip(payload);
		if (!tip || this.seen.includes(tip.id)) return;
		this.seen.push(tip.id);
		if (this.seen.length > SEEN_MAX) this.seen = this.seen.slice(-SEEN_MAX);
		// Fire-and-forget — the socket callback can't await, but the DO stays alive.
		void recordTip(createDb(this.env.DB), tip, Date.now());
	}
}
