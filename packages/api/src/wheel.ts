/**
 * Wheel-of-dares domain ("Howlwheel").
 *
 * One D1 JSON doc (id = "wheel") holds the operator's slots, a capped spin
 * history, and the single live `pendingSpin` channel the overlay polls. These
 * are PURE functions + pure geometry — no DB, no React, no baked-in randomness
 * (callers inject `r`/`rand`). Persistence lives in store.ts; the public/operator
 * tRPC procedures in routers/*.
 *
 * Geometry convention: angles are degrees measured CLOCKWISE from the top
 * (12 o'clock = 0°), matching a fixed pointer at the top of the SVG wheel and a
 * positive (clockwise) `rotation` applied to the wheel group. `targetIndex` and
 * every geometry input/return index name a position in the SAME array the caller
 * passes — the server picks over `enabledSlots(doc)` and the overlay renders
 * `enabledSlots(doc)` in identical order, so an index always names one slot.
 */

import { secureRandom } from "./random";
import { expandHex, HEX_COLOR } from "./theme";

export type WheelSlot = {
	id: string;
	/** The dare. */
	label: string;
	/** Integer >= 1 — scales the arc size AND the weighted-random odds. */
	weight: number;
	/** Optional hex; absent → a palette colour picked by render index. */
	color?: string;
	enabled: boolean;
};

/** A spin history entry (newest first; capped to {@link MAX_HISTORY}). */
export type WheelSpin = { id: string; label: string; at: number };

/** The overlay's live spin channel. Cleared on any structural slot change. */
export type PendingSpin = { spinId: string; targetIndex: number; at: number } | null;

export type WheelDoc = {
	slots: WheelSlot[];
	history: WheelSpin[];
	pendingSpin: PendingSpin;
};

/** One slot as sent to the overlay — render-only fields, no id, never the token. */
export type PublicWheelSlot = {
	/** Position in the enabled-slot render order (the index `pendingSpin` names). */
	index: number;
	label: string;
	/** Resolved colour (slot.color or the palette fallback) — always a #rrggbb. */
	color: string;
	weight: number;
};

/** The wheel as sent to the overlay — enabled slots only, no internal fields. */
export type PublicWheel = { slots: PublicWheelSlot[] };

export const MAX_SLOTS = 50;
export const MAX_LABEL_LEN = 80;
export const MAX_WEIGHT = 1000;
export const MAX_HISTORY = 25;
/** Forward spin always sweeps at least this many whole turns before landing. */
export const DEFAULT_MIN_TURNS = 5;

/**
 * Default slice colours, cycled by render index when a slot has no explicit hex.
 * A cohesive "moonlit pack" set — cool blues/teals/indigo with a single ember
 * accent for contrast — so the wheel reads as one palette rather than rainbow
 * confetti, while neighbours stay distinct. The overlay picks dark-or-white ink
 * per slice from each colour's luma, so every entry stays AA-legible.
 */
export const WHEEL_PALETTE = [
	"#2f6df0", // azure
	"#21c0a8", // teal
	"#6e6cf6", // indigo
	"#36c6f4", // sky cyan
	"#9b6cf6", // amethyst
	"#46d39a", // mint
	"#5b8def", // cornflower
	"#f0a24b", // ember (warm accent)
	"#7d8bd6", // periwinkle
	"#2aa9e0", // ocean
] as const;

/**
 * The default wolf-themed wheel-of-dares, seeded on first read of a fresh DB.
 * A pack-friendly mix: a few physical bits, a few voice/performance bits, some
 * chat-interaction ones, plus the obligatory "free spin". Operators edit these
 * in the dashboard — this is just a fun starting wheel.
 */
const SAMPLE_DARES = [
	"Howl on mic",
	"10 push-ups",
	"60-sec dance break",
	"Best villain laugh",
	"Talk in an accent (3 min)",
	"Chat picks next game",
	"Sing a song chorus",
	"Worst joke you know",
	"Compliment a random viewer",
	"Mystery dare from a mod",
	"Baby voice (2 min)",
	"Hydrate + stretch break",
	"Plushie on cam",
	"FREE SPIN — go again",
];

function newId(): string {
	return crypto.randomUUID();
}

export function defaultWheelDoc(): WheelDoc {
	return {
		slots: SAMPLE_DARES.map((label, i) => ({
			id: newId(),
			label,
			weight: 1,
			color: WHEEL_PALETTE[i % WHEEL_PALETTE.length]!,
			enabled: true,
		})),
		history: [],
		pendingSpin: null,
	};
}

/**
 * Backfill missing top-level keys on rows persisted before a field existed, so
 * the operator UI never dereferences an absent array. Mirrors
 * `withTimerConfigDefaults` — the store read boundary runs every raw doc through
 * this.
 */
export function withWheelDefaults(doc: WheelDoc): WheelDoc {
	return {
		slots: Array.isArray(doc.slots) ? doc.slots.map(normalizeSlot) : [],
		history: Array.isArray(doc.history) ? doc.history : [],
		pendingSpin: doc.pendingSpin ?? null,
	};
}

/** Clamp a weight to a positive integer in [1, MAX_WEIGHT]. */
export function clampWeight(weight: unknown): number {
	const n = typeof weight === "number" && Number.isFinite(weight) ? Math.round(weight) : 1;
	return Math.max(1, Math.min(MAX_WEIGHT, n));
}

/** Normalize one stored/legacy slot to a well-formed WheelSlot. */
function normalizeSlot(raw: WheelSlot): WheelSlot {
	const color =
		typeof raw.color === "string" && HEX_COLOR.test(raw.color) ? expandHex(raw.color) : undefined;
	return {
		id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
		label: typeof raw.label === "string" ? raw.label.trim().slice(0, MAX_LABEL_LEN) : "",
		weight: clampWeight(raw.weight),
		enabled: raw.enabled !== false,
		...(color ? { color } : {}),
	};
}

/** Enabled slots in array order — the render set, and the set indices name. */
export function enabledSlots(doc: WheelDoc): WheelSlot[] {
	return doc.slots.filter((s) => s.enabled);
}

/** Resolve a slot's display colour (explicit hex or the palette fallback). */
export function slotColor(slot: { color?: string }, index: number): string {
	return slot.color && HEX_COLOR.test(slot.color)
		? expandHex(slot.color)
		: WHEEL_PALETTE[index % WHEEL_PALETTE.length]!;
}

/** Project the doc into the overlay payload — enabled slots, render-only fields. */
export function toPublicWheel(doc: WheelDoc): PublicWheel {
	return {
		slots: enabledSlots(doc).map((s, index) => ({
			index,
			label: s.label,
			color: slotColor(s, index),
			weight: clampWeight(s.weight),
		})),
	};
}

// ---- pure geometry --------------------------------------------------------

export type WheelArc = {
	index: number;
	/** Clockwise-from-top degrees: arc occupies [start, end). */
	start: number;
	end: number;
	/** Slice centre angle (where the pointer lands for this slot). */
	center: number;
	sweep: number;
	weight: number;
};

/**
 * Weighted arcs for the passed slots (clockwise from top). `sweep = 360 *
 * weight / total`; weights are clamped to a positive int first. Returns [] for
 * an empty set.
 */
export function computeArcs(slots: { weight: number }[]): WheelArc[] {
	const weights = slots.map((s) => clampWeight(s.weight));
	const total = weights.reduce((a, b) => a + b, 0);
	if (total === 0) return [];
	const arcs: WheelArc[] = [];
	let cursor = 0;
	weights.forEach((weight, index) => {
		const sweep = (360 * weight) / total;
		const start = cursor;
		const end = index === weights.length - 1 ? 360 : start + sweep;
		arcs.push({ index, start, end, center: start + sweep / 2, sweep, weight });
		cursor = end;
	});
	return arcs;
}

/** Positive remainder in [0, 360). */
function mod360(x: number): number {
	return ((x % 360) + 360) % 360;
}

/**
 * Forward rotation (deg) that lands `targetIndex` dead-centre under the top
 * pointer, spinning clockwise by at least `minTurns` full turns past `current`.
 * Deterministic — always the slice centre, so a replayed spin lands identically.
 * Returns `current` unchanged when the slot set is empty or the index is absent.
 */
export function finalRotation(
	slots: { weight: number }[],
	targetIndex: number,
	current = 0,
	minTurns = DEFAULT_MIN_TURNS,
): number {
	const arcs = computeArcs(slots);
	const arc = arcs[targetIndex];
	if (!arc) return current;
	// A slice centred at `c` in the wheel frame sits under the top pointer when
	// rotation R satisfies c + R ≡ 0 (mod 360) → R ≡ -c.
	const residue = mod360(-arc.center);
	const floor = current + Math.max(0, minTurns) * 360;
	return floor + mod360(residue - floor);
}

/**
 * Inverse of {@link finalRotation}: which slot index sits under the top pointer
 * at `rotation`. Returns -1 for an empty set.
 */
export function slotIndexAtPointer(slots: { weight: number }[], rotation: number): number {
	const arcs = computeArcs(slots);
	if (arcs.length === 0) return -1;
	const pointer = mod360(-rotation);
	// Last arc's end is exactly 360; the half-open [start,end) covers [0,360).
	const hit = arcs.find((a) => pointer >= a.start && pointer < a.end);
	return (hit ?? arcs[arcs.length - 1]!).index;
}

/**
 * Weighted pick for `r` in [0,1) — index whose cumulative weight band contains
 * `r * total`. Randomness is injected so callers stay deterministic in tests.
 * Returns -1 for an empty set.
 */
export function pickWeighted(slots: { weight: number }[], r: number): number {
	const weights = slots.map((s) => clampWeight(s.weight));
	const total = weights.reduce((a, b) => a + b, 0);
	if (total === 0) return -1;
	const threshold = Math.max(0, Math.min(1, r)) * total;
	let cursor = 0;
	for (let i = 0; i < weights.length; i++) {
		cursor += weights[i]!;
		if (threshold < cursor) return i;
	}
	return weights.length - 1; // r === 1 fallthrough
}

// ---- pure doc mutations ---------------------------------------------------

export type SlotPatch = {
	id?: string;
	label?: string;
	weight?: number;
	color?: string;
	enabled?: boolean;
};

/**
 * Insert or update a slot (matched by id). Clears `pendingSpin` — any slot edit
 * can shift which index names which slot, so a stale pending index must not
 * survive. An absent/blank id with a non-empty label appends a new slot.
 */
export function upsertSlot(doc: WheelDoc, patch: SlotPatch): WheelDoc {
	const cleanColor =
		patch.color !== undefined && HEX_COLOR.test(patch.color) ? expandHex(patch.color) : undefined;
	const existing = patch.id ? doc.slots.find((s) => s.id === patch.id) : undefined;
	if (existing) {
		const slots = doc.slots.map((s) => {
			if (s.id !== existing.id) return s;
			const next: WheelSlot = {
				...s,
				...(patch.label !== undefined ? { label: patch.label.trim().slice(0, MAX_LABEL_LEN) } : {}),
				...(patch.weight !== undefined ? { weight: clampWeight(patch.weight) } : {}),
				...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
			};
			// color: explicit value sets it; explicit "" clears it; absent keeps it.
			if (patch.color !== undefined) {
				if (cleanColor) next.color = cleanColor;
				else delete next.color;
			}
			return next;
		});
		return { ...doc, slots, pendingSpin: null };
	}
	// New slot — only if there's a label and we're under the cap.
	const label = (patch.label ?? "").trim().slice(0, MAX_LABEL_LEN);
	if (!label || doc.slots.length >= MAX_SLOTS) return { ...doc, pendingSpin: null };
	const slot: WheelSlot = {
		id: newId(),
		label,
		weight: clampWeight(patch.weight ?? 1),
		enabled: patch.enabled ?? true,
		...(cleanColor ? { color: cleanColor } : {}),
	};
	return { ...doc, slots: [...doc.slots, slot], pendingSpin: null };
}

export function removeSlot(doc: WheelDoc, id: string): WheelDoc {
	return { ...doc, slots: doc.slots.filter((s) => s.id !== id), pendingSpin: null };
}

/**
 * Reorder slots to match `ids` (must reference every slot exactly once). On any
 * mismatch — wrong length, a duplicate id, or an unknown id — the doc is returned
 * UNCHANGED (same reference, so the router can detect the rejection). Clears
 * `pendingSpin`. The duplicate check matters: a same-length list with one id
 * repeated and another missing would otherwise drop a slot and clone another.
 */
export function reorderSlots(doc: WheelDoc, ids: string[]): WheelDoc {
	const byId = new Map(doc.slots.map((s) => [s.id, s]));
	if (
		ids.length !== doc.slots.length ||
		new Set(ids).size !== ids.length ||
		ids.some((id) => !byId.has(id))
	)
		return doc;
	return { ...doc, slots: ids.map((id) => byId.get(id)!), pendingSpin: null };
}

/**
 * Resolve a spin: pick the target (the given enabled slot, else weighted-random
 * via `rand`), append a history entry, and arm `pendingSpin` for the overlay.
 * Returns the new doc plus the chosen slot — or null winner when no slot is
 * enabled. `rand`/`spinId` are injected so the server (and tests) control them.
 */
export function resolveSpin(
	doc: WheelDoc,
	opts: { slotId?: string; spinId: string; now: number; rand?: () => number },
): { doc: WheelDoc; winner: WheelSlot | null; targetIndex: number } {
	const enabled = enabledSlots(doc);
	if (enabled.length === 0) return { doc, winner: null, targetIndex: -1 };
	const rand = opts.rand ?? secureRandom;
	let targetIndex =
		opts.slotId !== undefined
			? enabled.findIndex((s) => s.id === opts.slotId)
			: pickWeighted(enabled, rand());
	if (targetIndex < 0) targetIndex = pickWeighted(enabled, rand());
	const winner = enabled[targetIndex]!;
	const entry: WheelSpin = { id: opts.spinId, label: winner.label, at: opts.now };
	return {
		doc: {
			...doc,
			history: [entry, ...doc.history].slice(0, MAX_HISTORY),
			pendingSpin: { spinId: opts.spinId, targetIndex, at: opts.now },
		},
		winner,
		targetIndex,
	};
}
