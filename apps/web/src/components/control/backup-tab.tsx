"use client";

import { buildBackupDoc, splitBackupDoc } from "@wolfathon/api/backup";
import type { GiveawayDoc } from "@wolfathon/api/giveaway";
import type { Data } from "@wolfathon/api/state";
import type { TimerDoc } from "@wolfathon/api/timer";
import { currentRemainingMs } from "@wolfathon/api/timer";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	AlertDialog,
	AlertDialogClose,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@wolfathon/ui/components/alert-dialog";
import { Button } from "@wolfathon/ui/components/button";
import { FileText, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

import { buildClaudePrompt } from "./claude-prompt";
import { EXAMPLE_DOC, REWARDS_SCHEMA_BULLETS } from "./example";
import { type IEError, type IEConfig, ImportExportPanel } from "./import-export-panel";
import { TIMER_EXAMPLE, TIMER_SCHEMA_BULLETS } from "./timer-example";
import { guard } from "./use-draft";
import { nowStamp } from "./util";

const rewardsLabel = (index: number) => (index < 0 ? "Document" : `Goal #${index + 1}`);

/** "3d 4h 12m" from a ms duration (drops leading zero units, always shows minutes). */
function humanDuration(ms: number): string {
	const totalMin = Math.floor(ms / 60000);
	const d = Math.floor(totalMin / 1440);
	const h = Math.floor((totalMin % 1440) / 60);
	const m = totalMin % 60;
	return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(" ");
}

/**
 * A human-readable Markdown recap — paste straight into Notion. Unlike the JSON
 * backup (for restoring), this is a snapshot to keep: final clock, subs, which
 * rewards unlocked, and the giveaway winners to ship to.
 */
function buildRecapMarkdown(
	rewards: Data,
	timer: TimerDoc,
	giveaway: GiveawayDoc | undefined,
): string {
	const now = Date.now();
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

/** Trigger a client-side file download of arbitrary text. */
function downloadText(filename: string, text: string, mime: string) {
	const url = URL.createObjectURL(new Blob([text], { type: mime }));
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

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

	// Giveaway winners feed the Markdown recap only (not the JSON restore doc).
	const giveawayRaw = controlTrpc.giveaway.getRaw.queryOptions();
	const { data: giveaway } = useQuery(giveawayRaw);

	const resetSubathon = useMutation(
		controlTrpc.resetForNextSubathon.mutationOptions({
			onSuccess: () => {
				toast.success("Reset for the next subathon — configuration kept.");
				for (const q of [stateRaw, timerRaw, giveawayRaw]) {
					queryClient.invalidateQueries({ queryKey: q.queryKey });
				}
			},
			onError: (e) => toast.error(e.message),
		}),
	);

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

			{/* Notion-friendly recap — a readable snapshot to keep, not to restore. */}
			<section className="flex flex-col gap-2 rounded-2xl panel-card p-5">
				<h2 className="font-heading text-lg font-bold">Recap for your notes</h2>
				<p className="text-sm text-muted-foreground">
					A readable Markdown snapshot — final clock, subs, unlocked rewards, and giveaway winners
					to ship to. Paste it straight into Notion or a doc.
				</p>
				<div>
					<Button
						variant="outline"
						disabled={!ready}
						onClick={() =>
							ready &&
							downloadText(
								`wolfathon-recap-${nowStamp()}.md`,
								buildRecapMarkdown(rewards, timer, giveaway),
								"text/markdown",
							)
						}
					>
						<FileText className="size-4" />
						Download recap (.md)
					</Button>
				</div>
			</section>

			{/* Fresh slate for the next subathon — wipes progress, keeps config. */}
			<section className="flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-destructive/[0.04] p-5">
				<h2 className="font-heading text-lg font-bold">Start the next subathon</h2>
				<p className="text-sm text-muted-foreground">
					Resets the timer to base, sub count to 0, re-locks every reward, clears the wheel spin
					history, and resets the giveaway round.{" "}
					<span className="text-foreground">Your setup is kept</span> — goals, dares, overlay theme,
					timer settings, giveaway config, and Twitch/bot connections all stay. Download a backup or
					recap first if you want a record.
				</p>
				<div>
					<AlertDialog>
						<AlertDialogTrigger
							render={
								<Button variant="destructive" disabled={!ready || resetSubathon.isPending}>
									<RotateCcw className="size-4" />
									Reset for next subathon
								</Button>
							}
						/>
						<AlertDialogContent>
							<AlertDialogTitle>Reset for the next subathon?</AlertDialogTitle>
							<AlertDialogDescription>
								Timer → base, subs → 0, all rewards re-locked, wheel history cleared, giveaway round
								reset. Your goals, dares, theme, and connections are kept. This can&apos;t be undone
								— export a backup first if you need the numbers.
							</AlertDialogDescription>
							<AlertDialogFooter>
								<AlertDialogClose render={<Button variant="outline">Cancel</Button>} />
								<AlertDialogClose
									onClick={() => resetSubathon.mutate()}
									render={<Button variant="destructive">Reset everything</Button>}
								/>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</section>
		</div>
	);
}
