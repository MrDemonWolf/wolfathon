import { expect, test } from "bun:test";

import {
	BACKUP_VERSION,
	buildBackupDoc,
	buildRecapMarkdown,
	humanDuration,
	splitBackupDoc,
} from "./backup";
import { addWinner, defaultGiveawayDoc } from "./giveaway";
import { sampleData } from "./state";
import { defaultTimerDoc } from "./timer";

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

test("splitBackupDoc carries a legacy timer.config.label onto the rewards theme", () => {
	// Pre-migration backup: the custom eyebrow label lived on the timer half only.
	const split = splitBackupDoc({
		version: 1,
		rewards: { goals: [], theme: { preset: "brand" } },
		timer: { config: { label: "MARATHON" } },
	});
	expect(split.ok).toBe(true);
	if (split.ok) {
		expect((split.rewards as { theme: { label?: string } }).theme.label).toBe("MARATHON");
	}
});

test("splitBackupDoc never overwrites a label the rewards theme already has", () => {
	const split = splitBackupDoc({
		version: 1,
		rewards: { goals: [], theme: { label: "KEEP" } },
		timer: { config: { label: "OLD" } },
	});
	expect(split.ok).toBe(true);
	if (split.ok) {
		expect((split.rewards as { theme: { label?: string } }).theme.label).toBe("KEEP");
	}
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

test("humanDuration drops leading zero units but keeps minutes (and hours with days)", () => {
	expect(humanDuration(0)).toBe("0m");
	expect(humanDuration(12 * 60_000)).toBe("12m");
	expect(humanDuration(3 * 60 * 60_000 + 12 * 60_000)).toBe("3h 12m");
	// Days present → hours shown even at zero.
	expect(humanDuration(2 * 24 * 60 * 60_000 + 12 * 60_000)).toBe("2d 0h 12m");
});

test("buildRecapMarkdown snapshots timer, subs, rewards, and grouped winners", () => {
	const rewards = sampleData();
	const timer = defaultTimerDoc();
	let giveaway = addWinner(defaultGiveawayDoc(), { login: "ann", name: "Ann", source: "gift" }, 1);
	giveaway = addWinner(giveaway, { login: "bob", name: "Bob", source: "raffle" }, 2);
	const md = buildRecapMarkdown(rewards, timer, giveaway, 1_700_000_000_000);
	expect(md).toContain("# Wolfathon recap");
	expect(md).toContain("## Timer");
	expect(md).toContain("## Subs");
	expect(md).toContain("### Gift sub winners");
	expect(md).toContain("1. Ann (@ann)");
	expect(md).toContain("### Raffle winners");
	expect(md).toContain("1. Bob (@bob)");
	expect(md.endsWith("\n")).toBe(true);
});

test("buildRecapMarkdown shows (none) when there are no winners", () => {
	const md = buildRecapMarkdown(sampleData(), defaultTimerDoc(), undefined, 1_700_000_000_000);
	expect(md).toContain("## Giveaway winners\n- (none)");
});
