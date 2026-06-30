"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { Entrant, GiveawayDoc } from "@wolfathon/api/giveaway";
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
import { Crown, Dice5, ExternalLink, Gift, Loader2, Search, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

// ponytail: render at most this many entrant rows. A raffle pool can reach
// MAX_ENTRANTS (5000) and we don't want 5000 DOM nodes — the filter box narrows
// past the cap. Raise if a stream ever needs to eyeball more at once.
const ENTRANT_RENDER_CAP = 200;

/** Gifters who reached the threshold, earliest first ("first to gift N+"). */
function qualifying(doc: GiveawayDoc) {
	return doc.gifters
		.filter((g) => g.qualifiedAt != null)
		.sort((a, b) => (a.qualifiedAt ?? 0) - (b.qualifiedAt ?? 0));
}

/** Compact relative time ("12s ago"). Recomputed each 3s poll — no timer needed. */
function ago(ms: number, now: number) {
	const s = Math.max(0, Math.round((now - ms) / 1000));
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

const twitchUrl = (login: string) => `https://twitch.tv/${login}`;

/** Brand-tinted initial bubble — we only have login/name, no avatar URLs. */
function Avatar({ name, className = "" }: { name: string; className?: string }) {
	return (
		<span
			className={`grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary ${className}`}
			aria-hidden
		>
			{(name.trim()[0] ?? "?").toUpperCase()}
		</span>
	);
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
	const [filter, setFilter] = useState("");
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

	const now = Date.now();
	const cfg = data.config;
	const gifters = qualifying(data);
	const giftWinners = data.winners.filter((w) => w.source === "gift");
	const raffleWinners = data.winners.filter((w) => w.source === "raffle");
	const wonLogins = new Set(data.winners.map((w) => w.login));
	const remainingEntrants = data.entrants.filter((e) => !wonLogins.has(e.login)).length;

	// Newest entrants first so new chatters visibly pop in at the top each poll.
	const ordered = [...data.entrants].sort((a, b) => b.enteredAt - a.enteredAt);
	const q = filter.trim().toLowerCase();
	const matched = q
		? ordered.filter((e) => e.name.toLowerCase().includes(q) || e.login.includes(q))
		: ordered;
	const shown = matched.slice(0, ENTRANT_RENDER_CAP);
	const overflow = matched.length - shown.length;

	function entrantRow(e: Entrant) {
		const won = wonLogins.has(e.login);
		return (
			<li
				key={e.login}
				className={`flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 ${
					won ? "opacity-55" : "bg-muted/30"
				}`}
			>
				<Avatar name={e.name} />
				<div className="min-w-0 flex-1">
					<a
						href={twitchUrl(e.login)}
						target="_blank"
						rel="noreferrer"
						className="group flex items-center gap-1 truncate text-sm font-medium hover:text-primary"
					>
						<span className="truncate">{e.name}</span>
						<ExternalLink className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
					</a>
					<div className="text-xs text-muted-foreground">
						{won ? "already won" : ago(e.enteredAt, now)}
					</div>
				</div>
				{won && <Crown className="size-3.5 shrink-0 text-primary" />}
			</li>
		);
	}

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

			{/* ── Raffle pool (the entrant list) ────────────────────────────── */}
			<div className="rounded-2xl panel-card p-5">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<Users className="size-4 text-primary" />
						<h3 className="font-heading font-bold">
							Raffle pool{" "}
							<span className="text-muted-foreground">
								{raffleWinners.length}/{cfg.raffleWinnerSlots} drawn
							</span>
						</h3>
					</div>
					<Button onClick={() => draw.mutate()} disabled={draw.isPending || remainingEntrants === 0}>
						{draw.isPending ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<Dice5 className="size-4" />
						)}
						Draw winner
					</Button>
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					{remainingEntrants} eligible {remainingEntrants === 1 ? "entry" : "entries"} ·{" "}
					{data.entrants.length} entered total.
				</p>

				{/* Filter — only worth showing once the list gets long. */}
				{data.entrants.length > 12 && (
					<div className="relative mt-3">
						<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							className="pl-9"
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
							placeholder="Filter entrants by name…"
							aria-label="Filter entrants"
						/>
					</div>
				)}

				{data.entrants.length === 0 ? (
					<div className="mt-4 flex flex-col items-center gap-1 rounded-xl border border-dashed border-border py-10 text-center">
						<Users className="size-6 text-muted-foreground" />
						<p className="text-sm font-medium">No entrants yet</p>
						<p className="text-xs text-muted-foreground">
							{cfg.open
								? `Viewers join by typing ${cfg.command} in chat.`
								: `Open entries, then viewers join with ${cfg.command}.`}
						</p>
					</div>
				) : matched.length === 0 ? (
					<p className="mt-4 text-sm text-muted-foreground">No entrants match “{filter}”.</p>
				) : (
					<>
						<ul className="mt-3 grid max-h-[24rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
							{shown.map(entrantRow)}
						</ul>
						{overflow > 0 && (
							<p className="mt-2 text-xs text-muted-foreground">
								+{overflow} more — filter to narrow the list.
							</p>
						)}
					</>
				)}

				{/* Manual add — testing / fallback if chat ingest is unavailable. */}
				<div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
					<Input
						className="w-44"
						value={manual}
						onChange={(e) => setManual(e.target.value)}
						placeholder="add entrant login"
						aria-label="Entrant Twitch login"
						onKeyDown={(e) => {
							if (e.key !== "Enter") return;
							const login = manual.trim();
							if (login) addEntrant.mutate({ login }, { onSuccess: () => setManual("") });
						}}
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
					<span className="text-xs text-muted-foreground">Manual add for testing / fallback.</span>
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
