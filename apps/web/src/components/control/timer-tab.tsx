"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { TimerConfig } from "@wolfathon/api/timer";
import { Button } from "@wolfathon/ui/components/button";
import Link from "next/link";
import { toast } from "sonner";

import { controlTrpc } from "@/utils/trpc";

import { DirtyBar } from "./dirty-bar";
import { TimerConfigPanel } from "./timer-config-panel";
import { TimerPanel } from "./timer-panel";
import { TimerPreview } from "./timer-preview";
import { useControlDoc } from "./use-control-doc";
import { useDraft } from "./use-draft";

/**
 * Draft projection. `channelPoints` is excluded from the dirty diff because it is
 * server-owned: creating or removing a reward writes through to Twitch immediately,
 * so the returned rules landing in the draft must not read as an unsaved edit — it
 * did, which left the tab permanently dirty and blocked every later re-seed.
 */
const configKey = ({ channelPoints: _serverOwned, ...rest }: TimerConfig) => JSON.stringify(rest);
const selectConfig = (d: { config: TimerConfig }) => d.config;

export function TimerTab() {
	const { data, isLoading, isError, refetch, invalidate } = useControlDoc(
		controlTrpc.timer.getRaw.queryOptions(),
	);

	// Overlay theme is global (Settings → Theme) — pull it in just so the preview
	// renders with the operator's real colours.
	const { data: stateDoc } = useQuery(controlTrpc.state.getRaw.queryOptions());

	const setConfig = useMutation(controlTrpc.timer.setConfig.mutationOptions());
	const { draft, setDraft, dirty, stale, discard, seed } = useDraft(data, selectConfig, configKey);

	const previewDoc = data ? { config: draft ?? data.config, state: data.state } : undefined;

	function save() {
		if (!draft) return;
		// `channelPoints` is server-owned — creating/removing a reward writes straight
		// through to Twitch and D1. Omitting the key tells `setConfig` to preserve the
		// stored rules instead of replacing them with this page's snapshot.
		const { channelPoints: _serverOwned, ...payload } = draft;
		setConfig.mutate(payload, {
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
					stale={stale}
				/>
			</div>
			<div className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
				<div className="flex items-center justify-between">
					<h2 className="font-heading text-lg font-bold">Live preview</h2>
					<Link
						href="/dashboard/settings/overlays"
						className="rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						Get URL →
					</Link>
				</div>
				<TimerPreview doc={previewDoc} theme={stateDoc?.theme} />
				{dirty && <p className="text-xs text-amber-400">Preview shows unsaved changes.</p>}
			</div>
		</div>
	);
}
