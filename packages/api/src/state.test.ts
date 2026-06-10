import { expect, test } from "bun:test";

import { stripNotes, validateImport } from "./state";

test("stripNotes never leaks the internal note", () => {
  const pub = stripNotes({
    goals: [{ id: "a", reward: "Q&A", note: "10 subs", unlocked: false }],
    currentIndex: 0,
  });
  expect(JSON.stringify(pub)).not.toContain("10 subs");
  expect(pub.goals[0]).not.toHaveProperty("note");
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
