"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { GiveawayDoc } from "@wolfathon/api/giveaway";
import {
	AlertDialog,
	AlertDialogClose,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@wolfathon/ui/components/alert-dialog";
import { Button } from "@wolfathon/ui/components/button";
import { Checkbox } from "@wolfathon/ui/components/checkbox";
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

/** One labelled number in the status strip. */
function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
	return (
		<div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
			<div
				className={`font-heading text-2xl font-bold tabular-nums ${accent ? "text-primary" : ""}`}
			>
				{value}
			</div>
			<div className="eyebrow mt-0.5 text-[0.65rem]">{label}</div>
		</div>
	);
}

export function GiveawayTab() {
	const rawOptions = controlTrpc.giveaway.getRaw.queryOptions(undefined, {
		// Poll so live gifters / entrants appear without a manual refresh.
		refetchInterval: 3000,
	});
	const { data, isError, refetch } = useQuery(rawOptions);
	const invalidate = () => queryClient.invalidateQueries({ queryKey: rawOptions.queryKey });
	// Every mutation surfaces failures — the panel polls every 3s, so a silently
	// rejected save/draw/reset would otherwise just look like nothing happened.
	const onError = (e: { message: string }) => toast.error(e.message);

	const setConfig = useMutation(
		controlTrpc.giveaway.setConfig.mutationOptions({ onSuccess: invalidate, onError }),
	);
	const addGift = useMutation(
		controlTrpc.giveaway.addGiftWinner.mutationOptions({
			onSuccess: () => {
				toast.success("Winner added");
				invalidate();
			},
			onError,
		}),
	);
	const draw = useMutation(
		controlTrpc.giveaway.drawRaffle.mutationOptions({
			onSuccess: (r) => {
				if (r.winner) toast.success(`Raffle winner: ${r.winner.name}`);
				else toast.error("No entrants left to draw");
				invalidate();
			},
			onError,
		}),
	);
	const addEntrant = useMutation(
		controlTrpc.giveaway.addEntrant.mutationOptions({ onSuccess: invalidate, onError }),
	);
	const setShipped = useMutation(
		controlTrpc.giveaway.setShipped.mutationOptions({ onSuccess: invalidate, onError }),
	);
	const setNote = useMutation(
		controlTrpc.giveaway.setNote.mutationOptions({ onSuccess: invalidate, onError }),
	);
	const removeWinner = useMutation(
		controlTrpc.giveaway.removeWinner.mutationOptions({
			onSuccess: () => {
				toast.success("Winner removed");
				invalidate();
			},
			onError,
		}),
	);
	const resetRound = useMutation(
		controlTrpc.giveaway.resetRound.mutationOptions({
			onSuccess: () => {
				toast.success("Round reset");
				invalidate();
			},
			onError,
		}),
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

	if (!data && isError) {
		return (
			<div role="status" className="rounded-2xl panel-card p-5">
				<h2 className="font-heading text-lg font-bold">Couldn&apos;t load the giveaway</h2>
				<p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
				<Button variant="outline" className="mt-3" onClick={() => refetch()}>
					Retry
				</Button>
			</div>
		);
	}
	if (!data) {
		return (
			<p role="status" className="text-sm text-muted-foreground">
				Loading giveaway…
			</p>
		);
	}

	const cfg = data.config;
	const gifters = qualifying(data);
	const giftWinners = data.winners.filter((w) => w.source === "gift");
	const raffleWinners = data.winners.filter((w) => w.source === "raffle");
	const wonLogins = new Set(data.winners.map((w) => w.login));
	const remainingEntrants = data.entrants.filter((e) => !wonLogins.has(e.login)).length;

	return (
		<div className="flex flex-col gap-6">
			{/* ── Status header ─────────────────────────────────────────────── */}
			<div className="rounded-2xl panel-card p-5">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="flex flex-col gap-1">
						<span className="eyebrow text-[0.7rem]">Giveaway</span>
						<h2 className="font-heading text-2xl font-bold leading-tight">Sticker giveaway</h2>
						<p className="max-w-prose text-sm text-muted-foreground">
							First {cfg.giftWinnerSlots} to gift {cfg.giftThreshold}+ subs win automatically (you
							confirm); {cfg.raffleWinnerSlots} more by open chat raffle ({cfg.command}).
						</p>
					</div>
					<Button
						size="lg"
						variant={cfg.open ? "destructive" : "default"}
						onClick={() => setConfig.mutate({ open: !cfg.open })}
						disabled={setConfig.isPending}
					>
						{cfg.open ? (
							<>
								<span className="relative mr-0.5 flex size-2">
									<span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
									<span className="relative inline-flex size-2 rounded-full bg-current" />
								</span>
								Close entries
							</>
						) : (
							"Open entries"
						)}
					</Button>
				</div>

				{/* Live counts */}
				<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
					<div className="col-span-2 flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-4 py-3 sm:col-span-1">
						<span
							className={`relative flex size-2.5 ${cfg.open ? "text-primary" : "text-muted-foreground"}`}
						>
							{cfg.open && (
								<span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
							)}
							<span className="relative inline-flex size-2.5 rounded-full bg-current" />
						</span>
						<div>
							<div className="font-heading font-bold">{cfg.open ? "OPEN" : "CLOSED"}</div>
							<div className="eyebrow text-[0.65rem]">{cfg.command}</div>
						</div>
					</div>
					<Stat label="Entered" value={data.entrants.length} accent />
					<Stat label="In pool" value={remainingEntrants} />
					<Stat label="Gift-qualified" value={gifters.length} />
				</div>

				{/* Config */}
				<div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-[1fr_auto_auto]">
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
					<Button onClick={() => draw.mutate()} disabled={draw.isPending || remainingEntrants === 0}>
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
						aria-label="Entrant Twitch login"
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
					<AlertDialog>
						<AlertDialogTrigger
							render={
								<Button variant="destructive" size="sm" disabled={resetRound.isPending}>
									Reset round
								</Button>
							}
						/>
						<AlertDialogContent>
							<AlertDialogTitle>Reset round?</AlertDialogTitle>
							<AlertDialogDescription>
								This clears all gifters, entrants, and winners to start a new round. This cannot be
								undone.
							</AlertDialogDescription>
							<AlertDialogFooter>
								<AlertDialogClose render={<Button variant="outline">Cancel</Button>} />
								<AlertDialogClose
									onClick={() => resetRound.mutate()}
									render={<Button variant="destructive">Reset round</Button>}
								/>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
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
								<Checkbox
									checked={w.shipped}
									onCheckedChange={(checked) =>
										setShipped.mutate({ id: w.id, shipped: checked === true })
									}
									aria-label={`Mark ${w.name} shipped`}
								/>
								<span className="text-sm font-medium">{w.name}</span>
								<span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
									{w.source === "gift" ? "gift" : "raffle"}
								</span>
								<Input
									className="h-8 min-w-0 flex-1"
									defaultValue={w.note ?? ""}
									placeholder="shipping note (address, USA/EU…)"
									aria-label={`Shipping note for ${w.name}`}
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
