import { trpcServer } from "@hono/trpc-server";
import {
	canRun,
	dynamicTemplate,
	fillTemplate,
	goalsValue,
	isPrivileged,
	markRun,
	matchCommand,
	timerValue,
	wheelValue,
	wolfathonValue,
} from "@wolfathon/api/bot";
import { createContext } from "@wolfathon/api/context";
import { applyGiveawayEvent, parseGiveawayEvent } from "@wolfathon/api/giveaway";
import { publicRouter } from "@wolfathon/api/routers/index";
import { autoPause, autoResume } from "@wolfathon/api/timer";
import { isAllowedEmoteUrl } from "@wolfathon/api/timer";
import {
	refreshUserToken,
	sendChatMessage,
	type TwitchDoc,
	TwitchAuthError,
	parseEvent,
	verifyEventsubSignature,
} from "@wolfathon/api/twitch";
import {
	applyTimerEventAndBumpSubs,
	mutateBot,
	mutateGiveaway,
	mutateTimer,
	mutateTwitch,
	readBot,
	readState,
	readTimer,
	readWheel,
	readTwitch,
} from "@wolfathon/api/store";
import { createDb, type Db } from "@wolfathon/db";
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
		// Chat-bot replies. A "!"-prefixed chat line may trigger a bot command; the
		// reply (a Twitch API call) runs in waitUntil so the webhook returns its 2xx
		// immediately. The message id is already deduped above, so a Twitch retry
		// won't double-reply.
		if (
			type === "channel.chat.message" &&
			typeof chatText === "string" &&
			chatText.trim().startsWith("!")
		) {
			c.executionCtx.waitUntil(handleBotCommand(db, twitch, event, now));
		}
		return c.body(null, 204);
	}
	return c.body(null, 204);
});

/**
 * Self-hosted emote proxy. The overlays rewrite each Twitch/3rd-party emote image
 * to `/emote?u=<cdn url>`; we serve it from R2, lazily mirroring on the first miss
 * (cache-on-read) so a stream never depends on a third-party CDN staying up. `u`
 * is gated to the emote-CDN allowlist (`isAllowedEmoteUrl`) so this can't proxy
 * arbitrary hosts. Images are immutable per URL, so cache hard.
 */
const EMOTE_CACHE = "public, max-age=31536000, immutable";
// Emote images are tiny (a few KB). Cap stored/served bytes so the unauthenticated
// proxy can't be coerced into mirroring large bodies into R2.
const EMOTE_MAX_BYTES = 2_000_000;
app.get("/emote", async (c) => {
	const u = c.req.query("u");
	if (!u || !isAllowedEmoteUrl(u)) return c.text("bad emote url", 400);
	// Canonicalize to origin+path (host already allowlisted): dropping query +
	// fragment stops `?u=…?x=1`, `…?x=2`, … from minting unbounded distinct R2 keys
	// for one image (open-cache write/cost amplification).
	const parsed = new URL(u);
	const src = parsed.origin + parsed.pathname;
	const key = src.slice("https://".length);

	const hit = await env.EMOTES.get(key);
	if (hit) {
		return new Response(hit.body, {
			headers: {
				"content-type": hit.httpMetadata?.contentType ?? "image/png",
				"cache-control": EMOTE_CACHE,
			},
		});
	}

	// redirect:"manual" so an allowlisted CDN can't 3xx us onto an off-allowlist
	// host (isAllowedEmoteUrl only checks the initial URL). Any non-2xx — including
	// a redirect — is treated as a miss/failure.
	const res = await fetch(src, { redirect: "manual" });
	if (!res.ok) return c.text("emote fetch failed", 502);
	if (Number(res.headers.get("content-length") ?? "0") > EMOTE_MAX_BYTES) {
		return c.text("emote too large", 502);
	}
	const body = await res.arrayBuffer();
	if (body.byteLength > EMOTE_MAX_BYTES) return c.text("emote too large", 502);
	const contentType = res.headers.get("content-type") ?? "image/png";
	// Store for next time; serving doesn't block on a put failure.
	await env.EMOTES.put(key, body, { httpMetadata: { contentType } }).catch(() => {});
	return new Response(body, {
		headers: { "content-type": contentType, "cache-control": EMOTE_CACHE },
	});
});

app.get("/", (c) => c.text("Wolfathon public API — OK"));

/**
 * Match a "!" chat command and reply as the connected bot account. Reading chat
 * is free (the broadcaster's existing `channel.chat.message` subscription); only
 * the SEND needs the bot's token. Live commands render fresh timer/goal/wheel
 * data; text commands use the operator's stored reply.
 */
async function handleBotCommand(
	db: Db,
	twitch: TwitchDoc,
	event: Record<string, unknown>,
	now: number,
): Promise<void> {
	const bot = await readBot(db);
	const text =
		typeof (event.message as { text?: unknown } | undefined)?.text === "string"
			? (event.message as { text: string }).text
			: "";
	const cmd = matchCommand(bot, text);
	if (!cmd) return;

	// Never react to the bot's own messages (its replies don't start with "!", but
	// guard anyway against a self-trigger loop).
	if (twitch.bot && event.chatter_user_id === twitch.bot.userId) return;

	// Need a connected bot account, a known channel, and app creds to send at all.
	if (!twitch.bot || !twitch.broadcasterId || !env.TWITCH_CLIENT_ID) return;

	let reply: string;
	if (cmd.dynamic === "timer") {
		reply = fillTemplate(
			dynamicTemplate("timer", cmd.formatKey),
			timerValue(await readTimer(db), now),
		);
	} else if (cmd.dynamic === "goals") {
		reply = fillTemplate(dynamicTemplate("goals", cmd.formatKey), goalsValue(await readState(db)));
	} else if (cmd.dynamic === "wheel") {
		reply = fillTemplate(dynamicTemplate("wheel", cmd.formatKey), wheelValue(await readWheel(db)));
	} else if (cmd.dynamic === "wolfathon") {
		// Composite subathon status: enabled parts joined from live timer + state.
		const [timer, data] = await Promise.all([readTimer(db), readState(db)]);
		reply = wolfathonValue(cmd, timer, data, now);
	} else {
		reply = cmd.response;
	}
	if (!reply.trim()) return;

	const privileged = isPrivileged(event);
	// Anti-spam: normal viewers share a per-command cooldown; broadcaster/mod/VIP
	// bypass it. Claim the slot ATOMICALLY before sending — CAS serializes
	// concurrent deliveries so a burst can't double-reply. Trade-off: a
	// claimed-then-failed send consumes the window, which is rarer (and less
	// annoying) than the double-reply it prevents.
	if (!privileged) {
		let allowed = false;
		await mutateBot(db, (d) => {
			const c = d.commands.find((x) => x.id === cmd.id);
			const ok = !!c && canRun(c, d.cooldownSeconds, now, false);
			allowed = ok;
			return ok ? markRun(d, cmd.id, now) : d;
		});
		if (!allowed) return;
	}

	const token = await ensureBotToken(db, twitch.bot);
	if (!token) return;
	await sendChatMessage({
		clientId: env.TWITCH_CLIENT_ID,
		botToken: token,
		broadcasterId: twitch.broadcasterId,
		senderId: twitch.bot.userId,
		message: reply,
	});
}

/**
 * A valid bot user token, refreshing (and persisting the rotated tokens) when
 * within a minute of expiry. Null if refresh fails — the caller skips the reply
 * rather than send with a dead token. ponytail: a thundering herd of refreshes
 * right at expiry would leave all-but-one failing; rare given the cooldown + low
 * command volume, and the next command reads the persisted fresh token.
 */
async function ensureBotToken(db: Db, bot: NonNullable<TwitchDoc["bot"]>): Promise<string | null> {
	if (Date.now() < bot.expiresAt - 60_000) return bot.accessToken;
	if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return null;
	try {
		const t = await refreshUserToken({
			clientId: env.TWITCH_CLIENT_ID,
			clientSecret: env.TWITCH_CLIENT_SECRET,
			refreshToken: bot.refreshToken,
		});
		const expiresAt = Date.now() + t.expiresIn * 1000;
		await mutateTwitch(db, (d) =>
			d.bot
				? {
						...d,
						bot: {
							...d.bot,
							accessToken: t.accessToken,
							refreshToken: t.refreshToken,
							expiresAt,
							tokenInvalid: false,
						},
					}
				: d,
		);
		return t.accessToken;
	} catch (err) {
		// A 4xx means the refresh token is permanently dead (revoked grant / changed
		// password) — flag it so the dashboard prompts a reconnect instead of the bot
		// silently no-opping forever. A 5xx/network blip is transient: leave the flag
		// so the next command just retries.
		const status = err instanceof TwitchAuthError ? err.status : 0;
		if (status >= 400 && status < 500) {
			await mutateTwitch(db, (d) => (d.bot ? { ...d, bot: { ...d.bot, tokenInvalid: true } } : d));
		}
		return null;
	}
}

export default app;
