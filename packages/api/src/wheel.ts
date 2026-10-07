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
import { normalizeHex } from "./theme";
import { clampInt } from "./util";

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

export type WheelProofSlot = { label: string; weight: number };

export type WheelSpinProof = {
	algorithm: "sha256-commit-reveal-v1";
	commitmentHash: string;
	serverSeed: string;
	drawHash: string;
	drawCounter: number;
	pool: WheelProofSlot[];
	targetIndex: number;
};

/** A spin history entry (newest first; capped to {@link MAX_HISTORY}). */
export type WheelSpin = { id: string; label: string; at: number; proof?: WheelSpinProof };

/** Private, one-use commitment. `serverSeed` is never included in public projections. */
export type WheelRandomCommitment = {
	spinId: string;
	commitmentHash: string;
	serverSeed: string;
	pool: WheelProofSlot[];
	createdAt: number;
	revealAt: number;
};

/** Public portion shown before a random spin starts. */
export type PublicWheelCommitment = {
	spinId: string;
	commitmentHash: string;
	createdAt: number;
	revealAt: number;
};

/** The overlay's live spin channel. Cleared on any structural slot change. */
export type PendingSpin = {
	spinId: string;
	targetIndex: number;
	at: number;
	commitmentHash?: string;
	proof?: WheelSpinProof;
} | null;

/** Minimal spin channel used by the visual overlay; cryptographic proof stays in the control panel. */
export type OverlayPendingSpin = { spinId: string; targetIndex: number; at: number } | null;

export type WheelDoc = {
	slots: WheelSlot[];
	history: WheelSpin[];
	pendingSpin: PendingSpin;
	pendingCommitment: WheelRandomCommitment | null;
};

/** Authenticated dashboard view with unrevealed server entropy removed. */
export type WheelControlDoc = Omit<WheelDoc, "pendingCommitment"> & {
	pendingCommitment: PublicWheelCommitment | null;
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
/** Three-second overlay poll + six-second spin + six-second result reveal. */
export const WHEEL_SPIN_LOCK_MS = 15_000;
/**
 * How long a spin stays live on the public channel. `pendingSpin` is kept in the
 * doc indefinitely (it only clears on a structural slot edit), so without a bound
 * a freshly loaded / cached OBS source would replay the last spin on every mount.
 * Past this window the parked spin is treated as stale and hidden from the public
 * read. Comfortably exceeds the ~12s spin + result reveal, so a source that opens
 * mid-spin still catches it.
 */
export const WHEEL_SPIN_TTL_MS = 30_000;
/** Keep the commitment visible for longer than one public overlay poll interval. */
export const WHEEL_RANDOM_COMMIT_DELAY_MS = 4_000;
/** Reveal the seed to the public overlay after its six-second spin animation. */
export const WHEEL_PROOF_REVEAL_DELAY_MS = 6_000;

/** The `pendingSpin` only while it's still fresh (see {@link WHEEL_SPIN_TTL_MS}); else null. */
export function freshPendingSpin(doc: WheelDoc, now: number): PendingSpin {
	const p = doc.pendingSpin;
	if (!p || now - p.at >= WHEEL_SPIN_TTL_MS) return null;
	const spin = doc.history.find((entry) => entry.id === p.spinId);
	const proof = spin?.proof;
	return {
		...p,
		...(proof?.commitmentHash ? { commitmentHash: proof.commitmentHash } : {}),
		...(proof && now - p.at >= WHEEL_PROOF_REVEAL_DELAY_MS ? { proof } : {}),
	};
}

/** Strip proof details before a spin reaches the public wheel overlay. */
export function freshOverlaySpin(doc: WheelDoc, now: number): OverlayPendingSpin {
	const spin = freshPendingSpin(doc, now);
	return spin ? { spinId: spin.spinId, targetIndex: spin.targetIndex, at: spin.at } : null;
}

/** Remove the private seed and pool from a pending commitment before public use. */
export function publicWheelCommitment(doc: WheelDoc): PublicWheelCommitment | null {
	const commitment = doc.pendingCommitment;
	if (!commitment) return null;
	return {
		spinId: commitment.spinId,
		commitmentHash: commitment.commitmentHash,
		createdAt: commitment.createdAt,
		revealAt: commitment.revealAt,
	};
}

/** Dashboard projection: never return a server seed before its spin is revealed. */
export function toWheelControl(doc: WheelDoc): WheelControlDoc {
	return { ...doc, pendingCommitment: publicWheelCommitment(doc) };
}

/** Whether the current spin still owns the shared wheel across all dashboards. */
export function isWheelSpinLocked(doc: WheelDoc, now: number): boolean {
	return (
		doc.pendingCommitment != null ||
		(doc.pendingSpin !== null && now - doc.pendingSpin.at < WHEEL_SPIN_LOCK_MS)
	);
}

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
		pendingCommitment: null,
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
		pendingCommitment: doc.pendingCommitment ?? null,
	};
}

/** Clamp a weight to a positive integer in [1, MAX_WEIGHT]. */
export function clampWeight(weight: unknown): number {
	return clampInt(weight, { min: 1, max: MAX_WEIGHT, fallback: 1 });
}

/** Normalize one stored/legacy slot to a well-formed WheelSlot. */
function normalizeSlot(raw: WheelSlot): WheelSlot {
	const color = normalizeHex(raw.color);
	return {
		id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
		label: typeof raw.label === "string" ? raw.label.trim().slice(0, MAX_LABEL_LEN) : "",
		weight: clampWeight(raw.weight),
		enabled: raw.enabled !== false,
		...(color ? { color } : {}),
	};
}

/** Enabled slots in array order — the render set, and the set indices name. */
export function enabledSlots(doc: Pick<WheelDoc, "slots">): WheelSlot[] {
	return doc.slots.filter((s) => s.enabled);
}

/** Create a 256-bit seed using the platform CSPRNG. */
export function newWheelServerSeed(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 of UTF-8 text, returned as lowercase hexadecimal. */
export async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Commit to the secret seed, spin nonce, and exact ordered weighted pool. Array
 * pairs make the serialized input canonical and independent of object key order.
 */
export async function wheelCommitmentHash(
	serverSeed: string,
	spinId: string,
	pool: WheelProofSlot[],
): Promise<string> {
	return sha256Hex(
		JSON.stringify({
			algorithm: "sha256-commit-reveal-v1",
			spinId,
			serverSeed,
			pool: pool.map((slot) => [slot.label, slot.weight]),
		}),
	);
}

/**
 * Derive an unbiased integer in [0, totalWeight) from the committed seed. The
 * rejection step removes modulo bias; a new counter is hashed only if needed.
 */
export async function wheelDraw(
	serverSeed: string,
	spinId: string,
	totalWeight: number,
): Promise<{ drawHash: string; drawCounter: number; bucket: number }> {
	if (!Number.isSafeInteger(totalWeight) || totalWeight < 1) {
		throw new RangeError("Wheel draw requires a positive safe total weight.");
	}
	// 52 hash bits are exactly representable as a JavaScript number. Rejection
	// sampling avoids modulo bias without requiring a newer BigInt target.
	const range = 2 ** 52;
	const limit = range - (range % totalWeight);
	for (let drawCounter = 0; drawCounter < 100; drawCounter++) {
		const drawHash = await sha256Hex(`${serverSeed}:${spinId}:${drawCounter}`);
		const draw = Number.parseInt(drawHash.slice(0, 13), 16);
		if (draw < limit) return { drawHash, drawCounter, bucket: draw % totalWeight };
	}
	throw new Error("Could not derive an unbiased wheel draw.");
}

export function wheelWeightedIndexAt(pool: WheelProofSlot[], bucket: number): number {
	let remaining = bucket;
	for (let index = 0; index < pool.length; index++) {
		remaining -= clampWeight(pool[index]?.weight);
		if (remaining < 0) return index;
	}
	return -1;
}

/** Apply a previously committed draw to the unchanged enabled-slot pool. */
export function resolveCommittedRandomSpin(
	doc: WheelDoc,
	opts: { spinId: string; now: number; drawHash: string; drawCounter: number },
): { doc: WheelDoc; winner: WheelSlot; targetIndex: number; proof: WheelSpinProof } {
	const commitment = doc.pendingCommitment;
	if (!commitment || commitment.spinId !== opts.spinId) {
		throw new Error("The random spin commitment is no longer available.");
	}
	const enabled = enabledSlots(doc);
	const currentPool = enabled.map(({ label, weight }) => ({ label, weight: clampWeight(weight) }));
	if (JSON.stringify(currentPool) !== JSON.stringify(commitment.pool)) {
		throw new Error("The weighted dare pool changed after its hash was published.");
	}
	const totalWeight = commitment.pool.reduce((total, slot) => total + clampWeight(slot.weight), 0);
	const draw = Number.parseInt(opts.drawHash.slice(0, 13), 16);
	const range = 2 ** 52;
	const limit = range - (range % totalWeight);
	if (draw >= limit) throw new Error("The committed draw hash is outside the unbiased range.");
	const targetIndex = wheelWeightedIndexAt(commitment.pool, draw % totalWeight);
	const winner = enabled[targetIndex];
	if (!winner) throw new Error("The committed wheel draw did not select an enabled dare.");
	const proof: WheelSpinProof = {
		algorithm: "sha256-commit-reveal-v1",
		commitmentHash: commitment.commitmentHash,
		serverSeed: commitment.serverSeed,
		drawHash: opts.drawHash,
		drawCounter: opts.drawCounter,
		pool: commitment.pool.map((slot) => ({ ...slot })),
		targetIndex,
	};
	const result = resolveSpin(doc, { slotId: winner.id, spinId: opts.spinId, now: opts.now });
	const spin = result.doc.history[0];
	const pendingSpin = result.doc.pendingSpin;
	if (!spin || !pendingSpin) throw new Error("The committed wheel draw could not be recorded.");
	return {
		doc: {
			...result.doc,
			history: [{ ...spin, proof }, ...result.doc.history.slice(1)],
			pendingSpin: { ...pendingSpin, commitmentHash: proof.commitmentHash },
			pendingCommitment: null,
		},
		winner,
		targetIndex,
		proof,
	};
}

/** Independently verify the commitment, draw, weighted pool, and winner label. */
export async function verifyWheelSpinProof(spin: WheelSpin): Promise<boolean> {
	const proof = spin.proof;
	if (!proof || proof.algorithm !== "sha256-commit-reveal-v1" || proof.pool.length === 0)
		return false;
	if (proof.pool.some((slot) => !Number.isSafeInteger(slot.weight) || slot.weight < 1))
		return false;
	if ((await wheelCommitmentHash(proof.serverSeed, spin.id, proof.pool)) !== proof.commitmentHash)
		return false;
	const totalWeight = proof.pool.reduce((total, slot) => total + slot.weight, 0);
	if (!Number.isSafeInteger(totalWeight) || totalWeight < 1) return false;
	let expected: Awaited<ReturnType<typeof wheelDraw>>;
	try {
		expected = await wheelDraw(proof.serverSeed, spin.id, totalWeight);
	} catch {
		return false;
	}
	if (expected.drawHash !== proof.drawHash || expected.drawCounter !== proof.drawCounter)
		return false;
	const selected = wheelWeightedIndexAt(proof.pool, expected.bucket);
	return selected === proof.targetIndex && proof.pool[selected]?.label === spin.label;
}

/** Resolve a slot's display colour (explicit hex or the palette fallback). */
export function slotColor(slot: { color?: string }, index: number): string {
	return normalizeHex(slot.color) ?? WHEEL_PALETTE[index % WHEEL_PALETTE.length]!;
}

/** Project the doc into the overlay payload — enabled slots, render-only fields. */
export function toPublicWheel(doc: Pick<WheelDoc, "slots">): PublicWheel {
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
	const cleanColor = normalizeHex(patch.color);
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
