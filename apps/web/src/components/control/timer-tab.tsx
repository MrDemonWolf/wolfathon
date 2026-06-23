"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@wolfathon/ui/components/button";
import Link from "next/link";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

import { buildClaudePrompt } from "./claude-prompt";
import { DirtyBar } from "./dirty-bar";
import { type IEConfig, ImportExportPanel } from "./import-export-panel";
import { TimerConfigPanel } from "./timer-config-panel";
import { TimerPanel } from "./timer-panel";
import { TimerPreview } from "./timer-preview";
import { TIMER_EXAMPLE_JSON, TIMER_SCHEMA_BULLETS } from "./timer-example";
import { guard, useDraft } from "./use-draft";
import { nowStamp } from "./util";

export function TimerTab() {
	const rawOptions = controlTrpc.timer.getRaw.queryOptions();
	const { data, isLoading, isError, refetch } = useQuery(rawOptions);
	const invalidate = () => queryClient.invalidateQueries({ queryKey: rawOptions.queryKey });

	const setConfig = useMutation(controlTrpc.timer.setConfig.mutationOptions());
	const { draft, setDraft, dirty, discard, seed } = useDraft(
		data,
		(d) => d.config,
		(c) => JSON.stringify(c),
	);

	const previewDoc = data ? { config: draft ?? data.config, state: data.state } : undefined;

	function save() {
		if (!draft) return;
		setConfig.mutate(draft, {
			onSuccess: (res) => {
				if (!res.ok) {
					toast.error(
						res.errors[0] ? `${res.errors[0].path}: ${res.errors[0].message}` : "Invalid config",
					);
					return;
				}
				seed(res.doc.config);
				toast.success("Timer settings saved");
				invalidate();
			},
		});
	}

	const validate = useMutation(controlTrpc.timer.validateConfig.mutationOptions());
	const importMut = useMutation(controlTrpc.timer.setConfig.mutationOptions());

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
					const r = await importMut.mutateAsync(v);
					if (r.ok) {
						// Sync the draft to the imported config so a dirty draft does not shadow it
						// (reseed skips while dirty) or revert it on the next Save.
						seed(r.doc.config);
						return { ok: true } as const;
					}
					return {
						ok: false,
						errors: r.errors.map((e) => ({ label: e.path, message: e.message })),
					} as const;
				},
				(errors) => ({ ok: false, errors }),
			),
	};

	return (
		<div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
			<div className="flex flex-col gap-6">
				{isError && !data ? (
					<div className="rounded-xl panel-card p-5">
						<h2 className="font-heading text-lg font-bold">Couldn&apos;t load timer settings</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							The timer failed to load. Check your connection and try again.
						</p>
						<Button variant="outline" className="mt-3" onClick={() => refetch()}>
							Retry
						</Button>
					</div>
				) : !data && isLoading ? (
					<div className="rounded-xl panel-card p-5 text-sm text-muted-foreground">
						Loading timer…
					</div>
				) : (
					<>
						<TimerPanel doc={data} onChanged={invalidate} />
						{draft && <TimerConfigPanel config={draft} onChange={setDraft} />}
					</>
				)}
				<ImportExportPanel
					config={ie}
					busy={validate.isPending || importMut.isPending || setConfig.isPending}
					onImported={invalidate}
				/>
				<DirtyBar
					dirty={dirty}
					saving={setConfig.isPending || importMut.isPending}
					onSave={save}
					onDiscard={discard}
					summary="timer settings"
				/>
			</div>
			<div className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
				<div className="flex items-center justify-between">
					<h2 className="font-heading text-lg font-bold">Live preview</h2>
					<Link
						href="/control/overlays"
						className="rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						Get URL →
					</Link>
				</div>
				<TimerPreview doc={previewDoc} />
				{dirty && <p className="text-xs text-amber-400">Preview shows unsaved changes.</p>}
			</div>
		</div>
	);
}
