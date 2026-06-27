"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { controlTrpc, queryClient } from "@/utils/trpc";

import { buildClaudePrompt } from "./claude-prompt";
import { EXAMPLE_JSON, REWARDS_SCHEMA_BULLETS } from "./example";
import { type IEConfig, ImportExportPanel } from "./import-export-panel";
import { TIMER_EXAMPLE_JSON, TIMER_SCHEMA_BULLETS } from "./timer-example";
import { guard } from "./use-draft";
import { nowStamp } from "./util";

const rewardsLabel = (index: number) => (index < 0 ? "Document" : `Goal #${index + 1}`);

/**
 * Single home for backup/restore. Rewards and timer config each get their own
 * import/export panel — these used to be duplicated inside the live tabs.
 */
export function BackupTab() {
	// --- Rewards ---
	const stateRaw = controlTrpc.state.getRaw.queryOptions();
	const { data: rewards } = useQuery(stateRaw);
	const invalidateRewards = () => queryClient.invalidateQueries({ queryKey: stateRaw.queryKey });
	const validateRewards = useMutation(controlTrpc.state.validate.mutationOptions());
	const importRewards = useMutation(controlTrpc.state.import.mutationOptions());

	const rewardsIE: IEConfig = {
		title: "rewards",
		noteLine: "reward shows on stream; note + target are internal.",
		exampleJson: EXAMPLE_JSON,
		schemaBullets: REWARDS_SCHEMA_BULLETS,
		exportFilename: () => `wolfathon-goals-${nowStamp()}.json`,
		currentJson: () => (rewards ? JSON.stringify(rewards, null, 2) : null),
		claudePrompt: () =>
			rewards
				? buildClaudePrompt({
						kind: "rewards list",
						schemaBullets: REWARDS_SCHEMA_BULLETS,
						exampleJson: EXAMPLE_JSON,
						currentJson: JSON.stringify(rewards, null, 2),
					})
				: null,
		confirmText: "This wipes current goals and resets progress. Continue?",
		validate: (v) =>
			guard(
				async () => {
					const r = await validateRewards.mutateAsync(v);
					return r.ok
						? ({ ok: true, summary: r.rewards } as const)
						: ({
								ok: false,
								errors: r.errors.map((e) => ({ label: rewardsLabel(e.index), message: e.message })),
							} as const);
				},
				(errors) => ({ ok: false, errors }),
			),
		doImport: (v) =>
			guard(
				async () => {
					const r = await importRewards.mutateAsync(v);
					return r.ok
						? ({ ok: true } as const)
						: ({
								ok: false,
								errors: r.errors.map((e) => ({ label: rewardsLabel(e.index), message: e.message })),
							} as const);
				},
				(errors) => ({ ok: false, errors }),
			),
	};

	// --- Timer ---
	const timerRaw = controlTrpc.timer.getRaw.queryOptions();
	const { data: timer } = useQuery(timerRaw);
	const invalidateTimer = () => queryClient.invalidateQueries({ queryKey: timerRaw.queryKey });
	const validateTimer = useMutation(controlTrpc.timer.validateConfig.mutationOptions());
	const importTimer = useMutation(controlTrpc.timer.setConfig.mutationOptions());

	const timerIE: IEConfig = {
		title: "timer config",
		exampleJson: TIMER_EXAMPLE_JSON,
		schemaBullets: TIMER_SCHEMA_BULLETS,
		exportFilename: () => `wolfathon-timer-${nowStamp()}.json`,
		currentJson: () => (timer ? JSON.stringify(timer.config, null, 2) : null),
		claudePrompt: () =>
			timer
				? buildClaudePrompt({
						kind: "subathon timer config",
						schemaBullets: TIMER_SCHEMA_BULLETS,
						exampleJson: TIMER_EXAMPLE_JSON,
						currentJson: JSON.stringify(timer.config, null, 2),
					})
				: null,
		confirmText: "This replaces your timer config. Continue?",
		validate: (v) =>
			guard(
				async () => {
					const r = await validateTimer.mutateAsync(v);
					return r.ok
						? ({ ok: true, summary: ["valid config"] } as const)
						: ({
								ok: false,
								errors: r.errors.map((e) => ({ label: e.path, message: e.message })),
							} as const);
				},
				(errors) => ({ ok: false, errors }),
			),
		doImport: (v) =>
			guard(
				async () => {
					const r = await importTimer.mutateAsync(v);
					return r.ok
						? ({ ok: true } as const)
						: ({
								ok: false,
								errors: r.errors.map((e) => ({ label: e.path, message: e.message })),
							} as const);
				},
				(errors) => ({ ok: false, errors }),
			),
	};

	return (
		<div className="flex max-w-3xl flex-col gap-6">
			<section className="flex flex-col gap-2">
				<h2 className="font-heading text-lg font-bold">Rewards &amp; goals</h2>
				<ImportExportPanel
					config={rewardsIE}
					busy={validateRewards.isPending || importRewards.isPending}
					onImported={invalidateRewards}
				/>
			</section>
			<section className="flex flex-col gap-2">
				<h2 className="font-heading text-lg font-bold">Timer config</h2>
				<ImportExportPanel
					config={timerIE}
					busy={validateTimer.isPending || importTimer.isPending}
					onImported={invalidateTimer}
				/>
			</section>
		</div>
	);
}
