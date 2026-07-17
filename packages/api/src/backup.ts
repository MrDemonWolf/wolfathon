/**
 * Combined backup document: one JSON file that bundles the rewards/goals doc and
 * the timer config, so a single export fully restores the tracker (and a single
 * file is what the operator hands to Claude to edit).
 *
 * This module owns the wrapper shape (each half is validated by its own
 * validator — `validateImport` for rewards, `validateTimerConfig` for timer) plus
 * the human-readable Markdown recap, which reads across all three docs. Pure —
 * string building only, no DB or DOM — so it stays easy to test.
 */

import type { GiveawayDoc } from "./giveaway";
import type { Data } from "./state";
import { currentRemainingMs, splitDuration, type TimerDoc } from "./timer";
import { isPlainObject } from "./util";

/** Backup file format version. Bump only on a breaking wrapper-shape change. */
export const BACKUP_VERSION = 1;

/** The single-file backup: a version tag plus the two opaque sub-documents. */
export type BackupDoc = {
	version: number;
	rewards: unknown;
	timer: unknown;
};

/** Wrap the current rewards doc + timer config into one backup document. */
export function buildBackupDoc(rewards: unknown, timer: unknown): BackupDoc {
	return { version: BACKUP_VERSION, rewards, timer };
}

export type BackupSplit =
	| { ok: true; rewards: unknown; timer: unknown }
	| { ok: false; message: string };

/**
 * Pull the two halves out of a pasted/uploaded backup file. Validates only the
 * wrapper shape (an object carrying both `rewards` and `timer`); the contents of
 * each half are validated downstream. `version` is read leniently — unknown
 * future versions still split, since the per-half validators are the real gate.
 * Gives a targeted hint for an old rewards-only file so the operator isn't left
 * guessing why their previous export no longer imports.
 */
export function splitBackupDoc(value: unknown): BackupSplit {
	if (!isPlainObject(value)) {
		return { ok: false, message: "Backup must be a JSON object." };
	}
	const obj = value as Record<string, unknown>;
	const hasRewards = "rewards" in obj;
	const hasTimer = "timer" in obj;
	if (!hasRewards && !hasTimer && "goals" in obj) {
		return {
			ok: false,
			message:
				"This looks like an old rewards-only file. Wrap it as { version: 1, rewards: { …goals… }, timer: { …config… } } — or copy the Claude prompt for the new shape.",
		};
	}
	if (!hasRewards || !hasTimer) {
		return { ok: false, message: "Backup needs both a `rewards` section and a `timer` section." };
	}
	return { ok: true, rewards: carryLegacyLabel(obj.rewards, obj.timer), timer: obj.timer };
}

/**
 * Migration shim: the timer eyebrow `label` moved from `timer.config.label` to
 * `rewards.theme.label`. A pre-migration backup carries the operator's custom
 * label only on the timer half, so copy it onto the rewards theme (when that
 * theme exists but has no label) before the per-half validators run — otherwise
 * a restored backup silently resets the label to the default. Pure + non-mutating.
 */
function carryLegacyLabel(rewards: unknown, timer: unknown): unknown {
	if (!isPlainObject(rewards)) return rewards;
	const r = rewards as Record<string, unknown>;
	const theme = r.theme;
	if (!isPlainObject(theme)) return rewards;
	if (typeof (theme as Record<string, unknown>).label === "string") return rewards;
	const legacy = legacyTimerLabel(timer);
	if (legacy === undefined) return rewards;
	return { ...r, theme: { ...(theme as Record<string, unknown>), label: legacy } };
}

/** Pull a non-empty `label` off a legacy timer half (`{ config: { label } }` or bare). */
function legacyTimerLabel(timer: unknown): string | undefined {
	if (!isPlainObject(timer)) return undefined;
	const t = timer as Record<string, unknown>;
	const cfg = (typeof t.config === "object" && t.config !== null ? t.config : t) as Record<
		string,
		unknown
	>;
	const label = cfg.label;
	return typeof label === "string" && label.trim() ? label : undefined;
}

// ---- Markdown recap -------------------------------------------------------

/**
 * "3d 4h 12m" from a ms duration — drops leading zero units, but always shows
 * minutes (and hours once days are present). Distinct from the bot's
 * `formatDuration`, which omits a zero hours field even with days.
 */
export function humanDuration(ms: number): string {
	const { d, h, m } = splitDuration(ms);
	return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(" ");
}

/**
 * A human-readable Markdown recap — paste straight into Notion. Unlike the JSON
 * backup (for restoring), this is a snapshot to keep: final clock, subs, which
 * rewards unlocked, and the giveaway winners to ship to. `now` is injectable so
 * the recap is deterministic in tests.
 */
export function buildRecapMarkdown(
	rewards: Data,
	timer: TimerDoc,
	giveaway: GiveawayDoc | undefined,
	now: number = Date.now(),
): string {
	const lines: string[] = [`# Wolfathon recap — ${new Date(now).toLocaleString()}`, ""];

	lines.push("## Timer", `- Time on clock: ${humanDuration(currentRemainingMs(timer.state, now))}`);
	lines.push(`- Status: ${timer.state.running ? "running" : "paused"}`, "");

	lines.push("## Subs", `- Total subs counted: ${rewards.currentSubs ?? 0}`, "");

	lines.push("## Rewards");
	if (rewards.goals.length === 0) lines.push("- (none)");
	for (const g of rewards.goals) lines.push(`- [${g.unlocked ? "x" : " "}] ${g.reward}`);
	lines.push("");

	const winners = giveaway?.winners ?? [];
	const gift = winners.filter((w) => w.source === "gift");
	const raffle = winners.filter((w) => w.source === "raffle");
	const winLine = (w: (typeof winners)[number], i: number) =>
		`${i + 1}. ${w.name} (@${w.login})${w.shipped ? " — shipped ✓" : ""}${w.note ? ` — ${w.note}` : ""}`;
	lines.push("## Giveaway winners");
	if (winners.length === 0) {
		lines.push("- (none)");
	} else {
		if (gift.length) lines.push("### Gift sub winners", ...gift.map(winLine), "");
		if (raffle.length) lines.push("### Raffle winners", ...raffle.map(winLine), "");
	}
	return `${lines.join("\n").trimEnd()}\n`;
}
