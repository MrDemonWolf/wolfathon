"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { type Data, recompute } from "@wolfathon/api/state";
import { Button } from "@wolfathon/ui/components/button";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

import { buildClaudePrompt } from "./claude-prompt";
import { DirtyBar } from "./dirty-bar";
import { EXAMPLE_JSON, REWARDS_SCHEMA_BULLETS } from "./example";
import { GoalEditor } from "./goal-editor";
import { type IEConfig, type IEError, ImportExportPanel } from "./import-export-panel";
import { OverlayPreview } from "./overlay-preview";
import { SubsControl } from "./subs-control";
import { ThemeEditor } from "./theme-editor";
import { nowStamp } from "./util";

const label = (index: number) => (index < 0 ? "Document" : `Goal #${index + 1}`);

/** The bits we diff for dirty-state (currentIndex is server-derived). */
function persisted(d: Data) {
	return JSON.stringify({ goals: d.goals, currentSubs: d.currentSubs, theme: d.theme });
}

export function RewardsTab() {
	const rawOptions = controlTrpc.state.getRaw.queryOptions();
	const { data, isLoading, isError, refetch } = useQuery(rawOptions);
	const invalidate = () => queryClient.invalidateQueries({ queryKey: rawOptions.queryKey });

	const [draft, setDraft] = useState<Data | null>(null);
	const savedRef = useRef<string>("");
	const seenDataRef = useRef<Data | null>(null);
	const replace = useMutation(controlTrpc.state.replace.mutationOptions());

	// Seed the draft on first load, and re-seed when the server *reference* changes
	// while we have no unsaved edits (an import, or Twitch bumping the sub count).
	// Gating on the reference makes a re-seed loop impossible.
	useEffect(() => {
		if (!data || data === seenDataRef.current) return;
		seenDataRef.current = data;
		if (draft === null || persisted(draft) === savedRef.current) {
			setDraft(structuredClone(data));
			savedRef.current = persisted(data);
		}
	}, [data, draft]);

	const dirty = draft != null && persisted(draft) !== savedRef.current;
	const preview = draft ? recompute(draft) : data;

	// Warn before a tab close/reload throws away unsaved edits (each control tab
	// holds its draft in memory and only persists on Save).
	useEffect(() => {
		if (!dirty) return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	}, [dirty]);

	function discard() {
		if (!data) return;
		setDraft(structuredClone(data));
		savedRef.current = persisted(data);
	}

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
				})),
				currentSubs: draft.currentSubs,
				theme: draft.theme,
			},
			{
				onSuccess: (res) => {
					if (!res.ok) {
						toast.error(res.errors[0]?.message ?? "Couldn't save");
						return;
					}
					setDraft(structuredClone(res.state));
					savedRef.current = persisted(res.state);
					toast.success(
						res.bumped > 0
							? `Saved · ${res.bumped} goal${res.bumped > 1 ? "s" : ""} raised above the count`
							: "Goals saved",
					);
					invalidate();
				},
			},
		);
	}

	const validate = useMutation(controlTrpc.state.validate.mutationOptions());
	const importMut = useMutation(controlTrpc.state.import.mutationOptions());

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
		title: "rewards",
		noteLine: "reward shows on stream; note + target are internal.",
		exampleJson: EXAMPLE_JSON,
		schemaBullets: REWARDS_SCHEMA_BULLETS,
		exportFilename: () => `wolfathon-goals-${nowStamp()}.json`,
		currentJson: () => (data ? JSON.stringify(data, null, 2) : null),
		claudePrompt: () =>
			data
				? buildClaudePrompt({
						kind: "rewards list",
						schemaBullets: REWARDS_SCHEMA_BULLETS,
						exampleJson: EXAMPLE_JSON,
						currentJson: JSON.stringify(data, null, 2),
					})
				: null,
		confirmText: "This wipes current goals and resets progress. Continue?",
		validate: (v) =>
			guard(
				async () => {
					const r = await validate.mutateAsync(v);
					return r.ok
						? ({ ok: true, summary: r.rewards } as const)
						: ({
								ok: false,
								errors: r.errors.map((e) => ({ label: label(e.index), message: e.message })),
							} as const);
				},
				(errors) => ({ ok: false, errors }),
			),
		doImport: (v) =>
			guard(
				async () => {
					const r = await importMut.mutateAsync(v);
					return r.ok
						? ({ ok: true } as const)
						: ({
								ok: false,
								errors: r.errors.map((e) => ({ label: label(e.index), message: e.message })),
							} as const);
				},
				(errors) => ({ ok: false, errors }),
			),
	};

	const summary = draft
		? `${draft.goals.filter((g) => g.reward.trim()).length} goals · ${draft.currentSubs} subs`
		: undefined;

	return (
		<div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
			<div className="flex flex-col gap-6">
				{!draft && isError && (
					<div className="rounded-2xl panel-card p-5">
						<h2 className="font-heading text-lg font-bold">Couldn&apos;t load the subathon data</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							The goals failed to load. Check your connection and try again.
						</p>
						<Button variant="outline" className="mt-3" onClick={() => refetch()}>
							Retry
						</Button>
					</div>
				)}
				{!draft && !isError && isLoading && (
					<div className="rounded-2xl panel-card p-5 text-sm text-muted-foreground">
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
						<div className="rounded-2xl panel-card p-5">
							<h2 className="font-heading text-lg font-bold">Overlay theme</h2>
							<ThemeEditor
								theme={draft.theme}
								onChange={(theme) => setDraft({ ...draft, theme })}
								labelToggleText='Show "NEXT REWARD" label'
								statusToggleText="Show live status dot"
							/>
						</div>
					</>
				)}
				<ImportExportPanel
					config={ie}
					busy={validate.isPending || importMut.isPending || replace.isPending}
					onImported={invalidate}
				/>
				<DirtyBar
					dirty={dirty}
					saving={replace.isPending || importMut.isPending}
					onSave={save}
					onDiscard={discard}
					summary={summary}
				/>
			</div>
			<div className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
				<div className="flex items-center justify-between">
					<h2 className="font-heading text-lg font-bold">Live preview</h2>
					<a
						href="/overlay/rewards"
						target="_blank"
						rel="noreferrer"
						className="text-xs text-muted-foreground transition-colors hover:text-foreground"
					>
						Open ↗
					</a>
				</div>
				<OverlayPreview data={preview} />
				{dirty && <p className="text-xs text-amber-400">Preview shows unsaved changes.</p>}
			</div>
		</div>
	);
}
