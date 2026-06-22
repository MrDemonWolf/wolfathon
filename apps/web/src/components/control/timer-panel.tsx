"use client";

import { useMutation } from "@tanstack/react-query";
import { currentRemainingMs, type TimerDoc } from "@wolfathon/api/timer";
import { Button } from "@wolfathon/ui/components/button";
import { Input } from "@wolfathon/ui/components/input";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { controlTrpc } from "@/utils/trpc";

function fmt(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(h)}:${pad(m)}:${pad(s)}`;
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
	const opts = { onSuccess: onChanged };
	const start = useMutation(controlTrpc.timer.start.mutationOptions(opts));
	const pause = useMutation(controlTrpc.timer.pause.mutationOptions(opts));
	const reset = useMutation(controlTrpc.timer.reset.mutationOptions(opts));
	const addMinutes = useMutation(controlTrpc.timer.addMinutes.mutationOptions(opts));
	const applyEvent = useMutation(controlTrpc.timer.applyEvent.mutationOptions(opts));
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
	const remaining = doc ? currentRemainingMs(doc.state, now) : 0;
	const status = running ? "LIVE" : remaining > 0 ? "PAUSED" : "ENDED";

	const SIMS = [
		{ label: "Sub T1", event: { kind: "sub", tier: "t1" } },
		{ label: "Sub T2", event: { kind: "sub", tier: "t2" } },
		{ label: "Sub T3", event: { kind: "sub", tier: "t3" } },
		{ label: "Gift ×1", event: { kind: "gift", tier: "t1", count: 1 } },
		{ label: "100 bits", event: { kind: "bits", bits: 100 } },
	] as const;

	return (
		<div className="rounded-xl panel-card p-5">
			<h2 className="font-heading text-lg font-bold">Timer</h2>

			{/* status + live countdown */}
			<div className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-5 py-4">
				<div>
					<div className="text-xs tracking-wide text-muted-foreground uppercase">Remaining</div>
					<div className="font-heading text-4xl font-extrabold tabular-nums tracking-tight">
						{fmt(remaining)}
					</div>
				</div>
				<span
					className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
						running ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
					}`}
				>
					<span
						className={`size-1.5 rounded-full ${running ? "animate-pulse bg-primary" : "bg-muted-foreground"}`}
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
									onSuccess: () => {
										toast.success("Timer reset");
										setConfirmingReset(false);
									},
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
			<div className="mt-5">
				<div className="text-xs font-medium text-muted-foreground">Add time</div>
				<div className="mt-2 flex flex-wrap items-center gap-2">
					{[1, 5, 10, 30].map((min) => (
						<Button
							key={min}
							size="lg"
							variant="outline"
							onClick={() => addMinutes.mutate({ minutes: min })}
							disabled={busy}
						>
							+{min}m
						</Button>
					))}
					<Button
						size="lg"
						variant="outline"
						onClick={() => addMinutes.mutate({ minutes: -5 })}
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
						onClick={() => addMinutes.mutate({ minutes: Number(custom) || 0 })}
						disabled={busy || !custom}
					>
						Add
					</Button>
				</div>
			</div>

			{/* manual test events */}
			<div className="mt-5">
				<div className="text-xs font-medium text-muted-foreground">
					Simulate events (uses the configured minutes)
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
		</div>
	);
}
