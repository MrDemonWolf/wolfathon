import { expect, test } from "bun:test";

import {
	computeArcs,
	defaultWheelDoc,
	enabledSlots,
	finalRotation,
	MAX_SLOTS,
	type PendingSpin,
	pickWeighted,
	removeSlot,
	reorderSlots,
	resolveSpin,
	slotColor,
	slotIndexAtPointer,
	toPublicWheel,
	upsertSlot,
	type WheelDoc,
	type WheelSlot,
	withWheelDefaults,
} from "./wheel";

function slots(weights: number[]): { weight: number }[] {
	return weights.map((weight) => ({ weight }));
}

const WEIGHT_CONFIGS: number[][] = [
	[1],
	[1, 1, 1],
	[1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // the 10-dare default
	[5, 1, 1],
	[3, 1, 4, 1, 5, 9, 2, 6],
	[10, 20, 1, 7],
];

test("computeArcs sweeps sum to 360 and scale with weight", () => {
	for (const cfg of WEIGHT_CONFIGS) {
		const arcs = computeArcs(slots(cfg));
		expect(arcs.length).toBe(cfg.length);
		const total = arcs.reduce((a, b) => a + b.sweep, 0);
		expect(total).toBeCloseTo(360, 6);
		// Last arc closes exactly at 360 (no float gap at the wrap seam).
		expect(arcs[arcs.length - 1]!.end).toBe(360);
		// Heavier weight ⇒ wider sweep.
		const sum = cfg.reduce((a, b) => a + b, 0);
		arcs.forEach((arc, i) => expect(arc.sweep).toBeCloseTo((360 * cfg[i]!) / sum, 6));
	}
});

test("slotIndexAtPointer(finalRotation(i)) === i for every index, every config", () => {
	for (const cfg of WEIGHT_CONFIGS) {
		const s = slots(cfg);
		// vary the starting rotation so the forward-spin maths is exercised broadly
		for (const current of [0, 37.5, 359.9, 1234.5, -90]) {
			for (let i = 0; i < cfg.length; i++) {
				const rot = finalRotation(s, i, current, 5);
				// always spins forward by at least minTurns full turns
				expect(rot).toBeGreaterThanOrEqual(current + 5 * 360);
				expect(slotIndexAtPointer(s, rot)).toBe(i);
			}
		}
	}
});

test("pickWeighted respects weights across the [0,1) band", () => {
	// weights 1:3 over two slots → slot 1 owns 75% of the band
	const s = slots([1, 3]);
	expect(pickWeighted(s, 0)).toBe(0);
	expect(pickWeighted(s, 0.2)).toBe(0); // 0.2 < 0.25
	expect(pickWeighted(s, 0.25)).toBe(1); // boundary belongs to slot 1
	expect(pickWeighted(s, 0.99)).toBe(1);

	// Empirical distribution lands within tolerance of the weights.
	const cfg = [3, 1, 4, 2];
	const sc = slots(cfg);
	const total = cfg.reduce((a, b) => a + b, 0);
	const counts = new Array(cfg.length).fill(0);
	const N = 12000;
	for (let k = 0; k < N; k++) counts[pickWeighted(sc, (k + 0.5) / N)]++;
	cfg.forEach((w, i) => expect(counts[i] / N).toBeCloseTo(w / total, 1));
});

test("empty / disabled sets degrade safely", () => {
	expect(computeArcs([])).toEqual([]);
	expect(slotIndexAtPointer([], 123)).toBe(-1);
	expect(pickWeighted([], 0.5)).toBe(-1);
	expect(finalRotation([], 0, 90)).toBe(90); // no-op, returns current
});

test("default doc seeds the sample wheel, all enabled, palette-coloured", () => {
	const doc = defaultWheelDoc();
	expect(doc.slots.length).toBe(14);
	expect(enabledSlots(doc).length).toBe(14);
	expect(doc.slots.every((s) => !!s.color)).toBe(true);
	expect(doc.pendingSpin).toBeNull();
	expect(doc.config.spinEvery).toBe(10);
});

test("trigger's targetIndex names the same slot the overlay renders", () => {
	const doc = defaultWheelDoc();
	// disable a couple so enabled-order ≠ raw-order, exercising the index mapping
	let d = upsertSlot(doc, { id: doc.slots[2]!.id, enabled: false });
	d = upsertSlot(d, { id: doc.slots[5]!.id, enabled: false });

	const {
		doc: spun,
		winner,
		targetIndex,
	} = resolveSpin(d, {
		spinId: "spin-1",
		now: 1000,
		rand: () => 0.5,
	});
	const pending = spun.pendingSpin as NonNullable<PendingSpin>;
	const pub = toPublicWheel(spun);

	// The index the overlay animates to maps to the winner's label in the SAME
	// enabled-order array the overlay renders.
	expect(pub.slots[pending.targetIndex]!.label).toBe(winner!.label);
	expect(targetIndex).toBe(pending.targetIndex);
	// And the wheel geometry lands that index under the pointer.
	const geomSlots = pub.slots.map((p) => ({ weight: p.weight }));
	expect(slotIndexAtPointer(geomSlots, finalRotation(geomSlots, pending.targetIndex, 0, 5))).toBe(
		pending.targetIndex,
	);
});

test("targeting a specific enabled slot lands on it", () => {
	const doc = defaultWheelDoc();
	const target = doc.slots[7]!;
	const { winner } = resolveSpin(doc, { slotId: target.id, spinId: "s", now: 1 });
	expect(winner!.id).toBe(target.id);
});

test("history is newest-first and capped at 25", () => {
	let doc = defaultWheelDoc();
	for (let i = 0; i < 30; i++) {
		doc = resolveSpin(doc, { spinId: `s${i}`, now: i, rand: () => 0 }).doc;
	}
	expect(doc.history.length).toBe(25);
	expect(doc.history[0]!.id).toBe("s29"); // newest first
});

test("any structural slot change clears a stale pendingSpin", () => {
	const armed = resolveSpin(defaultWheelDoc(), { spinId: "s", now: 1, rand: () => 0 }).doc;
	expect(armed.pendingSpin).not.toBeNull();
	expect(removeSlot(armed, armed.slots[0]!.id).pendingSpin).toBeNull();
	expect(upsertSlot(armed, { id: armed.slots[0]!.id, weight: 9 }).pendingSpin).toBeNull();
	const reordered = reorderSlots(
		armed,
		[...armed.slots].reverse().map((s) => s.id),
	);
	expect(reordered.pendingSpin).toBeNull();
});

test("reorderSlots rejects a duplicate-id list (no slot dropped or cloned)", () => {
	const doc = defaultWheelDoc();
	const ids = doc.slots.map((s) => s.id);
	// Same length, but id[0] repeated and id[1] missing — must be rejected, not
	// silently drop slot 1 and clone slot 0.
	const dup = [...ids];
	dup[1] = dup[0]!;
	const out = reorderSlots(doc, dup);
	expect(out).toBe(doc); // same reference = rejected
	// A genuine reorder still produces a fresh, complete doc.
	const rev = reorderSlots(doc, [...ids].reverse());
	expect(rev).not.toBe(doc);
	expect(rev.slots.map((s) => s.id).sort()).toEqual([...ids].sort());
});

test("public projection leaks no ids and only enabled slots", () => {
	let doc = defaultWheelDoc();
	doc = upsertSlot(doc, { id: doc.slots[0]!.id, enabled: false });
	const pub = toPublicWheel(doc);
	expect(pub.slots.length).toBe(13); // one disabled
	for (const s of pub.slots) {
		expect(Object.keys(s).sort()).toEqual(["color", "index", "label", "weight"]);
		expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
	}
	// indices are dense 0..n-1 in render order
	expect(pub.slots.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test("upsert clamps weight to a positive int and validates colour", () => {
	let doc = defaultWheelDoc();
	const id = doc.slots[0]!.id;
	doc = upsertSlot(doc, { id, weight: 0 });
	expect(doc.slots[0]!.weight).toBe(1); // clamped up
	doc = upsertSlot(doc, { id, weight: 99999 });
	expect(doc.slots[0]!.weight).toBe(1000); // clamped down
	doc = upsertSlot(doc, { id, color: "not-a-hex" });
	expect(doc.slots[0]!.color).toBeUndefined(); // invalid → cleared/ignored
	doc = upsertSlot(doc, { id, color: "#abc" });
	expect(doc.slots[0]!.color).toBe("#aabbcc"); // expanded
});

test("spinning with no enabled slot yields a null winner and leaves the doc alone", () => {
	let doc = defaultWheelDoc();
	// disable every slot
	for (const s of doc.slots) doc = upsertSlot(doc, { id: s.id, enabled: false });
	const {
		doc: out,
		winner,
		targetIndex,
	} = resolveSpin(doc, { spinId: "s", now: 1, rand: () => 0 });
	expect(winner).toBeNull();
	expect(targetIndex).toBe(-1);
	expect(out).toBe(doc); // unchanged — no history entry, no pendingSpin armed
	expect(out.pendingSpin).toBeNull();
});

test("upsertSlot appends a new slot, ignores a blank label, and honours the cap", () => {
	let doc = defaultWheelDoc(); // 14 slots
	doc = upsertSlot(doc, { label: "  New dare  ", weight: 4 });
	expect(doc.slots.length).toBe(15);
	expect(doc.slots.at(-1)!.label).toBe("New dare"); // trimmed
	expect(doc.slots.at(-1)!.weight).toBe(4);

	// Blank/whitespace label with no id → no-op (still 15).
	expect(upsertSlot(doc, { label: "   " }).slots.length).toBe(15);

	// Fill to the cap, then a further add is refused.
	while (doc.slots.length < MAX_SLOTS) doc = upsertSlot(doc, { label: `x${doc.slots.length}` });
	expect(doc.slots.length).toBe(MAX_SLOTS);
	expect(upsertSlot(doc, { label: "over the cap" }).slots.length).toBe(MAX_SLOTS);
});

test("withWheelDefaults backfills a legacy/partial row without throwing", () => {
	// A row persisted before history/pendingSpin existed, with a sloppy slot.
	const legacy = {
		slots: [{ id: "a", label: "  hi  ", weight: 0, enabled: true, color: "#abc" }],
	} as unknown as WheelDoc;
	const doc = withWheelDefaults(legacy);
	expect(doc.history).toEqual([]);
	expect(doc.pendingSpin).toBeNull();
	expect(doc.slots[0]!.label).toBe("hi"); // trimmed
	expect(doc.slots[0]!.weight).toBe(1); // clamped up from 0
	expect(doc.slots[0]!.color).toBe("#aabbcc"); // expanded
	// A completely empty object degrades to an empty wheel, not a crash.
	expect(withWheelDefaults({} as unknown as WheelDoc)).toEqual({
		slots: [],
		history: [],
		pendingSpin: null,
		config: { spinEvery: 10 },
	});
});

test("slotColor falls back to the palette by index when a slot has no valid hex", () => {
	expect(slotColor({ color: "#ff8800" }, 3)).toBe("#ff8800"); // explicit wins
	expect(slotColor({ color: "bogus" }, 0)).toBe("#2f6df0"); // invalid → palette[0]
	expect(slotColor({}, 1)).toBe("#21c0a8"); // none → palette[1]
});

const _typecheck: WheelSlot = { id: "x", label: "y", weight: 1, enabled: true };
void _typecheck;
