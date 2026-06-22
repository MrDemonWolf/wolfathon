"use client";

import { useQuery } from "@tanstack/react-query";
import {
	DEFAULT_TIMER_EMOJIS,
	MAX_EMOJIS,
	MAX_EMOTE_COUNT,
	MAX_LABEL_LEN,
	type TimerConfig,
} from "@wolfathon/api/timer";
import { Button } from "@wolfathon/ui/components/button";
import { Input } from "@wolfathon/ui/components/input";
import { Plus, RotateCcw, Twitch, X } from "lucide-react";
import { useState } from "react";

import { ThemeEditor } from "./theme-editor";

/** Quick palette for one-tap adding — covers most subathon/stream vibes. */
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

import { controlTrpc } from "@/utils/trpc";

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

	return (
		<div className="rounded-2xl panel-card p-5">
			<h2 className="font-heading text-lg font-bold">Time rules</h2>

			<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
				<Field
					label="Bits / 100 (min)"
					value={config.bitsPer100Minutes}
					onChange={(v) => onChange({ ...config, bitsPer100Minutes: n(v) })}
				/>
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

			{/* channel point rules */}
			<div className="mt-5">
				<div className="flex items-center justify-between">
					<div className="text-sm font-medium">Channel-point rewards</div>
					<Button
						variant="outline"
						size="sm"
						className="rounded-lg"
						onClick={() =>
							onChange({
								...config,
								channelPoints: [...config.channelPoints, { rewardTitle: "", minutes: 5 }],
							})
						}
					>
						<Plus className="size-3.5" />
						Add
					</Button>
				</div>
				<div className="mt-2 flex flex-col gap-2">
					{config.channelPoints.map((rule, i) => (
						<div key={i} className="flex items-center gap-2">
							<Input
								className="h-9 flex-1 rounded-lg"
								aria-label="Channel-point reward title (exact)"
								placeholder="Reward title (exact)"
								value={rule.rewardTitle}
								onChange={(e) => {
									const cp = [...config.channelPoints];
									cp[i] = { ...cp[i]!, rewardTitle: e.target.value };
									onChange({ ...config, channelPoints: cp });
								}}
							/>
							<Input
								className="h-9 w-24 rounded-lg"
								type="number"
								aria-label="Minutes added per redemption"
								value={String(rule.minutes)}
								onChange={(e) => {
									const cp = [...config.channelPoints];
									cp[i] = { ...cp[i]!, minutes: n(e.target.value) };
									onChange({ ...config, channelPoints: cp });
								}}
							/>
							<Button
								variant="destructive"
								size="icon-sm"
								className="rounded-lg"
								aria-label="Remove rule"
								onClick={() =>
									onChange({
										...config,
										channelPoints: config.channelPoints.filter((_, j) => j !== i),
									})
								}
							>
								<X className="size-4" />
							</Button>
						</div>
					))}
					{config.channelPoints.length === 0 && (
						<p className="text-xs text-muted-foreground">
							No channel-point rules. Add one and match the reward title exactly (or connect Twitch
							and redeem once to capture its id).
						</p>
					)}
				</div>
			</div>

			{/* overlay emoji */}
			<EmojiEditor emojis={config.emojis} onChange={(emojis) => onChange({ ...config, emojis })} />

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
								emoteCount: Math.max(0, Math.min(MAX_EMOTE_COUNT, Math.round(n(e.target.value)))),
							})
						}
					/>
					<span className="text-xs font-normal text-muted-foreground">
						How many emotes flood the bar on each add (0–{MAX_EMOTE_COUNT}, 0 = off).
					</span>
				</label>
			</div>

			{/* editable eyebrow label */}
			<div className="mt-4">
				<label className="flex max-w-xs flex-col gap-1 text-sm font-medium">
					Overlay label
					<Input
						className="h-9 rounded-lg"
						maxLength={MAX_LABEL_LEN}
						value={config.label}
						onChange={(e) => onChange({ ...config, label: e.target.value })}
						placeholder="SUBATHON"
					/>
					<span className="text-xs font-normal text-muted-foreground">
						The eyebrow text above the countdown. Toggle its visibility under “Overlay theme”.
					</span>
				</label>
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

			{/* overlay colours + chrome */}
			<ThemeEditor
				theme={config.theme}
				onChange={(theme) => onChange({ ...config, theme })}
				labelToggleText='Show "SUBATHON" label'
				statusToggleText="Show play/pause icon"
			/>
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
	const [showEmotes, setShowEmotes] = useState(false);
	const emotes = useQuery({
		...controlTrpc.twitch.listEmotes.queryOptions(),
		enabled: showEmotes,
		retry: false,
		staleTime: 5 * 60_000,
	});

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

			{/* Twitch channel emotes */}
			<div className="mt-3">
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
					<p className="text-xs text-destructive">
						{emotes.error instanceof Error ? emotes.error.message : "Couldn't load emotes."} Connect
						Twitch in the panel above, then retry.
					</p>
				) : emotes.data && emotes.data.length > 0 ? (
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
				) : (
					<p className="text-xs text-muted-foreground">No channel emotes found.</p>
				)}
			</div>
		</div>
	);
}

function Field({
	label,
	value,
	onChange,
}: {
	label: string;
	value: number;
	onChange: (v: string) => void;
}) {
	return (
		<label className="flex flex-col gap-1 text-xs text-muted-foreground">
			{label}
			<Input
				className="h-9 rounded-lg"
				type="number"
				value={String(value)}
				onChange={(e) => onChange(e.target.value)}
			/>
		</label>
	);
}
