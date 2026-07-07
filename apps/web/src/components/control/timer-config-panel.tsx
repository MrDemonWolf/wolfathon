"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
	DEFAULT_TIMER_EMOJIS,
	type EmoteDirection,
	EMOTE_DIRECTIONS,
	EMOTE_SCALES,
	MAX_CHANNEL_POINT_RULES,
	MAX_EMOJIS,
	MAX_EMOTE_COUNT,
	type TimerConfig,
} from "@wolfathon/api/timer";
import { Button } from "@wolfathon/ui/components/button";
import { Input } from "@wolfathon/ui/components/input";
import { ArrowRight, ArrowUp, Plus, RotateCcw, Trash2, Twitch, X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { toast } from "sonner";

const EMOTE_DIRECTION_LABELS: Record<EmoteDirection, string> = {
	up: "Up",
	right: "Left → Right",
	left: "Right → Left",
};

/** Quick palette for one-tap adding — covers most Wolfathon/stream vibes. */
const EMOJI_PRESETS = [
	"🐺",
	"🌙",
	"⚡",
	"💙",
	"🔥",
	"✨",
	"🎮",
	"🏆",
	"🎉",
	"🎊",
	"💜",
	"💖",
	"⭐",
	"🚀",
	"👑",
	"💎",
	"🩵",
	"🐾",
	"🍕",
	"☕",
];

import { controlTrpc, queryClient } from "@/utils/trpc";

/** Controlled — the Timer tab holds the draft config and persists it on Save. */
export function TimerConfigPanel({
	config,
	onChange,
}: {
	config: TimerConfig;
	onChange: (c: TimerConfig) => void;
}) {
	const n = (v: string): number => {
		const x = Number(v);
		return Number.isFinite(x) ? x : 0;
	};
	// Preview glyph for the direction picker — first real emoji, skipping Twitch
	// emote URLs (which wouldn't render as text). Falls back to the wolf.
	const previewEmote = config.emojis.find((e) => !e.startsWith("http")) ?? "🐺";

	const [section, setSection] = useState<"rules" | "behaviour">("rules");
	const TABS = [
		{ id: "rules", label: "Time rules" },
		{ id: "behaviour", label: "Behaviour" },
	] as const;

	// Roving tab navigation (WAI-ARIA tabs pattern): arrows/Home/End move the
	// selection and focus, matching the visible segmented control.
	function onTabKeyDown(e: KeyboardEvent<HTMLDivElement>) {
		const ids = TABS.map((t) => t.id);
		const i = ids.indexOf(section);
		let next: number;
		if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % ids.length;
		else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + ids.length) % ids.length;
		else if (e.key === "Home") next = 0;
		else if (e.key === "End") next = ids.length - 1;
		else return;
		e.preventDefault();
		const id = ids[next];
		setSection(id);
		document.getElementById(`tab-${id}`)?.focus();
	}

	return (
		<div className="rounded-2xl panel-card p-5">
			<div className="flex flex-col gap-1">
				<h2 className="font-heading text-lg font-bold">Timer setup</h2>
				<p className="text-sm text-muted-foreground">
					How time is earned, how the overlay behaves, and how it looks.
				</p>
			</div>

			<div
				role="tablist"
				aria-label="Timer setup sections"
				onKeyDown={onTabKeyDown}
				className="segmented mt-4 inline-flex w-fit gap-1 rounded-[0.95rem] p-1"
			>
				{TABS.map((t) => {
					const active = section === t.id;
					return (
						<button
							key={t.id}
							id={`tab-${t.id}`}
							type="button"
							role="tab"
							aria-selected={active}
							aria-controls={`panel-${t.id}`}
							tabIndex={active ? 0 : -1}
							onClick={() => setSection(t.id)}
							className={`rounded-[0.7rem] px-4 py-1.5 text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
								active
									? "segmented-on text-primary-foreground"
									: "text-muted-foreground hover:bg-white/5 hover:text-foreground"
							}`}
						>
							{t.label}
						</button>
					);
				})}
			</div>

			{section === "rules" && (
				<div
					role="tabpanel"
					id="panel-rules"
					aria-labelledby="tab-rules"
					tabIndex={0}
					className="mt-2"
				>
					<p className="mt-1 text-sm text-muted-foreground">
						Minutes added per event. Each field below is labelled with the event it covers.
					</p>

					{/* Session bounds — where the timer starts and its ceiling. */}
					<div className="mt-4">
						<div className="eyebrow text-[0.65rem]">Session bounds</div>
						<div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
							<Field
								label="Start (min)"
								value={config.startMinutes}
								onChange={(v) => onChange({ ...config, startMinutes: n(v) })}
							/>
							<Field
								label="Cap (min, 0=∞)"
								value={config.maxMinutes}
								onChange={(v) => onChange({ ...config, maxMinutes: n(v) })}
							/>
						</div>
					</div>

					{/* Subs & gifts — the tier ladder plus gifted subs. */}
					<div className="mt-4">
						<div className="eyebrow text-[0.65rem]">Subs &amp; gifts</div>
						<div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
							<Field
								label="Sub T1 (min)"
								value={config.sub.t1}
								onChange={(v) => onChange({ ...config, sub: { ...config.sub, t1: n(v) } })}
							/>
							<Field
								label="Sub T2 (min)"
								value={config.sub.t2}
								onChange={(v) => onChange({ ...config, sub: { ...config.sub, t2: n(v) } })}
							/>
							<Field
								label="Sub T3 (min)"
								value={config.sub.t3}
								onChange={(v) => onChange({ ...config, sub: { ...config.sub, t3: n(v) } })}
							/>
							<Field
								label="Prime (min)"
								value={config.sub.prime}
								onChange={(v) => onChange({ ...config, sub: { ...config.sub, prime: n(v) } })}
							/>
							<Field
								label="Gift sub (min)"
								value={config.giftSubMinutes}
								onChange={(v) => onChange({ ...config, giftSubMinutes: n(v) })}
							/>
						</div>
					</div>

					{/* Bits & channel points — cheers plus per-reward redemption rules. */}
					<div className="mt-4">
						<div className="eyebrow text-[0.65rem]">Bits &amp; channel points</div>
						<div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
							<Field
								label="Bits / 100 (min)"
								value={config.bitsPer100Minutes}
								onChange={(v) => onChange({ ...config, bitsPer100Minutes: n(v) })}
							/>
						</div>
					</div>

					{/* channel point rewards — created/owned on Twitch */}
					<ChannelRewards config={config} onChange={onChange} />
				</div>
			)}

			{section === "behaviour" && (
				<div
					role="tabpanel"
					id="panel-behaviour"
					aria-labelledby="tab-behaviour"
					tabIndex={0}
					className="mt-2"
				>
					{/* overlay emoji */}
					<EmojiEditor
						emojis={config.emojis}
						onChange={(emojis) => onChange({ ...config, emojis })}
					/>

					{/* emote burst count */}
					<div className="mt-4">
						<label className="flex max-w-xs flex-col gap-1 text-sm font-medium">
							Emotes per time-add
							<Input
								className="h-9 rounded-lg"
								type="number"
								min={0}
								max={MAX_EMOTE_COUNT}
								value={String(config.emoteCount)}
								onChange={(e) =>
									onChange({
										...config,
										emoteCount: Math.max(
											0,
											Math.min(MAX_EMOTE_COUNT, Math.round(n(e.target.value))),
										),
									})
								}
							/>
							<span className="text-xs font-normal text-muted-foreground">
								How many emotes flood the bar on each add (0–{MAX_EMOTE_COUNT}, 0 = off).
							</span>
						</label>
					</div>

					{/* emote glyph size */}
					<div className="mt-4">
						<div className="text-sm font-medium">Emote size</div>
						<p className="mt-1 text-xs text-muted-foreground">
							How big each flooding emote renders. Bump it up for a 1080p source.
						</p>
						<div
							role="radiogroup"
							aria-label="Emote size"
							className="segmented mt-2 inline-flex w-fit gap-1 rounded-[0.95rem] p-1"
						>
							{EMOTE_SCALES.map((scale) => {
								const active = config.emoteScale === scale;
								return (
									<button
										key={scale}
										type="button"
										role="radio"
										aria-checked={active}
										onClick={() => onChange({ ...config, emoteScale: scale })}
										className={`rounded-[0.7rem] px-4 py-1.5 text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
											active
												? "segmented-on text-primary-foreground"
												: "text-muted-foreground hover:bg-white/5 hover:text-foreground"
										}`}
									>
										{scale}×
									</button>
								);
							})}
						</div>
					</div>

					{/* emote travel direction */}
					<div className="mt-4">
						<div className="text-sm font-medium">Emote direction</div>
						<p className="mt-1 text-xs text-muted-foreground">
							Which way the emotes travel when time is added.
						</p>
						<div
							role="radiogroup"
							aria-label="Emote direction"
							className="mt-2 grid max-w-md gap-2 [grid-template-columns:repeat(auto-fit,minmax(7rem,1fr))]"
						>
							{EMOTE_DIRECTIONS.map((dir) => {
								const active = config.emoteDirection === dir;
								return (
									<button
										key={dir}
										type="button"
										role="radio"
										aria-checked={active}
										onClick={() => onChange({ ...config, emoteDirection: dir })}
										className={`flex flex-col items-stretch gap-2 rounded-lg border p-2 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
											active
												? "border-primary/60 bg-primary/10"
												: "border-border hover:border-primary/40 hover:bg-accent"
										}`}
									>
										{/* live preview — emote travels the real overlay direction;
										    hidden under reduced motion, where the arrow carries it. */}
										<span
											aria-hidden
											className="grid h-7 place-items-center overflow-hidden rounded-md bg-background/60 motion-reduce:hidden"
										>
											<span
												className={
													active
														? `animate-wolf-prev-${dir} text-base leading-none`
														: "text-base leading-none opacity-30"
												}
											>
												{previewEmote}
											</span>
										</span>
										<span className="flex items-center justify-center gap-2">
											{dir === "up" ? (
												<ArrowUp className="size-4" />
											) : (
												<ArrowRight className={`size-4 ${dir === "left" ? "rotate-180" : ""}`} />
											)}
											{EMOTE_DIRECTION_LABELS[dir]}
										</span>
									</button>
								);
							})}
						</div>
					</div>

					{/* alert: name who added the time */}
					<div className="mt-4">
						<label className="flex items-center gap-2 text-sm font-medium">
							<input
								type="checkbox"
								className="size-4 accent-primary"
								checked={config.showEventSource}
								onChange={(e) => onChange({ ...config, showEventSource: e.target.checked })}
							/>
							Name who added the time on the alert
						</label>
						<p className="mt-1 text-xs text-muted-foreground">
							e.g. “MrDemonWolf · Sub +5m”. Off shows just “+5m”. Anonymous cheers and gifts stay
							anonymous.
						</p>
					</div>

					{/* auto-pause when the stream goes offline */}
					<div className="mt-4">
						<label className="flex items-center gap-2 text-sm font-medium">
							<input
								type="checkbox"
								className="size-4 accent-primary"
								checked={config.autoPauseOnOffline}
								onChange={(e) => onChange({ ...config, autoPauseOnOffline: e.target.checked })}
							/>
							Auto-pause when the stream goes offline
						</label>
						<p className="mt-1 text-xs text-muted-foreground">
							Pauses the timer on <code className="text-foreground">stream.offline</code> so an
							outage or ended stream doesn’t burn time, and resumes it when you go live again.
							Requires Twitch connected. A manual pause is never overridden.
						</p>
					</div>

					{/* Tips (Ko-fi integration is not wired up yet — fields are disabled + dimmed so the
					    operator can't mistake these pre-set rates for a live, configured feature). */}
					<div className="mt-5 opacity-60">
						<div className="flex items-center gap-2">
							<div className="text-sm font-medium">Tips</div>
							<span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
								Coming soon
							</span>
						</div>
						<p className="mt-1 text-xs text-muted-foreground">
							Tip integration (Ko-fi) is coming soon. These rates control how much time a tip adds
							and how it advances the reward goals once it’s connected.
						</p>
						<div className="mt-2 grid grid-cols-2 gap-3 sm:max-w-md">
							<Field
								label="Minutes per $1"
								value={config.tipMinutesPerDollar}
								onChange={(v) => onChange({ ...config, tipMinutesPerDollar: n(v) })}
								disabled
							/>
							<Field
								label="$ per goal sub (0 = off)"
								value={config.tipDollarsPerSub}
								onChange={(v) => onChange({ ...config, tipDollarsPerSub: n(v) })}
								disabled
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

/**
 * Channel-point rewards card. Unlike the rest of the timer config (which is a
 * draft saved by the DirtyBar), creating/removing a reward hits Twitch
 * IMMEDIATELY (Helix create/delete) and persists the rule server-side — so these
 * mutations write straight through and we sync the draft + the saved baseline
 * from the returned doc, never leaving a phantom-dirty channelPoints diff.
 */
function ChannelRewards({
	config,
	onChange,
}: {
	config: TimerConfig;
	onChange: (c: TimerConfig) => void;
}) {
	const [title, setTitle] = useState("");
	const [minutes, setMinutes] = useState("5");
	const rules = config.channelPoints;
	const atCap = rules.length >= MAX_CHANNEL_POINT_RULES;

	// Keep the saved baseline in sync so the through-write doesn't read as dirty.
	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: controlTrpc.timer.getRaw.queryOptions().queryKey,
		});

	const create = useMutation(
		controlTrpc.timer.createChannelReward.mutationOptions({
			onSuccess: (doc) => {
				onChange({ ...config, channelPoints: doc.config.channelPoints });
				setTitle("");
				setMinutes("5");
				toast.success("Reward created on Twitch");
				invalidate();
			},
			onError: (err) => toast.error(err.message),
		}),
	);
	const remove = useMutation(
		controlTrpc.timer.removeChannelReward.mutationOptions({
			onSuccess: (doc) => {
				onChange({ ...config, channelPoints: doc.config.channelPoints });
				toast.success("Reward removed");
				invalidate();
			},
			onError: (err) => toast.error(err.message),
		}),
	);
	const busy = create.isPending || remove.isPending;

	function submit() {
		const t = title.trim();
		const m = Number(minutes);
		if (!t || !Number.isFinite(m)) return;
		create.mutate({ title: t, minutes: Math.max(0, m) });
	}

	return (
		<div className="mt-4">
			<div className="text-sm font-medium">Channel-point rewards</div>
			<p className="mt-1 text-xs text-muted-foreground">
				Creating a reward adds it to your Twitch channel and links it to a timer add. Needs the
				channel-point reward scope — if it returns a 401, reconnect Twitch in Settings → Twitch. Up
				to {MAX_CHANNEL_POINT_RULES}.
			</p>

			{/* existing rewards (up to 2) */}
			<div className="mt-2 flex flex-col gap-2">
				{rules.map((rule, i) => (
					<div
						key={rule.rewardId ?? i}
						className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2"
					>
						<div className="flex-1 truncate text-sm font-medium">
							{rule.rewardTitle || "Untitled reward"}
						</div>
						<div className="text-xs text-muted-foreground">+{rule.minutes}m</div>
						<Button
							variant="destructive"
							size="icon-sm"
							className="rounded-lg"
							aria-label={`Remove ${rule.rewardTitle || "reward"}`}
							disabled={busy}
							onClick={() =>
								remove.mutate(rule.rewardId ? { rewardId: rule.rewardId } : { index: i })
							}
						>
							<Trash2 className="size-4" />
						</Button>
					</div>
				))}
				{rules.length === 0 && (
					<p className="text-xs text-muted-foreground">
						No rewards yet. Create one below to add a redeemable timer-add to your channel.
					</p>
				)}
			</div>

			{/* create form */}
			<div className="mt-3 flex items-end gap-2">
				<label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
					Reward title
					<Input
						className="h-9 rounded-lg"
						placeholder="e.g. Add 5 minutes"
						value={title}
						maxLength={45}
						disabled={atCap || busy}
						onChange={(e) => setTitle(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								submit();
							}
						}}
					/>
				</label>
				<label className="flex w-24 flex-col gap-1 text-xs text-muted-foreground">
					Minutes
					<Input
						className="h-9 rounded-lg"
						type="number"
						min={0}
						value={minutes}
						disabled={atCap || busy}
						onChange={(e) => setMinutes(e.target.value)}
					/>
				</label>
				<Button
					variant="outline"
					size="sm"
					className="mb-px rounded-lg"
					disabled={atCap || busy || !title.trim()}
					onClick={submit}
				>
					<Plus className="size-3.5" />
					{create.isPending ? "Creating…" : "Create"}
				</Button>
			</div>
			{atCap && (
				<p className="mt-2 text-xs text-muted-foreground">
					At the {MAX_CHANNEL_POINT_RULES}-reward limit. Remove one to create another.
				</p>
			)}
		</div>
	);
}

/** Render one entry: a Twitch emote image (https URL) or a unicode emoji. */
function entryGlyph(e: string, sizeClass = "size-6") {
	return e.startsWith("https://") ? (
		// eslint-disable-next-line @next/next/no-img-element
		<img src={e} alt="" className={`${sizeClass} object-contain`} />
	) : (
		<span>{e}</span>
	);
}

function EmojiEditor({ emojis, onChange }: { emojis: string[]; onChange: (e: string[]) => void }) {
	const [draft, setDraft] = useState("");
	// Load the channel emotes ONCE per session. gcTime/staleTime Infinity keep the
	// list in the query cache across tab-switch remounts (this panel unmounts
	// inactive tabs), so seed `showEmotes` from that cache — the grid reappears
	// instantly without re-clicking "Load". A full page reload clears it (expected);
	// the Reload button forces a manual refresh.
	const emotesOpts = controlTrpc.twitch.listEmotes.queryOptions();
	const [showEmotes, setShowEmotes] = useState(
		() => queryClient.getQueryData(emotesOpts.queryKey) !== undefined,
	);
	const emotes = useQuery({
		...emotesOpts,
		enabled: showEmotes,
		retry: false,
		staleTime: Infinity,
		gcTime: Infinity,
		refetchOnReconnect: false,
	});
	// Reload must show freshly-uploaded emotes, so it bypasses the server-side
	// emote cache via `refresh: true` and writes the result into the base query.
	const [reloading, setReloading] = useState(false);
	const busy = emotes.isFetching || reloading;
	async function reloadEmotes() {
		setReloading(true);
		try {
			const fresh = await queryClient.fetchQuery(
				controlTrpc.twitch.listEmotes.queryOptions({ refresh: true }),
			);
			queryClient.setQueryData(emotesOpts.queryKey, fresh);
		} finally {
			setReloading(false);
		}
	}
	const reloadButton = (
		<Button variant="ghost" size="sm" className="rounded-lg" onClick={reloadEmotes} disabled={busy}>
			<RotateCcw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
			{busy ? "Reloading…" : "Reload"}
		</Button>
	);

	function add(values: string[]) {
		const merged = [...emojis];
		for (const v of values) {
			const t = v.trim();
			if (t && !merged.includes(t) && merged.length < MAX_EMOJIS) merged.push(t);
		}
		onChange(merged);
	}

	function addDraft() {
		// Space-separate to paste several at once; each token is one drifter.
		add(draft.split(/\s+/));
		setDraft("");
	}

	return (
		<div className="mt-5">
			<div className="flex items-center justify-between">
				<div className="text-sm font-medium">
					Overlay emoji{" "}
					<span className="text-muted-foreground">
						({emojis.length}/{MAX_EMOJIS})
					</span>
				</div>
				<Button
					variant="ghost"
					size="sm"
					className="rounded-lg"
					onClick={() => onChange([...DEFAULT_TIMER_EMOJIS])}
				>
					<RotateCcw className="size-3.5" />
					Reset
				</Button>
			</div>
			<p className="mt-1 text-xs text-muted-foreground">
				These drift up behind the timer and burst out whenever time is added.
			</p>

			{/* current selection */}
			<div className="mt-2 flex flex-wrap gap-1.5">
				{emojis.length === 0 && (
					<span className="text-xs text-muted-foreground">None — overlay falls back to 🐺.</span>
				)}
				{emojis.map((e, i) => (
					<button
						key={`${e}-${i}`}
						type="button"
						aria-label={`Remove ${e}`}
						className="group inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-lg leading-none transition hover:border-destructive/60 hover:bg-destructive/10"
						onClick={() => onChange(emojis.filter((_, j) => j !== i))}
					>
						{entryGlyph(e)}
						<X className="size-3 text-muted-foreground group-hover:text-destructive" />
					</button>
				))}
			</div>

			{/* quick presets */}
			<div className="mt-3 flex flex-wrap gap-1.5">
				{EMOJI_PRESETS.map((e) => {
					const active = emojis.includes(e);
					return (
						<button
							key={e}
							type="button"
							disabled={!active && emojis.length >= MAX_EMOJIS}
							className={`inline-flex size-9 items-center justify-center rounded-lg border text-lg leading-none transition disabled:opacity-40 ${
								active
									? "border-primary/60 bg-primary/15"
									: "border-border bg-background hover:border-primary/40 hover:bg-accent"
							}`}
							onClick={() => (active ? onChange(emojis.filter((x) => x !== e)) : add([e]))}
						>
							{e}
						</button>
					);
				})}
			</div>

			{/* custom add */}
			<div className="mt-3 flex items-center gap-2">
				<Input
					className="h-9 flex-1 rounded-lg"
					aria-label="Add custom emoji (space-separated)"
					placeholder="Paste your own (space-separated) — e.g. 🦊 🌟 🍩"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							addDraft();
						}
					}}
				/>
				<Button
					variant="outline"
					size="sm"
					className="rounded-lg"
					disabled={!draft.trim() || emojis.length >= MAX_EMOJIS}
					onClick={addDraft}
				>
					<Plus className="size-3.5" />
					Add
				</Button>
			</div>

			{/* Twitch channel emotes — tucked behind a disclosure to keep the
			    common emoji-picking flow above the fold. */}
			<details className="group mt-3 rounded-lg border border-border bg-background/30">
				<summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
					<Twitch className="size-3.5 text-muted-foreground" />
					Customize emotes
					<span className="ml-auto text-xs font-normal text-muted-foreground">
						{showEmotes ? "" : "Add your channel’s Twitch emotes"}
					</span>
				</summary>
				<div className="px-3 pb-3">
					{!showEmotes ? (
						<Button
							variant="outline"
							size="sm"
							className="rounded-lg"
							onClick={() => setShowEmotes(true)}
						>
							<Twitch className="size-3.5" />
							Load my Twitch emotes
						</Button>
					) : emotes.isLoading ? (
						<p className="text-xs text-muted-foreground">Loading channel emotes…</p>
					) : emotes.isError ? (
						<div className="space-y-2">
							<p className="text-xs text-destructive">
								{emotes.error instanceof Error ? emotes.error.message : "Couldn't load emotes."}{" "}
								Connect Twitch in Settings → Twitch, then reload.
							</p>
							{reloadButton}
						</div>
					) : emotes.data && emotes.data.length > 0 ? (
						<>
							<div className="mb-2 flex items-center justify-between gap-2">
								<span className="text-xs text-muted-foreground">
									Click an emote to add it. Cached for this session.
								</span>
								{reloadButton}
							</div>
							<div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-background/50 p-2">
								<div className="flex flex-wrap gap-1.5">
									{emotes.data.map((em) => {
										const active = emojis.includes(em.url);
										return (
											<button
												key={em.id}
												type="button"
												title={em.name}
												disabled={!active && emojis.length >= MAX_EMOJIS}
												className={`inline-flex size-10 items-center justify-center rounded-lg border p-1 transition disabled:opacity-40 ${
													active
														? "border-primary/60 bg-primary/15"
														: "border-border hover:border-primary/40 hover:bg-accent"
												}`}
												onClick={() =>
													active ? onChange(emojis.filter((x) => x !== em.url)) : add([em.url])
												}
											>
												{/* eslint-disable-next-line @next/next/no-img-element */}
												<img src={em.url} alt={em.name} className="size-full object-contain" />
											</button>
										);
									})}
								</div>
							</div>
						</>
					) : (
						<p className="text-xs text-muted-foreground">No channel emotes found.</p>
					)}
				</div>
			</details>
		</div>
	);
}

function Field({
	label,
	value,
	onChange,
	disabled,
}: {
	label: string;
	value: number;
	onChange: (v: string) => void;
	disabled?: boolean;
}) {
	return (
		<label className="flex flex-col gap-1 text-xs text-muted-foreground">
			{label}
			<Input
				className="h-9 rounded-lg"
				type="number"
				value={String(value)}
				onChange={(e) => onChange(e.target.value)}
				disabled={disabled}
			/>
		</label>
	);
}
