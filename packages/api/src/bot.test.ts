import { expect, test } from "bun:test";

import {
	activeWolfathonParts,
	canRun,
	defaultBotDoc,
	dynamicTemplate,
	fillTemplate,
	formatDuration,
	goalsValue,
	isPrivileged,
	markRun,
	matchCommand,
	setCooldown,
	timerValue,
	updateCommand,
	wheelValue,
	withBotDefaults,
	wolfathonValue,
} from "./bot";
import { defaultTimerDoc, start } from "./timer";
import { sampleData } from "./state";
import { defaultWheelDoc } from "./wheel";

test("matchCommand resolves aliases on enabled commands only", () => {
	const doc = { ...defaultBotDoc(), enabled: true };
	expect(matchCommand(doc, "!subathon")?.id).toBe("wolfathon");
	expect(matchCommand(doc, "!TIME now")?.id).toBe("timer"); // case-insensitive, ignores args
	expect(matchCommand(doc, "hello !wolf")).toBeNull(); // command must be the first token
	expect(matchCommand(doc, "!nope")).toBeNull();
});

test("master switch + per-command disable both gate matching", () => {
	expect(matchCommand(defaultBotDoc(), "!timer")).toBeNull(); // master off by default
	let doc = { ...defaultBotDoc(), enabled: true };
	doc = updateCommand(doc, "timer", { enabled: false });
	expect(matchCommand(doc, "!timer")).toBeNull();
	expect(matchCommand(doc, "!goals")?.id).toBe("goals"); // others unaffected
});

test("cooldown blocks normal viewers but privileged bypass", () => {
	const cmd = { ...defaultBotDoc().commands[0]!, lastRunAt: 1_000 };
	expect(canRun(cmd, 15, 1_000 + 14_000, false)).toBe(false); // within cooldown
	expect(canRun(cmd, 15, 1_000 + 15_000, false)).toBe(true); // exactly elapsed
	expect(canRun(cmd, 15, 1_000 + 1, true)).toBe(true); // privileged ignores cooldown
	expect(canRun({ ...cmd, lastRunAt: undefined }, 15, 0, false)).toBe(true); // never run
});

test("markRun stamps only the named command", () => {
	const doc = markRun(defaultBotDoc(), "timer", 999);
	expect(doc.commands.find((c) => c.id === "timer")?.lastRunAt).toBe(999);
	expect(doc.commands.find((c) => c.id === "goals")?.lastRunAt).toBeUndefined();
});

test("isPrivileged detects broadcaster, mod, vip; not plain viewers", () => {
	expect(isPrivileged({ chatter_user_id: "1", broadcaster_user_id: "1" })).toBe(true);
	expect(isPrivileged({ badges: [{ set_id: "moderator" }] })).toBe(true);
	expect(isPrivileged({ badges: [{ set_id: "vip" }] })).toBe(true);
	expect(isPrivileged({ chatter_user_id: "2", broadcaster_user_id: "1", badges: [] })).toBe(false);
	expect(isPrivileged({ badges: [{ set_id: "subscriber" }] })).toBe(false);
});

test("dynamic templates fill {value} and fall back on unknown key", () => {
	expect(fillTemplate("Time left: {value}", "2h 5m")).toBe("Time left: 2h 5m");
	expect(dynamicTemplate("timer", "hype")).toContain("{value}");
	// Unknown key → first preset, not a crash.
	expect(dynamicTemplate("goals", "does-not-exist")).toBe(dynamicTemplate("goals", "plain"));
});

test("live value formatters", () => {
	expect(formatDuration(0)).toBe("0m");
	expect(formatDuration((2 * 24 * 60 + 3 * 60 + 12) * 60_000)).toBe("2d 3h 12m");

	const timer = defaultTimerDoc(); // 60m, paused
	expect(timerValue(timer, 0)).toBe("1h 0m (paused)");
	const running = { ...timer, state: start(timer.state, 0) };
	expect(timerValue(running, 0)).toBe("1h 0m");

	const data = sampleData(); // first goal "Q&A" @ target 1, currentSubs 0
	expect(goalsValue(data)).toBe("Q&A at 1 subs (0/1)");
	expect(goalsValue({ ...data, goals: [], currentIndex: 0 })).toBe("all rewards unlocked!");

	const wheel = defaultWheelDoc();
	const enabled = wheel.slots.filter((s) => s.enabled).length;
	expect(wheelValue(wheel)).toBe(`${enabled} ${enabled === 1 ? "dare" : "dares"}`);
	expect(wheelValue({ ...wheel, slots: [] })).toBe("no dares yet");
});

test("updateCommand clamps response, validates triggers + formatKey", () => {
	let doc = { ...defaultBotDoc(), enabled: true };

	// Response edit applies to text commands, clamped to the max length.
	doc = updateCommand(doc, "giveaway", { response: "x".repeat(999) });
	expect(doc.commands.find((c) => c.id === "giveaway")!.response.length).toBe(400);

	// Response edits are ignored on dynamic commands (they render live).
	doc = updateCommand(doc, "timer", { response: "hijack" });
	expect(doc.commands.find((c) => c.id === "timer")!.response).toBe("");

	// formatKey only accepts keys valid for the command's kind.
	doc = updateCommand(doc, "timer", { formatKey: "ends" });
	expect(doc.commands.find((c) => c.id === "timer")!.formatKey).toBe("ends");
	doc = updateCommand(doc, "timer", { formatKey: "bogus" });
	expect(doc.commands.find((c) => c.id === "timer")!.formatKey).toBe("ends"); // unchanged

	// Triggers normalize (lowercase, "!"-prefix required) and can't be emptied.
	doc = updateCommand(doc, "wolfathon", { triggers: ["!FOO", "bar", "!foo", " !baz "] });
	expect(doc.commands.find((c) => c.id === "wolfathon")!.triggers).toEqual(["!foo", "!baz"]);
	const before = doc.commands.find((c) => c.id === "wolfathon")!.triggers;
	doc = updateCommand(doc, "wolfathon", { triggers: ["nobang"] });
	expect(doc.commands.find((c) => c.id === "wolfathon")!.triggers).toEqual(before); // fallback kept
});

test("setCooldown clamps; withBotDefaults backfills legacy docs", () => {
	expect(setCooldown(defaultBotDoc(), -5).cooldownSeconds).toBe(0);
	expect(setCooldown(defaultBotDoc(), 99_999).cooldownSeconds).toBe(3600);

	// Legacy / partial doc → defaults filled, commands re-seeded.
	const filled = withBotDefaults({} as never);
	expect(filled.enabled).toBe(false);
	expect(filled.cooldownSeconds).toBe(15);
	expect(filled.commands.length).toBe(5);
});

test("withBotDefaults migrates a legacy text !wolfathon to the composite command", () => {
	// A doc saved before !wolfathon became dynamic: plain text, operator-disabled,
	// with a custom alias. Migration adds the composite fields, keeps the edits.
	const legacy = {
		enabled: true,
		cooldownSeconds: 20,
		commands: [
			{ id: "wolfathon", triggers: ["!sub"], enabled: false, response: "old static text" },
		],
	} as never;
	const cmd = withBotDefaults(legacy).commands.find((c) => c.id === "wolfathon")!;
	expect(cmd.dynamic).toBe("wolfathon");
	expect(cmd.parts).toEqual(["intro", "timer", "subs", "goal"]);
	expect(cmd.enabled).toBe(false); // operator edit preserved
	expect(cmd.triggers).toEqual(["!sub"]); // alias preserved
});

test("!wolfathon parts: default = all, toggles validate + render live", () => {
	const base = defaultBotDoc();
	const wolf = base.commands.find((c) => c.id === "wolfathon")!;
	const timer = defaultTimerDoc(); // 1h 0m, paused
	const data = sampleData(); // currentSubs 0, first goal "Q&A" @ 1

	// Default (parts undefined after stripping) = every part, canonical order.
	expect(activeWolfathonParts({ ...wolf, parts: undefined })).toEqual([
		"intro",
		"timer",
		"subs",
		"goal",
	]);

	const full = wolfathonValue(wolf, timer, data, 0);
	expect(full).toContain("subathon");
	expect(full).toContain("1h 0m (paused) on the clock");
	expect(full).toContain("0 subs so far");
	expect(full).toContain("Next reward: Q&A at 1 subs (0/1)");

	// A subset renders only those parts, joined by " · ".
	let doc = updateCommand({ ...base, enabled: true }, "wolfathon", { parts: ["subs", "timer"] });
	const subset = doc.commands.find((c) => c.id === "wolfathon")!;
	expect(activeWolfathonParts(subset)).toEqual(["timer", "subs"]); // canonical, deduped order
	expect(wolfathonValue(subset, timer, { ...data, currentSubs: 1 }, 0)).toBe(
		"⏰ 1h 0m (paused) on the clock · 1 sub so far",
	);

	// Unknown keys are dropped; parts edits don't touch non-composite commands.
	doc = updateCommand(doc, "wolfathon", { parts: ["bogus", "goal"] });
	expect(doc.commands.find((c) => c.id === "wolfathon")!.parts).toEqual(["goal"]);
	doc = updateCommand(doc, "timer", { parts: ["subs"] });
	expect(doc.commands.find((c) => c.id === "timer")!.parts).toBeUndefined();

	// All rewards unlocked → the goal part says so.
	expect(wolfathonValue({ ...wolf, parts: ["goal"] }, timer, { ...data, goals: [] }, 0)).toBe(
		"🎯 All rewards unlocked!",
	);
});
