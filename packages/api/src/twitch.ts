/**
 * Twitch integration for the subathon timer.
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

export const TWITCH_SCOPES = [
	"channel:read:subscriptions",
	"bits:read",
	"channel:read:redemptions",
	// Read chat so the giveaway `!enter` raffle can ingest entries via EventSub.
	"user:read:chat",
] as const;

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

/** Persisted Twitch state (secret — never public). */
export type TwitchDoc = {
	broadcasterId?: string;
	broadcasterLogin?: string;
	/** Transient CSRF token for the redirect flow; set on startAuth, cleared on callback. */
	oauthState?: string;
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

// ---- OAuth (Authorization Code / redirect flow) ---------------------------

/**
 * Build the Twitch consent URL the broadcaster is redirected to. `state` is an
 * opaque CSRF token the caller persists and re-checks on the callback.
 */
export function buildAuthorizeUrl(args: {
	clientId: string;
	redirectUri: string;
	state: string;
}): string {
	const params = new URLSearchParams({
		response_type: "code",
		client_id: args.clientId,
		redirect_uri: args.redirectUri,
		scope: TWITCH_SCOPES.join(" "),
		state: args.state,
	});
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
	const res = await fetch(`${HELIX}/users`, {
		headers: { "client-id": clientId, authorization: `Bearer ${userToken}` },
	});
	if (!res.ok) throw new Error(`users lookup failed: ${res.status} ${await res.text()}`);
	const data = (await res.json()) as { data: { id: string; login: string }[] };
	const user = data.data[0];
	if (!user) throw new Error("no user for token");
	return { id: user.id, login: user.login };
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
	const webhookSecret = prev.webhookSecret ?? crypto.randomUUID().replace(/-/g, "");

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
	// ponytail: one page (~9 subs); add cursor paging only if this app ever holds
	// >100 subscriptions.
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
		{ headers: { "client-id": clientId, authorization: `Bearer ${appToken}` } },
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
		headers: { "client-id": clientId, authorization: `Bearer ${appToken}` },
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
				headers: { "client-id": clientId, authorization: `Bearer ${appToken}` },
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
				"client-id": args.clientId,
				authorization: `Bearer ${args.appToken}`,
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
 * Send a correctly-signed `channel.subscribe` notification to our own public
 * webhook, byte-for-byte as Twitch would. Proves the whole live chain end to
 * end: HMAC verification, the public Worker being reachable, event parsing, and
 * the timer add. Returns the webhook's HTTP status (204 = accepted). Like a real
 * sub, it adds T1 sub-time — so run it before going live, then reset the timer.
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
			user_id: "00000000",
			user_login: "wolfathon_test",
			user_name: "wolfathon_test",
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
