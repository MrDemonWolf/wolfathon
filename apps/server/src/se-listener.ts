import { parseTip } from "@wolfathon/api/streamelements";
import { readSe, recordTip, writeSe } from "@wolfathon/api/store";
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
 * The JWT lives in D1 (the `streamelements` doc), NOT in env — so the operator can
 * paste/rotate it from the control panel without a redeploy. The server Worker's
 * cron pings `/ensure` every minute and the DO's own alarm re-arms; together they
 * connect, reconnect on a token change, and keep the socket alive across evictions.
 *
 * ⚠️ The Engine.IO framing + SE auth/event message shapes below follow SE's
 * documented socket.io v2 protocol but are UNVERIFIED against the live gateway —
 * validate once a JWT is set, then adjust the packet handling if needed.
 */

type Env = { DB: D1Database };

// socket.io v2 = Engine.IO v3.
const SE_REALTIME = "https://realtime.streamelements.com/socket.io/?EIO=3&transport=websocket";
const KEEPALIVE_MS = 20_000;
const SEEN_MAX = 300;

export class SEListener extends DurableObject<Env> {
	private ws: WebSocket | null = null;
	private connecting = false;
	private activeJwt: string | null = null; // the jwt the live socket authed with
	private seen: string[] = []; // recently-applied tip ids (dedupe replays)

	async fetch(req: Request): Promise<Response> {
		if (new URL(req.url).pathname.endsWith("/stop")) {
			this.teardown();
			await this.ctx.storage.deleteAlarm();
			return Response.json({ ok: true });
		}
		await this.ensureConnected();
		return Response.json({ ok: true });
	}

	async alarm(): Promise<void> {
		if (this.ws?.readyState === WebSocket.READY_STATE_OPEN) this.sendRaw("2"); // Engine.IO ping
		await this.ensureConnected();
		await this.ctx.storage.setAlarm(Date.now() + KEEPALIVE_MS);
	}

	private get db() {
		return createDb(this.env.DB);
	}

	private teardown(): void {
		this.ws?.close();
		this.ws = null;
		this.activeJwt = null;
	}

	/** Reconcile the live socket with the D1 token: connect, reconnect on change, or drop. */
	private async ensureConnected(): Promise<void> {
		const jwt = (await readSe(this.db)).jwt ?? null;
		const open = this.ws?.readyState === WebSocket.READY_STATE_OPEN;

		if (!jwt) {
			if (this.ws) this.teardown();
			return;
		}
		if (open && this.activeJwt === jwt) return; // already connected with the current token
		if (this.connecting) return;

		this.teardown();
		await this.openSocket(jwt);
		await this.ctx.storage.setAlarm(Date.now() + KEEPALIVE_MS);
	}

	private async openSocket(jwt: string): Promise<void> {
		this.connecting = true;
		try {
			// Cloudflare outbound WebSocket: fetch with Upgrade, then take resp.webSocket.
			const resp = await fetch(SE_REALTIME, { headers: { Upgrade: "websocket" } });
			const ws = resp.webSocket;
			if (!ws) {
				await this.setConnected(false, "socket upgrade failed");
				return;
			}
			ws.accept();
			this.ws = ws;
			this.activeJwt = jwt;
			ws.addEventListener("message", (e) =>
				this.onMessage(typeof e.data === "string" ? e.data : ""),
			);
			const drop = () => {
				if (this.ws === ws) {
					this.ws = null;
					this.activeJwt = null;
					void this.setConnected(false);
				}
			};
			ws.addEventListener("close", drop);
			ws.addEventListener("error", drop);
		} catch (e) {
			this.ws = null;
			this.activeJwt = null;
			await this.setConnected(false, e instanceof Error ? e.message : "connect failed");
		} finally {
			this.connecting = false;
		}
	}

	private async setConnected(connected: boolean, lastError?: string): Promise<void> {
		const prev = await readSe(this.db);
		await writeSe(this.db, { ...prev, connected, lastError });
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
			if (this.activeJwt) this.emit("authenticate", { method: "jwt", token: this.activeJwt });
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
		if (typeof event !== "string") return;

		if (event === "authenticated") {
			void this.setConnected(true);
			return;
		}
		if (!event.startsWith("event")) return; // "event" / "event:test"

		const tip = parseTip(payload);
		if (!tip || this.seen.includes(tip.id)) return;
		this.seen.push(tip.id);
		if (this.seen.length > SEEN_MAX) this.seen = this.seen.slice(-SEEN_MAX);
		// Fire-and-forget — the socket callback can't await, but the DO stays alive.
		void this.applyTip(tip);
	}

	private async applyTip(tip: { id: string; amount: number; who?: string }): Promise<void> {
		const db = this.db;
		await recordTip(db, tip, Date.now());
		const prev = await readSe(db);
		await writeSe(db, { ...prev, lastTipAt: Date.now() });
	}
}
