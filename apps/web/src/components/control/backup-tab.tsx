"use client";

import { buildBackupDoc, splitBackupDoc } from "@wolfathon/api/backup";
import { useMutation, useQuery } from "@tanstack/react-query";

import { controlTrpc, queryClient } from "@/utils/trpc";

import { buildClaudePrompt } from "./claude-prompt";
import { EXAMPLE_DOC, REWARDS_SCHEMA_BULLETS } from "./example";
import { type IEError, type IEConfig, ImportExportPanel } from "./import-export-panel";
import { TIMER_EXAMPLE, TIMER_SCHEMA_BULLETS } from "./timer-example";
import { guard } from "./use-draft";
import { nowStamp } from "./util";

const rewardsLabel = (index: number) => (index < 0 ? "Document" : `Goal #${index + 1}`);

/** One combined backup file: the rewards doc and the timer config in one document. */
const BACKUP_EXAMPLE_JSON = JSON.stringify(buildBackupDoc(EXAMPLE_DOC, TIMER_EXAMPLE), null, 2);

const BACKUP_SCHEMA_BULLETS = [
	"One document with `version` (1) plus two sections: `rewards` and `timer`.",
	...REWARDS_SCHEMA_BULLETS.map((b) => `rewards — ${b}`),
	...TIMER_SCHEMA_BULLETS.map((b) => `timer — ${b}`),
];

/**
 * Single home for backup/restore. Rewards and timer config used to export as two
 * separate files; they're now bundled into one full-restore document. The two
 * halves are validated by their own server validators — this tab just splits the
 * wrapper and fans the calls out, surfacing each half's errors under its section.
 */
export function BackupTab() {
	const stateRaw = controlTrpc.state.getRaw.queryOptions();
	const { data: rewards } = useQuery(stateRaw);
	const validateRewards = useMutation(controlTrpc.state.validate.mutationOptions());
	const importRewards = useMutation(controlTrpc.state.import.mutationOptions());

	const timerRaw = controlTrpc.timer.getRaw.queryOptions();
	const { data: timer } = useQuery(timerRaw);
	const validateTimer = useMutation(controlTrpc.timer.validateConfig.mutationOptions());
	const importTimer = useMutation(controlTrpc.timer.setConfig.mutationOptions());

	const ready = rewards != null && timer != null;
	const currentJson = () =>
		ready ? JSON.stringify(buildBackupDoc(rewards, timer.config), null, 2) : null;

	/** Validate both halves; collect errors from each under a section label. */
	async function validateBoth(
		rewardsDoc: unknown,
		timerDoc: unknown,
	): Promise<{ ok: true; summary: string[] } | { ok: false; errors: IEError[] }> {
		const [rw, tm] = await Promise.all([
			validateRewards.mutateAsync(rewardsDoc),
			validateTimer.mutateAsync(timerDoc),
		]);
		const errors: IEError[] = [];
		if (!rw.ok)
			errors.push(
				...rw.errors.map((e) => ({
					label: `Rewards · ${rewardsLabel(e.index)}`,
					message: e.message,
				})),
			);
		if (!tm.ok)
			errors.push(...tm.errors.map((e) => ({ label: `Timer · ${e.path}`, message: e.message })));
		if (errors.length) return { ok: false, errors };
		return { ok: true, summary: [...(rw.ok ? rw.rewards : []), "timer config valid"] };
	}

	const backupIE: IEConfig = {
		title: "your setup",
		noteLine: "One file restores everything: goals, sub count, overlay theme, and timer config.",
		exampleJson: BACKUP_EXAMPLE_JSON,
		schemaBullets: BACKUP_SCHEMA_BULLETS,
		exportFilename: () => `wolfathon-backup-${nowStamp()}.json`,
		currentJson,
		claudePrompt: () => {
			const json = currentJson();
			return json
				? buildClaudePrompt({
						kind: "full backup (rewards + timer config in one document)",
						schemaBullets: BACKUP_SCHEMA_BULLETS,
						exampleJson: BACKUP_EXAMPLE_JSON,
						currentJson: json,
					})
				: null;
		},
		confirmText:
			"This replaces ALL goals, sub count, theme, and timer config, and resets goal progress. Continue?",
		validate: (v) =>
			guard(
				async () => {
					const split = splitBackupDoc(v);
					if (!split.ok)
						return { ok: false, errors: [{ label: "Backup", message: split.message }] };
					return validateBoth(split.rewards, split.timer);
				},
				(errors) => ({ ok: false, errors }),
			),
		doImport: (v) =>
			guard(
				async () => {
					const split = splitBackupDoc(v);
					if (!split.ok)
						return { ok: false, errors: [{ label: "Backup", message: split.message }] };
					// Validate both BEFORE writing either, so a bad half never half-applies.
					const pre = await validateBoth(split.rewards, split.timer);
					if (!pre.ok) return pre;
					// ponytail: two separate D1 writes (state row + timer doc), not one
					// transaction — a network failure between them can leave the timer
					// un-imported; re-import fixes it. Fine for a manual restore tool.
					const [rw, tm] = await Promise.all([
						importRewards.mutateAsync(split.rewards),
						importTimer.mutateAsync(split.timer),
					]);
					const errors: IEError[] = [];
					if (!rw.ok)
						errors.push(
							...rw.errors.map((e) => ({
								label: `Rewards · ${rewardsLabel(e.index)}`,
								message: e.message,
							})),
						);
					if (!tm.ok)
						errors.push(
							...tm.errors.map((e) => ({ label: `Timer · ${e.path}`, message: e.message })),
						);
					if (errors.length) return { ok: false, errors };
					return { ok: true };
				},
				(errors) => ({ ok: false, errors }),
			),
	};

	const busy =
		validateRewards.isPending ||
		importRewards.isPending ||
		validateTimer.isPending ||
		importTimer.isPending;

	return (
		<div className="flex max-w-3xl flex-col gap-6">
			<section className="flex flex-col gap-2">
				<h2 className="font-heading text-lg font-bold">Backup &amp; restore</h2>
				<p className="text-sm text-muted-foreground">
					Everything in one JSON file — goals, sub count, overlay theme, and timer config. Hand the
					file to Claude to edit, then upload to restore.
				</p>
				<ImportExportPanel
					config={backupIE}
					busy={busy}
					onImported={() => {
						queryClient.invalidateQueries({ queryKey: stateRaw.queryKey });
						queryClient.invalidateQueries({ queryKey: timerRaw.queryKey });
					}}
				/>
			</section>
		</div>
	);
}
