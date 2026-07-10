"use client";

import { bumpPassedGoals, type Goal, MAX_TARGET } from "@wolfathon/api/state";
import { Button } from "@wolfathon/ui/components/button";
import { Input } from "@wolfathon/ui/components/input";
import { NumberStepper } from "@wolfathon/ui/components/number-stepper";
import {
	ArrowDown,
	ArrowUp,
	Check,
	Eye,
	EyeOff,
	Lock,
	LockOpen,
	Plus,
	TrendingUp,
	Trophy,
	X,
} from "lucide-react";

/**
 * Controlled goal list — every edit is local (the Rewards tab holds the draft
 * and persists on Save). `currentSubs` is used for the live next-goal progress
 * counter and to flag future targets that sit at/below the count.
 *
 * The live `subs / target` counter lives ONLY in the banner for the next goal:
 * that's the one target the overlay actually uses (`nextTarget`), and the one
 * the operator nudges just before unlocking. Future rows keep an optional
 * pre-plan target; unlocked + next rows show none (banner owns it).
 *
 * Targets are never auto-raised on save — they persist exactly as typed. When a
 * target has fallen at/below the live sub count, the operator raises it on demand
 * with the "Raise past goals" button, which floors every trailing target above
 * the count in one click (a preview of the edit; it isn't saved until Save).
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
	const nextIndex = goals.findIndex((g) => !g.unlocked);
	const next = nextIndex === -1 ? undefined : goals[nextIndex];
	const allUnlocked = goals.length > 0 && !next;

	// Preview the "Raise past goals" edit without applying it: `raised` is the
	// list with every trailing target floored above the count, and `raisedCount`
	// drives the button (shown only when at least one target would move).
	// ponytail: recompute per render — the list is tiny, no memo needed.
	const { goals: raised, bumped: raisedCount } = bumpPassedGoals(goals, currentSubs);

	const patch = (i: number, p: Partial<Goal>) =>
		onChange(goals.map((g, j) => (j === i ? { ...g, ...p } : g)));

	// Explicit, operator-driven raise — floor every trailing target above the
	// live count in one edit. Becomes an unsaved change, saved with everything else.
	function raisePastGoals() {
		if (raisedCount === 0) return;
		onChange(raised);
	}

	function move(i: number, dir: -1 | 1) {
		const t = i + dir;
		if (t < 0 || t >= goals.length) return;
		const reordered = [...goals];
		[reordered[i], reordered[t]] = [reordered[t]!, reordered[i]!];
		onChange(reordered);
	}

	function add() {
		if (goals.length >= 50) return;
		onChange([...goals, { id: crypto.randomUUID(), reward: "", unlocked: false }]);
	}

	function unlockNext() {
		if (nextIndex === -1) return;
		patch(nextIndex, { unlocked: true });
	}

	const clampTarget = (v: number) => Math.min(MAX_TARGET, Math.max(0, Math.floor(v)));

	// Next-goal progress (banner only). A 0/undefined target = no milestone yet.
	const target = next?.target;
	const pct = target ? Math.min(100, Math.round((currentSubs / target) * 100)) : 0;
	const reached = !!target && currentSubs >= target;
	const remaining = target ? Math.max(0, target - currentSubs) : 0;

	return (
		<div className="rounded-2xl panel-card p-5">
			<div className="flex items-center justify-between gap-3">
				<h2 className="font-heading text-lg font-bold">Goals</h2>
				<div className="flex items-center gap-2">
					{raisedCount > 0 && (
						<Button
							variant="outline"
							size="sm"
							className="rounded-lg border-amber-400/40 text-amber-400 hover:bg-amber-400/10 hover:text-amber-300"
							onClick={raisePastGoals}
							title={`${raisedCount} ${raisedCount === 1 ? "target sits" : "targets sit"} at or below your current ${currentSubs} subs. Raise ${raisedCount === 1 ? "it" : "them"} just above the count so the ${raisedCount === 1 ? "goal stays" : "goals stay"} ahead. Nothing saves until you hit Save.`}
						>
							<TrendingUp className="size-3.5" />
							Raise {raisedCount} past {raisedCount === 1 ? "goal" : "goals"}
						</Button>
					)}
					<Button
						variant="outline"
						size="sm"
						className="rounded-lg"
						onClick={add}
						disabled={goals.length >= 50}
						title={goals.length >= 50 ? "Maximum 50 goals reached" : undefined}
					>
						<Plus className="size-3.5" />
						Add goal
					</Button>
				</div>
			</div>
			<p className="mt-1 text-sm text-muted-foreground">
				Unlock top to bottom. Only the <span className="text-foreground">reward</span> name shows on
				stream — the note stays private, and the <span className="text-foreground">eye</span> toggle
				hides a reward from the overlay so it stays a surprise (only you see it). Set the sub target
				on the highlighted next goal below.
			</p>

			{/* Next reward — the live hub: name, progress, target stepper, unlock. */}
			<div className="mt-4 rounded-xl border border-primary/30 bg-primary/[0.06] p-4">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<div className="eyebrow text-[0.65rem]">Next reward</div>
						<div className="mt-0.5 truncate font-heading text-2xl font-extrabold leading-tight">
							{allUnlocked ? "All goals unlocked 🐺" : next?.reward?.trim() || "Untitled goal"}
						</div>
					</div>
					<Button
						size="lg"
						className="h-11 shrink-0 rounded-lg px-5 text-sm"
						disabled={!next}
						onClick={unlockNext}
					>
						<Trophy className="size-4" />
						Unlock next
					</Button>
				</div>

				{next && (
					<div className="mt-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							{/* Live counter */}
							<div className="flex items-baseline gap-1.5 font-heading tabular-nums">
								<span className="text-2xl font-extrabold text-primary">{currentSubs}</span>
								<span className="text-muted-foreground">/</span>
								<span className="text-2xl font-bold">{target || "—"}</span>
								<span className="ml-1 self-center text-sm font-sans font-medium text-muted-foreground">
									subs
								</span>
							</div>
							{/* Target stepper — nudge it before unlocking. An empty field steps
							    from the live sub count. */}
							<div className="flex items-center gap-1.5">
								<span className="mr-1 text-xs text-muted-foreground">Target</span>
								<NumberStepper
									size="sm"
									value={target}
									onChange={(v) => patch(nextIndex, { target: v })}
									min={0}
									max={MAX_TARGET}
									emptyValue={currentSubs}
									label="Next goal sub target"
									placeholder="—"
								/>
							</div>
						</div>

						{/* Progress bar */}
						<div
							className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
							role="progressbar"
							aria-valuemin={0}
							aria-valuemax={target || undefined}
							aria-valuenow={target ? Math.min(currentSubs, target) : undefined}
						>
							<div
								className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
								style={{ width: `${pct}%` }}
							/>
						</div>

						<p className="mt-2 text-xs text-muted-foreground">
							{!target
								? "No target yet — add one to show a progress bar on stream."
								: reached
									? "Target reached — unlock when you're ready. 🎉"
									: `${remaining} more ${remaining === 1 ? "sub" : "subs"} to go.`}
						</p>
					</div>
				)}
			</div>

			{/* Goal rows */}
			<ul className="mt-4 flex flex-col gap-2">
				{goals.map((g, i) => {
					const isNext = i === nextIndex;
					// Optional pre-plan target lives on future (locked, not-next) rows only.
					const showRowTarget = !g.unlocked && !isNext;
					const passed = g.target != null && g.target <= currentSubs && !g.unlocked;
					return (
						<li
							key={g.id}
							className={`rounded-xl border px-3 py-2 transition-colors ${
								isNext
									? "border-primary/50 bg-primary/5"
									: g.unlocked
										? "border-border bg-background/30"
										: "border-border bg-background/40"
							}`}
						>
							<div className="flex items-center gap-2">
								<button
									type="button"
									title={g.unlocked ? "Unlocked — click to re-lock" : "Locked — click to unlock"}
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
									className={`h-9 flex-1 rounded-lg ${g.unlocked ? "text-muted-foreground" : ""} ${
										g.reward.trim() ? "" : "ring-1 ring-destructive/60"
									}`}
									aria-invalid={!g.reward.trim()}
									aria-label={`Goal ${i + 1} reward`}
									placeholder="Reward (shown on stream)"
									value={g.reward}
									maxLength={80}
									onChange={(e) => patch(i, { reward: e.target.value })}
								/>
								{isNext && (
									<span className="shrink-0 rounded-md bg-primary/15 px-2 py-1 text-xs font-semibold text-primary">
										Next
									</span>
								)}
								{g.unlocked && (
									<span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">
										<Check className="size-3.5" />
										Unlocked
									</span>
								)}
								{g.hidden && (
									<span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-400/10 px-2 py-1 text-xs text-amber-400">
										<EyeOff className="size-3.5" />
										Hidden
									</span>
								)}
								<div className="flex shrink-0 items-center gap-1">
									<Button
										variant="ghost"
										size="icon-sm"
										className={`rounded-lg ${g.hidden ? "text-amber-400" : ""}`}
										aria-label={g.hidden ? "Show on overlay" : "Hide from overlay"}
										title={
											g.hidden
												? "Hidden from the overlay — only you see it. Click to show."
												: "Visible on the overlay. Click to hide it (only you see it)."
										}
										onClick={() => patch(i, { hidden: !g.hidden })}
									>
										{g.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
									</Button>
									<Button
										variant="ghost"
										size="icon-sm"
										className="rounded-lg"
										aria-label="Move up"
										disabled={i === 0}
										onClick={() => move(i, -1)}
									>
										<ArrowUp className="size-4" />
									</Button>
									<Button
										variant="ghost"
										size="icon-sm"
										className="rounded-lg"
										aria-label="Move down"
										disabled={i === goals.length - 1}
										onClick={() => move(i, 1)}
									>
										<ArrowDown className="size-4" />
									</Button>
									<Button
										variant="destructive"
										size="icon-sm"
										className="rounded-lg"
										aria-label="Remove goal"
										onClick={() => onChange(goals.filter((_, j) => j !== i))}
									>
										<X className="size-4" />
									</Button>
								</div>
							</div>

							{/* Quiet second line: private note + optional future target. */}
							<div className="mt-1.5 flex flex-wrap items-center gap-2 pl-10">
								<Input
									className="h-8 min-w-0 flex-1 rounded-lg text-sm"
									aria-label={`Goal ${i + 1} private note`}
									placeholder="Private note (optional)"
									value={g.note ?? ""}
									onChange={(e) => patch(i, { note: e.target.value })}
								/>
								{showRowTarget && (
									<div className="flex items-center gap-1.5">
										<Input
											className="h-8 w-20 rounded-lg text-sm tabular-nums"
											type="number"
											min={0}
											max={MAX_TARGET}
											aria-label={`Goal ${i + 1} sub target`}
											placeholder="—"
											value={g.target ?? ""}
											onChange={(e) => {
												const v = e.target.value;
												patch(i, {
													target: v === "" ? undefined : clampTarget(Number(v) || 0),
												});
											}}
										/>
										<span className="text-xs text-muted-foreground">target</span>
									</div>
								)}
								{passed && showRowTarget && (
									<span
										className="text-xs font-medium whitespace-nowrap text-amber-400"
										title={`At or below your current count (${currentSubs}). It saves exactly as typed — use "Raise past goals" up top to bump it above the count.`}
									>
										below your count
									</span>
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
