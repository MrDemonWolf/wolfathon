"use client";

import { useMutation } from "@tanstack/react-query";
import type { Data } from "@wolfathon/api/state";
import { Button } from "@wolfathon/ui/components/button";
import { Input } from "@wolfathon/ui/components/input";
import { ArrowDown, ArrowUp, Lock, LockOpen, Plus, Trophy, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { controlTrpc } from "@/utils/trpc";

export function GoalEditor({ data, onChanged }: { data: Data | undefined; onChanged: () => void }) {
	const [reward, setReward] = useState("");
	const [note, setNote] = useState("");

	const mutationOpts = { onSuccess: onChanged };
	const unlockNext = useMutation(controlTrpc.goals.unlockNext.mutationOptions(mutationOpts));
	const add = useMutation(
		controlTrpc.goals.add.mutationOptions({
			onSuccess: () => {
				setReward("");
				setNote("");
				onChanged();
			},
		}),
	);
	const remove = useMutation(controlTrpc.goals.remove.mutationOptions(mutationOpts));
	const reorder = useMutation(controlTrpc.goals.reorder.mutationOptions(mutationOpts));

	const goals = data?.goals ?? [];
	const nextReward = data ? goals[data.currentIndex] : undefined;
	const allUnlocked = goals.length > 0 && !nextReward;

	function move(index: number, direction: -1 | 1) {
		const target = index + direction;
		if (target < 0 || target >= goals.length) return;
		const ids = goals.map((g) => g.id);
		[ids[index], ids[target]] = [ids[target]!, ids[index]!];
		reorder.mutate({ ids });
	}

	function submitAdd(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = reward.trim();
		if (!trimmed) return;
		add.mutate({ reward: trimmed, note: note.trim() || undefined });
	}

	return (
		<div className="rounded-2xl panel-card p-5">
			<h2 className="font-heading text-lg font-bold">Goals</h2>
			<p className="mt-1 text-sm text-muted-foreground">
				Goals unlock top to bottom. Only the <span className="text-foreground">reward</span> name is
				ever shown on stream — the note is internal.
			</p>

			{/* Unlock next */}
			<div className="mt-4 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0">
					<div className="text-xs tracking-wide text-muted-foreground uppercase">Next reward</div>
					<div className="truncate font-heading text-xl font-bold">
						{allUnlocked ? "All goals unlocked 🐺" : (nextReward?.reward ?? "—")}
					</div>
				</div>
				<Button
					size="lg"
					className="h-11 rounded-lg px-5 text-sm"
					disabled={!nextReward || unlockNext.isPending}
					onClick={() =>
						unlockNext.mutate(undefined, {
							onSuccess: () => toast.success(`Unlocked: ${nextReward?.reward ?? ""}`),
						})
					}
				>
					<Trophy className="size-4" />
					Unlock next goal
				</Button>
			</div>

			{/* List */}
			<ul className="mt-4 flex flex-col gap-2">
				{goals.map((g, i) => {
					const isNext = i === data?.currentIndex;
					return (
						<li
							key={g.id}
							className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
								isNext ? "border-primary/50 bg-primary/5" : "border-border bg-background/40"
							}`}
						>
							{g.unlocked ? (
								<LockOpen className="size-4 shrink-0 text-primary" />
							) : (
								<Lock className="size-4 shrink-0 text-muted-foreground" />
							)}
							<div className="min-w-0 flex-1">
								<div className="truncate font-medium">{g.reward}</div>
								{g.note && <div className="truncate text-xs text-muted-foreground">{g.note}</div>}
							</div>
							<div className="flex shrink-0 items-center gap-1">
								<Button
									variant="ghost"
									size="icon-sm"
									className="rounded-lg"
									aria-label="Move up"
									disabled={i === 0 || reorder.isPending}
									onClick={() => move(i, -1)}
								>
									<ArrowUp className="size-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon-sm"
									className="rounded-lg"
									aria-label="Move down"
									disabled={i === goals.length - 1 || reorder.isPending}
									onClick={() => move(i, 1)}
								>
									<ArrowDown className="size-4" />
								</Button>
								<Button
									variant="destructive"
									size="icon-sm"
									className="rounded-lg"
									aria-label="Remove goal"
									disabled={remove.isPending}
									onClick={() => remove.mutate({ id: g.id })}
								>
									<X className="size-4" />
								</Button>
							</div>
						</li>
					);
				})}
				{goals.length === 0 && (
					<li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
						No goals yet. Add one below or import a list.
					</li>
				)}
			</ul>

			{/* Add */}
			<form onSubmit={submitAdd} className="mt-4 flex flex-col gap-2 sm:flex-row">
				<Input
					className="h-10 flex-1 rounded-lg"
					aria-label="Reward name (shown on stream)"
					placeholder="Reward (shown on stream)"
					value={reward}
					maxLength={80}
					onChange={(e) => setReward(e.target.value)}
				/>
				<Input
					className="h-10 flex-1 rounded-lg"
					aria-label="Internal note"
					placeholder="Note (internal, e.g. 10 subs)"
					value={note}
					onChange={(e) => setNote(e.target.value)}
				/>
				<Button
					type="submit"
					className="h-10 rounded-lg px-4"
					disabled={!reward.trim() || add.isPending}
				>
					<Plus className="size-4" />
					Add
				</Button>
			</form>
		</div>
	);
}
