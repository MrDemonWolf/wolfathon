"use client";

import { useMutation } from "@tanstack/react-query";
import { currentRemainingMs, pad2, splitDuration, type TimerDoc } from "@wolfathon/api/timer";
import { Button } from "@wolfathon/ui/components/button";
import { Input } from "@wolfathon/ui/components/input";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { controlTrpc } from "@/utils/trpc";

/** HH:MM:SS, with hours rolled up from any whole days (so 25h shows "25:00:00"). */
function fmt(ms: number): string {
	const { d, h, m, s } = splitDuration(ms);
	return `${pad2(d * 24 + h)}:${pad2(m)}:${pad2(s)}`;
}

export function TimerPanel({
	doc,
	onChanged,
}: {
	doc: TimerDoc | undefined;
	onChanged: () => void;
}) {
	const [custom, setCustom] = useState("5");
	const [confirmingReset, setConfirmingReset] = useState(false);
	// Surface failures: these live mutations previously failed silently (only the
	// queryCache toasts, not mutations), so a failed +30m or reset showed nothing.
	const opts = { onSuccess: onChanged, onError: (e: { message: string }) => toast.error(e.message) };
	const start = useMutation(controlTrpc.timer.start.mutationOptions(opts));
	const pause = useMutation(controlTrpc.timer.pause.mutationOptions(opts));
	const reset = useMutation(controlTrpc.timer.reset.mutationOptions(opts));
	const addMinutes = useMutation(controlTrpc.timer.addMinutes.mutationOptions(opts));
	const applyEvent = useMutation(controlTrpc.timer.applyEvent.mutationOptions(opts));

	// Manual time changes confirm with a toast so a +1m is distinguishable from
	// the per-second tick. Errors are toasted by the shared opts.onError above.
	const addTime = (minutes: number) =>
		addMinutes.mutate(
			{ minutes },
			{ onSuccess: () => toast.success(`${minutes >= 0 ? "+" : ""}${minutes}m`) },
		);
	const busy =
		start.isPending ||
		pause.isPending ||
		reset.isPending ||
		addMinutes.isPending ||
		applyEvent.isPending;

	// Tick once a second so the countdown is live. The state is timestamp-based,
	// so `currentRemainingMs` recomputes from `now` without refetching.
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, []);

	const running = doc?.state.running ?? false;
	const autoPaused = !running && (doc?.state.autoPaused ?? false);
	const remaining = doc ? currentRemainingMs(doc.state, now) : 0;
	const status = running
		? "LIVE"
		: remaining > 0
			? autoPaused
				? "PAUSED · OFFLINE"
				: "PAUSED"
			: "ENDED";

	const SIMS = [
		{ label: "Sub T1", event: { kind: "sub", tier: "t1" } },
		{ label: "Sub T2", event: { kind: "sub", tier: "t2" } },
		{ label: "Sub T3", event: { kind: "sub", tier: "t3" } },
		{ label: "Gift ×1", event: { kind: "gift", tier: "t1", count: 1 } },
		{ label: "100 bits", event: { kind: "bits", bits: 100 } },
	] as const;

	return (
		<div className="rounded-2xl panel-card p-5">
			<h2 className="font-heading text-lg font-bold">Timer</h2>

			{/* Live hub — everything used mid-stream: countdown, transport, add-time. */}
			<div className="mt-4 rounded-xl border border-primary/30 bg-primary/[0.06] p-4">
				{/* status + live countdown */}
				<div
						role="status"
						aria-live="polite"
						aria-atomic="true"
						className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-5 py-4"
					>
					<div>
						<div className="eyebrow text-[0.65rem]">Remaining</div>
						<div className="mt-0.5 font-heading text-4xl font-extrabold tabular-nums tracking-tight">
							{fmt(remaining)}
						</div>
					</div>
					<span
						className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
							running
								? "bg-primary/15 text-primary"
								: autoPaused
									? "bg-amber-400/15 text-amber-400"
									: "bg-secondary text-muted-foreground"
						}`}
					>
						<span
							aria-hidden="true"
							className={`size-1.5 rounded-full ${
								running
									? "animate-pulse bg-primary"
									: autoPaused
										? "bg-amber-400"
										: "bg-muted-foreground"
							}`}
						/>
						{status}
					</span>
				</div>

				{/* transport */}
				<div className="mt-3 flex flex-wrap gap-2">
					{running ? (
						<Button size="lg" className="px-4" onClick={() => pause.mutate()} disabled={busy}>
							<Pause className="size-4" />
							Pause
						</Button>
					) : (
						<Button size="lg" className="px-4" onClick={() => start.mutate()} disabled={busy}>
							<Play className="size-4" />
							Start
						</Button>
					)}
					{confirmingReset ? (
						<div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
							<span className="text-sm">Reset the timer? This clears the remaining time.</span>
							<Button
								size="lg"
								variant="destructive"
								className="px-4"
								onClick={() =>
									reset.mutate(undefined, {
										onSuccess: () => toast.success("Timer reset"),
										// Clear the confirm on both paths so a failed reset can't leave
										// "Yes, reset" stuck on screen.
										onSettled: () => setConfirmingReset(false),
									})
								}
								disabled={busy}
							>
								<RotateCcw className="size-4" />
								Yes, reset
							</Button>
							<Button
								size="lg"
								variant="ghost"
								onClick={() => setConfirmingReset(false)}
								disabled={busy}
							>
								Cancel
							</Button>
						</div>
					) : (
						<Button
							size="lg"
							variant="destructive"
							className="px-4"
							onClick={() => setConfirmingReset(true)}
							disabled={busy}
						>
							<RotateCcw className="size-4" />
							Reset
						</Button>
					)}
				</div>

				{/* add time */}
				<div className="mt-4">
					<div className="eyebrow text-[0.65rem]">Add time</div>
					<div className="mt-2 flex flex-wrap items-center gap-2">
						{[1, 5, 10, 30].map((min) => (
							<Button
								key={min}
								size="lg"
								variant="outline"
								onClick={() => addTime(min)}
								disabled={busy}
							>
								+{min}m
							</Button>
						))}
						<Button
							size="lg"
							variant="outline"
							onClick={() => addTime(-5)}
							disabled={busy}
						>
							−5m
						</Button>
						<span className="mx-1 h-6 w-px self-center bg-border" />
						<Input
							className="h-9 w-20"
							type="number"
							aria-label="Custom minutes to add"
							value={custom}
							onChange={(e) => setCustom(e.target.value)}
						/>
						<Button
							size="lg"
							variant="outline"
							onClick={() => addTime(Number(custom) || 0)}
							disabled={busy || !custom}
						>
							Add
						</Button>
					</div>
				</div>
			</div>

			{/* Dev-only testing — tucked away so it doesn't compete with live controls. */}
			<details className="group mt-4 rounded-xl border border-border bg-background/40 px-4 py-3">
				<summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-muted-foreground marker:content-none">
					Testing tools
					<span
						aria-hidden="true"
						className="text-xs text-muted-foreground transition-transform group-open:rotate-180"
					>
						▾
					</span>
				</summary>
				<div className="mt-3">
					<div className="text-xs text-muted-foreground">
						Preview the overlay alert — doesn't change the timer or sub count
					</div>
					<div className="mt-2 flex flex-wrap gap-2">
						{SIMS.map((s) => (
							<Button
								key={s.label}
								size="lg"
								variant="secondary"
								onClick={() => applyEvent.mutate(s.event)}
								disabled={busy}
							>
								{s.label}
							</Button>
						))}
					</div>
				</div>
			</details>
		</div>
	);
}
