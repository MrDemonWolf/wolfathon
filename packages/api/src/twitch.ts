/**
 * Twitch integration for the Wolfathon timer.
 *
 * Auth model (see README):
 *  - One confidential Twitch app. `client_id` + `client_secret` come from the
 *    web Worker's env (`TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`), NOT the DB.
 *  - The broadcaster authorizes scopes ONCE via the OAuth Authorization Code
 *    (redirect) flow: control panel → Twitch consent → `/api/twitch/callback`.
 *  - EventSub uses **webhook** transport (Twitch POSTs to the public server
 *    Worker), so no persistent connection / Durable Object is needed.
 *  - The Worker manages subscriptions with an **app access token**
 *    (client_credentials) and verifies every event by HMAC.
 *
 * Only the resulting tokens live in the `twitch` D1 row, and never reach a
 * public response.
 */

import type { TimerEvent } from "./timer";
import { randomToken } from "./util";

export const TWITCH_SCOPES = [
	"channel:read:subscriptions",
	"bits:read",
	"channel:read:redemptions",
	// Create/delete the timer's channel-point rewards on the broadcaster's channel
	// (Helix createCustomReward / deleteCustomReward, which require the broadcaster's
	// USER token). NOTE: added after some operators first connected — they must
	// reconnect Twitch once to re-grant, or createChannelReward 401s.
	"channel:manage:redemptions",
	// Read chat so the giveaway `!enter` raffle can ingest entries via EventSub.
	// channel.chat.message over webhook uses our APP token, which Twitch requires
	// to also carry user:bot (chatting user) + channel:bot (broadcaster) — without
	// them sub-create returns 403 "subscription missing proper authorization".
	"user:read:chat",
	"user:bot",
	"channel:bot",
] as const;

/**
 * Scopes the SEPARATE bot account grants. `user:write:chat` is what Helix
 * `POST /chat/messages` actually requires to send; `user:bot` marks the traffic
 * as a bot. The bot reads chat through the broadcaster's existing subscription,
 * so it needs no read scope here.
 */
export const BOT_SCOPES = ["user:write:chat", "user:bot"] as const;

/**
 * EventSub subscription types we create on connect. Most condition only on the
 * broadcaster; `channel.chat.message` additionally needs `user_id` (the user
 * whose chat view we read — the broadcaster reading their own chat).
 */
const SUBSCRIPTIONS: { type: string; version: string; needsUserId?: boolean }[] = [
	{ type: "channel.subscribe", version: "1" },
	{ type: "channel.subscription.message", version: "1" },
	{ type: "channel.subscription.gift", version: "1" },
	{ type: "channel.cheer", version: "1" },
	{ type: "channel.channel_points_custom_reward_redemption.add", version: "1" },
	// stream.offline / stream.online drive auto-pause + auto-resume (opt-in via
	// timer config `autoPauseOnOffline`); no scope needed.
	{ type: "stream.offline", version: "1" },
	{ type: "stream.online", version: "1" },
	// Giveaway raffle entries. High volume — the webhook handler filters to the
	// `!enter` command before touching the giveaway doc.
	{ type: "channel.chat.message", version: "1", needsUserId: true },
];

/**
 * The separately-connected chat bot account (own OAuth grant). The bot's user
 * token sends chat via Helix; reading chat reuses the broadcaster's existing
 * `channel.chat.message` subscription, so the bot needs no EventSub of its own.
 */
export type BotAccount = {
	userId: string;
	login: string;
	accessToken: string;
	refreshToken: string;
	/** Epoch ms the bot's user token expires — refreshed on demand before sending. */
	expiresAt: number;
	/**
	 * Set when a token refresh is rejected (revoked grant / changed password): the
	 * bot is silently dead until reconnected, so the dashboard surfaces a reconnect
	 * prompt instead of the bot no-opping forever. Cleared on the next good refresh.
	 */
	tokenInvalid?: boolean;
};

/** Persisted Twitch state (secret — never public). */
export type TwitchDoc = {
	broadcasterId?: string;
	broadcasterLogin?: string;
	/** Transient CSRF token for the redirect flow; set on startAuth, cleared on callback. */
	oauthState?: string;
	/** Transient CSRF token for the SEPARATE bot-account connect flow. */
	botOauthState?: string;
	accessToken?: string; // user token from the auth-code flow (proves the grant)
	refreshToken?: string;
	expiresAt?: number;
	webhookSecret?: string;
	subscriptionIds?: string[];
	/** EventSub types that failed to (re)create on the last connect — empty/absent = all good. */
	failedSubscriptionTypes?: string[];
	/** Full "type: status text" for each failed sub — the reason, for diagnosis. */
	failedSubscriptionReasons?: string[];
	/** Recent EventSub message ids for idempotency. */
	recentEventIds?: string[];
	connected?: boolean;
	/** The connected chat bot account (absent until the operator connects one). */
	bot?: BotAccount;
};

export function defaultTwitchDoc(): TwitchDoc {
	return {};
}

/** Masked status safe to return to the (Access-gated) control panel. */
export type TwitchStatus = {
	hasCredentials: boolean;
	connected: boolean;
	broadcasterLogin?: string;
	subscriptionCount: number;
	/** How many EventSub subscriptions a full connect creates (for "X of N" display). */
	expectedSubscriptionCount: number;
	/** Subscription types that failed to create — non-empty means a degraded connect. */
	failedSubscriptionTypes: string[];
	/** Full reason per failed sub ("type: status text") — for diagnosing a degraded connect. */
	failedSubscriptionReasons: string[];
};

/** `hasCredentials` reflects the env-provided app creds, not the DB. */
export function toStatus(doc: TwitchDoc, hasCredentials: boolean): TwitchStatus {
	return {
		hasCredentials,
		connected: Boolean(doc.connected),
		broadcasterLogin: doc.broadcasterLogin,
		subscriptionCount: doc.subscriptionIds?.length ?? 0,
		expectedSubscriptionCount: SUBSCRIPTIONS.length,
		failedSubscriptionTypes: doc.failedSubscriptionTypes ?? [],
		failedSubscriptionReasons: doc.failedSubscriptionReasons ?? [],
	};
}

const ID = "https://id.twitch.tv/oauth2";
const HELIX = "https://api.twitch.tv/helix";

/**
 * The auth headers every Helix call carries: the app's `client-id` plus a bearer
 * token (an app token or a user token, depending on the endpoint). One place so
 * the header shape can't drift across the ~dozen call sites.
 */
function helixHeaders(clientId: string, token: string): Record<string, string> {
	return { "client-id": clientId, authorization: `Bearer ${token}` };
}

// ---- OAuth (Authorization Code / redirect flow) ---------------------------

/**
 * Build the Twitch consent URL the broadcaster is redirected to. `state` is an
 * opaque CSRF token the caller persists and re-checks on the callback.
 */
export function buildAuthorizeUrl(args: {
	clientId: string;
	redirectUri: string;
	state: string;
	/** Scopes to request — defaults to the broadcaster set; the bot connect passes {@link BOT_SCOPES}. */
	scopes?: readonly string[];
	/**
	 * Force Twitch to re-show the consent screen. The bot connect sets this so the
	 * operator can pick a DIFFERENT account than the one already logged in (their
	 * broadcaster), instead of Twitch silently re-using the existing session.
	 */
	forceVerify?: boolean;
}): string {
	const params = new URLSearchParams({
		response_type: "code",
		client_id: args.clientId,
		redirect_uri: args.redirectUri,
		scope: (args.scopes ?? TWITCH_SCOPES).join(" "),
		state: args.state,
	});
	if (args.forceVerify) params.set("force_verify", "true");
	return `${ID}/authorize?${params.toString()}`;
}

export type TokenSet = {
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
	scopes: string[];
};

/** Exchange an authorization `code` for user tokens. `redirectUri` must match. */
export async function exchangeCode(args: {
	clientId: string;
	clientSecret: string;
	code: string;
	redirectUri: string;
}): Promise<TokenSet> {
	const res = await fetch(`${ID}/token`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: args.clientId,
			client_secret: args.clientSecret,
			code: args.code,
			grant_type: "authorization_code",
			redirect_uri: args.redirectUri,
		}),
	});
	if (!res.ok) throw new Error(`code exchange failed: ${res.status} ${await res.text()}`);
	const json = (await res.json()) as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
		scope?: string[];
	};
	return {
		accessToken: json.access_token,
		refreshToken: json.refresh_token,
		expiresIn: json.expires_in,
		scopes: json.scope ?? [],
	};
}

/** App access token (client_credentials) for managing EventSub subscriptions. */
export async function getAppToken(clientId: string, clientSecret: string): Promise<string> {
	const res = await fetch(`${ID}/token`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: "client_credentials",
		}),
	});
	if (!res.ok) throw new Error(`app token failed: ${res.status} ${await res.text()}`);
	return ((await res.json()) as { access_token: string }).access_token;
}

/** Resolve the authenticated user (the broadcaster) from a user token. */
export async function getBroadcaster(
	clientId: string,
	userToken: string,
): Promise<{ id: string; login: string }> {
	const res = await fetch(`${HELIX}/users`, { headers: helixHeaders(clientId, userToken) });
	if (!res.ok) throw new Error(`users lookup failed: ${res.status} ${await res.text()}`);
	const data = (await res.json()) as { data: { id: string; login: string }[] };
	const user = data.data[0];
	if (!user) throw new Error("no user for token");
	return { id: user.id, login: user.login };
}

/** Carries the HTTP status so callers can tell a permanent 4xx (dead grant) from a transient 5xx. */
export class TwitchAuthError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.name = "TwitchAuthError";
		this.status = status;
	}
}

/**
 * Refresh a user token (the bot's), returning a fresh {@link TokenSet}. Twitch
 * rotates the refresh token on each use, so the caller MUST persist the new
 * `refreshToken` too. Needs the client secret → the API Worker must bind
 * `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` (see alchemy.run.ts). Throws
 * {@link TwitchAuthError} (with the status) on failure.
 */
export async function refreshUserToken(args: {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
}): Promise<TokenSet> {
	const res = await fetch(`${ID}/token`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: args.clientId,
			client_secret: args.clientSecret,
			grant_type: "refresh_token",
			refresh_token: args.refreshToken,
		}),
	});
	if (!res.ok) {
		throw new TwitchAuthError(
			res.status,
			`token refresh failed: ${res.status} ${await res.text()}`,
		);
	}
	const json = (await res.json()) as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
		scope?: string[];
	};
	return {
		accessToken: json.access_token,
		refreshToken: json.refresh_token,
		expiresIn: json.expires_in,
		scopes: json.scope ?? [],
	};
}

/** How far ahead of a user token's expiry we proactively refresh it. */
export const TOKEN_REFRESH_SKEW_MS = 60_000;

/** A user token is still usable if it expires beyond the refresh-skew window. */
export function tokenFresh(expiresAt: number | undefined): boolean {
	return expiresAt != null && Date.now() < expiresAt - TOKEN_REFRESH_SKEW_MS;
}

/** The rotated token triplet handed to a caller's persist step. */
export type RotatedToken = { accessToken: string; refreshToken: string; expiresAt: number };

/**
 * Refresh a user token, compute its absolute expiry, and hand the rotated triplet
 * to `persist` (Twitch rotates the refresh token each use, so it MUST be stored).
 * Returns the new access token. Throws {@link TwitchAuthError} on refresh failure
 * so the caller can map a 4xx (dead grant) vs a transient 5xx to its own outcome.
 * Shared by the broadcaster (api router) and bot (server worker) token paths.
 */
export async function refreshAndPersistUserToken(args: {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	// Returns the persisted doc (mutateTwitch) — typed as unknown since the token
	// is the only thing this helper hands back to the caller.
	persist: (rotated: RotatedToken) => Promise<unknown>;
}): Promise<string> {
	const t = await refreshUserToken({
		clientId: args.clientId,
		clientSecret: args.clientSecret,
		refreshToken: args.refreshToken,
	});
	const rotated: RotatedToken = {
		accessToken: t.accessToken,
		refreshToken: t.refreshToken,
		expiresAt: Date.now() + t.expiresIn * 1000,
	};
	await args.persist(rotated);
	return rotated.accessToken;
}

/**
 * Send a chat message as the bot account via Helix. `senderId` is the bot's user
 * id, `broadcasterId` the channel; `botToken` must carry `user:write:chat`.
 * Returns false (never throws) so a failed reply can't crash the webhook — Twitch
 * still gets its 2xx.
 */
export async function sendChatMessage(args: {
	clientId: string;
	botToken: string;
	broadcasterId: string;
	senderId: string;
	message: string;
}): Promise<boolean> {
	try {
		const res = await fetch(`${HELIX}/chat/messages`, {
			method: "POST",
			headers: {
				...helixHeaders(args.clientId, args.botToken),
				"content-type": "application/json",
			},
			body: JSON.stringify({
				broadcaster_id: args.broadcasterId,
				sender_id: args.senderId,
				// Twitch hard-caps chat at 500 chars; clamp by code point (not UTF-16
				// unit) so the cut can't split an emoji/surrogate pair mid-character.
				message: [...args.message].slice(0, 500).join(""),
			}),
		});
		if (!res.ok) {
			console.log(`chat send failed: ${res.status} ${await res.text()}`);
			return false;
		}
		// Twitch returns 200 even when it DROPS the message (e.g. duplicate/rate);
		// surface that so a silent drop is at least logged.
		const json = (await res.json()) as {
			data?: { is_sent?: boolean; drop_reason?: { message?: string } }[];
		};
		const sent = json.data?.[0];
		if (sent && sent.is_sent === false) {
			console.log(`chat send dropped: ${sent.drop_reason?.message ?? "unknown"}`);
			return false;
		}
		return true;
	} catch (err) {
		console.log(`chat send error: ${String(err)}`);
		return false;
	}
}

/**
 * Given a fresh user token, do all the post-consent work and return the new
 * {@link TwitchDoc} to persist: resolve the broadcaster, mint an app token, drop
 * any stale subscriptions, and (re)create the EventSub webhook subscriptions.
 * Pure of DB access — the caller reads `prev` and writes the result.
 */
export async function finalizeConnection(args: {
	clientId: string;
	clientSecret: string;
	prev: TwitchDoc;
	tokens: TokenSet;
	eventsubCallback: string;
	/**
	 * Persist the partial doc (tokens + broadcaster + webhook secret) to D1 BEFORE
	 * the EventSub subscriptions are created. Twitch verifies the webhook with a
	 * synchronous challenge during creation, and the server Worker reads the
	 * secret from D1 to answer it — so on a first connect the secret must already
	 * be stored, or verification 404s and the subscription is dropped forever.
	 */
	persist: (doc: TwitchDoc) => Promise<void>;
}): Promise<{ doc: TwitchDoc; errors: string[] }> {
	const { clientId, clientSecret, prev, tokens } = args;
	const broadcaster = await getBroadcaster(clientId, tokens.accessToken);
	const webhookSecret = prev.webhookSecret ?? randomToken();

	const base: TwitchDoc = {
		...prev,
		oauthState: undefined,
		accessToken: tokens.accessToken,
		refreshToken: tokens.refreshToken,
		expiresAt: Date.now() + tokens.expiresIn * 1000,
		broadcasterId: broadcaster.id,
		broadcasterLogin: broadcaster.login,
		webhookSecret,
	};
	await args.persist(base);

	const appToken = await getAppToken(clientId, clientSecret);
	// Reconcile only THIS broadcaster's subscriptions — clears orphans left by an
	// earlier partial failure so re-create can't 409, without ever deleting another
	// broadcaster's subs (the app token can see every sub it created). The list API
	// has no broadcaster filter, so we filter the page client-side by condition.
	// ponytail: one page (8 subs — see SUBSCRIPTIONS); add cursor paging only if this
	// app ever holds >100 subscriptions.
	const existing = await listSubscriptions(clientId, appToken);
	const mine = existing.filter((s) => s.broadcasterId === broadcaster.id).map((s) => s.id);
	if (mine.length) await deleteSubscriptions(clientId, appToken, mine);

	const { ids, errors } = await createSubscriptions({
		clientId,
		appToken,
		broadcasterId: broadcaster.id,
		callback: args.eventsubCallback,
		secret: webhookSecret,
	});

	// errors are "type: status text" — keep just the type so the panel can name
	// exactly which subscriptions are missing on a degraded (partial) connect.
	const failedSubscriptionTypes = errors
		.map((e) => e.split(":")[0]?.trim() ?? "")
		.filter((t) => t.length > 0);

	return {
		doc: {
			...base,
			subscriptionIds: ids,
			failedSubscriptionTypes,
			failedSubscriptionReasons: errors,
			connected: ids.length > 0,
		},
		errors,
	};
}

// ---- Channel emotes -------------------------------------------------------

export type ChannelEmote = { id: string; name: string; url: string };

/**
 * Fetch the broadcaster's channel emotes for the overlay emoji picker. Works
 * with an app access token (the endpoint isn't user-scoped). Builds a 3x dark
 * URL from the response template, preferring the animated format when present.
 */
export async function getChannelEmotes(
	clientId: string,
	appToken: string,
	broadcasterId: string,
): Promise<ChannelEmote[]> {
	const res = await fetch(
		`${HELIX}/chat/emotes?broadcaster_id=${encodeURIComponent(broadcasterId)}`,
		{ headers: helixHeaders(clientId, appToken) },
	);
	if (!res.ok) throw new Error(`emotes lookup failed: ${res.status} ${await res.text()}`);
	const json = (await res.json()) as {
		data: { id: string; name: string; format?: string[] }[];
		template: string;
	};
	return json.data.map((e) => {
		const format = e.format?.includes("animated") ? "animated" : "static";
		const url = json.template
			.replace("{{id}}", e.id)
			.replace("{{format}}", format)
			.replace("{{theme_mode}}", "dark")
			.replace("{{scale}}", "3.0");
		return { id: e.id, name: e.name, url };
	});
}

// ---- Channel-point custom rewards -----------------------------------------

/** A custom channel-point reward as created on Twitch (Helix). */
export type CustomReward = { id: string; title: string };

/**
 * Create a custom channel-point reward on the broadcaster's channel via Helix
 * `POST channel_points/custom_rewards`. Requires the broadcaster's USER token
 * carrying `channel:manage:redemptions` (NOT an app token — custom rewards are
 * managed only by the channel owner). Throws {@link TwitchAuthError} (with the
 * HTTP status) so the caller can map a 401 → "reconnect Twitch", a 400 → bad
 * input, etc. `cost` is the channel-point price the viewer pays to redeem.
 */
export async function createCustomReward(args: {
	clientId: string;
	userToken: string;
	broadcasterId: string;
	title: string;
	cost: number;
}): Promise<CustomReward> {
	const res = await fetch(
		`${HELIX}/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(args.broadcasterId)}`,
		{
			method: "POST",
			headers: {
				...helixHeaders(args.clientId, args.userToken),
				"content-type": "application/json",
			},
			body: JSON.stringify({ title: args.title, cost: args.cost }),
		},
	);
	if (!res.ok) {
		throw new TwitchAuthError(
			res.status,
			`create reward failed: ${res.status} ${await res.text()}`,
		);
	}
	const json = (await res.json()) as { data: { id: string; title: string }[] };
	const reward = json.data[0];
	if (!reward) throw new TwitchAuthError(502, "create reward: empty response");
	return { id: reward.id, title: reward.title };
}

/**
 * Delete a custom channel-point reward by id via Helix
 * `DELETE channel_points/custom_rewards`. Same auth as {@link createCustomReward}
 * (broadcaster user token + `channel:manage:redemptions`). Twitch only lets us
 * delete rewards THIS client_id created, which is exactly the ones we made.
 * Throws {@link TwitchAuthError} on failure so the caller can decide whether to
 * still drop the local rule.
 */
export async function deleteCustomReward(args: {
	clientId: string;
	userToken: string;
	broadcasterId: string;
	rewardId: string;
}): Promise<void> {
	const res = await fetch(
		`${HELIX}/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(
			args.broadcasterId,
		)}&id=${encodeURIComponent(args.rewardId)}`,
		{
			method: "DELETE",
			headers: helixHeaders(args.clientId, args.userToken),
		},
	);
	// 204 = deleted; 404 = already gone (treat as success — the rule should drop too).
	if (!res.ok && res.status !== 404) {
		throw new TwitchAuthError(
			res.status,
			`delete reward failed: ${res.status} ${await res.text()}`,
		);
	}
}

// ---- EventSub management --------------------------------------------------

/** One of the app's live EventSub subscriptions, with enough to scope by broadcaster. */
export type EventsubSubscription = { id: string; type: string; broadcasterId?: string };

/**
 * List the app's live EventSub subscriptions. The Helix list endpoint has no
 * broadcaster filter (only status / type / id), so callers filter the returned
 * `broadcasterId` (from each sub's condition) themselves — see finalizeConnection.
 */
export async function listSubscriptions(
	clientId: string,
	appToken: string,
): Promise<EventsubSubscription[]> {
	const res = await fetch(`${HELIX}/eventsub/subscriptions`, {
		headers: helixHeaders(clientId, appToken),
	});
	if (!res.ok) return [];
	const data = (await res.json()) as {
		data: { id: string; type: string; condition?: { broadcaster_user_id?: string } }[];
	};
	return data.data.map((s) => ({
		id: s.id,
		type: s.type,
		broadcasterId: s.condition?.broadcaster_user_id,
	}));
}

export async function deleteSubscriptions(
	clientId: string,
	appToken: string,
	ids: string[],
): Promise<void> {
	await Promise.all(
		ids.map((id) =>
			fetch(`${HELIX}/eventsub/subscriptions?id=${encodeURIComponent(id)}`, {
				method: "DELETE",
				headers: helixHeaders(clientId, appToken),
			}),
		),
	);
}

export type SubscribeResult = { ids: string[]; errors: string[] };

/** Create the timer's EventSub webhook subscriptions for a broadcaster. */
export async function createSubscriptions(args: {
	clientId: string;
	appToken: string;
	broadcasterId: string;
	callback: string;
	secret: string;
}): Promise<SubscribeResult> {
	const ids: string[] = [];
	const errors: string[] = [];
	for (const sub of SUBSCRIPTIONS) {
		const res = await fetch(`${HELIX}/eventsub/subscriptions`, {
			method: "POST",
			headers: {
				...helixHeaders(args.clientId, args.appToken),
				"content-type": "application/json",
			},
			body: JSON.stringify({
				type: sub.type,
				version: sub.version,
				condition: {
					broadcaster_user_id: args.broadcasterId,
					...(sub.needsUserId ? { user_id: args.broadcasterId } : {}),
				},
				transport: { method: "webhook", callback: args.callback, secret: args.secret },
			}),
		});
		if (res.ok) {
			const data = (await res.json()) as { data: { id: string }[] };
			for (const s of data.data) ids.push(s.id);
		} else {
			errors.push(`${sub.type}: ${res.status} ${await res.text()}`);
		}
	}
	return { ids, errors };
}

// ---- Webhook verification + parsing --------------------------------------

async function hmacHex(secret: string, message: string): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
	return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Constant-time string compare. Node's `crypto.timingSafeEqual` isn't guaranteed
 * on the Workers runtime, so XOR-accumulate over char codes instead. The length
 * check leaks only length, which is fixed for the fixed-width tokens we compare
 * (HMAC hex signatures, random OAuth `state`). Shared with the OAuth callback.
 */
export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/**
 * Verify a Twitch EventSub webhook request. The trust boundary: only Twitch and
 * this Worker know `secret`. Rejects bad signatures and stale (>10 min) messages.
 */
export async function verifyEventsubSignature(
	headers: Headers,
	rawBody: string,
	secret: string,
): Promise<boolean> {
	const id = headers.get("twitch-eventsub-message-id");
	const ts = headers.get("twitch-eventsub-message-timestamp");
	const sig = headers.get("twitch-eventsub-message-signature");
	if (!id || !ts || !sig) return false;
	const age = Date.now() - Date.parse(ts);
	if (!Number.isFinite(age) || Math.abs(age) > 10 * 60 * 1000) return false;
	const expected = `sha256=${await hmacHex(secret, id + ts + rawBody)}`;
	return timingSafeEqual(expected, sig);
}

/**
 * Sentinel identity carried by the operator "Send test" event. The webhook
 * recognizes it ({@link isTestEvent}) and verifies the chain WITHOUT adding time
 * — a test must never move the clock.
 */
export const TEST_EVENT_USER_ID = "00000000";
export const TEST_EVENT_USER_LOGIN = "wolfathon_test";

/**
 * True for the synthetic `channel.subscribe` fired by "Send test". Verified end
 * to end (reachable + signed + parsed) but never applied to the timer.
 */
export function isTestEvent(type: string, event: Record<string, unknown>): boolean {
	return (
		type === "channel.subscribe" &&
		event.user_id === TEST_EVENT_USER_ID &&
		event.user_login === TEST_EVENT_USER_LOGIN
	);
}

/**
 * Send a correctly-signed `channel.subscribe` notification to our own public
 * webhook, byte-for-byte as Twitch would. Proves the whole live chain end to
 * end: HMAC verification, the public Worker being reachable, and event parsing.
 * Returns the webhook's HTTP status (204 = accepted). Carries the test sentinel
 * so the webhook accepts it WITHOUT adding time — safe to run mid-subathon.
 */
export async function sendTestNotification(args: {
	callbackUrl: string;
	secret: string;
	broadcasterId: string;
	broadcasterLogin?: string;
}): Promise<number> {
	const messageId = crypto.randomUUID();
	const timestamp = new Date().toISOString();
	const login = args.broadcasterLogin ?? "broadcaster";
	// Sign and send the IDENTICAL bytes — build the JSON once, never re-stringify.
	const body = JSON.stringify({
		subscription: {
			id: crypto.randomUUID(),
			type: "channel.subscribe",
			version: "1",
			status: "enabled",
			cost: 0,
			condition: { broadcaster_user_id: args.broadcasterId },
			transport: { method: "webhook", callback: args.callbackUrl },
			created_at: timestamp,
		},
		event: {
			user_id: TEST_EVENT_USER_ID,
			user_login: TEST_EVENT_USER_LOGIN,
			user_name: TEST_EVENT_USER_LOGIN,
			broadcaster_user_id: args.broadcasterId,
			broadcaster_user_login: login,
			broadcaster_user_name: login,
			tier: "1000",
			is_gift: false,
		},
	});
	const signature = `sha256=${await hmacHex(args.secret, messageId + timestamp + body)}`;
	const res = await fetch(args.callbackUrl, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"twitch-eventsub-message-id": messageId,
			"twitch-eventsub-message-timestamp": timestamp,
			"twitch-eventsub-message-signature": signature,
			"twitch-eventsub-message-type": "notification",
			"twitch-eventsub-subscription-type": "channel.subscribe",
			"twitch-eventsub-subscription-version": "1",
		},
		body,
	});
	return res.status;
}

function planToTier(tier: unknown): "t1" | "t2" | "t3" {
	if (tier === "2000") return "t2";
	if (tier === "3000") return "t3";
	return "t1";
}

/**
 * Map a Twitch EventSub event payload to a normalized {@link TimerEvent}, or
 * null if it shouldn't add time (e.g. a gift recipient's own subscribe event,
 * which is already counted via channel.subscription.gift).
 */
export function parseEvent(type: string, event: Record<string, unknown>): TimerEvent | null {
	// Display name of who triggered it, for the overlay alert. Anonymous cheers /
	// gifts carry no name (is_anonymous) — leave `who` unset so they stay anonymous.
	const who = (() => {
		if (event.is_anonymous === true) return undefined;
		const n = event.user_name ?? event.user_login;
		return typeof n === "string" && n.trim() ? { who: n.trim() } : undefined;
	})();
	switch (type) {
		case "channel.subscribe":
			if (event.is_gift === true) return null; // counted via the gift event
			return { kind: "sub", tier: planToTier(event.tier), ...who };
		case "channel.subscription.message":
			return { kind: "sub", tier: planToTier(event.tier), ...who };
		case "channel.subscription.gift":
			return {
				kind: "gift",
				tier: planToTier(event.tier),
				count: Number(event.total) || 1,
				...who,
			};
		case "channel.cheer":
			return { kind: "bits", bits: Number(event.bits) || 0, ...who };
		case "channel.channel_points_custom_reward_redemption.add": {
			const reward = (event.reward ?? {}) as { id?: string; title?: string };
			return { kind: "points", rewardId: reward.id, rewardTitle: reward.title, ...who };
		}
		default:
			return null;
	}
}
