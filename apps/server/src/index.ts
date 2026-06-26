import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@wolfathon/api/context";
import { applyGiveawayEvent, parseGiveawayEvent } from "@wolfathon/api/giveaway";
import { publicRouter } from "@wolfathon/api/routers/index";
import { subsFromEvent } from "@wolfathon/api/state";
import { applyEvent, autoPause, autoResume } from "@wolfathon/api/timer";
import { parseEvent, verifyEventsubSignature } from "@wolfathon/api/twitch";
import {
	readGiveaway,
	readState,
	readTimer,
	readTwitch,
	writeGiveaway,
	writeState,
	writeTimer,
	writeTwitch,
} from "@wolfathon/api/store";
import { createDb } from "@wolfathon/db";
import { env } from "@wolfathon/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

/**
 * Public overlay API (Cloudflare Worker).
 *
 * Hosts the note-stripped `publicRouter` (overlays poll here) plus the Twitch
 * EventSub webhook. Operator (protected) procedures live behind Cloudflare
 * Access in the web app's `/api/trpc` route, NOT here. See README → "Architecture".
 */
const app = new Hono();

app.use(logger());
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
	}),
);

app.use(
	"/trpc/*",
	trpcServer({
		router: publicRouter,
		createContext: (_opts, c) =>
			createContext({
				db: createDb(env.DB),
				headers: c.req.raw.headers,
				// No protected procedures are mounted here, so Access is irrelevant.
				access: { teamDomain: undefined, aud: undefined, disabled: false },
			}),
	}),
);

/**
 * Twitch EventSub webhook (public, but HMAC-verified). Twitch POSTs sub / gift /
 * bits / channel-point events here; verified events add time to the timer.
 */
app.post("/twitch/eventsub", async (c) => {
	const raw = await c.req.text();
	const db = createDb(env.DB);
	const twitch = await readTwitch(db);

	// No secret = not connected; reject so nothing can be spoofed in.
	if (!twitch.webhookSecret) return c.text("not configured", 404);

	const valid = await verifyEventsubSignature(c.req.raw.headers, raw, twitch.webhookSecret);
	if (!valid) return c.text("invalid signature", 403);

	const messageType = c.req.header("twitch-eventsub-message-type");
	const body = JSON.parse(raw) as {
		challenge?: string;
		subscription?: { type?: string };
		event?: Record<string, unknown>;
	};

	if (messageType === "webhook_callback_verification") {
		return c.text(body.challenge ?? "", 200);
	}
	if (messageType === "revocation") {
		return c.body(null, 204);
	}
	if (messageType === "notification") {
		const type = body.subscription?.type ?? "";
		const event = body.event ?? {};
		const messageId = c.req.header("twitch-eventsub-message-id") ?? "";

		const timerEvent = parseEvent(type, event);

		// Cheap pre-filter so the chat firehose stays free: only gifts and
		// "!"-prefixed chat messages can be giveaway events. Everything else (the
		// vast majority of chat) returns here with zero giveaway D1 access.
		// NOTE: the raffle command must start with "!" for this gate to see it.
		const chatText = (event.message as { text?: unknown } | undefined)?.text;
		const maybeGiveaway =
			type === "channel.subscription.gift" ||
			(type === "channel.chat.message" &&
				typeof chatText === "string" &&
				chatText.trim().startsWith("!"));

		const isStreamState = type === "stream.offline" || type === "stream.online";

		// Nothing actionable → skip dedup write + all giveaway/timer reads.
		if (!timerEvent && !maybeGiveaway && !isStreamState) return c.body(null, 204);

		const recent = twitch.recentEventIds ?? [];
		if (messageId && recent.includes(messageId)) return c.body(null, 204); // already processed

		const now = Date.now();
		if (isStreamState) {
			// Stream went down / came back — auto-pause so an outage doesn't burn
			// subathon time, then auto-resume on return. Opt-in (default on); resume
			// only fires when the pause was automatic, never overriding a manual one.
			const timer = await readTimer(db);
			if (timer.config.autoPauseOnOffline) {
				const state =
					type === "stream.offline" ? autoPause(timer.state, now) : autoResume(timer.state, now);
				if (state !== timer.state) await writeTimer(db, { ...timer, state });
			}
		}
		if (timerEvent) {
			const timer = await readTimer(db);
			const { state } = applyEvent(timer.config, timer.state, timerEvent, now);
			await writeTimer(db, { ...timer, state });
			// Sub/gift events also bump the goals' running sub count.
			const subs = subsFromEvent(timerEvent);
			if (subs > 0) {
				const data = await readState(db);
				await writeState(db, { ...data, currentSubs: (data.currentSubs ?? 0) + subs });
			}
		}
		if (maybeGiveaway) {
			const giveaway = await readGiveaway(db);
			const gEvent = parseGiveawayEvent(type, event, giveaway.config.command);
			if (gEvent) await writeGiveaway(db, applyGiveawayEvent(giveaway, gEvent, now));
		}
		await writeTwitch(db, { ...twitch, recentEventIds: [messageId, ...recent].slice(0, 50) });
		return c.body(null, 204);
	}
	return c.body(null, 204);
});

app.get("/", (c) => c.text("Wolfathon public API — OK"));

export default app;
