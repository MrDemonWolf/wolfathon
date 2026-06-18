"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { controlTrpc, queryClient } from "@/utils/trpc";

import { buildClaudePrompt } from "./claude-prompt";
import { type IEConfig, type IEError, ImportExportPanel } from "./import-export-panel";
import { TimerConfigPanel } from "./timer-config-panel";
import { TimerPanel } from "./timer-panel";
import { TimerPreview } from "./timer-preview";
import { TIMER_EXAMPLE_JSON, TIMER_SCHEMA_BULLETS } from "./timer-example";
import { nowStamp } from "./util";

export function TimerTab() {
	const rawOptions = controlTrpc.timer.getRaw.queryOptions();
	const { data } = useQuery(rawOptions);
	const invalidate = () => queryClient.invalidateQueries({ queryKey: rawOptions.queryKey });

	const validate = useMutation(controlTrpc.timer.validateConfig.mutationOptions());
	const setConfig = useMutation(controlTrpc.timer.setConfig.mutationOptions());

	async function guard<T>(fn: () => Promise<T>, onErr: (errors: IEError[]) => T): Promise<T> {
		try {
			return await fn();
		} catch (e) {
			return onErr([
				{ label: "Error", message: e instanceof Error ? e.message : "request failed" },
			]);
		}
	}

	const ie: IEConfig = {
		title: "timer config",
		exampleJson: TIMER_EXAMPLE_JSON,
		schemaBullets: TIMER_SCHEMA_BULLETS,
		exportFilename: () => `wolfathon-timer-${nowStamp()}.json`,
		currentJson: () => (data ? JSON.stringify(data.config, null, 2) : null),
		claudePrompt: () =>
			data
				? buildClaudePrompt({
						kind: "subathon timer config",
						schemaBullets: TIMER_SCHEMA_BULLETS,
						exampleJson: TIMER_EXAMPLE_JSON,
						currentJson: JSON.stringify(data.config, null, 2),
					})
				: null,
		confirmText: "This replaces your timer config. Continue?",
		validate: (v) =>
			guard(
				async () => {
					const r = await validate.mutateAsync(v);
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
					const r = await setConfig.mutateAsync(v);
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
		<div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
			<div className="flex flex-col gap-6">
				<TimerPanel doc={data} onChanged={invalidate} />
				<TimerConfigPanel doc={data} onChanged={invalidate} />
				<ImportExportPanel
					config={ie}
					busy={validate.isPending || setConfig.isPending}
					onImported={invalidate}
				/>
			</div>
			<div className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
				<div className="flex items-center justify-between">
					<h2 className="font-heading text-lg font-bold">Live preview</h2>
					<a
						href="/overlay/timer"
						target="_blank"
						rel="noreferrer"
						className="text-xs text-muted-foreground transition-colors hover:text-foreground"
					>
						Open ↗
					</a>
				</div>
				<TimerPreview doc={data} />
			</div>
		</div>
	);
}
