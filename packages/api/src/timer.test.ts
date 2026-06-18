import { expect, test } from "bun:test";

import {
	applyEvent,
	defaultTimerConfig,
	defaultTimerState,
	pause,
	start,
	validateTimerConfig,
} from "./timer";

const MIN = 60_000;

test("a sub adds the configured tier minutes", () => {
	const config = defaultTimerConfig();
	const state = defaultTimerState(config); // 60 min, stopped
	const { state: next, addedMs } = applyEvent(config, state, { kind: "sub", tier: "t2" }, 0);
	expect(addedMs).toBe(config.sub.t2 * MIN);
	expect(next.remainingMs).toBe(60 * MIN + config.sub.t2 * MIN);
});

test("the cap limits remaining time", () => {
	const config = { ...defaultTimerConfig(), startMinutes: 60, maxMinutes: 65 };
	const state = defaultTimerState(config);
	const { state: next } = applyEvent(config, state, { kind: "manualMinutes", minutes: 100 }, 0);
	expect(next.remainingMs).toBe(65 * MIN);
});

test("bits prorate by hundreds", () => {
	const config = { ...defaultTimerConfig(), bitsPer100Minutes: 2 };
	const state = defaultTimerState(config);
	const { addedMs } = applyEvent(config, state, { kind: "bits", bits: 250 }, 0);
	expect(addedMs).toBe(5 * MIN); // 2.5 * 2 minutes
});

test("start then pause preserves remaining", () => {
	const config = defaultTimerConfig();
	const running = start(defaultTimerState(config), 0);
	expect(running.running).toBe(true);
	const paused = pause(running, 10 * MIN);
	expect(paused.running).toBe(false);
	expect(paused.remainingMs).toBe(50 * MIN);
});

test("validateTimerConfig accepts the default config", () => {
	expect(validateTimerConfig(defaultTimerConfig()).ok).toBe(true);
});

test("validateTimerConfig rejects a non-numeric field", () => {
	const result = validateTimerConfig({ ...defaultTimerConfig(), startMinutes: "nope" });
	expect(result.ok).toBe(false);
});

test("validateTimerConfig keeps clean emoji and drops blanks", () => {
	const result = validateTimerConfig({ ...defaultTimerConfig(), emojis: ["🐺", "  ", "🔥", ""] });
	expect(result.ok).toBe(true);
	if (result.ok) expect(result.config.emojis).toEqual(["🐺", "🔥"]);
});

test("validateTimerConfig rejects too many emoji", () => {
	const emojis = Array.from({ length: 25 }, () => "🐺");
	expect(validateTimerConfig({ ...defaultTimerConfig(), emojis }).ok).toBe(false);
});
