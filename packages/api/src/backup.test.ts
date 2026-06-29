import { expect, test } from "bun:test";

import { BACKUP_VERSION, buildBackupDoc, splitBackupDoc } from "./backup";

test("buildBackupDoc wraps both halves under the current version", () => {
	const doc = buildBackupDoc({ goals: [] }, { startMinutes: 60 });
	expect(doc.version).toBe(BACKUP_VERSION);
	expect(doc.rewards).toEqual({ goals: [] });
	expect(doc.timer).toEqual({ startMinutes: 60 });
});

test("splitBackupDoc round-trips buildBackupDoc", () => {
	const split = splitBackupDoc(buildBackupDoc({ a: 1 }, { b: 2 }));
	expect(split).toEqual({ ok: true, rewards: { a: 1 }, timer: { b: 2 } });
});

test("splitBackupDoc splits even an unknown future version (per-half validators gate)", () => {
	const split = splitBackupDoc({ version: 99, rewards: {}, timer: {} });
	expect(split.ok).toBe(true);
});

test("splitBackupDoc rejects non-objects", () => {
	expect(splitBackupDoc(null).ok).toBe(false);
	expect(splitBackupDoc([]).ok).toBe(false);
	expect(splitBackupDoc("x").ok).toBe(false);
});

test("splitBackupDoc requires both sections", () => {
	expect(splitBackupDoc({ rewards: {} }).ok).toBe(false);
	expect(splitBackupDoc({ timer: {} }).ok).toBe(false);
});

test("splitBackupDoc hints when handed an old rewards-only file", () => {
	const r = splitBackupDoc({ currentSubs: 0, goals: [{ reward: "Q&A" }] });
	expect(r.ok).toBe(false);
	if (!r.ok) expect(r.message).toContain("rewards-only");
});
