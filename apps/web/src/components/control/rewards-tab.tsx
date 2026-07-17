"use client";

import { useMutation } from "@tanstack/react-query";
import { type Data, recompute } from "@wolfathon/api/state";
import { Button } from "@wolfathon/ui/components/button";
import Link from "next/link";
import { toast } from "sonner";

import { controlTrpc } from "@/utils/trpc";

import { DirtyBar } from "./dirty-bar";
import { GoalEditor } from "./goal-editor";
import { OverlayPreview } from "./overlay-preview";
import { SubsControl } from "./subs-control";
import { useControlDoc } from "./use-control-doc";
import { useDraft } from "./use-draft";

/** The bits we diff for dirty-state (currentIndex is server-derived; theme is global → Settings). */
function persisted(d: Data) {
	return JSON.stringify({ goals: d.goals, currentSubs: d.currentSubs });
}

export function RewardsTab() {
	const { data, isLoading, isError, refetch, invalidate } = useControlDoc(
		controlTrpc.state.getRaw.queryOptions(),
	);

	const replace = useMutation(controlTrpc.state.replace.mutationOptions());
	const { draft, setDraft, dirty, discard, seed } = useDraft(data, (d) => d, persisted);

	const preview = draft ? recompute(draft) : data;

	function save() {
		if (!draft) return;
		const goals = draft.goals.map((g) => ({ ...g, reward: g.reward.trim() }));
		const empties = goals.filter((g) => !g.reward).length;
		if (empties > 0) {
			toast.error(
				`${empties} goal${empties > 1 ? "s" : ""} ${empties > 1 ? "have" : "has"} no reward name — fill it in or remove the row.`,
			);
			return;
		}
		if (goals.length === 0) {
			toast.error("Add at least one goal with a reward name.");
			return;
		}
		replace.mutate(
			{
				goals: goals.map((g) => ({
					id: g.id,
					reward: g.reward,
					note: g.note,
					unlocked: g.unlocked,
					...(g.target != null ? { target: g.target } : {}),
					...(g.hidden ? { hidden: g.hidden } : {}),
				})),
				currentSubs: draft.currentSubs,
			},
			{
				onSuccess: (res) => {
					if (!res.ok) {
						toast.error(res.errors[0]?.message ?? "Couldn't save");
						return;
					}
					seed(res.state);
					toast.success("Goals saved");
					invalidate();
				},
			},
		);
	}

	const summary = draft
		? `${draft.goals.filter((g) => g.reward.trim()).length} goals · ${draft.currentSubs} subs`
		: undefined;

	return (
		<div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
			<div className="flex flex-col gap-6">
				{!draft && isError && (
					<div role="status" className="rounded-2xl panel-card p-5">
						<h2 className="font-heading text-lg font-bold">
							Couldn&apos;t load the Wolfathon data
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							The goals failed to load. Check your connection and try again.
						</p>
						<Button variant="outline" className="mt-3" onClick={() => refetch()}>
							Retry
						</Button>
					</div>
				)}
				{!draft && !isError && isLoading && (
					<div role="status" className="rounded-2xl panel-card p-5 text-sm text-muted-foreground">
						Loading goals…
					</div>
				)}
				{draft && (
					<>
						<GoalEditor
							goals={draft.goals}
							currentSubs={draft.currentSubs}
							onChange={(goals) => setDraft({ ...draft, goals })}
						/>
						<SubsControl
							value={draft.currentSubs}
							onChange={(currentSubs) => setDraft({ ...draft, currentSubs })}
						/>
					</>
				)}
				<DirtyBar
					dirty={dirty}
					saving={replace.isPending}
					onSave={save}
					onDiscard={discard}
					summary={summary}
				/>
			</div>
			<div className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="font-heading text-lg font-bold">Live preview</h2>
						<p className="text-xs text-muted-foreground">Exactly what your OBS source shows.</p>
					</div>
					<Link
						href="/dashboard/settings/overlays"
						className="rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						Get URL →
					</Link>
				</div>
				<OverlayPreview data={preview} />
				{dirty && <p className="text-xs text-amber-400">Preview shows unsaved changes.</p>}
			</div>
		</div>
	);
}
