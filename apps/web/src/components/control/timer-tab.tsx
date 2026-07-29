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
import { useSaveConflict } from "./use-save-conflict";

/** The config plus the revision it was built from (sent back so a save can be rejected). */
type ConfigDraft = { config: TimerConfig; configRev: number };

/**
 * Draft projection. Two fields are excluded from the dirty diff:
 *  - `channelPoints`, because it is server-owned — creating or removing a reward
 *    writes through to Twitch immediately, so the returned rules landing in the
 *    draft must not read as an unsaved edit. They did, which left the tab
 *    permanently dirty and blocked every later re-seed.
 *  - `configRev`, because it is a concurrency token, not something a human edited.
 */
const configKey = ({ config }: ConfigDraft) => {
	const { channelPoints: _serverOwned, ...rest } = config;
	return JSON.stringify(rest);
};
const selectConfig = (d: { config: TimerConfig; configRev?: number }): ConfigDraft => ({
	config: d.config,
	configRev: d.configRev ?? 0,
});

export function TimerTab() {
	const { data, isLoading, isError, refetch, invalidate } = useControlDoc(
		controlTrpc.timer.getRaw.queryOptions(),
	);

	// Overlay theme is global (Settings → Theme) — pull it in just so the preview
	// renders with the operator's real colours.
	const { data: stateDoc } = useQuery(controlTrpc.state.getRaw.queryOptions());

	const setConfig = useMutation(controlTrpc.timer.setConfig.mutationOptions());
	const { draft, setDraft, dirty, stale, discard, seed } = useDraft(data, selectConfig, configKey);
	const { conflict, handle, clear } = useSaveConflict(refetch);

	const previewDoc = data ? { config: draft?.config ?? data.config, state: data.state } : undefined;

	/**
	 * `force` re-issues a rejected save against the revision we have just refetched,
	 * deliberately overwriting whoever won the race.
	 */
	function save(force = false) {
		if (!draft) return;
		// `channelPoints` is server-owned — creating/removing a reward writes straight
		// through to Twitch and D1. Omitting the key tells `setConfig` to preserve the
		// stored rules instead of replacing them with this page's snapshot.
		const { channelPoints: _serverOwned, ...config } = draft.config;
		setConfig.mutate(
			{ ...config, baseConfigRev: force ? (data?.configRev ?? 0) : draft.configRev },
			{
				onSuccess: (res) => {
					if (!res.ok) {
						toast.error(
							res.errors[0] ? `${res.errors[0].path}: ${res.errors[0].message}` : "Invalid config",
						);
						return;
					}
					clear();
					seed(selectConfig(res.doc));
					toast.success("Timer settings saved");
					invalidate();
				},
				onError: (error) => {
					if (!handle(error)) toast.error(error.message);
				},
			},
		);
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
						{draft && (
							<TimerConfigPanel
								config={draft.config}
								onChange={(config) => setDraft((d) => d && { ...d, config })}
								// A reward create/remove already wrote through to Twitch and D1, so
								// adopt the returned doc as the new SAVED baseline rather than an
								// edit — otherwise the tab reads as dirty and its `configRev` (which
								// the write just bumped) would conflict on the operator's next save.
								onDocChanged={(doc) => seed(selectConfig(doc))}
							/>
						)}
					</>
				)}
				<DirtyBar
					dirty={dirty}
					saving={setConfig.isPending}
					onSave={() => save()}
					onDiscard={() => {
						clear();
						discard();
					}}
					summary="timer settings"
					stale={stale}
					conflict={conflict}
					onLoadLatest={() => {
						clear();
						discard();
					}}
					onForceSave={() => save(true)}
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
