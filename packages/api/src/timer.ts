/**
 * Subathon timer domain.
 *
 * The timer is timestamp-based, not tick-based: while running we store `endsAt`
 * (epoch ms); while paused we store the frozen `remainingMs`. The overlay counts
 * down locally from these values and resyncs on its poll, so we never need a
 * websocket or Durable Object.
 *
 * Time is added by configurable events (subs / gifts / bits / channel points),
 * honouring an optional cap. Pure functions only — persistence lives in store.ts.
 */

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
};

export type TimerState = {
  running: boolean;
  /** Epoch ms the timer hits zero (only when running). */
  endsAt: number | null;
  /** Frozen remaining ms (authoritative when paused/stopped). */
  remainingMs: number;
  /** Total ms ever added by events — for stats/goals. */
  totalAddedMs: number;
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
};

export type TimerEvent =
  | { kind: "sub"; tier: SubTier }
  | { kind: "gift"; tier: SubTier; count: number }
  | { kind: "bits"; bits: number }
  | { kind: "points"; rewardId?: string; rewardTitle?: string }
  | { kind: "manualMinutes"; minutes: number };

export type TimerConfigError = { path: string; message: string };
export type TimerConfigResult =
  | { ok: true; config: TimerConfig }
  | { ok: false; errors: TimerConfigError[] };

const MIN = 60_000;
export const MAX_CHANNEL_POINT_RULES = 50;
/** Sanity ceiling so a typo can't set a 10-year timer. */
export const MAX_MINUTES_LIMIT = 525_600; // one year
export const MAX_EMOJIS = 24;
/** Longest single entry: fits a unicode emoji OR a Twitch emote CDN URL. */
const MAX_EMOJI_LEN = 300;

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
  };
}

export function defaultTimerState(config: TimerConfig = defaultTimerConfig()): TimerState {
  return {
    running: false,
    endsAt: null,
    remainingMs: Math.round(config.startMinutes * MIN),
    totalAddedMs: 0,
  };
}

export function defaultTimerDoc(): TimerDoc {
  const config = defaultTimerConfig();
  return { config, state: defaultTimerState(config) };
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
export function addMs(
  config: TimerConfig,
  state: TimerState,
  ms: number,
  now: number,
): TimerState {
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
  return { ...state, running: true, endsAt: now + Math.max(0, state.remainingMs) };
}

export function pause(state: TimerState, now: number): TimerState {
  if (!state.running || state.endsAt == null) return state;
  return { ...state, running: false, endsAt: null, remainingMs: Math.max(0, state.endsAt - now) };
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
    case "manualMinutes":
      return event.minutes;
  }
}

/** Apply an event, returning the new state and how many ms were added. */
export function applyEvent(
  config: TimerConfig,
  state: TimerState,
  event: TimerEvent,
  now: number,
): { state: TimerState; addedMs: number } {
  const ms = Math.round(eventMinutes(config, event) * MIN);
  return { state: addMs(config, state, ms, now), addedMs: ms };
}

export function toPublicTimer(doc: TimerDoc, now: number): PublicTimer {
  const emojis = doc.config.emojis?.length ? doc.config.emojis : DEFAULT_TIMER_EMOJIS;
  return {
    running: doc.state.running,
    endsAt: doc.state.endsAt,
    remainingMs: currentRemainingMs(doc.state, now),
    serverNow: now,
    emojis,
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
        const v = item.trim();
        if (v && v.length <= MAX_EMOJI_LEN) cleaned.push(v);
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
          errors.push({ path: `channelPoints[${i}].rewardTitle`, message: "required non-empty string" });
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
