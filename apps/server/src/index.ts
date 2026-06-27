import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@wolfathon/api/context";
import { applyGiveawayEvent, parseGiveawayEvent } from "@wolfathon/api/giveaway";
import { publicRouter } from "@wolfathon/api/routers/index";
import { autoPause, autoResume } from "@wolfathon/api/timer";
import { parseEvent, verifyEventsubSignature } from "@wolfathon/api/twitch";
import {
	applyTimerEventAndBumpSubs,
	mutateGiveaway,
	mutateTimer,
	mutateTwitch,
	readTwitch,
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

// Redact the overlay token (`?t=...`) from request logs — the public Worker logs
// every path, and the token is the overlays' only credential (see sec audit).
app.use(
	logger((message, ...rest) => console.log(message.replace(/\?\S+/, "?[redacted]"), ...rest)),
);
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

		// Idempotency: record the message id BEFORE applying side effects, so a
		// retried delivery short-circuits the dedup check above. Trade-off: if the
		// handler crashes mid-apply, the event is dropped (lost time) rather than
		// double-counted on retry — the safer failure mode, since over-counting
		// silently inflates the timer and is unrecoverable, and Twitch's
		// at-least-once delivery already tolerates the occasional loss. mutateTwitch
		// is compare-and-swap, so concurrent deliveries can't clobber each other's ids.
		if (messageId) {
			await mutateTwitch(db, (doc) => ({
				...doc,
				recentEventIds: [messageId, ...(doc.recentEventIds ?? [])].slice(0, 50),
			}));
		}

		const now = Date.now();
		if (isStreamState) {
			// Stream went down / came back — auto-pause so an outage doesn't burn
			// subathon time, then auto-resume on return. Opt-in (default on); resume
			// only fires when the pause was automatic, never overriding a manual one.
			await mutateTimer(db, (timer) => {
				if (!timer.config.autoPauseOnOffline) return timer;
				const state =
					type === "stream.offline" ? autoPause(timer.state, now) : autoResume(timer.state, now);
				return state === timer.state ? timer : { ...timer, state };
			});
		}
		if (timerEvent) {
			await applyTimerEventAndBumpSubs(db, timerEvent, now);
		}
		if (maybeGiveaway) {
			await mutateGiveaway(db, (giveaway) => {
				const gEvent = parseGiveawayEvent(type, event, giveaway.config.command);
				return gEvent ? applyGiveawayEvent(giveaway, gEvent, now) : giveaway;
			});
		}
		return c.body(null, 204);
	}
	return c.body(null, 204);
});

app.get("/", (c) => c.text("Wolfathon public API — OK"));

export default app;
