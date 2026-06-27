"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@wolfathon/ui/components/button";
import Link from "next/link";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

import { DirtyBar } from "./dirty-bar";
import { TimerConfigPanel } from "./timer-config-panel";
import { TimerPanel } from "./timer-panel";
import { TimerPreview } from "./timer-preview";
import { useDraft } from "./use-draft";

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

	return (
		<div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
			<div className="flex flex-col gap-6">
				{isError && !data ? (
					<div role="status" className="rounded-xl panel-card p-5">
						<h2 className="font-heading text-lg font-bold">Couldn&apos;t load timer settings</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							The timer failed to load. Check your connection and try again.
						</p>
						<Button variant="outline" className="mt-3" onClick={() => refetch()}>
							Retry
						</Button>
					</div>
				) : !data && isLoading ? (
					<div role="status" className="rounded-xl panel-card p-5 text-sm text-muted-foreground">
						Loading timer…
					</div>
				) : (
					<>
						<TimerPanel doc={data} onChanged={invalidate} />
						{draft && <TimerConfigPanel config={draft} onChange={setDraft} />}
					</>
				)}
				<DirtyBar
					dirty={dirty}
					saving={setConfig.isPending}
					onSave={save}
					onDiscard={discard}
					summary="timer settings"
				/>
			</div>
			<div className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
				<div className="flex items-center justify-between">
					<h2 className="font-heading text-lg font-bold">Live preview</h2>
					<Link
						href="/settings/overlays"
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
