/**
 * Wolfathon timer domain.
 *
 * The timer is timestamp-based, not tick-based: while running we store `endsAt`
 * (epoch ms); while paused we store the frozen `remainingMs`. The overlay counts
 * down locally from these values and resyncs on its poll, so we never need a
 * websocket or Durable Object.
 *
 * Time is added by configurable events (subs / gifts / bits / channel points),
 * honouring an optional cap. Pure functions only — persistence lives in store.ts.
 */

import {
	clampScale,
	type OverlayTheme,
	resolveTextColor,
	resolveThemeGradient,
	type ThemeCorners,
	type ThemeFont,
} from "./theme";

/**
 * Which way the time-add emote burst travels across the timer capsule.
 * `up` is the original well-up; `left`/`right` sweep horizontally.
 */
export type EmoteDirection = "up" | "left" | "right";
export const EMOTE_DIRECTIONS: EmoteDirection[] = ["up", "left", "right"];

// The overlay theme is shared with the rewards card — see ./theme.
export type { OverlayTheme as TimerTheme, ThemePreset as TimerThemePreset } from "./theme";
export {
	defaultOverlayTheme as defaultTimerTheme,
	HEX_COLOR,
	MAX_GRADIENT_STOPS,
	resolveThemeGradient,
	THEME_PRESETS as TIMER_THEME_PRESETS,
} from "./theme";

export type SubTier = "t1" | "t2" | "t3" | "prime";

export type ChannelPointRule = {
	/** Twitch reward id (preferred match). Filled once a redemption is seen. */
	rewardId?: string;
	/** Human label shown in the panel; also used to match if no id yet. */
	rewardTitle: string;
	minutes: number;
};

export type TimerConfig = {
	startMinutes: number;
	/** 0 = no cap. */
	maxMinutes: number;
	sub: { t1: number; t2: number; t3: number; prime: number };
	/** Minutes added per gifted sub. */
	giftSubMinutes: number;
	/** Minutes added per 100 bits (fractional bits prorated). */
	bitsPer100Minutes: number;
	channelPoints: ChannelPointRule[];
	/** Emoji that drift behind the overlay + burst when time is added. */
	emojis: string[];
	/** How many emotes flood the bar on each time-add (0 = none). */
	emoteCount: number;
	/** Which way the time-add emote burst travels (up / left→right / right→left). */
	emoteDirection: EmoteDirection;
	/** Show who/what added time on the time-add alert (e.g. "Name · Sub +5m"). */
	showEventSource: boolean;
	/**
	 * Auto-pause the timer when the stream goes offline (and auto-resume when it
	 * comes back, only if the pause was automatic). Driven by `stream.offline` /
	 * `stream.online` EventSub. Default on.
	 */
	autoPauseOnOffline: boolean;
	/** Minutes added per $1 of a tip (Ko-fi integration TBD; rate is pre-configurable). */
	tipMinutesPerDollar: number;
	/** Dollars of tips that count as one sub toward the reward goals (0 = tips don't advance goals). */
	tipDollarsPerSub: number;
};

export type TimerState = {
	running: boolean;
	/** Epoch ms the timer hits zero (only when running). */
	endsAt: number | null;
	/** Frozen remaining ms (authoritative when paused/stopped). */
	remainingMs: number;
	/** Total ms ever added by events — for stats/goals. */
	totalAddedMs: number;
	/** Most recent time-add, for the overlay alert. Null until the first add. */
	lastEvent: TimerLastEvent | null;
	/**
	 * True when the current pause was automatic (stream went offline). Lets
	 * `stream.online` auto-resume without overriding a deliberate manual pause.
	 * Any manual Start/Pause clears it.
	 */
	autoPaused: boolean;
};

export type TimerDoc = { config: TimerConfig; state: TimerState };

/** What the overlay receives — no config, no secrets. */
export type PublicTimer = {
	running: boolean;
	endsAt: number | null;
	remainingMs: number;
	/** Server clock so the overlay can correct browser-clock skew. */
	serverNow: number;
	/** Emoji the overlay animates (drift + add-time burst). */
	emojis: string[];
	/** How many emotes flood the bar on each time-add. */
	emoteCount: number;
	/** Which way the time-add emote burst travels. */
	emoteDirection: EmoteDirection;
	/** Resolved capsule gradient stops (2+ hex colours). */
	gradient: string[];
	/** Resolved countdown text colour (hex). */
	textColor: string;
	/** Display font key. */
	font: ThemeFont;
	/** Corner style. */
	corners: ThemeCorners;
	/** Paused automatically because the stream is offline (vs a manual pause). */
	autoPaused: boolean;
	/** Show the eyebrow label. */
	showLabel: boolean;
	/** Editable eyebrow text (defaults to "WOLFATHON"). */
	label: string;
	/** Show the play/pause status chip. */
	showStatus: boolean;
	/** Show the unit labels under the countdown digits (D/H/M/S). */
	showUnits: boolean;
	/** Size multiplier for the timer capsule (operator-tunable for 1080p). */
	timerScale: number;
	/** Whether the alert should name who/what added the time. */
	showEventSource: boolean;
	/** The most recent time-add (drives the "+Xm" alert + source line). */
	lastEvent: TimerLastEvent | null;
};

export type TimerEvent =
	| { kind: "sub"; tier: SubTier; who?: string }
	| { kind: "gift"; tier: SubTier; count: number; who?: string }
	| { kind: "bits"; bits: number; who?: string }
	| { kind: "points"; rewardId?: string; rewardTitle?: string; who?: string }
	| { kind: "tip"; amount: number; who?: string }
	| { kind: "manualMinutes"; minutes: number };

/** The most recent time-add, recorded for the overlay's "+Xm" alert. */
export type TimerLastEvent = { at: number; minutes: number; label: string };

export type TimerConfigError = { path: string; message: string };
export type TimerConfigResult =
	| { ok: true; config: TimerConfig }
	| { ok: false; errors: TimerConfigError[] };

const MIN = 60_000;
export const MAX_CHANNEL_POINT_RULES = 50;
/** Sanity ceiling so a typo can't set a 10-year timer. */
export const MAX_MINUTES_LIMIT = 525_600; // one year
export const MAX_EMOJIS = 24;
/** Ceiling on the per-add emote burst so a typo can't spawn thousands of nodes. */
export const MAX_EMOTE_COUNT = 80;
export const DEFAULT_EMOTE_COUNT = 26;
/** Emotes well up by default (the original behaviour). */
export const DEFAULT_EMOTE_DIRECTION: EmoteDirection = "up";
/** Longest single entry: fits a unicode emoji OR a Twitch emote CDN URL. */
const MAX_EMOJI_LEN = 300;

/** Hosts whose https images we allow as emote glyphs. Operator-set image URLs
 * that aren't on this list never reach an <img src> on the public overlay. */
const EMOTE_CDN_HOSTS = new Set([
	"static-cdn.jtvnw.net", // Twitch
	"cdn.7tv.app", // 7TV
	"cdn.betterttv.net", // BTTV
	"cdn.frankerfacez.com", // FFZ
]);

const DANGEROUS_SCHEME = /^(javascript|data|vbscript):/i;

/**
 * Normalise one emoji entry, or return null to drop it.
 *
 * An entry is either a bare unicode emoji / text grapheme (rendered as text) or
 * an https image URL on a known emote CDN (rendered as <img>). The overlay/control
 * render an `<img src>` only for `https://` entries, so the only injection vector
 * is a non-allowlisted https URL — that, plus any script/data URI or other
 * protocol, is rejected here. Plain text (incl. ascii emotes like ":)") passes.
 */
export function sanitizeEmoji(raw: string): string | null {
	const v = raw.trim();
	if (!v || v.length > MAX_EMOJI_LEN) return null;
	if (DANGEROUS_SCHEME.test(v)) return null;
	if (v.includes("://")) {
		if (!v.startsWith("https://")) return null; // http://, ftp://, …
		let host: string;
		try {
			host = new URL(v).hostname.toLowerCase();
		} catch {
			return null;
		}
		return EMOTE_CDN_HOSTS.has(host) ? v : null;
	}
	return v;
}

/**
 * True if `u` is an https image URL on an allowed emote CDN. The `/emote` proxy
 * (apps/server) only fetches URLs that pass this, so it can't be turned into an
 * open SSRF proxy for arbitrary hosts.
 */
export function isAllowedEmoteUrl(u: string): boolean {
	if (!u.startsWith("https://") || u.length > MAX_EMOJI_LEN) return false;
	try {
		return EMOTE_CDN_HOSTS.has(new URL(u).hostname.toLowerCase());
	} catch {
		return false;
	}
}

/** Wolf-themed drift set, used when a config has none (incl. old saved rows). */
export const DEFAULT_TIMER_EMOJIS = ["🐺", "🌙", "⚡", "💙", "🔥", "✨", "🎮", "🏆"];

export function defaultTimerConfig(): TimerConfig {
	return {
		startMinutes: 60,
		maxMinutes: 0,
		sub: { t1: 5, t2: 10, t3: 25, prime: 5 },
		giftSubMinutes: 5,
		bitsPer100Minutes: 1,
		channelPoints: [],
		emojis: [...DEFAULT_TIMER_EMOJIS],
		emoteCount: DEFAULT_EMOTE_COUNT,
		emoteDirection: DEFAULT_EMOTE_DIRECTION,
		showEventSource: true,
		autoPauseOnOffline: true,
		tipMinutesPerDollar: 1,
		tipDollarsPerSub: 5,
	};
}

/** Subs a tip is worth toward the reward goals (0 if tips don't advance goals). */
export function tipSubs(amount: number, config: TimerConfig): number {
	const per = config.tipDollarsPerSub;
	return per > 0 ? Math.max(0, amount) / per : 0;
}

export function defaultTimerState(config: TimerConfig = defaultTimerConfig()): TimerState {
	return {
		running: false,
		endsAt: null,
		remainingMs: Math.round(config.startMinutes * MIN),
		totalAddedMs: 0,
		lastEvent: null,
		autoPaused: false,
	};
}

export function defaultTimerDoc(): TimerDoc {
	const config = defaultTimerConfig();
	return { config, state: defaultTimerState(config) };
}

/**
 * Backfill top-level config keys missing on rows persisted before a field
 * existed (e.g. `theme`, `emojis`), so the operator editor never dereferences an
 * absent field. The read boundary in store.ts runs every raw timer doc through
 * this — see the round-trip test guarding new fields against the #20 crash class.
 */
export function withTimerConfigDefaults(doc: TimerDoc): TimerDoc {
	return { ...doc, config: { ...defaultTimerConfig(), ...doc.config } };
}

/** Zero-pad to two digits (e.g. 5 → "05"). Shared by the overlay + control formatters. */
export const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Split a duration in ms into whole days / hours / minutes / seconds (clamped at
 * zero). Shared so the overlay countdown and the control panel format from one
 * implementation instead of three copies of the same divmod.
 */
export function splitDuration(ms: number): { d: number; h: number; m: number; s: number } {
	const total = Math.max(0, Math.floor(ms / 1000));
	return {
		d: Math.floor(total / 86400),
		h: Math.floor((total % 86400) / 3600),
		m: Math.floor((total % 3600) / 60),
		s: total % 60,
	};
}

/** Current remaining ms, whether running or paused. */
export function currentRemainingMs(state: TimerState, now: number): number {
	if (state.running && state.endsAt != null) return Math.max(0, state.endsAt - now);
	return Math.max(0, state.remainingMs);
}

function capMs(config: TimerConfig): number {
	return config.maxMinutes > 0 ? config.maxMinutes * MIN : Number.POSITIVE_INFINITY;
}

/** Add (or remove, if negative) milliseconds, respecting the cap and zero floor. */
export function addMs(config: TimerConfig, state: TimerState, ms: number, now: number): TimerState {
	const cap = capMs(config);
	const next: TimerState = { ...state };
	if (state.running && state.endsAt != null) {
		const remaining = Math.max(0, state.endsAt - now);
		const updated = Math.min(cap, Math.max(0, remaining + ms));
		next.endsAt = now + updated;
	} else {
		next.remainingMs = Math.min(cap, Math.max(0, state.remainingMs + ms));
	}
	if (ms > 0) next.totalAddedMs = state.totalAddedMs + ms;
	return next;
}

export function start(state: TimerState, now: number): TimerState {
	if (state.running) return state;
	// Manual start clears the auto-pause flag (this is a deliberate resume).
	return {
		...state,
		running: true,
		endsAt: now + Math.max(0, state.remainingMs),
		autoPaused: false,
	};
}

export function pause(state: TimerState, now: number): TimerState {
	// Manual pause — always clears the auto-pause flag so a later stream.online
	// won't override the operator's choice.
	if (!state.running || state.endsAt == null) {
		return state.autoPaused ? { ...state, autoPaused: false } : state;
	}
	return {
		...state,
		running: false,
		endsAt: null,
		remainingMs: Math.max(0, state.endsAt - now),
		autoPaused: false,
	};
}

/** Pause because the stream went offline. Tags the pause as automatic. No-op if already paused. */
export function autoPause(state: TimerState, now: number): TimerState {
	if (!state.running || state.endsAt == null) return state;
	return {
		...state,
		running: false,
		endsAt: null,
		remainingMs: Math.max(0, state.endsAt - now),
		autoPaused: true,
	};
}

/** Resume on stream.online — only if the timer was auto-paused (never overrides a manual pause). */
export function autoResume(state: TimerState, now: number): TimerState {
	if (state.running || !state.autoPaused) return state;
	return {
		...state,
		running: true,
		endsAt: now + Math.max(0, state.remainingMs),
		autoPaused: false,
	};
}

/** Reset to the configured start time (stopped, stats cleared). */
export function reset(config: TimerConfig): TimerState {
	return defaultTimerState(config);
}

/** Minutes a given event is worth under the current config. */
export function eventMinutes(config: TimerConfig, event: TimerEvent): number {
	switch (event.kind) {
		case "sub":
			return config.sub[event.tier];
		case "gift":
			return config.giftSubMinutes * Math.max(0, event.count);
		case "bits":
			return (Math.max(0, event.bits) / 100) * config.bitsPer100Minutes;
		case "points": {
			const rule = config.channelPoints.find((r) =>
				event.rewardId && r.rewardId
					? r.rewardId === event.rewardId
					: r.rewardTitle.toLowerCase() === (event.rewardTitle ?? "").toLowerCase(),
			);
			return rule?.minutes ?? 0;
		}
		case "tip":
			return config.tipMinutesPerDollar * Math.max(0, event.amount);
		case "manualMinutes":
			return event.minutes;
	}
}

/**
 * Human label for the time-add alert: who (if known) + what. Manual adds have no
 * source, so they show just the "+Xm" with no label.
 */
export function eventLabel(event: TimerEvent): string {
	const who = "who" in event && event.who ? event.who.trim() : "";
	const tag = (base: string) => (who ? `${who} · ${base}` : base);
	switch (event.kind) {
		case "sub":
			return tag("Sub");
		case "gift":
			return tag(`Gift ×${Math.max(1, event.count)}`);
		case "bits":
			return tag(`${Math.max(0, event.bits)} bits`);
		case "points":
			return tag(event.rewardTitle?.trim() || "Channel points");
		case "tip":
			return tag(`$${event.amount} tip`);
		case "manualMinutes":
			return "";
	}
}

/**
 * Apply an event, returning the new state and how many ms were added.
 *
 * `preview` (the control panel's test buttons) still fires the overlay alert so
 * the overlay can be tested, but leaves the clock and stats untouched — no time
 * is added and `addedMs` is 0.
 */
export function applyEvent(
	config: TimerConfig,
	state: TimerState,
	event: TimerEvent,
	now: number,
	preview = false,
): { state: TimerState; addedMs: number } {
	const ms = Math.round(eventMinutes(config, event) * MIN);
	const next = preview ? state : addMs(config, state, ms, now);
	// Record the add so the overlay can show "+Xm" + its source. Only positive
	// adds count (a −5m correction shouldn't fire the celebratory alert).
	const state2 =
		ms > 0
			? {
					...next,
					lastEvent: {
						at: now,
						minutes: Math.max(1, Math.round(ms / MIN)),
						label: eventLabel(event),
					},
				}
			: next;
	return { state: state2, addedMs: preview ? 0 : ms };
}

/**
 * Project the timer doc into its public payload. The overlay `theme` is shared
 * with the rewards card and lives in the rewards doc (see state.ts) — the public
 * router reads it there and passes it in, so both overlays always match.
 */
export function toPublicTimer(doc: TimerDoc, now: number, theme: OverlayTheme): PublicTimer {
	const emojis = doc.config.emojis?.length ? doc.config.emojis : DEFAULT_TIMER_EMOJIS;
	return {
		running: doc.state.running,
		endsAt: doc.state.endsAt,
		remainingMs: currentRemainingMs(doc.state, now),
		autoPaused: doc.state.autoPaused ?? false,
		serverNow: now,
		emojis,
		emoteCount: doc.config.emoteCount ?? DEFAULT_EMOTE_COUNT,
		emoteDirection: doc.config.emoteDirection ?? DEFAULT_EMOTE_DIRECTION,
		gradient: resolveThemeGradient(theme),
		textColor: resolveTextColor(theme),
		font: theme.font,
		corners: theme.corners,
		showLabel: theme.showLabel,
		label: theme.label,
		showStatus: theme.showStatus,
		showUnits: theme.showUnits,
		timerScale: clampScale(theme.timerScale),
		showEventSource: doc.config.showEventSource ?? true,
		lastEvent: doc.state.lastEvent ?? null,
	};
}

// ---- validation (import / setConfig) -------------------------------------

function num(
	errors: TimerConfigError[],
	path: string,
	v: unknown,
	{ min = 0, max = MAX_MINUTES_LIMIT }: { min?: number; max?: number } = {},
): number {
	if (typeof v !== "number" || !Number.isFinite(v)) {
		errors.push({ path, message: "must be a number" });
		return 0;
	}
	if (v < min) {
		errors.push({ path, message: `must be >= ${min}` });
		return min;
	}
	if (v > max) {
		errors.push({ path, message: `must be <= ${max}` });
		return max;
	}
	return v;
}

/**
 * Validate an arbitrary import document into a normalized TimerConfig.
 * Accepts either a bare config or `{ config: {...} }` (an export). Collects all
 * errors and never partial-writes (mirrors `state.ts` validateImport).
 */
export function validateTimerConfig(input: unknown): TimerConfigResult {
	const errors: TimerConfigError[] = [];
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		return { ok: false, errors: [{ path: "(root)", message: "must be a JSON object" }] };
	}
	// Unwrap a full export ({ config, state }) or take the object as the config.
	const raw = (input as Record<string, unknown>).config ?? input;
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return { ok: false, errors: [{ path: "config", message: "must be an object" }] };
	}
	const r = raw as Record<string, unknown>;
	const subRaw = (r.sub ?? {}) as Record<string, unknown>;

	const config: TimerConfig = {
		startMinutes: num(errors, "startMinutes", r.startMinutes, { min: 0 }),
		maxMinutes: num(errors, "maxMinutes", r.maxMinutes, { min: 0 }),
		sub: {
			t1: num(errors, "sub.t1", subRaw.t1),
			t2: num(errors, "sub.t2", subRaw.t2),
			t3: num(errors, "sub.t3", subRaw.t3),
			prime: num(errors, "sub.prime", subRaw.prime),
		},
		giftSubMinutes: num(errors, "giftSubMinutes", r.giftSubMinutes),
		bitsPer100Minutes: num(errors, "bitsPer100Minutes", r.bitsPer100Minutes),
		channelPoints: [],
		emojis: [...DEFAULT_TIMER_EMOJIS],
		// Optional on older import docs; absent → the default burst size.
		emoteCount:
			r.emoteCount === undefined
				? DEFAULT_EMOTE_COUNT
				: Math.round(num(errors, "emoteCount", r.emoteCount, { min: 0, max: MAX_EMOTE_COUNT })),
		// Optional; absent or unknown → the default well-up direction.
		emoteDirection: EMOTE_DIRECTIONS.includes(r.emoteDirection as EmoteDirection)
			? (r.emoteDirection as EmoteDirection)
			: DEFAULT_EMOTE_DIRECTION,
		// Alert-source is optional; absent → on (lenient, like emojis).
		showEventSource: typeof r.showEventSource === "boolean" ? r.showEventSource : true,
		// Optional; absent → on (auto-pause/resume around stream offline).
		autoPauseOnOffline: typeof r.autoPauseOnOffline === "boolean" ? r.autoPauseOnOffline : true,
		// Tip rates are optional; absent → defaults.
		tipMinutesPerDollar:
			r.tipMinutesPerDollar === undefined
				? 1
				: num(errors, "tipMinutesPerDollar", r.tipMinutesPerDollar, { min: 0, max: 1000 }),
		tipDollarsPerSub:
			r.tipDollarsPerSub === undefined
				? 5
				: num(errors, "tipDollarsPerSub", r.tipDollarsPerSub, { min: 0, max: 100000 }),
	};

	// Emoji are optional; absent → keep the wolf default set.
	const em = r.emojis;
	if (em !== undefined) {
		if (!Array.isArray(em)) {
			errors.push({ path: "emojis", message: "must be an array" });
		} else if (em.length > MAX_EMOJIS) {
			errors.push({ path: "emojis", message: `max ${MAX_EMOJIS} emoji` });
		} else {
			const cleaned: string[] = [];
			em.forEach((item, i) => {
				if (typeof item !== "string") {
					errors.push({ path: `emojis[${i}]`, message: "must be a string" });
					return;
				}
				const ok = sanitizeEmoji(item);
				if (ok) cleaned.push(ok);
			});
			config.emojis = cleaned;
		}
	}

	const cp = r.channelPoints;
	if (cp !== undefined) {
		if (!Array.isArray(cp)) {
			errors.push({ path: "channelPoints", message: "must be an array" });
		} else if (cp.length > MAX_CHANNEL_POINT_RULES) {
			errors.push({ path: "channelPoints", message: `max ${MAX_CHANNEL_POINT_RULES} rules` });
		} else {
			cp.forEach((item, i) => {
				if (typeof item !== "object" || item === null) {
					errors.push({ path: `channelPoints[${i}]`, message: "must be an object" });
					return;
				}
				const o = item as Record<string, unknown>;
				const title = typeof o.rewardTitle === "string" ? o.rewardTitle.trim() : "";
				if (!title) {
					errors.push({
						path: `channelPoints[${i}].rewardTitle`,
						message: "required non-empty string",
					});
				}
				const minutes = num(errors, `channelPoints[${i}].minutes`, o.minutes);
				if (o.rewardId !== undefined && typeof o.rewardId !== "string") {
					errors.push({ path: `channelPoints[${i}].rewardId`, message: "must be a string" });
				}
				config.channelPoints.push({
					rewardTitle: title,
					minutes,
					...(typeof o.rewardId === "string" && o.rewardId ? { rewardId: o.rewardId } : {}),
				});
			});
		}
	}

	if (errors.length > 0) return { ok: false, errors };
	return { ok: true, config };
}
