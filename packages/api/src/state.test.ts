import { expect, test } from "bun:test";

import {
	bumpPassedGoals,
	type Data,
	type Goal,
	nextGoalIndex,
	nextVisibleGoal,
	recompute,
	sampleData,
	stripNotes,
	subsFromEvent,
	validateImport,
	withThemeDefaults,
} from "./state";
import { defaultOverlayTheme, NEXT_REWARDS_SHOWN, type OverlayTheme } from "./theme";

test("recompute backfills a missing theme (pre-theme rows can't crash the editor)", () => {
	const legacy = { goals: [], currentIndex: 0, currentSubs: 0 } as unknown as Data;
	const data = recompute(legacy);
	expect(data.theme).toBeDefined();
	expect(data.theme.preset).toBe("brand");
});

test("withThemeDefaults backfills new fields on a pre-migration theme row", () => {
	// An old stored theme: all the OLD keys, but no `label` and no `showLiveDot`.
	const old = {
		preset: "brand",
		gradient: ["#000000", "#ffffff"],
		textColor: "auto",
		font: "inter",
		corners: "rounded",
		showLabel: true,
		showStatus: false,
		showUnits: true,
		showProgressBar: true,
		showUnlocked: true,
	} as unknown as OverlayTheme;

	const filled = withThemeDefaults(old);
	expect(filled.label).toBe("WOLFATHON"); // new field filled from defaults
	expect(filled.showLiveDot).toBe(false); // inherited from the old combined showStatus
	expect(filled.showLabel).toBe(true); // existing value preserved

	// A pre-split row that had the status indicator ON keeps the dot ON.
	expect(withThemeDefaults({ ...old, showStatus: true } as OverlayTheme).showLiveDot).toBe(true);
	// No stored theme → full defaults.
	expect(withThemeDefaults(undefined).label).toBe("WOLFATHON");
	expect(withThemeDefaults(undefined).showLiveDot).toBe(true);
});

test("validateImport preserves the per-goal hidden flag", () => {
	const res = validateImport({
		goals: [{ reward: "Secret reveal", hidden: true }, { reward: "Public goal" }],
	});
	expect(res.ok).toBe(true);
	if (res.ok) {
		expect(res.data.goals[0]?.hidden).toBe(true);
		expect(res.data.goals[1]?.hidden).toBeUndefined();
	}
});

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

test("stripNotes drops hidden goals and recomputes the next pointer past them", () => {
	const pub = stripNotes({
		goals: [
			{ id: "a", reward: "Q&A", unlocked: true, target: 5 },
			{ id: "b", reward: "Secret", unlocked: false, target: 8, hidden: true },
			{ id: "c", reward: "Onesie", unlocked: false, target: 10 },
		],
		currentIndex: 1,
		currentSubs: 7,
		theme: defaultOverlayTheme(),
	});
	// Hidden goal is gone entirely — not even as the "next".
	expect(pub.goals.map((g) => g.reward)).toEqual(["Q&A", "Onesie"]);
	// Next pointer + target resolve over the visible list (Onesie, not the secret).
	expect(pub.goals[pub.currentIndex]?.reward).toBe("Onesie");
	expect(pub.nextTarget).toBe(10);
	expect(JSON.stringify(pub)).not.toContain("Secret");
});

test("nextGoalIndex points past the end once every goal is unlocked", () => {
	expect(nextGoalIndex([])).toBe(0);
	expect(nextGoalIndex([{ unlocked: true }, { unlocked: false }])).toBe(1);
	expect(nextGoalIndex([{ unlocked: true }, { unlocked: true }])).toBe(2);
});

test("nextVisibleGoal skips a hidden next goal (chat must never name a secret reward)", () => {
	const data: Data = {
		goals: [
			{ id: "a", reward: "Q&A", unlocked: true, target: 5 },
			{ id: "b", reward: "Secret", unlocked: false, target: 8, hidden: true },
			{ id: "c", reward: "Onesie", unlocked: false, target: 10 },
		],
		currentIndex: 1, // raw pointer lands ON the hidden goal — that's the trap
		currentSubs: 7,
		theme: defaultOverlayTheme(),
	};
	expect(data.goals[data.currentIndex]?.reward).toBe("Secret");
	expect(nextVisibleGoal(data)?.reward).toBe("Onesie");
});

test("nextVisibleGoal is undefined when every visible goal is unlocked", () => {
	const data: Data = {
		goals: [
			{ id: "a", reward: "Q&A", unlocked: true },
			{ id: "b", reward: "Secret", unlocked: false, hidden: true },
		],
		currentIndex: 1,
		currentSubs: 0,
		theme: defaultOverlayTheme(),
	};
	expect(nextVisibleGoal(data)).toBeUndefined();
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
	// Freezing off — the legacy raise-everything behaviour, pinned so the flag stays
	// a real switch rather than a one-way removal.
	const { goals: out, bumped } = bumpPassedGoals(goals, 12, false);
	expect(bumped).toBe(2); // 5 and 8 were ≤ 12
	expect(out[0]!.target!).toBeGreaterThan(12);
	expect(out[1]!.target!).toBeGreaterThan(out[0]!.target!);
	expect(out[2]!.target).toBe(40); // already ahead, unchanged
	expect(out[3]!.target).toBeUndefined();
});

test("bumpPassedGoals leaves unlocked (past) goals untouched", () => {
	const goals: Goal[] = [
		{ id: "a", reward: "A", unlocked: true, target: 5 }, // done, below count — stays
		{ id: "b", reward: "B", unlocked: true, target: 10 }, // done, below count — stays
		{ id: "c", reward: "C", unlocked: false, target: 8 }, // upcoming, below count — raised
	];
	const { goals: out, bumped } = bumpPassedGoals(goals, 12, false);
	expect(bumped).toBe(1); // only the upcoming goal moves
	expect(out[0]!.target).toBe(5);
	expect(out[1]!.target).toBe(10);
	expect(out[2]!.target!).toBeGreaterThan(12);
});

test("bumpPassedGoals leaves a met-but-locked target exactly as typed by default", () => {
	// The count passed goal B's target but the operator hasn't unlocked it yet —
	// that's the goal they're working ON. Its number must not move under them.
	const goals: Goal[] = [
		{ id: "a", reward: "A", unlocked: true, target: 5 },
		{ id: "b", reward: "B", unlocked: false, target: 10 },
	];
	const { goals: out, bumped } = bumpPassedGoals(goals, 12);
	expect(bumped).toBe(0);
	expect(out[1]!.target).toBe(10);
});

test("bumpPassedGoals no longer cascades into later goals from a frozen met goal", () => {
	// The reported case: working on goal #4 must not rewrite #2 and #3. Under the
	// old floor cascade, raising B to ~14 pushed C and D above it too.
	const goals: Goal[] = [
		{ id: "a", reward: "A", unlocked: false, target: 10 }, // met — frozen
		{ id: "b", reward: "B", unlocked: false, target: 11 }, // met — frozen
		{ id: "c", reward: "C", unlocked: false, target: 20 }, // ahead — untouched
		{ id: "d", reward: "D", unlocked: false, target: 30 }, // ahead — untouched
	];
	const { goals: out, bumped } = bumpPassedGoals(goals, 12);
	expect(bumped).toBe(0);
	expect(out.map((g) => g.target)).toEqual([10, 11, 20, 30]);
});

test("bumpPassedGoals still repairs a target sitting below an already-unlocked goal", () => {
	// Genuinely out of order: C is awarded at 30, but D would unlock at 20. That's
	// the case the raise still exists for, and freezing must not mask it.
	const goals: Goal[] = [
		{ id: "c", reward: "C", unlocked: true, target: 30 },
		{ id: "d", reward: "D", unlocked: false, target: 20 },
	];
	const { goals: out, bumped } = bumpPassedGoals(goals, 5);
	expect(bumped).toBe(1);
	expect(out[1]!.target!).toBeGreaterThan(30);
});

test("bumpPassedGoals reports zero raises once every goal is unlocked", () => {
	const goals: Goal[] = [
		{ id: "a", reward: "A", unlocked: true, target: 5 },
		{ id: "b", reward: "B", unlocked: true, target: 10 },
	];
	expect(bumpPassedGoals(goals, 999).bumped).toBe(0);
	expect(bumpPassedGoals(goals, 999, false).bumped).toBe(0);
});

test("recompute backfills freezeMetTargets on a pre-flag row (and never drops it)", () => {
	const legacy = {
		goals: [{ id: "a", reward: "A", unlocked: false }],
		currentIndex: 0,
		currentSubs: 0,
		theme: defaultOverlayTheme(),
	} as Data;
	expect(recompute(legacy).freezeMetTargets).toBe(true);
	// recompute runs on both sides of every mutateState — an explicit false has to
	// survive the round trip or the operator's choice is erased on the next write.
	expect(recompute({ ...legacy, freezeMetTargets: false }).freezeMetTargets).toBe(false);
});

test("validateImport defaults freezeMetTargets to true and round-trips an explicit false", () => {
	const absent = validateImport({ goals: [{ reward: "Q&A" }] });
	expect(absent.ok && absent.data.freezeMetTargets).toBe(true);
	const off = validateImport({ goals: [{ reward: "Q&A" }], freezeMetTargets: false });
	expect(off.ok && off.data.freezeMetTargets).toBe(false);
	const bad = validateImport({ goals: [{ reward: "Q&A" }], freezeMetTargets: "yes" });
	expect(bad.ok).toBe(false);
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

// ---- read-boundary defaults (the #20 white-screen crash class) ------------
// `recompute` is the read boundary for rewards: a Data field added to the type
// but dropped from recompute's return literal — or absent on an old row — would
// crash /control. These guard both directions so future fields are covered.

test("recompute backfills every optional key dropped from an old row", () => {
	const full = sampleData();
	// `goals` is the always-present core field (recompute indexes into it); the
	// rest were added later and must survive a row persisted before they existed.
	const optional = (Object.keys(full) as (keyof Data)[]).filter((k) => k !== "goals");
	for (const key of optional) {
		const data = { ...full };
		delete (data as Record<string, unknown>)[key];
		const restored = recompute(data as Data);
		expect(restored[key], `${key} must be backfilled at the read boundary`).toBeDefined();
	}
});

test("recompute preserves all Data keys (no field silently dropped)", () => {
	expect(Object.keys(recompute(sampleData())).sort()).toEqual(Object.keys(sampleData()).sort());
});

// ---- the payload must not carry rewards the overlay never draws --------------

/** `n` locked goals after two unlocked ones, so `currentIndex` is 2. */
function ladder(future: number): Data {
	const goals: Goal[] = [
		{ id: "u1", reward: "Q&A", unlocked: true },
		{ id: "u2", reward: "Phasmophobia", unlocked: true },
		{ id: "cur", reward: "Onesie reveal", unlocked: false, target: 10 },
		...Array.from({ length: future }, (_, i) => ({
			id: `f${i}`,
			reward: `Future ${i}`,
			unlocked: false,
			target: 100 + i,
		})),
	];
	return {
		goals,
		currentIndex: 2,
		currentSubs: 7,
		theme: defaultOverlayTheme(),
		freezeMetTargets: true,
		goalsRev: 0,
	};
}

test("stripNotes never ships a future reward the overlay can't draw", () => {
	// 12 upcoming but only NEXT_REWARDS_SHOWN are ever rendered — the rest used to
	// ride along in the payload, readable by anyone with the ?t= URL.
	const pub = stripNotes(ladder(12));
	expect(pub.goals).toHaveLength(2 + 1 + NEXT_REWARDS_SHOWN);
	expect(JSON.stringify(pub)).not.toContain(`Future ${NEXT_REWARDS_SHOWN}`);
	expect(JSON.stringify(pub)).not.toContain("Future 11");
});

test("stripNotes ships NO upcoming rewards when the Next rewards toggle is off", () => {
	// The toggle used to gate rendering only, so turning it off looked like it hid
	// them and didn't.
	const data = ladder(12);
	const pub = stripNotes({ ...data, theme: { ...data.theme, showNext: false } });
	expect(pub.goals.map((g) => g.reward)).toEqual(["Q&A", "Phasmophobia", "Onesie reveal"]);
	expect(JSON.stringify(pub)).not.toContain("Future");
});

test("stripNotes keeps currentIndex valid and every unlocked goal in the slice", () => {
	// The overlay indexes `goals[currentIndex]` for the current reward, and its
	// unlock-celebration tracker needs each goal present the moment it flips.
	const pub = stripNotes(ladder(12));
	expect(pub.goals[pub.currentIndex]?.reward).toBe("Onesie reveal");
	expect(pub.goals.filter((g) => g.unlocked).map((g) => g.id)).toEqual(["u1", "u2"]);
	expect(pub.nextTarget).toBe(10);
});

test("stripNotes handles fewer upcoming goals than the window, and an all-unlocked list", () => {
	const few = stripNotes(ladder(2));
	expect(few.goals.map((g) => g.reward)).toEqual([
		"Q&A",
		"Phasmophobia",
		"Onesie reveal",
		"Future 0",
		"Future 1",
	]);
	const done = stripNotes({
		goals: [
			{ id: "a", reward: "Q&A", unlocked: true },
			{ id: "b", reward: "Onesie", unlocked: true },
		],
		currentIndex: 2,
		currentSubs: 9,
		theme: defaultOverlayTheme(),
		freezeMetTargets: true,
		goalsRev: 0,
	});
	expect(done.goals).toHaveLength(2);
	expect(done.currentIndex).toBe(2);
	expect(done.nextTarget).toBeNull();
});

test("a hidden goal is still dropped even when it sits inside the shown window", () => {
	const data = ladder(3);
	data.goals[3]!.hidden = true; // "Future 0" — a surprise reward
	const pub = stripNotes(data);
	expect(JSON.stringify(pub)).not.toContain("Future 0");
	expect(pub.goals.map((g) => g.reward)).toContain("Future 1");
});
