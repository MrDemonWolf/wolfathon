/**
 * Twitch integration for the subathon timer.
 *
 * Auth model (see README):
 *  - One confidential Twitch app (client_id + client_secret).
 *  - The broadcaster authorizes scopes ONCE via the OAuth Device Code Flow.
 *  - EventSub uses **webhook** transport (Twitch POSTs to the public server
 *    Worker), so no persistent connection / Durable Object is needed.
 *  - The Worker manages subscriptions with an **app access token**
 *    (client_credentials) and verifies every event by HMAC.
 *
 * All secrets live in the `twitch` D1 row and never reach a public response.
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
  clientId?: string;
  clientSecret?: string;
  broadcasterId?: string;
  broadcasterLogin?: string;
  /** Transient device-flow code, set by startDeviceAuth, cleared on success. */
  deviceCode?: string;
  accessToken?: string; // user token from device flow (proves the grant)
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

export function toStatus(doc: TwitchDoc): TwitchStatus {
  return {
    hasCredentials: Boolean(doc.clientId && doc.clientSecret),
    connected: Boolean(doc.connected),
    broadcasterLogin: doc.broadcasterLogin,
    subscriptionCount: doc.subscriptionIds?.length ?? 0,
  };
}

const ID = "https://id.twitch.tv/oauth2";
const HELIX = "https://api.twitch.tv/helix";

// ---- OAuth ----------------------------------------------------------------

export type DeviceStart = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
};

/** Begin the Device Code Flow — returns the code the broadcaster enters. */
export async function startDeviceFlow(clientId: string): Promise<DeviceStart> {
  const res = await fetch(`${ID}/device`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, scopes: TWITCH_SCOPES.join(" ") }),
  });
  if (!res.ok) throw new Error(`device start failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as DeviceStart;
}

export type DevicePoll =
  | { status: "pending" }
  | { status: "ok"; accessToken: string; refreshToken: string; expiresIn: number; scopes: string[] };

/** Poll once for the device-flow token. Returns "pending" until authorized. */
export async function pollDeviceFlow(clientId: string, deviceCode: string): Promise<DevicePoll> {
  const res = await fetch(`${ID}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      scopes: TWITCH_SCOPES.join(" "),
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  if (res.status === 400) return { status: "pending" };
  if (!res.ok) throw new Error(`device poll failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string[];
  };
  return {
    status: "ok",
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
