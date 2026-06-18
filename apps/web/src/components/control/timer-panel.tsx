"use client";

import { useMutation } from "@tanstack/react-query";
import { currentRemainingMs, type TimerDoc } from "@wolfathon/api/timer";
import { Button } from "@wolfathon/ui/components/button";
import { Input } from "@wolfathon/ui/components/input";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useState } from "react";
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

	const running = doc?.state.running ?? false;
	const remaining = doc ? currentRemainingMs(doc.state, Date.now()) : 0;

	return (
		<div className="rounded-2xl panel-card p-5">
			<h2 className="font-heading text-lg font-bold">Timer</h2>

			{/* status */}
			<div className="mt-3 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 p-4">
				<div>
					<div className="text-xs tracking-wide text-muted-foreground uppercase">Remaining</div>
					<div className="font-heading text-3xl font-extrabold tabular-nums">{fmt(remaining)}</div>
				</div>
				<span
					className={`rounded-full px-2.5 py-1 text-xs font-semibold ${running ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}
				>
					{running ? "LIVE" : remaining > 0 ? "PAUSED" : "ENDED"}
				</span>
			</div>

			{/* transport */}
			<div className="mt-3 flex flex-wrap gap-2">
				{running ? (
					<Button className="h-10 rounded-lg px-4" onClick={() => pause.mutate()} disabled={busy}>
						<Pause className="size-4" />
						Pause
					</Button>
				) : (
					<Button className="h-10 rounded-lg px-4" onClick={() => start.mutate()} disabled={busy}>
						<Play className="size-4" />
						Start
					</Button>
				)}
				<Button
					variant="destructive"
					className="h-10 rounded-lg px-4"
					onClick={() => reset.mutate(undefined, { onSuccess: () => toast.success("Timer reset") })}
					disabled={busy}
				>
					<RotateCcw className="size-4" />
					Reset
				</Button>
			</div>

			{/* add time */}
			<div className="mt-4">
				<div className="text-xs font-medium text-muted-foreground">Add time</div>
				<div className="mt-2 flex flex-wrap items-center gap-2">
					{[1, 5, 10, 30].map((min) => (
						<Button
							key={min}
							variant="outline"
							className="rounded-lg"
							onClick={() => addMinutes.mutate({ minutes: min })}
							disabled={busy}
						>
							+{min}m
						</Button>
					))}
					<Button
						variant="outline"
						className="rounded-lg"
						onClick={() => addMinutes.mutate({ minutes: -5 })}
						disabled={busy}
					>
						−5m
					</Button>
					<span className="mx-1 w-px self-stretch bg-border" />
					<Input
						className="h-9 w-20 rounded-lg"
						type="number"
						value={custom}
						onChange={(e) => setCustom(e.target.value)}
					/>
					<Button
						variant="outline"
						className="rounded-lg"
						onClick={() => addMinutes.mutate({ minutes: Number(custom) || 0 })}
						disabled={busy || !custom}
					>
						Add
					</Button>
				</div>
			</div>

			{/* manual test events */}
			<div className="mt-4">
				<div className="text-xs font-medium text-muted-foreground">
					Simulate events (uses the configured minutes)
				</div>
				<div className="mt-2 flex flex-wrap gap-2">
					<Button
						variant="secondary"
						className="rounded-lg"
						onClick={() => applyEvent.mutate({ kind: "sub", tier: "t1" })}
						disabled={busy}
					>
						Sub T1
					</Button>
					<Button
						variant="secondary"
						className="rounded-lg"
						onClick={() => applyEvent.mutate({ kind: "sub", tier: "t2" })}
						disabled={busy}
					>
						Sub T2
					</Button>
					<Button
						variant="secondary"
						className="rounded-lg"
						onClick={() => applyEvent.mutate({ kind: "sub", tier: "t3" })}
						disabled={busy}
					>
						Sub T3
					</Button>
					<Button
						variant="secondary"
						className="rounded-lg"
						onClick={() => applyEvent.mutate({ kind: "gift", tier: "t1", count: 1 })}
						disabled={busy}
					>
						Gift ×1
					</Button>
					<Button
						variant="secondary"
						className="rounded-lg"
						onClick={() => applyEvent.mutate({ kind: "bits", bits: 100 })}
						disabled={busy}
					>
						100 bits
					</Button>
				</div>
			</div>
		</div>
	);
}
