import { expect, test } from "bun:test";

import {
	applyEvent,
	defaultTimerConfig,
	defaultTimerDoc,
	defaultTimerState,
	eventLabel,
	pause,
	resolveThemeGradient,
	start,
	TIMER_THEME_PRESETS,
	toPublicTimer,
	validateTimerConfig,
	withTimerConfigDefaults,
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

test("theme: custom preset requires at least 2 hex stops", () => {
	const base = defaultTimerConfig();
	expect(
		validateTimerConfig({ ...base, theme: { ...base.theme, preset: "custom", gradient: ["#fff"] } })
			.ok,
	).toBe(false);
	const ok = validateTimerConfig({
		...base,
		theme: { ...base.theme, preset: "custom", gradient: ["#ff0000", "#00aced"] },
	});
	expect(ok.ok).toBe(true);
});

test("theme: rejects a bad preset and a non-hex stop", () => {
	const base = defaultTimerConfig();
	expect(validateTimerConfig({ ...base, theme: { ...base.theme, preset: "neon" } }).ok).toBe(false);
	expect(
		validateTimerConfig({ ...base, theme: { ...base.theme, gradient: ["red", "#00aced"] } }).ok,
	).toBe(false);
});

test("theme: validates font, corners, and textColor", () => {
	const base = defaultTimerConfig();
	expect(validateTimerConfig({ ...base, theme: { ...base.theme, font: "comic" } }).ok).toBe(false);
	expect(validateTimerConfig({ ...base, theme: { ...base.theme, corners: "round" } }).ok).toBe(
		false,
	);
	expect(validateTimerConfig({ ...base, theme: { ...base.theme, textColor: "blue" } }).ok).toBe(
		false,
	);
	const ok = validateTimerConfig({
		...base,
		theme: { ...base.theme, font: "roboto", corners: "pill", textColor: "#112233" },
	});
	expect(ok.ok).toBe(true);
	if (ok.ok) {
		expect(ok.config.theme.font).toBe("roboto");
		expect(ok.config.theme.corners).toBe("pill");
		expect(ok.config.theme.textColor).toBe("#112233");
	}
});

test("theme: explicit textColor wins; auto resolves from gradient brightness", () => {
	const dark = {
		config: {
			...defaultTimerConfig(),
			theme: { ...defaultTimerConfig().theme, preset: "mono" as const },
		},
		state: defaultTimerState(),
	};
	// mono is light → auto picks dark ink
	expect(toPublicTimer(dark, 0).textColor).toBe("#04122b");
	const fixed = {
		config: {
			...defaultTimerConfig(),
			theme: { ...defaultTimerConfig().theme, textColor: "#ff0000" },
		},
		state: defaultTimerState(),
	};
	expect(toPublicTimer(fixed, 0).textColor).toBe("#ff0000");
});

test("theme: missing theme falls back to brand in the public payload", () => {
	const config = defaultTimerConfig();
	// Simulate an old saved row with no theme field.
	delete (config as { theme?: unknown }).theme;
	const pub = toPublicTimer({ config, state: defaultTimerState(config) }, 1_000);
	expect(pub.gradient).toEqual(TIMER_THEME_PRESETS.brand);
	expect(pub.showLabel).toBe(true);
	expect(
		resolveThemeGradient({ preset: "brand", gradient: [], showLabel: true, showStatus: true }),
	).toEqual(TIMER_THEME_PRESETS.brand);
});

// ---- read-boundary defaults (the #20 white-screen crash class) ------------
// A new TimerConfig field added without a matching default in defaultTimerConfig
// would crash /control on rows persisted before it existed. These iterate the
// keys so future fields are covered without touching this test.

test("withTimerConfigDefaults restores every config key dropped from an old row", () => {
	const full = defaultTimerConfig();
	for (const key of Object.keys(full) as (keyof typeof full)[]) {
		const config = { ...full };
		delete (config as Record<string, unknown>)[key];
		const restored = withTimerConfigDefaults({ config, state: defaultTimerState() }).config;
		expect(restored[key], `config.${key} must be backfilled at the read boundary`).toBeDefined();
	}
});

test("withTimerConfigDefaults preserves all keys for a full doc (none dropped)", () => {
	const doc = defaultTimerDoc();
	const restored = withTimerConfigDefaults(doc);
	expect(Object.keys(restored.config).sort()).toEqual(Object.keys(doc.config).sort());
	expect(restored.state).toEqual(doc.state);
});

test("validateTimerConfig drops non-allowlisted emoji image URLs but keeps emote CDN + unicode", () => {
	const result = validateTimerConfig({
		...defaultTimerConfig(),
		emojis: [
			"🐺", // bare unicode → kept
			"https://static-cdn.jtvnw.net/emoticons/v2/25/static/light/3.0", // allowlisted → kept
			"javascript:alert(1)", // dropped
			"data:image/svg+xml,<svg/onload=alert(1)>", // dropped
			"http://static-cdn.jtvnw.net/x.png", // non-https → dropped
			"https://evil.example.com/x.png", // arbitrary host → dropped
		],
	});
	expect(result.ok).toBe(true);
	if (result.ok)
		expect(result.config.emojis).toEqual([
			"🐺",
			"https://static-cdn.jtvnw.net/emoticons/v2/25/static/light/3.0",
		]);
});

// ---- time-add alert source (who · what +Xm) -------------------------------

test("eventLabel names who + what; manual adds have no source", () => {
	expect(eventLabel({ kind: "sub", tier: "t1", who: "Wolf" })).toBe("Wolf · Sub");
	expect(eventLabel({ kind: "gift", tier: "t1", count: 5, who: "Wolf" })).toBe("Wolf · Gift ×5");
	expect(eventLabel({ kind: "bits", bits: 500 })).toBe("500 bits"); // anonymous → no name
	expect(eventLabel({ kind: "manualMinutes", minutes: 5 })).toBe("");
});

test("applyEvent records the last add (minutes + label) only for positive adds", () => {
	const config = defaultTimerConfig();
	const { state } = applyEvent(
		config,
		defaultTimerState(config),
		{ kind: "sub", tier: "t2", who: "Wolf" },
		1000,
	);
	expect(state.lastEvent).toEqual({ at: 1000, minutes: config.sub.t2, label: "Wolf · Sub" });
	// A negative manual correction must not overwrite it with a celebratory alert.
	const { state: after } = applyEvent(config, state, { kind: "manualMinutes", minutes: -5 }, 2000);
	expect(after.lastEvent?.at).toBe(1000);
});

test("toPublicTimer exposes the label + event-source toggle + last event", () => {
	const doc = defaultTimerDoc();
	const pub = toPublicTimer(doc, 0);
	expect(pub.label).toBe("SUBATHON");
	expect(pub.showEventSource).toBe(true);
	expect(pub.lastEvent).toBeNull();
});
