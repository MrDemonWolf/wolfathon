"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { Entrant, GiveawayDoc, Winner } from "@wolfathon/api/giveaway";
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
import { useEffect, useRef, useState } from "react";
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
	const start = useMutation(
		controlTrpc.giveaway.start.mutationOptions({
			onSuccess: () => {
				toast.success("Giveaway started — gift subs now count");
				invalidate();
			},
			onError,
		}),
	);
	const reroll = useMutation(
		controlTrpc.giveaway.reroll.mutationOptions({
			onSuccess: (r) => {
				if (r.winner) toast.success(`Rerolled: ${r.winner.name}`);
				else toast.error("No one left to reroll to");
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

	// Editable config draft (command + threshold), seeded once from the server.
	// A `seeded` ref (not a sentinel like t===5) so a real threshold of 5 or a
	// command the operator clears isn't silently re-overwritten by the next poll.
	const [command, setCommand] = useState("");
	const [threshold, setThreshold] = useState(5);
	const [manual, setManual] = useState("");
	const [filter, setFilter] = useState("");
	const seeded = useRef(false);
	useEffect(() => {
		if (!data || seeded.current) return;
		seeded.current = true;
		setCommand(data.config.command);
		setThreshold(data.config.giftThreshold);
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
	const started = data.startedAt != null;
	const gifters = qualifying(data);
	const giftWinners = data.winners.filter((w) => w.source === "gift");
	const raffleWinners = data.winners.filter((w) => w.source === "raffle");
	const wonLogins = new Set(data.winners.map((w) => w.login));
	const remainingEntrants = data.entrants.filter((e) => !wonLogins.has(e.login)).length;
	// A command must be "!" + at least one char or it silently breaks chat entry.
	const cmdTrimmed = command.trim();
	const cmdValid = cmdTrimmed.startsWith("!") && cmdTrimmed.length > 1;
	// All planned raffle slots already drawn — drawing again is an intentional extra.
	const raffleFull = cfg.raffleWinnerSlots > 0 && raffleWinners.length >= cfg.raffleWinnerSlots;

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

	// One winner row — shipping checkbox, name, note, optional reroll (raffle), remove.
	function renderWinner(w: Winner, canReroll: boolean) {
		return (
			<li
				key={w.id}
				className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2"
			>
				<Checkbox
					checked={w.shipped}
					onCheckedChange={(checked) => setShipped.mutate({ id: w.id, shipped: checked === true })}
					aria-label={`Mark ${w.name} shipped`}
				/>
				<Avatar name={w.name} />
				<a
					href={twitchUrl(w.login)}
					target="_blank"
					rel="noreferrer"
					className="text-sm font-medium hover:text-primary"
				>
					{w.name}
				</a>
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
				{canReroll && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => reroll.mutate({ id: w.id })}
						disabled={reroll.isPending}
						aria-label={`Reroll ${w.name}`}
					>
						<Dice5 className="size-3.5" /> Reroll
					</Button>
				)}
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
						{started ? (
							<span className="flex items-center gap-1.5 text-xs font-medium text-primary">
								<span className="inline-flex size-2 rounded-full bg-current" />
								Tracking gift subs
							</span>
						) : (
							<span className="text-xs text-muted-foreground">
								Gift subs only count after you hit Start.
							</span>
						)}
					</div>
					{started ? (
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
									Close {cfg.command}
								</>
							) : (
								`Open ${cfg.command}`
							)}
						</Button>
					) : (
						<Button
							size="lg"
							onClick={() => start.mutate()}
							disabled={start.isPending}
							aria-busy={start.isPending}
						>
							{start.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
							Start giveaway
						</Button>
					)}
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
							aria-invalid={!cmdValid}
							aria-describedby="gv-cmd-hint"
						/>
						<span
							id="gv-cmd-hint"
							role={cmdValid ? undefined : "alert"}
							className={`text-xs ${cmdValid ? "text-muted-foreground" : "text-destructive"}`}
						>
							{cmdValid
								? "Must start with “!”."
								: "Enter a command starting with “!” (e.g. !enter)."}
						</span>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="gv-thr">Gift threshold</Label>
						<Input
							id="gv-thr"
							type="number"
							min={1}
							className="w-28"
							value={threshold}
							// Ignore non-numeric/empty input so the field can't become NaN.
							onChange={(e) => {
								const n = Number(e.target.value);
								if (Number.isFinite(n)) setThreshold(n);
							}}
						/>
					</div>
					<div className="flex items-end">
						<Button
							variant="outline"
							onClick={() =>
								setConfig.mutate({ command: cmdTrimmed, giftThreshold: Math.max(1, threshold) })
							}
							disabled={setConfig.isPending || !cmdValid}
						>
							Save
						</Button>
					</div>
				</div>
			</div>

			{/* ── Gift qualifiers ───────────────────────────────────────────── */}
			<div className="rounded-2xl panel-card p-5">
				<div className="flex items-center gap-2">
					<Gift className="size-4 text-primary" />
					<h3 className="font-heading font-bold">
						Gift winners{" "}
						<span className="text-muted-foreground">
							{giftWinners.length}/{cfg.giftWinnerSlots}
						</span>
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
								className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
							>
								<div className="flex min-w-0 items-center gap-2.5">
									<span className="font-heading text-sm font-bold tabular-nums text-muted-foreground">
										#{i + 1}
									</span>
									<Avatar name={g.name} />
									<a
										href={twitchUrl(g.login)}
										target="_blank"
										rel="noreferrer"
										className="truncate text-sm font-medium hover:text-primary"
									>
										{g.name}
									</a>
									<span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
										{g.count} subs
									</span>
								</div>
								{wonLogins.has(g.login) ? (
									<span className="flex shrink-0 items-center gap-1 text-xs text-primary">
										<Crown className="size-3.5" /> winner
									</span>
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
					<Button
						onClick={() => draw.mutate()}
						disabled={draw.isPending || remainingEntrants === 0}
						aria-busy={draw.isPending}
						title={raffleFull ? "All planned raffle slots are filled" : undefined}
					>
						{draw.isPending ? (
							<Loader2 className="size-4 animate-spin" aria-hidden />
						) : (
							<Dice5 className="size-4" aria-hidden />
						)}
						{raffleFull ? "Draw extra winner" : "Draw winner"}
					</Button>
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					{remainingEntrants} eligible {remainingEntrants === 1 ? "entry" : "entries"} ·{" "}
					{data.entrants.length} entered total.
				</p>
				{/* Concise spoken summary so the 3s-polled pool growth is announced once
				    per change instead of row-by-row spam. */}
				<p className="sr-only" role="status" aria-live="polite">
					{data.entrants.length} entered, {remainingEntrants} in pool.
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

			{/* ── Winners ───────────────────────────────────────────────────── */}
			<div className="rounded-2xl panel-card p-5">
				<div className="flex items-center justify-between">
					<h3 className="font-heading font-bold">
						Winners <span className="text-muted-foreground">{data.winners.length}</span>
					</h3>
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
								This clears {data.gifters.length} gifters, {data.entrants.length} entrants, and{" "}
								{data.winners.length} winners to start a new round. This cannot be undone.
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
					<p className="mt-3 text-sm text-muted-foreground">
						No winners yet. Confirm a gifter or draw the raffle above.
					</p>
				) : (
					<div className="mt-3 flex flex-col gap-5">
						<div>
							<div className="flex items-center gap-2">
								<Gift className="size-4 text-primary" />
								<h4 className="text-sm font-semibold">
									Gift sub winners{" "}
									<span className="text-muted-foreground">{giftWinners.length}</span>
								</h4>
							</div>
							{giftWinners.length === 0 ? (
								<p className="mt-2 text-sm text-muted-foreground">No gift sub winners yet.</p>
							) : (
								<ul className="mt-2 flex flex-col gap-2">
									{giftWinners.map((w) => renderWinner(w, false))}
								</ul>
							)}
						</div>
						<div>
							<div className="flex items-center gap-2">
								<Dice5 className="size-4 text-primary" />
								<h4 className="text-sm font-semibold">
									Raffle winners{" "}
									<span className="text-muted-foreground">{raffleWinners.length}</span>
								</h4>
							</div>
							{raffleWinners.length === 0 ? (
								<p className="mt-2 text-sm text-muted-foreground">No raffle winners yet.</p>
							) : (
								<ul className="mt-2 flex flex-col gap-2">
									{raffleWinners.map((w) => renderWinner(w, true))}
								</ul>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
