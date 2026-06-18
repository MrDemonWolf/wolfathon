import { expect, test } from "bun:test";

import {
  buildAuthorizeUrl,
  parseEvent,
  sendTestNotification,
  TWITCH_SCOPES,
  verifyEventsubSignature,
} from "./twitch";

test("a gifted recipient's subscribe is ignored (counted via the gift event)", () => {
  expect(parseEvent("channel.subscribe", { is_gift: true, tier: "1000" })).toBeNull();
});

test("a new sub maps the tier", () => {
  expect(parseEvent("channel.subscribe", { is_gift: false, tier: "3000" })).toEqual({
    kind: "sub",
    tier: "t3",
  });
});

test("a gift counts the total", () => {
  expect(parseEvent("channel.subscription.gift", { tier: "1000", total: 5 })).toEqual({
    kind: "gift",
    tier: "t1",
    count: 5,
  });
});

test("a cheer carries the bit count", () => {
  expect(parseEvent("channel.cheer", { bits: 300 })).toEqual({ kind: "bits", bits: 300 });
});

test("unknown events are ignored", () => {
  expect(parseEvent("channel.follow", {})).toBeNull();
});

test("the test notification is signed so our own verifier accepts it", async () => {
  const secret = "0123456789abcdef0123456789abcdef";
  let captured: Request | undefined;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured = new Request(input as string, init);
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  try {
    const status = await sendTestNotification({
      callbackUrl: "https://api.example.dev/twitch/eventsub",
      secret,
      broadcasterId: "1337",
      broadcasterLogin: "wolf",
    });
    expect(status).toBe(204);
  } finally {
    globalThis.fetch = realFetch;
  }

  const req = captured!;
  const body = await req.text();
  expect(await verifyEventsubSignature(req.headers, body, secret)).toBe(true);
  // A tampered body must fail the signature (proves we sign the bytes we send).
  expect(await verifyEventsubSignature(req.headers, body + " ", secret)).toBe(false);
  expect(parseEvent("channel.subscribe", JSON.parse(body).event)).toEqual({ kind: "sub", tier: "t1" });
});

test("the authorize URL carries the code flow params, scopes, and state", () => {
  const url = new URL(
    buildAuthorizeUrl({ clientId: "abc", redirectUri: "https://x.dev/api/twitch/callback", state: "s123" }),
  );
  expect(url.origin + url.pathname).toBe("https://id.twitch.tv/oauth2/authorize");
  expect(url.searchParams.get("response_type")).toBe("code");
  expect(url.searchParams.get("client_id")).toBe("abc");
  expect(url.searchParams.get("redirect_uri")).toBe("https://x.dev/api/twitch/callback");
  expect(url.searchParams.get("state")).toBe("s123");
  expect(url.searchParams.get("scope")).toBe(TWITCH_SCOPES.join(" "));
});
