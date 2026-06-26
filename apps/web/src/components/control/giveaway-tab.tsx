"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { GiveawayDoc } from "@wolfathon/api/giveaway";
import { Button } from "@wolfathon/ui/components/button";
import { Input } from "@wolfathon/ui/components/input";
import { Label } from "@wolfathon/ui/components/label";
import { Crown, Dice5, Gift, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

/** Gifters who reached the threshold, earliest first ("first to gift N+"). */
function qualifying(doc: GiveawayDoc) {
	return doc.gifters
		.filter((g) => g.qualifiedAt != null)
		.sort((a, b) => (a.qualifiedAt ?? 0) - (b.qualifiedAt ?? 0));
}

export function GiveawayTab() {
	const rawOptions = controlTrpc.giveaway.getRaw.queryOptions(undefined, {
		// Poll so live gifters / entrants appear without a manual refresh.
		refetchInterval: 3000,
	});
	const { data } = useQuery(rawOptions);
	const invalidate = () => queryClient.invalidateQueries({ queryKey: rawOptions.queryKey });

	const setConfig = useMutation(
		controlTrpc.giveaway.setConfig.mutationOptions({ onSuccess: invalidate }),
	);
	const addGift = useMutation(
		controlTrpc.giveaway.addGiftWinner.mutationOptions({ onSuccess: invalidate }),
	);
	const draw = useMutation(
		controlTrpc.giveaway.drawRaffle.mutationOptions({
			onSuccess: (r) => {
				if (r.winner) toast.success(`Raffle winner: ${r.winner.name}`);
				else toast.error("No entrants left to draw");
				invalidate();
			},
		}),
	);
	const addEntrant = useMutation(
		controlTrpc.giveaway.addEntrant.mutationOptions({ onSuccess: invalidate }),
	);
	const setShipped = useMutation(
		controlTrpc.giveaway.setShipped.mutationOptions({ onSuccess: invalidate }),
	);
	const setNote = useMutation(
		controlTrpc.giveaway.setNote.mutationOptions({ onSuccess: invalidate }),
	);
	const removeWinner = useMutation(
		controlTrpc.giveaway.removeWinner.mutationOptions({ onSuccess: invalidate }),
	);
	const resetRound = useMutation(
		controlTrpc.giveaway.resetRound.mutationOptions({ onSuccess: invalidate }),
	);

	// Editable config draft (command + threshold), seeded from server.
	const [command, setCommand] = useState("");
	const [threshold, setThreshold] = useState(5);
	const [manual, setManual] = useState("");
	useEffect(() => {
		if (!data) return;
		setCommand((c) => (c === "" ? data.config.command : c));
		setThreshold((t) => (t === 5 ? data.config.giftThreshold : t));
	}, [data]);

	if (!data) {
		return <p className="text-sm text-muted-foreground">Loading giveaway…</p>;
	}

	const cfg = data.config;
	const gifters = qualifying(data);
	const giftWinners = data.winners.filter((w) => w.source === "gift");
	const raffleWinners = data.winners.filter((w) => w.source === "raffle");
	const wonLogins = new Set(data.winners.map((w) => w.login));
	const remainingEntrants = data.entrants.filter((e) => !wonLogins.has(e.login)).length;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="font-heading text-lg font-bold">Giveaway</h2>
				<p className="text-sm text-muted-foreground">
					First {cfg.giftWinnerSlots} to gift {cfg.giftThreshold}+ subs win automatically (you
					confirm); {cfg.raffleWinnerSlots} more by open chat raffle ({cfg.command}).
				</p>
			</div>

			{/* Settings */}
			<div className="rounded-2xl panel-card p-5">
				<div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="gv-cmd">Raffle command</Label>
						<Input
							id="gv-cmd"
							value={command}
							onChange={(e) => setCommand(e.target.value)}
							placeholder="!enter"
						/>
						<span className="text-xs text-muted-foreground">Must start with “!”.</span>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="gv-thr">Gift threshold</Label>
						<Input
							id="gv-thr"
							type="number"
							min={1}
							className="w-28"
							value={threshold}
							onChange={(e) => setThreshold(Number(e.target.value))}
						/>
					</div>
					<div className="flex items-end">
						<Button
							variant="outline"
							onClick={() => setConfig.mutate({ command, giftThreshold: threshold })}
							disabled={setConfig.isPending}
						>
							Save
						</Button>
					</div>
				</div>

				<div className="mt-4 flex items-center justify-between rounded-xl border border-border p-3">
					<div>
						<div className="font-medium">Entries {cfg.open ? "open" : "closed"}</div>
						<div className="text-xs text-muted-foreground">
							{cfg.open
								? `Accepting ${cfg.command} — ${data.entrants.length} entered`
								: `${cfg.command} is ignored until you open entries`}
						</div>
					</div>
					<Button
						variant={cfg.open ? "destructive" : "default"}
						onClick={() => setConfig.mutate({ open: !cfg.open })}
						disabled={setConfig.isPending}
					>
						{cfg.open ? "Close entries" : "Open entries"}
					</Button>
				</div>
			</div>

			{/* Gift winners */}
			<div className="rounded-2xl panel-card p-5">
				<div className="flex items-center gap-2">
					<Gift className="size-4 text-primary" />
					<h3 className="font-heading font-bold">
						Gift winners ({giftWinners.length}/{cfg.giftWinnerSlots})
					</h3>
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					Viewers who gifted {cfg.giftThreshold}+ subs, in order. Confirm the first{" "}
					{cfg.giftWinnerSlots} as winners.
				</p>
				{gifters.length === 0 ? (
					<p className="mt-3 text-sm text-muted-foreground">No qualifying gifters yet.</p>
				) : (
					<ul className="mt-3 flex flex-col gap-2">
						{gifters.map((g, i) => (
							<li
								key={g.login}
								className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
							>
								<span className="text-sm">
									<span className="text-muted-foreground">#{i + 1}</span> {g.name}{" "}
									<span className="text-xs text-muted-foreground">({g.count} subs)</span>
								</span>
								{wonLogins.has(g.login) ? (
									<span className="text-xs text-primary">✓ winner</span>
								) : (
									<Button
										size="sm"
										variant="secondary"
										onClick={() => addGift.mutate({ login: g.login })}
										disabled={addGift.isPending}
									>
										<Crown className="size-3.5" /> Make winner
									</Button>
								)}
							</li>
						))}
					</ul>
				)}
			</div>

			{/* Raffle */}
			<div className="rounded-2xl panel-card p-5">
				<div className="flex items-center gap-2">
					<Dice5 className="size-4 text-primary" />
					<h3 className="font-heading font-bold">
						Raffle winners ({raffleWinners.length}/{cfg.raffleWinnerSlots})
					</h3>
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					{remainingEntrants} eligible {remainingEntrants === 1 ? "entry" : "entries"} in the pool.
				</p>
				<div className="mt-3 flex flex-wrap items-center gap-2">
					<Button
						onClick={() => draw.mutate()}
						disabled={draw.isPending || remainingEntrants === 0}
					>
						{draw.isPending ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<Dice5 className="size-4" />
						)}
						Draw winner
					</Button>
					{/* Manual add — testing / fallback if chat ingest is unavailable. */}
					<Input
						className="w-40"
						value={manual}
						onChange={(e) => setManual(e.target.value)}
						placeholder="add entrant login"
					/>
					<Button
						variant="outline"
						onClick={() => {
							const login = manual.trim();
							if (!login) return;
							addEntrant.mutate({ login }, { onSuccess: () => setManual("") });
						}}
						disabled={addEntrant.isPending || !manual.trim()}
					>
						Add
					</Button>
				</div>
			</div>

			{/* All winners */}
			<div className="rounded-2xl panel-card p-5">
				<div className="flex items-center justify-between">
					<h3 className="font-heading font-bold">Winners ({data.winners.length})</h3>
					<Button
						variant="destructive"
						size="sm"
						onClick={() => {
							if (confirm("Clear all gifters, entrants, and winners for a new round?"))
								resetRound.mutate();
						}}
						disabled={resetRound.isPending}
					>
						Reset round
					</Button>
				</div>
				{data.winners.length === 0 ? (
					<p className="mt-3 text-sm text-muted-foreground">No winners yet.</p>
				) : (
					<ul className="mt-3 flex flex-col gap-2">
						{data.winners.map((w) => (
							<li
								key={w.id}
								className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2"
							>
								<input
									type="checkbox"
									checked={w.shipped}
									onChange={(e) => setShipped.mutate({ id: w.id, shipped: e.target.checked })}
									aria-label={`Mark ${w.name} shipped`}
									className="size-4 accent-[var(--primary)]"
								/>
								<span className="text-sm font-medium">{w.name}</span>
								<span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
									{w.source === "gift" ? "gift" : "raffle"}
								</span>
								<Input
									className="h-8 min-w-0 flex-1"
									defaultValue={w.note ?? ""}
									placeholder="shipping note (address, USA/EU…)"
									onBlur={(e) => {
										if (e.target.value !== (w.note ?? ""))
											setNote.mutate({ id: w.id, note: e.target.value });
									}}
								/>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => removeWinner.mutate({ id: w.id })}
									disabled={removeWinner.isPending}
									aria-label={`Remove ${w.name}`}
								>
									<Trash2 className="size-4" />
								</Button>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
