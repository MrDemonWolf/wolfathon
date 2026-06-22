import { expect, test } from "bun:test";

import { parseTip, toSeStatus } from "./streamelements";
import { applyEvent, defaultTimerConfig, defaultTimerState, eventLabel, tipSubs } from "./timer";

test("parseTip reads amount + username from an SE tip event, ignores non-tips", () => {
	expect(parseTip({ _id: "abc", type: "tip", data: { amount: 5, username: "Wolf" } })).toEqual({
		id: "abc",
		amount: 5,
		who: "Wolf",
	});
	// Not a tip.
	expect(parseTip({ type: "subscriber", data: { amount: 5 } })).toBeNull();
	// Zero / missing amount.
	expect(parseTip({ type: "tip", data: { amount: 0, username: "x" } })).toBeNull();
	expect(parseTip(null)).toBeNull();
});

test("parseTip falls back to a synthetic id and stays anonymous without a username", () => {
	const tip = parseTip({ type: "tip", data: { amount: 10 } });
	expect(tip?.amount).toBe(10);
	expect(tip?.who).toBeUndefined();
	expect(typeof tip?.id).toBe("string");
});

test("a tip adds time per dollar and counts toward goals per the configured rates", () => {
	const config = { ...defaultTimerConfig(), tipMinutesPerDollar: 2, tipDollarsPerSub: 5 };
	const { addedMs, state } = applyEvent(
		config,
		defaultTimerState(config),
		{ kind: "tip", amount: 10, who: "Wolf" },
		1000,
	);
	expect(addedMs).toBe(20 * 60_000); // $10 * 2 min/$
	expect(state.lastEvent).toEqual({ at: 1000, minutes: 20, label: "Wolf · $10 tip" });
	expect(tipSubs(10, config)).toBe(2); // $10 / $5-per-sub
});

test("tipDollarsPerSub = 0 disables goal advancement from tips", () => {
	const config = { ...defaultTimerConfig(), tipDollarsPerSub: 0 };
	expect(tipSubs(50, config)).toBe(0);
});

test("eventLabel formats an anonymous tip", () => {
	expect(eventLabel({ kind: "tip", amount: 3 })).toBe("$3 tip");
});

test("toSeStatus masks the jwt and reflects connection state", () => {
	const status = toSeStatus({
		jwt: "secret-token",
		channelId: "abc",
		connected: true,
		lastTipAt: 5,
	});
	expect(status).toEqual({
		connected: true,
		hasJwt: true,
		channelId: "abc",
		lastTipAt: 5,
		lastError: undefined,
	});
	expect(JSON.stringify(status)).not.toContain("secret-token");
	expect(toSeStatus({}).hasJwt).toBe(false);
});
