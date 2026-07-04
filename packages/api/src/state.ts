/**
 * Domain logic for the Wolfathon tracker.
 *
 * One rule governs this whole file: `reward` is the only goal field that may
 * ever reach the overlay. `note` is internal (e.g. "10 subs") and is stripped
 * server-side by {@link stripNotes} before any public response.
 */

import {
	defaultOverlayTheme,
	type OverlayTheme,
	resolveThemeGradient,
	type ThemeCorners,
	type ThemeError,
	type ThemeFont,
	validateOverlayTheme,
} from "./theme";
import type { TimerEvent } from "./timer";

/** A goal as stored internally (includes the private `note`). */
export type Goal = {
	id: string;
	reward: string;
	note?: string;
	unlocked: boolean;
	/** Sub-count milestone for this reward. Undefined = no numeric target. */
	target?: number;
	/** Operator-only: hidden goals never reach the overlay (a secret reward). */
	hidden?: boolean;
};

/** The full tracker document, stored as JSON in the single DB row. */
export type Data = {
	goals: Goal[];
	/** Index of the next goal to unlock (== number of unlocked goals at the front). */
	currentIndex: number;
	/** Running sub count — fed by Twitch sub/gift events + manual adjust. */
	currentSubs: number;
	/** Overlay colours + chrome. Optional on old rows; defaults to brand. */
	theme: OverlayTheme;
};

/** A goal as sent to the overlay — note, target AND hidden flag removed. */
export type PublicGoal = Omit<Goal, "note" | "target" | "hidden">;

/** The tracker document as sent to the overlay — notes removed. */
export type PublicData = {
	goals: PublicGoal[];
	currentIndex: number;
	/** Current sub count (for the next-goal progress bar). */
	currentSubs: number;
	/** Target of the NEXT goal only — never future targets. Null if none. */
	nextTarget: number | null;
	/** Resolved accent gradient stops. */
	gradient: string[];
	/** Reward text colour: `"auto"` (→ white on the dark card) or a hex. */
	textColor: string;
	/** Display font key. */
	font: ThemeFont;
	/** Corner style. */
	corners: ThemeCorners;
	/** Show the "NEXT REWARD" eyebrow on the rewards card. */
	showRewardsLabel: boolean;
	/** Show the live status dot. */
	showLiveDot: boolean;
	/** Show the next-goal progress bar. */
	showProgressBar: boolean;
	/** Show the "Coming up" row of the next few upcoming rewards. */
	showNext: boolean;
};

export const MAX_TARGET = 10_000_000;

/** How many subs an event represents (sub = 1, gift = count, else 0). */
export function subsFromEvent(event: TimerEvent): number {
	if (event.kind === "sub") return 1;
	if (event.kind === "gift") return Math.max(0, event.count);
	return 0;
}

/** Round up to a clean step so a bumped target reads nicely (14, 30, 250…). */
function roundUpClean(n: number): number {
	const step = n < 20 ? 1 : n < 100 ? 5 : n < 1000 ? 10 : 50;
	return Math.ceil(n / step) * step;
}

/**
 * Keep upcoming goal targets ahead of the current sub count: any target at/below
 * the running floor is raised ~10% above it (and kept strictly ascending). The
 * floor starts at `currentSubs`, so a goal set below where we already are floats
 * back up instead of sitting permanently "already met". Returns how many moved.
 *
 * Unlocked goals are already awarded, so they're left exactly as typed — only
 * upcoming (still-locked) goals get raised.
 */
export function bumpPassedGoals(
	goals: Goal[],
	currentSubs: number,
): { goals: Goal[]; bumped: number } {
	let floor = Math.max(0, currentSubs);
	let bumped = 0;
	const next = goals.map((g) => {
		if (g.target == null) return g;
		// Already-awarded goals never move — keep their target, but let it hold the
		// floor so upcoming targets still sort above a manually-high unlocked one.
		if (g.unlocked) {
			floor = Math.max(floor, g.target);
			return g;
		}
		let target = g.target;
		if (target <= floor) {
			target = Math.min(MAX_TARGET, roundUpClean(Math.max(floor * 1.1, floor + 1)));
			bumped++;
		}
		floor = Math.max(floor, target);
		return target === g.target ? g : { ...g, target };
	});
	return { goals: next, bumped };
}

/** A single import validation failure. `index` is the goal row, or -1 for document-level errors. */
export type ImportError = { index: number; message: string };

export type ImportResult =
	| { ok: true; data: Data; rewards: string[] }
	| { ok: false; errors: ImportError[] };

export const MAX_GOALS = 50;
export const MAX_REWARD_LENGTH = 80;

/** Sample goals pre-seeded into a fresh database (mirrors the README example). */
const SAMPLE_GOALS: { reward: string; note: string; target?: number }[] = [
	{ reward: "Q&A", note: "1 sub", target: 1 },
	{ reward: "Phasmophobia", note: "5 subs", target: 5 },
	{ reward: "Onesie reveal", note: "10 subs", target: 10 },
	{ reward: "Cake on cam", note: "15 subs", target: 15 },
	{ reward: "Confetti chaos", note: "25 subs", target: 25 },
	{ reward: "Stretch goal", note: "dream" },
];

function newId(): string {
	return crypto.randomUUID();
}

/** Build the default tracker used to seed a fresh database. */
export function sampleData(): Data {
	return {
		goals: SAMPLE_GOALS.map((g) => ({
			id: newId(),
			reward: g.reward,
			note: g.note,
			unlocked: false,
			...(g.target != null ? { target: g.target } : {}),
		})),
		currentIndex: 0,
		currentSubs: 0,
		theme: defaultOverlayTheme(),
	};
}

/**
 * Backfill a stored theme against the current defaults. Themes are persisted raw
 * in D1 and never re-validated on read, so a row written before a new field
 * existed lacks that key — and `theme.<newField>` would be `undefined` at runtime
 * despite its non-optional type. Spreading over `defaultOverlayTheme()` fills every
 * missing field (so old rows get a real `label`, `showLiveDot`, …) without
 * touching values the operator did set.
 */
export function withThemeDefaults(stored: OverlayTheme | undefined): OverlayTheme {
	if (!stored) return defaultOverlayTheme();
	const merged = { ...defaultOverlayTheme(), ...stored };
	// `showLiveDot` was split out of the old combined `showStatus` toggle. A
	// pre-split row has no `showLiveDot` key, so inherit `showStatus`: a dot the
	// operator had hidden stays hidden, one they showed stays shown — instead of
	// snapping back to the default-on.
	const raw = stored as Partial<OverlayTheme>;
	if (raw.showLiveDot === undefined && raw.showStatus !== undefined) {
		merged.showLiveDot = raw.showStatus;
	}
	// `showRewardsLabel` was split out of the old combined `showLabel` eyebrow
	// toggle. A pre-split row has no `showRewardsLabel` key, so inherit `showLabel`
	// — an operator who had hidden the eyebrow keeps it hidden on the rewards card
	// too, instead of it snapping back to default-on.
	if (raw.showRewardsLabel === undefined && raw.showLabel !== undefined) {
		merged.showRewardsLabel = raw.showLabel;
	}
	return merged;
}

/**
 * Keep the tracker's invariants consistent after any mutation:
 * `currentIndex` always points at the first locked goal (or past the end when
 * everything is unlocked). Goals unlock top-to-bottom.
 */
export function recompute(data: Data): Data {
	const firstLocked = data.goals.findIndex((g) => !g.unlocked);
	return {
		goals: data.goals,
		currentIndex: firstLocked === -1 ? data.goals.length : firstLocked,
		currentSubs: Math.max(0, data.currentSubs ?? 0),
		theme: withThemeDefaults(data.theme),
	};
}

/** Remove every `note` and resolve the theme so the tracker is safe to expose publicly. */
export function stripNotes(data: Data): PublicData {
	const theme = withThemeDefaults(data.theme);
	// Hidden goals are operator-only — drop them before the overlay sees anything,
	// then recompute the next-goal pointer over what's left so a hidden reward
	// never shows (not even as the upcoming "next").
	const visible = data.goals.filter((g) => !g.hidden);
	const firstLocked = visible.findIndex((g) => !g.unlocked);
	const currentIndex = firstLocked === -1 ? visible.length : firstLocked;
	// Only the NEXT goal's target is exposed — never future ones (a big gifter
	// must not see the final ceiling).
	const nextTarget = visible[currentIndex]?.target ?? null;
	return {
		currentIndex,
		currentSubs: Math.max(0, data.currentSubs ?? 0),
		nextTarget,
		goals: visible.map(({ id, reward, unlocked }) => ({ id, reward, unlocked })),
		gradient: resolveThemeGradient(theme),
		textColor: theme.textColor,
		font: theme.font,
		corners: theme.corners,
		showRewardsLabel: theme.showRewardsLabel,
		showLiveDot: theme.showLiveDot,
		showProgressBar: theme.showProgressBar,
		showNext: theme.showNext,
	};
}

/** Normalize one optional note into a trimmed string or `undefined`. */
function cleanNote(note: unknown): string | undefined {
	if (typeof note !== "string") return undefined;
	const trimmed = note.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Validate an import document and, on success, produce a fully normalized state.
 *
 * Accepts two shapes (both keyed on `goals`):
 *  - minimal:    `{ goals: [{ reward, note? }] }`
 *  - full export: the raw state object produced by Export (`{ goals: [...], currentIndex }`)
 *
 * Behaviour:
 *  - All errors are collected; the caller must never partial-write.
 *  - Client-supplied `id` / `unlocked` / `currentIndex` are ignored.
 *  - On success every goal is reset to `unlocked: false` and `currentIndex: 0`.
 */
export function validateImport(input: unknown): ImportResult {
	const errors: ImportError[] = [];

	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		return { ok: false, errors: [{ index: -1, message: "Document must be a JSON object." }] };
	}

	const goals = (input as Record<string, unknown>).goals;
	if (!Array.isArray(goals)) {
		return { ok: false, errors: [{ index: -1, message: "`goals` must be an array." }] };
	}
	if (goals.length === 0) {
		return {
			ok: false,
			errors: [{ index: -1, message: "`goals` must contain at least one goal." }],
		};
	}
	if (goals.length > MAX_GOALS) {
		return {
			ok: false,
			errors: [{ index: -1, message: `Too many goals: ${goals.length} (max ${MAX_GOALS}).` }],
		};
	}

	const normalized: Goal[] = [];
	goals.forEach((raw, index) => {
		if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
			errors.push({ index, message: "Goal must be an object." });
			return;
		}
		const reward = (raw as Record<string, unknown>).reward;
		if (typeof reward !== "string") {
			errors.push({ index, message: "`reward` is required and must be a string." });
			return;
		}
		const trimmed = reward.trim();
		if (trimmed.length === 0) {
			errors.push({ index, message: "`reward` must not be empty." });
			return;
		}
		if (trimmed.length > MAX_REWARD_LENGTH) {
			errors.push({
				index,
				message: `\`reward\` is too long (${trimmed.length} chars, max ${MAX_REWARD_LENGTH}).`,
			});
			return;
		}
		const note = (raw as Record<string, unknown>).note;
		if (note !== undefined && typeof note !== "string") {
			errors.push({ index, message: "`note` must be a string when present." });
			return;
		}
		const rawTarget = (raw as Record<string, unknown>).target;
		let target: number | undefined;
		if (rawTarget !== undefined && rawTarget !== null) {
			if (typeof rawTarget !== "number" || !Number.isFinite(rawTarget) || rawTarget < 0) {
				errors.push({ index, message: "`target` must be a non-negative number when present." });
				return;
			}
			target = Math.min(MAX_TARGET, Math.round(rawTarget));
		}
		const hidden = (raw as Record<string, unknown>).hidden === true;
		normalized.push({
			id: newId(),
			reward: trimmed,
			note: cleanNote(note),
			unlocked: false,
			...(target != null ? { target } : {}),
			...(hidden ? { hidden: true } : {}),
		});
	});

	// Optional document-level current sub count.
	const rawSubs = (input as Record<string, unknown>).currentSubs;
	let currentSubs = 0;
	if (rawSubs !== undefined) {
		if (typeof rawSubs !== "number" || !Number.isFinite(rawSubs) || rawSubs < 0) {
			errors.push({ index: -1, message: "`currentSubs` must be a non-negative number." });
		} else {
			currentSubs = Math.round(rawSubs);
		}
	}

	// Theme is optional on import; absent → brand default (the import router
	// preserves the operator's existing theme when the doc omits one).
	const themeErrors: ThemeError[] = [];
	const theme = validateOverlayTheme((input as Record<string, unknown>).theme, themeErrors);
	themeErrors.forEach((e) => errors.push({ index: -1, message: `${e.path}: ${e.message}` }));

	if (errors.length > 0) {
		return { ok: false, errors };
	}

	return {
		ok: true,
		data: { goals: normalized, currentIndex: 0, currentSubs, theme },
		rewards: normalized.map((g) => g.reward),
	};
}
