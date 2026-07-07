import { trpcServer } from "@hono/trpc-server";
import {
	buildGiftAnnouncement,
	buildGiveawayClaimAnnouncement,
	buildGiveawayDrawAnnouncement,
	buildGiveawayTimeoutAnnouncement,
	canRun,
	dynamicTemplate,
	fillTemplate,
	type GiftBatch,
	GIFT_BATCH_WINDOW_MS,
	giveawayValue,
	goalsValue,
	isPrivileged,
	markRun,
	matchCommand,
	mergeGiftBatch,
	timerValue,
	wheelValue,
	wolfathonValue,
} from "@wolfathon/api/bot";
import { createContext } from "@wolfathon/api/context";
import {
	applyGiveawayEvent,
	claimPending,
	expirePending,
	parseGiveawayEvent,
} from "@wolfathon/api/giveaway";
import { publicRouter } from "@wolfathon/api/routers/index";
import { autoPause, autoResume } from "@wolfathon/api/timer";
import {
	refreshUserToken,
	sendChatMessage,
	type TwitchDoc,
	TwitchAuthError,
	isTestEvent,
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
	readGiveaway,
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

		// Operator "Send test": signature + reachability + parse are now all proven
		// (we got past the 403/404 gates and parseEvent ran). Acknowledge without
		// applying time — a test must never move the clock, even mid-subathon.
		if (isTestEvent(type, event)) return c.body(null, 204);

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
			// Wolfathon time, then auto-resume on return. Opt-in (default on); resume
			// only fires when the pause was automatic, never overriding a manual one.
			await mutateTimer(db, (timer) => {
				if (!timer.config.autoPauseOnOffline) return timer;
				const state =
					type === "stream.offline" ? autoPause(timer.state, now) : autoResume(timer.state, now);
				return state === timer.state ? timer : { ...timer, state };
			});
		}
		if (timerEvent) {
			const { subsBefore, subsAfter } = await applyTimerEventAndBumpSubs(db, timerEvent, now);
			// A gift-sub event fires a batched chat announcement. It SENDs chat and
			// sleeps out a debounce window, so it runs in waitUntil after the 2xx.
			// Only fire when the count actually moved (bits/points do not bump subs).
			if (subsAfter > subsBefore) {
				c.executionCtx.waitUntil(handleGiftAnnouncement(db, twitch, event, timerEvent, now));
			}
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
			// Giveaway draw → claim flow rides the same "!" fast-path so the giveaway
			// doc is never read on the ordinary chat firehose. It announces a fresh
			// draw, accepts the winner's !claim, or surfaces a lapsed window.
			c.executionCtx.waitUntil(handleGiveawayClaim(db, twitch, event, chatText, now));
		}
		return c.body(null, 204);
	}
	return c.body(null, 204);
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
	} else if (cmd.dynamic === "giveaway") {
		// Live: the operator's giveaway rules/TOS link, set in the Giveaway tab.
		reply = fillTemplate(
			dynamicTemplate("giveaway", cmd.formatKey),
			giveawayValue(await readGiveaway(db)),
		);
	} else if (cmd.dynamic === "wolfathon") {
		// Composite Wolfathon status: enabled parts joined from live timer + state.
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

	await sendAsBot(db, twitch, reply);
}

/**
 * Drive the giveaway draw → claim chat flow from a "!"-prefixed chat line.
 *
 * Three outcomes, all decided + committed in ONE CAS so concurrent deliveries
 * can't double-announce, then the chosen line is sent once:
 *
 *  1. A fresh draw (`pendingClaim` not yet `announced`) → post the "you won, type
 *     !claim" line and flip `announced`.
 *  2. The winner types `!claim` within the window → mark claimed (clears
 *     `pendingClaim`) and post the confirmation.
 *  3. The window lapsed unclaimed → post the timeout line once (guarded by
 *     `timedOut`) and leave the pending winner in place so the dashboard prompts
 *     an operator redraw.
 *
 * ponytail: there's no background timer in a stateless Worker, so the timeout
 * fires on the NEXT "!" chat tick after the window lapses — not on a wall clock.
 * In a quiet chat the operator's dashboard countdown is the live signal; the
 * chat line just confirms it the next time anyone types a command.
 */
async function handleGiveawayClaim(
	db: Db,
	twitch: TwitchDoc,
	event: Record<string, unknown>,
	chatText: string,
	now: number,
): Promise<void> {
	const giveaway = await readGiveaway(db);
	if (!giveaway.pendingClaim) return; // nothing waiting → no giveaway-doc write

	const isClaim = chatText.trim().split(/\s+/)[0]?.toLowerCase() === "!claim";
	const login =
		typeof event.chatter_user_login === "string" ? event.chatter_user_login.toLowerCase() : "";

	// Decide + commit atomically. `line` is captured from the winning CAS apply so
	// we only send for the delivery that actually transitioned the doc.
	let line: string | null = null;
	await mutateGiveaway(db, (doc) => {
		const pc = doc.pendingClaim;
		if (!pc) return doc; // another delivery already resolved it
		line = null;
		// 1) Claim wins over a stale timeout: the winner spoke in time.
		if (isClaim && login) {
			const { doc: claimed, claimed: ok } = claimPending(doc, login, now);
			if (ok) {
				line = buildGiveawayClaimAnnouncement(pc.name);
				return claimed;
			}
		}
		// 2) Window lapsed unclaimed → announce the timeout once.
		if (expirePending(doc, now)) {
			if (!pc.timedOut) {
				line = buildGiveawayTimeoutAnnouncement(pc.name);
				return { ...doc, pendingClaim: { ...pc, timedOut: true } };
			}
			return doc; // already announced the timeout
		}
		// 3) Still in-window and undrawn-announce → post the "you won" line once.
		if (!pc.announced) {
			line = buildGiveawayDrawAnnouncement(pc.name);
			return { ...doc, pendingClaim: { ...pc, announced: true } };
		}
		return doc;
	});

	if (line) await sendAsBot(db, twitch, line);
}

/**
 * Send one chat line as the connected bot account, refreshing the token first.
 * No-ops (rather than throws) when the bot isn't connected or creds are missing,
 * so the milestone/gift announcers and command replies share one safe send path.
 */
async function sendAsBot(db: Db, twitch: TwitchDoc, message: string): Promise<void> {
	if (!message.trim()) return;
	if (!twitch.bot || !twitch.broadcasterId || !env.TWITCH_CLIENT_ID) return;
	const token = await ensureBotToken(db, twitch.bot);
	if (!token) return;
	await sendChatMessage({
		clientId: env.TWITCH_CLIENT_ID,
		botToken: token,
		broadcasterId: twitch.broadcasterId,
		senderId: twitch.bot.userId,
		message,
	});
}

/** Resolve after `ms` — used to debounce the gift-sub announcement inside waitUntil. */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fold a gift-sub event into a pending burst, then schedule a single delayed
 * flush so a sub-train collapses into one chat line.
 *
 * ponytail: the gift debounce uses waitUntil + setTimeout, not a Durable Object —
 * fine for one channel's gift rate; a burst that outlives the worker (~30s) would
 * lose its trailing flush, at which point a DO alarm is the upgrade.
 */
async function handleGiftAnnouncement(
	db: Db,
	twitch: TwitchDoc,
	event: Record<string, unknown>,
	timerEvent: NonNullable<ReturnType<typeof parseEvent>>,
	now: number,
): Promise<void> {
	if (timerEvent.kind === "gift") {
		const bot = await readBot(db);
		if (bot.enabled && bot.announceGifts) {
			const login = typeof event.user_login === "string" ? event.user_login : "";
			const name = typeof event.user_name === "string" ? event.user_name : login || "Anonymous";
			await mutateBot(db, (d) => ({
				...d,
				giftBatch: mergeGiftBatch(d.giftBatch, { login, name }, timerEvent.count, now),
			}));
			await flushGiftBatch(db, twitch);
		}
	}
}

/**
 * Wait out the debounce window, then claim + announce the pending gift burst.
 * The claim is a compare-and-swap: only the flush whose window has elapsed clears
 * the batch and sends, so overlapping deliveries collapse into ONE chat line.
 */
async function flushGiftBatch(db: Db, twitch: TwitchDoc): Promise<void> {
	await sleep(GIFT_BATCH_WINDOW_MS);
	let toSend: GiftBatch | null = null;
	await mutateBot(db, (d) => {
		const batch = d.giftBatch;
		if (batch && Date.now() - batch.firstAt >= GIFT_BATCH_WINDOW_MS) {
			toSend = batch;
			return { ...d, giftBatch: null };
		}
		toSend = null;
		return d; // unchanged ref → no write (another flush already claimed it)
	});
	if (!toSend) return;
	const timer = await readTimer(db);
	const minutes = Math.round((toSend as GiftBatch).subs * timer.config.giftSubMinutes);
	await sendAsBot(db, twitch, buildGiftAnnouncement(toSend, minutes));
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
