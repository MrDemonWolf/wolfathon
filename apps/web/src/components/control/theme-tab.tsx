"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { Data } from "@wolfathon/api/state";
import type { OverlayTheme } from "@wolfathon/api/theme";
import { defaultTimerConfig, type TimerDoc } from "@wolfathon/api/timer";
import { useMemo } from "react";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

import { DirtyBar } from "./dirty-bar";
import { OverlayPreview } from "./overlay-preview";
import { ThemeEditor } from "./theme-editor";
import { TimerPreview } from "./timer-preview";
import { useDraft } from "./use-draft";

/** Dummy timer doc for the preview — a running clock with a few hours left. */
function dummyTimerDoc(): TimerDoc {
	const remainingMs = 2 * 3_600_000 + 47 * 60_000; // 2h 47m
	return {
		config: defaultTimerConfig(),
		state: {
			running: true,
			endsAt: Date.now() + remainingMs,
			remainingMs,
			totalAddedMs: 0,
			lastEvent: null,
			autoPaused: false,
		},
	};
}

/** Dummy rewards state for the preview — two unlocked, one in progress. */
function dummyData(theme: OverlayTheme): Data {
	return {
		currentIndex: 2,
		currentSubs: 7,
		theme,
		goals: [
			{ id: "1", reward: "Q&A", unlocked: true, target: 1 },
			{ id: "2", reward: "Phasmophobia", unlocked: true, target: 5 },
			{ id: "3", reward: "Onesie reveal", unlocked: false, target: 10 },
			{ id: "4", reward: "Cake on cam", unlocked: false, target: 15 },
		],
	};
}

/**
 * The global overlay theme editor. One theme drives BOTH overlays (timer capsule
 * + rewards card), so it lives here in Settings rather than on either tab. The
 * preview shows both surfaces with dummy data so the operator can compare presets
 * without touching their live goals or timer.
 */
export function ThemeTab() {
	const rawOptions = controlTrpc.state.getRaw.queryOptions();
	const { data, isLoading, isError, refetch } = useQuery(rawOptions);
	const invalidate = () => queryClient.invalidateQueries({ queryKey: rawOptions.queryKey });

	const setTheme = useMutation(controlTrpc.state.setTheme.mutationOptions());
	const { draft, setDraft, dirty, discard, seed } = useDraft(
		data,
		(d) => d.theme,
		(t) => JSON.stringify(t),
	);

	// Stable dummy timer (theme is passed separately, so it needn't rebuild on edits).
	const timerDoc = useMemo(() => dummyTimerDoc(), []);
	const rewardsDoc = useMemo(() => (draft ? dummyData(draft) : undefined), [draft]);

	function save() {
		if (!draft) return;
		setTheme.mutate(draft, {
			onSuccess: (res) => {
				if (!res.ok) {
					toast.error(
						res.errors[0] ? `${res.errors[0].path}: ${res.errors[0].message}` : "Invalid theme",
					);
					return;
				}
				seed(res.state.theme);
				toast.success("Overlay theme saved");
				invalidate();
			},
		});
	}

	return (
		<div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
			<div className="flex flex-col gap-6">
				{!draft && isError && (
					<div className="rounded-2xl panel-card p-5">
						<h2 className="font-heading text-lg font-bold">Couldn&apos;t load the theme</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							The overlay theme failed to load. Check your connection and try again.
						</p>
						<button
							type="button"
							onClick={() => refetch()}
							className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition hover:bg-accent"
						>
							Retry
						</button>
					</div>
				)}
				{!draft && !isError && isLoading && (
					<div className="rounded-2xl panel-card p-5 text-sm text-muted-foreground">
						Loading theme…
					</div>
				)}
				{draft && (
					<div className="rounded-2xl panel-card p-5">
						<h2 className="font-heading text-lg font-bold">Overlay theme</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							One theme for both overlays — the subathon timer and the rewards card share these
							colours, font and corners.
						</p>
						<ThemeEditor
							theme={draft}
							onChange={setDraft}
							labelToggleText='Show eyebrow label ("SUBATHON" / "NEXT REWARD")'
							statusToggleText="Show status indicator (timer chip + live dot)"
						/>
					</div>
				)}
				<DirtyBar
					dirty={dirty}
					saving={setTheme.isPending}
					onSave={save}
					onDiscard={discard}
					summary="overlay theme"
				/>
			</div>

			<div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
				<div>
					<h2 className="font-heading text-lg font-bold">Live preview</h2>
					<p className="text-xs text-muted-foreground">
						Sample data — your real goals and timer aren&apos;t shown here.
					</p>
				</div>
				<div className="flex flex-col gap-2">
					<span className="eyebrow text-[0.65rem]">Timer overlay</span>
					<TimerPreview doc={timerDoc} theme={draft ?? undefined} />
				</div>
				<div className="flex flex-col gap-2">
					<span className="eyebrow text-[0.65rem]">Rewards overlay</span>
					<OverlayPreview data={rewardsDoc} />
				</div>
				{dirty && <p className="text-xs text-amber-400">Preview shows unsaved changes.</p>}
			</div>
		</div>
	);
}
