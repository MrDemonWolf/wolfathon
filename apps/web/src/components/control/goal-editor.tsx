"use client";

import type { Goal } from "@wolfathon/api/state";
import { Button } from "@wolfathon/ui/components/button";
import { Input } from "@wolfathon/ui/components/input";
import { ArrowDown, ArrowUp, Check, Lock, LockOpen, Plus, Trophy, X } from "lucide-react";

/**
 * Controlled goal list — every edit is local (the Rewards tab holds the draft
 * and persists on Save). `currentSubs` is used only to flag targets that sit
 * at/below the count (they'll auto-bump on save).
 */
export function GoalEditor({
	goals,
	currentSubs,
	onChange,
}: {
	goals: Goal[];
	currentSubs: number;
	onChange: (goals: Goal[]) => void;
}) {
	const currentIndex = goals.findIndex((g) => !g.unlocked);
	const nextIndex = currentIndex === -1 ? -1 : currentIndex;
	const next = nextIndex === -1 ? undefined : goals[nextIndex];
	const allUnlocked = goals.length > 0 && !next;

	const patch = (i: number, p: Partial<Goal>) =>
		onChange(goals.map((g, j) => (j === i ? { ...g, ...p } : g)));

	function move(i: number, dir: -1 | 1) {
		const t = i + dir;
		if (t < 0 || t >= goals.length) return;
		const next = [...goals];
		[next[i], next[t]] = [next[t]!, next[i]!];
		onChange(next);
	}

	function add() {
		if (goals.length >= 50) return;
		onChange([...goals, { id: crypto.randomUUID(), reward: "", unlocked: false }]);
	}

	function unlockNext() {
		if (nextIndex === -1) return;
		patch(nextIndex, { unlocked: true });
	}

	return (
		<div className="rounded-2xl panel-card p-5">
			<div className="flex items-center justify-between gap-3">
				<h2 className="font-heading text-lg font-bold">Goals</h2>
				<Button variant="outline" size="sm" className="rounded-lg" onClick={add} disabled={goals.length >= 50}>
					<Plus className="size-3.5" />
					Add goal
				</Button>
			</div>
			<p className="mt-1 text-sm text-muted-foreground">
				Unlock top to bottom. Only the <span className="text-foreground">reward</span> name shows on
				stream; the note is internal. <span className="text-foreground">Target</span> is the sub
				milestone for the progress bar.
			</p>

			{/* Next reward + unlock */}
			<div className="mt-4 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0">
					<div className="text-xs tracking-wide text-muted-foreground uppercase">Next reward</div>
					<div className="truncate font-heading text-xl font-bold">
						{allUnlocked ? "All goals unlocked 🐺" : next?.reward?.trim() || "—"}
					</div>
				</div>
				<Button
					size="lg"
					className="h-11 rounded-lg px-5 text-sm"
					disabled={!next}
					onClick={unlockNext}
				>
					<Trophy className="size-4" />
					Unlock next
				</Button>
			</div>

			{/* Goal rows */}
			<ul className="mt-4 flex flex-col gap-2">
				{goals.map((g, i) => {
					const isNext = i === nextIndex;
					const passed = g.target != null && g.target <= currentSubs && !g.unlocked;
					return (
						<li
							key={g.id}
							className={`rounded-xl border px-3 py-2.5 ${
								isNext ? "border-primary/50 bg-primary/5" : "border-border bg-background/40"
							}`}
						>
							<div className="flex items-center gap-2">
								<button
									type="button"
									aria-label={g.unlocked ? "Mark locked" : "Mark unlocked"}
									className={`grid size-8 shrink-0 place-items-center rounded-lg transition ${
										g.unlocked
											? "text-primary hover:bg-primary/10"
											: "text-muted-foreground hover:bg-accent"
									}`}
									onClick={() => patch(i, { unlocked: !g.unlocked })}
								>
									{g.unlocked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
								</button>
								<Input
									className="h-9 flex-1 rounded-lg"
									aria-label={`Goal ${i + 1} reward`}
									placeholder="Reward (shown on stream)"
									value={g.reward}
									maxLength={80}
									onChange={(e) => patch(i, { reward: e.target.value })}
								/>
								<div className="flex shrink-0 items-center gap-1">
									<Button variant="ghost" size="icon-sm" className="rounded-lg" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
										<ArrowUp className="size-4" />
									</Button>
									<Button variant="ghost" size="icon-sm" className="rounded-lg" aria-label="Move down" disabled={i === goals.length - 1} onClick={() => move(i, 1)}>
										<ArrowDown className="size-4" />
									</Button>
									<Button variant="destructive" size="icon-sm" className="rounded-lg" aria-label="Remove goal" onClick={() => onChange(goals.filter((_, j) => j !== i))}>
										<X className="size-4" />
									</Button>
								</div>
							</div>
							<div className="mt-2 flex flex-wrap items-center gap-2 pl-10">
								<Input
									className="h-8 min-w-0 flex-1 rounded-lg text-sm"
									aria-label={`Goal ${i + 1} internal note`}
									placeholder="Note (internal)"
									value={g.note ?? ""}
									onChange={(e) => patch(i, { note: e.target.value })}
								/>
								<div className="flex items-center gap-1.5">
									<Input
										className="h-8 w-20 rounded-lg text-sm tabular-nums"
										type="number"
										min={0}
										aria-label={`Goal ${i + 1} sub target`}
										placeholder="—"
										value={g.target ?? ""}
										onChange={(e) => {
											const v = e.target.value;
											patch(i, { target: v === "" ? undefined : Math.max(0, Math.floor(Number(v) || 0)) });
										}}
									/>
									<span className="text-xs text-muted-foreground">subs</span>
								</div>
								{g.unlocked && (
									<span className="inline-flex items-center gap-1 text-xs text-primary">
										<Check className="size-3.5" />
										unlocked
									</span>
								)}
								{passed && (
									<span className="text-xs text-amber-400">≤ {currentSubs} — bumps on save</span>
								)}
							</div>
						</li>
					);
				})}
				{goals.length === 0 && (
					<li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
						No goals yet. Add one above or import a list.
					</li>
				)}
			</ul>
		</div>
	);
}
