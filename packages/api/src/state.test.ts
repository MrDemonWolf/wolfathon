import { expect, test } from "bun:test";

import { bumpPassedGoals, type Goal, stripNotes, subsFromEvent, validateImport } from "./state";
import { defaultOverlayTheme } from "./theme";

test("stripNotes never leaks the internal note", () => {
	const pub = stripNotes({
		goals: [{ id: "a", reward: "Q&A", note: "10 subs", unlocked: false }],
		currentIndex: 0,
		currentSubs: 0,
		theme: defaultOverlayTheme(),
	});
	expect(JSON.stringify(pub)).not.toContain("10 subs");
	expect(pub.goals[0]).not.toHaveProperty("note");
});

test("stripNotes resolves the theme (gradient stops + raw textColor + font/corners)", () => {
	const pub = stripNotes({
		goals: [{ id: "a", reward: "Q&A", unlocked: false }],
		currentIndex: 0,
		currentSubs: 0,
		theme: { ...defaultOverlayTheme(), font: "poppins", corners: "sharp" },
	});
	expect(pub.gradient.length).toBeGreaterThanOrEqual(2);
	expect(pub.textColor).toBe("auto");
	expect(pub.font).toBe("poppins");
	expect(pub.corners).toBe("sharp");
});

test("stripNotes exposes the NEXT target + currentSubs but no other targets", () => {
	const pub = stripNotes({
		goals: [
			{ id: "a", reward: "Q&A", unlocked: true, target: 5 },
			{ id: "b", reward: "Onesie", unlocked: false, target: 10 },
			{ id: "c", reward: "Cake", unlocked: false, target: 25 },
		],
		currentIndex: 1,
		currentSubs: 7,
		theme: defaultOverlayTheme(),
	});
	expect(pub.currentSubs).toBe(7);
	expect(pub.nextTarget).toBe(10); // goals[currentIndex]
	// Future ceilings (25) must never reach the wire.
	expect(pub.goals.some((g) => (g as { target?: number }).target === 25)).toBe(false);
	expect(pub.goals.every((g) => !("target" in g))).toBe(true);
});

test("subsFromEvent counts subs + gifts, ignores bits/points/manual", () => {
	expect(subsFromEvent({ kind: "sub", tier: "t1" })).toBe(1);
	expect(subsFromEvent({ kind: "gift", tier: "t1", count: 5 })).toBe(5);
	expect(subsFromEvent({ kind: "bits", bits: 500 })).toBe(0);
	expect(subsFromEvent({ kind: "manualMinutes", minutes: 5 })).toBe(0);
});

test("bumpPassedGoals raises passed targets above current, keeps ascending order", () => {
	const goals: Goal[] = [
		{ id: "a", reward: "A", unlocked: false, target: 5 },
		{ id: "b", reward: "B", unlocked: false, target: 8 },
		{ id: "c", reward: "C", unlocked: false, target: 40 },
		{ id: "d", reward: "D", unlocked: false }, // no target, untouched
	];
	const { goals: out, bumped } = bumpPassedGoals(goals, 12);
	expect(bumped).toBe(2); // 5 and 8 were ≤ 12
	expect(out[0]!.target!).toBeGreaterThan(12);
	expect(out[1]!.target!).toBeGreaterThan(out[0]!.target!);
	expect(out[2]!.target).toBe(40); // already ahead, unchanged
	expect(out[3]!.target).toBeUndefined();
});

test("validateImport round-trips an embedded theme and rejects a bad one", () => {
	const ok = validateImport({
		goals: [{ reward: "Q&A" }],
		theme: { preset: "aurora", font: "inter" },
	});
	expect(ok.ok).toBe(true);
	if (ok.ok) {
		expect(ok.data.theme.preset).toBe("aurora");
		expect(ok.data.theme.font).toBe("inter");
	}
	expect(validateImport({ goals: [{ reward: "Q&A" }], theme: { font: "bad" } }).ok).toBe(false);
});

test("validateImport accepts the minimal shape and resets progress", () => {
	const result = validateImport({ goals: [{ reward: "Q&A", note: "1 sub" }] });
	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.data.currentIndex).toBe(0);
		expect(result.data.goals[0]?.unlocked).toBe(false);
	}
});

test("validateImport rejects a goal missing reward", () => {
	expect(validateImport({ goals: [{ note: "x" }] }).ok).toBe(false);
});

test("validateImport rejects an empty goals array", () => {
	expect(validateImport({ goals: [] }).ok).toBe(false);
});
