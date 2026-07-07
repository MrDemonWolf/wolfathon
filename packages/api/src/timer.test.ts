import { expect, test } from "bun:test";

import {
	applyEvent,
	autoPause,
	autoResume,
	clampEmoteScale,
	currentRemainingMs,
	DEFAULT_EMOTE_SCALE,
	defaultTimerConfig,
	defaultTimerDoc,
	defaultTimerState,
	defaultTimerTheme,
	EMOTE_SCALES,
	eventLabel,
	eventMs,
	eventMinutes,
	MAX_CHANNEL_POINT_RULES,
	pause,
	resolveThemeGradient,
	start,
	TIMER_THEME_PRESETS,
	tipSubs,
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

test("the cap also applies while the timer is running (endsAt branch)", () => {
	const config = { ...defaultTimerConfig(), startMinutes: 60, maxMinutes: 65 };
	const running = start(defaultTimerState(config), 0); // endsAt = 60min
	const { state: next } = applyEvent(config, running, { kind: "manualMinutes", minutes: 100 }, 0);
	expect(currentRemainingMs(next, 0)).toBe(65 * MIN);
	expect(next.endsAt).toBe(65 * MIN);
});

test("time can't go negative while running (zero floor on the endsAt branch)", () => {
	const config = defaultTimerConfig(); // 60min, no cap
	const running = start(defaultTimerState(config), 0); // endsAt = 60min
	const { state: next } = applyEvent(config, running, { kind: "manualMinutes", minutes: -1000 }, 0);
	expect(currentRemainingMs(next, 0)).toBe(0);
	expect(next.endsAt).toBe(0);
});

test("eventMinutes resolves channel points by id, then case-insensitive title, else 0", () => {
	const config = {
		...defaultTimerConfig(),
		channelPoints: [{ rewardId: "abc", rewardTitle: "Hydrate", minutes: 10 }],
	};
	// rewardId match wins even if the title differs
	expect(eventMinutes(config, { kind: "points", rewardId: "abc", rewardTitle: "ignored" })).toBe(
		10,
	);
	// no id → case-insensitive title fallback
	expect(eventMinutes(config, { kind: "points", rewardTitle: "hydrate" })).toBe(10);
	// unknown reward → 0
	expect(eventMinutes(config, { kind: "points", rewardId: "zzz", rewardTitle: "nope" })).toBe(0);
});

test("eventMinutes scales tips by the dollar rate and clamps negatives", () => {
	const config = { ...defaultTimerConfig(), tipMinutesPerDollar: 2 };
	expect(eventMinutes(config, { kind: "tip", amount: 5 })).toBe(10);
	expect(eventMinutes(config, { kind: "tip", amount: -5 })).toBe(0);
});

test("tipSubs converts dollars to goal subs and is safe at the edges", () => {
	const config = defaultTimerConfig();
	expect(tipSubs(20, { ...config, tipDollarsPerSub: 5 })).toBe(4);
	expect(tipSubs(20, { ...config, tipDollarsPerSub: 0 })).toBe(0); // rate 0 → tips don't advance goals
	expect(tipSubs(-5, { ...config, tipDollarsPerSub: 5 })).toBe(0); // negative clamps to 0
});

test("bits prorate by hundreds", () => {
	const config = { ...defaultTimerConfig(), bitsPer100Minutes: 2 };
	const state = defaultTimerState(config);
	const { addedMs } = applyEvent(config, state, { kind: "bits", bits: 250 }, 0);
	expect(addedMs).toBe(5 * MIN); // 2.5 * 2 minutes
});

// A cheer of ANY size must add time, prorated in MILLISECONDS — small cheers
// (1 bit, 10 bits) must NOT floor to zero minutes. Rate = 1 min per 100 bits, so
// each bit is worth 600ms (= MIN/100).
test("bits proration: 1 / 10 / 100 / 250 bits add exact ms at 1 min/100", () => {
	const config = { ...defaultTimerConfig(), bitsPer100Minutes: 1 };
	const state = defaultTimerState(config);
	const add = (bits: number) => applyEvent(config, state, { kind: "bits", bits }, 0).addedMs;
	expect(add(1)).toBe(600); // 0.6s — sub-minute, still added (not floored to 0)
	expect(add(10)).toBe(6_000); // 6s
	expect(add(100)).toBe(MIN); // exactly 1 minute
	expect(add(250)).toBe(150_000); // 2.5 minutes
});

test("eventMs adds sub-minute bits even at a fractional rate (never floors to 0)", () => {
	const config = { ...defaultTimerConfig(), bitsPer100Minutes: 0.5 };
	// 1 bit at 0.5 min/100 = 300ms — positive, never zero.
	expect(eventMs(config, { kind: "bits", bits: 1 })).toBe(300);
	expect(eventMs(config, { kind: "bits", bits: 50 })).toBe(15_000); // 0.25 min
});

test("a tiny cheer moves the clock even under a cap", () => {
	// Cap well above current remaining — the 600ms add must land in full.
	const config = {
		...defaultTimerConfig(),
		bitsPer100Minutes: 1,
		startMinutes: 60,
		maxMinutes: 120,
	};
	const state = defaultTimerState(config);
	const { state: next, addedMs } = applyEvent(config, state, { kind: "bits", bits: 1 }, 0);
	expect(addedMs).toBe(600);
	expect(next.remainingMs).toBe(60 * MIN + 600);
});

// ---- emote size (emoteScale) ----------------------------------------------

test("clampEmoteScale: only 1/2/3 pass, junk falls back to 1", () => {
	expect(clampEmoteScale(1)).toBe(1);
	expect(clampEmoteScale(2)).toBe(2);
	expect(clampEmoteScale(3)).toBe(3);
	expect(clampEmoteScale(2.4)).toBe(2); // rounds into the set
	expect(clampEmoteScale(0)).toBe(DEFAULT_EMOTE_SCALE); // below set → default
	expect(clampEmoteScale(4)).toBe(DEFAULT_EMOTE_SCALE); // above set → default
	expect(clampEmoteScale("2")).toBe(DEFAULT_EMOTE_SCALE); // wrong type → default
	expect(clampEmoteScale(undefined)).toBe(DEFAULT_EMOTE_SCALE);
});

test("emoteScale: defaults to 1, validates to the allowed set, backfills old rows", () => {
	expect(defaultTimerConfig().emoteScale).toBe(1);
	expect(EMOTE_SCALES).toEqual([1, 2, 3]);

	const ok = validateTimerConfig({ ...defaultTimerConfig(), emoteScale: 3 });
	expect(ok.ok).toBe(true);
	if (ok.ok) expect(ok.config.emoteScale).toBe(3);

	// Out-of-set junk clamps to the default rather than erroring (lenient, like emoteCount/direction).
	const junk = validateTimerConfig({ ...defaultTimerConfig(), emoteScale: 9 });
	expect(junk.ok).toBe(true);
	if (junk.ok) expect(junk.config.emoteScale).toBe(1);

	// Old import doc without the field backfills to 1.
	const { emoteScale: _omit, ...noField } = defaultTimerConfig();
	const back = validateTimerConfig(noField);
	expect(back.ok && back.config.emoteScale).toBe(1);
});

test("toPublicTimer carries the clamped emoteScale", () => {
	const config = { ...defaultTimerConfig(), emoteScale: 3 as const };
	const pub = toPublicTimer({ config, state: defaultTimerState(config) }, 0, defaultTimerTheme());
	expect(pub.emoteScale).toBe(3);
	// A row with a junk persisted scale resolves to 1 in the public payload.
	const bad = { ...defaultTimerConfig(), emoteScale: 99 as unknown as 1 };
	const pub2 = toPublicTimer({ config: bad, state: defaultTimerState() }, 0, defaultTimerTheme());
	expect(pub2.emoteScale).toBe(1);
});

// ---- channel-point reward cap (now 2, managed on Twitch) ------------------

test("channelPoints are capped at MAX_CHANNEL_POINT_RULES (2)", () => {
	expect(MAX_CHANNEL_POINT_RULES).toBe(2);
	const two = [
		{ rewardId: "a", rewardTitle: "One", minutes: 5 },
		{ rewardId: "b", rewardTitle: "Two", minutes: 10 },
	];
	const ok = validateTimerConfig({ ...defaultTimerConfig(), channelPoints: two });
	expect(ok.ok).toBe(true);
	if (ok.ok) expect(ok.config.channelPoints).toHaveLength(2);

	const three = [...two, { rewardId: "c", rewardTitle: "Three", minutes: 1 }];
	const over = validateTimerConfig({ ...defaultTimerConfig(), channelPoints: three });
	expect(over.ok).toBe(false);
});

test("start then pause preserves remaining", () => {
	const config = defaultTimerConfig();
	const running = start(defaultTimerState(config), 0);
	expect(running.running).toBe(true);
	const paused = pause(running, 10 * MIN);
	expect(paused.running).toBe(false);
	expect(paused.remainingMs).toBe(50 * MIN);
});

test("autoPause then stream.online auto-resumes, preserving remaining", () => {
	const config = defaultTimerConfig();
	const running = start(defaultTimerState(config), 0);

	const paused = autoPause(running, 10 * MIN); // 50 min left, offline
	expect(paused.running).toBe(false);
	expect(paused.autoPaused).toBe(true);
	expect(paused.remainingMs).toBe(50 * MIN);

	const resumed = autoResume(paused, 20 * MIN);
	expect(resumed.running).toBe(true);
	expect(resumed.autoPaused).toBe(false);
	expect(resumed.endsAt).toBe(20 * MIN + 50 * MIN);
});

test("auto-resume never overrides a manual pause", () => {
	const running = start(defaultTimerState(defaultTimerConfig()), 0);
	const manuallyPaused = pause(running, 10 * MIN);
	expect(manuallyPaused.autoPaused).toBe(false);
	expect(autoResume(manuallyPaused, 20 * MIN)).toBe(manuallyPaused);
});

test("a manual pause after an auto-pause clears the auto flag (stays paused on online)", () => {
	const running = start(defaultTimerState(defaultTimerConfig()), 0);
	const auto = autoPause(running, 5 * MIN);
	const manual = pause(auto, 6 * MIN);
	expect(manual.autoPaused).toBe(false);
	expect(autoResume(manual, 9 * MIN)).toBe(manual);
});

test("auto-resume is a no-op while already running", () => {
	const running = start(defaultTimerState(defaultTimerConfig()), 0);
	expect(autoResume(running, 5 * MIN)).toBe(running);
});

test("autoPauseOnOffline defaults on and survives a config round-trip", () => {
	expect(defaultTimerConfig().autoPauseOnOffline).toBe(true);
	const off = validateTimerConfig({ ...defaultTimerConfig(), autoPauseOnOffline: false });
	expect(off.ok && off.config.autoPauseOnOffline).toBe(false);
	// Old import docs without the field backfill to on.
	const { autoPauseOnOffline: _omit, ...noField } = defaultTimerConfig();
	const back = validateTimerConfig(noField);
	expect(back.ok && back.config.autoPauseOnOffline).toBe(true);
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

test("emoteDirection: defaults to up and accepts up/left/right, ignoring junk", () => {
	expect(defaultTimerConfig().emoteDirection).toBe("up");
	const ok = validateTimerConfig({ ...defaultTimerConfig(), emoteDirection: "left" });
	expect(ok.ok).toBe(true);
	if (ok.ok) expect(ok.config.emoteDirection).toBe("left");
	const junk = validateTimerConfig({ ...defaultTimerConfig(), emoteDirection: "diagonal" });
	expect(junk.ok).toBe(true);
	if (junk.ok) expect(junk.config.emoteDirection).toBe("up");
});

test("theme: the public payload resolves the passed-in (shared) theme", () => {
	const doc = { config: defaultTimerConfig(), state: defaultTimerState() };
	// mono is light → auto picks dark ink
	expect(toPublicTimer(doc, 0, { ...defaultTimerTheme(), preset: "mono" }).textColor).toBe(
		"#04122b",
	);
	// an explicit hex wins over auto
	expect(toPublicTimer(doc, 0, { ...defaultTimerTheme(), textColor: "#ff0000" }).textColor).toBe(
		"#ff0000",
	);
	// brand default → brand gradient + chrome on
	const pub = toPublicTimer(doc, 1_000, defaultTimerTheme());
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

test("applyEvent preview fires the alert but adds no time (test buttons)", () => {
	const config = defaultTimerConfig();
	const base = defaultTimerState(config);
	const { state, addedMs } = applyEvent(config, base, { kind: "sub", tier: "t2" }, 1000, true);
	expect(addedMs).toBe(0);
	expect(state.remainingMs).toBe(base.remainingMs); // clock untouched
	expect(state.totalAddedMs).toBe(base.totalAddedMs); // stats untouched
	expect(state.lastEvent).toEqual({ at: 1000, minutes: config.sub.t2, label: "Sub" }); // alert still fires
});

test("toPublicTimer sources the eyebrow label from the THEME, not the timer config", () => {
	const doc = defaultTimerDoc();
	// A stray legacy config.label (pre-migration rows still carry it) must be
	// ignored — the theme is now the single source of truth.
	(doc.config as Record<string, unknown>).label = "STALE";
	const pub = toPublicTimer(doc, 0, { ...defaultTimerTheme(), label: "MARATHON" });
	expect(pub.label).toBe("MARATHON");
	expect(pub.showEventSource).toBe(true);
	expect(pub.lastEvent).toBeNull();
});
