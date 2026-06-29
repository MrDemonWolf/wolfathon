/**
 * Combined backup document: one JSON file that bundles the rewards/goals doc and
 * the timer config, so a single export fully restores the tracker (and a single
 * file is what the operator hands to Claude to edit).
 *
 * This module owns only the wrapper shape. Each half is validated by its own
 * validator (`validateImport` for rewards, `validateTimerConfig` for timer), so
 * this file stays dependency-free and easy to test.
 */

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
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
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
	return { ok: true, rewards: obj.rewards, timer: obj.timer };
}
