import { expect, test } from "bun:test";

import { stripNotes, validateImport } from "./state";
import { defaultOverlayTheme } from "./theme";

test("stripNotes never leaks the internal note", () => {
	const pub = stripNotes({
		goals: [{ id: "a", reward: "Q&A", note: "10 subs", unlocked: false }],
		currentIndex: 0,
		theme: defaultOverlayTheme(),
	});
	expect(JSON.stringify(pub)).not.toContain("10 subs");
	expect(pub.goals[0]).not.toHaveProperty("note");
});

test("stripNotes resolves the theme (gradient stops + raw textColor + font/corners)", () => {
	const pub = stripNotes({
		goals: [{ id: "a", reward: "Q&A", unlocked: false }],
		currentIndex: 0,
		theme: { ...defaultOverlayTheme(), font: "poppins", corners: "sharp" },
	});
	expect(pub.gradient.length).toBeGreaterThanOrEqual(2);
	expect(pub.textColor).toBe("auto");
	expect(pub.font).toBe("poppins");
	expect(pub.corners).toBe("sharp");
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
