import { expect, test } from "bun:test";

import {
	buildAuthorizeUrl,
	isTestEvent,
	parseEvent,
	sendTestNotification,
	TEST_EVENT_USER_ID,
	TEST_EVENT_USER_LOGIN,
	TWITCH_SCOPES,
	verifyEventsubSignature,
} from "./twitch";

test("a gifted recipient's subscribe is ignored (counted via the gift event)", () => {
	expect(parseEvent("channel.subscribe", { is_gift: true, tier: "1000" })).toBeNull();
});

test("the Send-test sentinel is recognized (so the webhook skips adding time)", () => {
	// A real sub with a different identity must NOT be treated as a test.
	expect(isTestEvent("channel.subscribe", { user_id: "12345", user_login: "someone" })).toBe(false);
	// The exact sentinel our own sendTestNotification emits IS a test.
	expect(
		isTestEvent("channel.subscribe", {
			user_id: TEST_EVENT_USER_ID,
			user_login: TEST_EVENT_USER_LOGIN,
		}),
	).toBe(true);
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
	// stream.offline carries no time; it is handled as a pause, not a TimerEvent.
	expect(parseEvent("stream.offline", {})).toBeNull();
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
	expect(parseEvent("channel.subscribe", JSON.parse(body).event)).toEqual({
		kind: "sub",
		tier: "t1",
		who: "wolfathon_test",
	});
});

/** Compute the `sha256=…` header the way Twitch (and our verifier) does. */
async function sign(secret: string, message: string): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
	return `sha256=${[...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const HMAC_SECRET = "0123456789abcdef0123456789abcdef";

test("verifyEventsubSignature accepts a correctly-signed fresh message", async () => {
	const id = "msg-ok";
	const body = '{"hello":"world"}';
	const ts = new Date().toISOString();
	const headers = new Headers({
		"twitch-eventsub-message-id": id,
		"twitch-eventsub-message-timestamp": ts,
		"twitch-eventsub-message-signature": await sign(HMAC_SECRET, id + ts + body),
	});
	expect(await verifyEventsubSignature(headers, body, HMAC_SECRET)).toBe(true);
});

test("verifyEventsubSignature rejects stale and future timestamps despite a valid signature", async () => {
	const id = "msg-old";
	const body = "{}";
	for (const skewMs of [-11 * 60 * 1000, 11 * 60 * 1000]) {
		const ts = new Date(Date.now() + skewMs).toISOString();
		// Sign the SAME stale/future ts, so rejection comes from the age guard, not a mismatch.
		const headers = new Headers({
			"twitch-eventsub-message-id": id,
			"twitch-eventsub-message-timestamp": ts,
			"twitch-eventsub-message-signature": await sign(HMAC_SECRET, id + ts + body),
		});
		expect(await verifyEventsubSignature(headers, body, HMAC_SECRET)).toBe(false);
	}
});

test("verifyEventsubSignature rejects when any required header is missing", async () => {
	const id = "msg-miss";
	const body = "{}";
	const ts = new Date().toISOString();
	const full: Record<string, string> = {
		"twitch-eventsub-message-id": id,
		"twitch-eventsub-message-timestamp": ts,
		"twitch-eventsub-message-signature": await sign(HMAC_SECRET, id + ts + body),
	};
	for (const omit of Object.keys(full)) {
		const headers = new Headers(
			Object.fromEntries(Object.entries(full).filter(([k]) => k !== omit)),
		);
		expect(await verifyEventsubSignature(headers, body, HMAC_SECRET)).toBe(false);
	}
});

test("the authorize URL carries the code flow params, scopes, and state", () => {
	const url = new URL(
		buildAuthorizeUrl({
			clientId: "abc",
			redirectUri: "https://x.dev/api/twitch/callback",
			state: "s123",
		}),
	);
	expect(url.origin + url.pathname).toBe("https://id.twitch.tv/oauth2/authorize");
	expect(url.searchParams.get("response_type")).toBe("code");
	expect(url.searchParams.get("client_id")).toBe("abc");
	expect(url.searchParams.get("redirect_uri")).toBe("https://x.dev/api/twitch/callback");
	expect(url.searchParams.get("state")).toBe("s123");
	expect(url.searchParams.get("scope")).toBe(TWITCH_SCOPES.join(" "));
});
