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
] as const;

/** EventSub subscription types we create on connect (all condition broadcaster_user_id). */
const SUBSCRIPTIONS: { type: string; version: string }[] = [
  { type: "channel.subscribe", version: "1" },
  { type: "channel.subscription.message", version: "1" },
  { type: "channel.subscription.gift", version: "1" },
  { type: "channel.cheer", version: "1" },
  { type: "channel.channel_points_custom_reward_redemption.add", version: "1" },
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
};

/** `hasCredentials` reflects the env-provided app creds, not the DB. */
export function toStatus(doc: TwitchDoc, hasCredentials: boolean): TwitchStatus {
  return {
    hasCredentials,
    connected: Boolean(doc.connected),
    broadcasterLogin: doc.broadcasterLogin,
    subscriptionCount: doc.subscriptionIds?.length ?? 0,
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
  // Reconcile against ALL of the app's live subscriptions, not just the ones we
  // tracked — clears orphans left by an earlier partial failure so re-create
  // can't 409. ponytail: one page (~5 subs); add cursor paging only if this app
  // ever holds >100 subscriptions.
  const existing = await listSubscriptions(clientId, appToken);
  if (existing.length) await deleteSubscriptions(clientId, appToken, existing);

  const { ids, errors } = await createSubscriptions({
    clientId,
    appToken,
    broadcasterId: broadcaster.id,
    callback: args.eventsubCallback,
    secret: webhookSecret,
  });

  return {
    doc: { ...base, subscriptionIds: ids, connected: ids.length > 0 },
    errors,
  };
}

// ---- EventSub management --------------------------------------------------

export async function listSubscriptions(clientId: string, appToken: string): Promise<string[]> {
  const res = await fetch(`${HELIX}/eventsub/subscriptions`, {
    headers: { "client-id": clientId, authorization: `Bearer ${appToken}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { data: { id: string }[] };
  return data.data.map((s) => s.id);
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
        condition: { broadcaster_user_id: args.broadcasterId },
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

function timingSafeEqual(a: string, b: string): boolean {
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
  switch (type) {
    case "channel.subscribe":
      if (event.is_gift === true) return null; // counted via the gift event
      return { kind: "sub", tier: planToTier(event.tier) };
    case "channel.subscription.message":
      return { kind: "sub", tier: planToTier(event.tier) };
    case "channel.subscription.gift":
      return { kind: "gift", tier: planToTier(event.tier), count: Number(event.total) || 1 };
    case "channel.cheer":
      return { kind: "bits", bits: Number(event.bits) || 0 };
    case "channel.channel_points_custom_reward_redemption.add": {
      const reward = (event.reward ?? {}) as { id?: string; title?: string };
      return { kind: "points", rewardId: reward.id, rewardTitle: reward.title };
    }
    default:
      return null;
  }
}
