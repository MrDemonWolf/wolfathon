"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
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
import { useCopyToClipboard } from "@wolfathon/ui/hooks/use-copy-to-clipboard";
import {
	Check,
	Copy,
	Disc3,
	ExternalLink,
	Eye,
	EyeOff,
	FlipHorizontal2,
	Gauge,
	Loader2,
	Maximize2,
	Minimize2,
	RotateCcw,
	Trophy,
	Volume2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { OVERLAY_SIZES } from "@/utils/constants";
import {
	MAX_OVERLAY_SOUND_BYTES,
	OVERLAY_SOUND_MIME_TYPES,
	REWARD_SOUND_PRESETS,
	TIMER_SOUND_PRESETS,
	TIMER_WARNING_SOUND_PRESETS,
	type OverlaySoundEvent,
	type SettingsDoc,
} from "@wolfathon/api/settings";
import {
	playOverlaySound,
	playWheelTickSequence,
	type PlayableOverlaySound,
} from "@/utils/overlay-sound";
import { controlTrpc, queryClient } from "@/utils/trpc";

const SOURCES = [
	{
		icon: Gauge,
		title: "Wolfathon timer",
		path: "/overlay/timer",
		// Matches the capsule's locked 131:20 aspect so the bar nearly fills the source.
		size: OVERLAY_SIZES.timer.size,
		compactSize: OVERLAY_SIZES.timer.compactSize,
		blurb:
			"Countdown bar that auto-adds time from subs, gifts, bits, and channel points; emotes flood the bar on each add.",
	},
	{
		icon: Trophy,
		title: "Rewards",
		path: "/overlay/rewards",
		size: OVERLAY_SIZES.rewards.size,
		compactSize: OVERLAY_SIZES.rewards.compactSize,
		blurb:
			"Current reward name with unlock celebration. Compact mode removes progress and upcoming rewards. Names only, no numbers.",
		mirrorable: true,
	},
	{
		icon: Disc3,
		title: "Wheel of dares",
		path: "/overlay/wheel",
		// Square source — the wheel fills a min-dimension box, so keep it 1:1.
		size: OVERLAY_SIZES.wheel.size,
		blurb:
			"Spinner of dares — spin it from the Wheel tab and this source whirls to the result on cue. Weighted slices, fixed top pointer.",
	},
] as const;

/**
 * Operator-only overlay URLs. Each URL carries the secret `?t=` token that the
 * public overlay API checks — without it OBS sources serve nothing. Resetting
 * rotates the token and instantly breaks the old URLs (re-paste in OBS).
 */
export function OverlaysTab() {
	const tokenOptions = controlTrpc.settings.get.queryOptions();
	const { data: settings, isLoading } = useQuery(tokenOptions);
	const customSoundId = settings?.overlaySounds.customSound?.id;
	const soundAsset = useQuery({
		...controlTrpc.settings.getSoundAsset.queryOptions({
			id: customSoundId ?? "00000000-0000-4000-8000-000000000000",
		}),
		enabled: customSoundId !== undefined,
	});

	// Overlay pages are served by this web origin; resolve it client-side.
	const [origin, setOrigin] = useState("");
	useEffect(() => setOrigin(window.location.origin), []);

	const rotate = useMutation(
		controlTrpc.settings.rotateOverlayToken.mutationOptions({
			onSuccess: (nextSettings) => {
				queryClient.setQueryData(tokenOptions.queryKey, nextSettings);
				toast.success("Overlay URLs reset — re-paste them into OBS");
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const updateSounds = useMutation(
		controlTrpc.settings.updateOverlaySounds.mutationOptions({
			onSuccess: (nextSettings) => queryClient.setQueryData(tokenOptions.queryKey, nextSettings),
			onError: (e) => toast.error(e.message),
		}),
	);
	const uploadSound = useMutation(
		controlTrpc.settings.uploadOverlaySound.mutationOptions({
			onSuccess: (nextSettings) => {
				queryClient.setQueryData(tokenOptions.queryKey, nextSettings);
				toast.success("Custom overlay sound uploaded");
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const removeSound = useMutation(
		controlTrpc.settings.removeOverlaySound.mutationOptions({
			onSuccess: (nextSettings) => {
				queryClient.setQueryData(tokenOptions.queryKey, nextSettings);
				toast.success("Custom sound removed — the built-in sounds are ready");
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	async function uploadSoundFile(file: File) {
		if (file.size > MAX_OVERLAY_SOUND_BYTES) {
			toast.error("Choose an audio file that is 256 KiB or smaller.");
			return;
		}
		const mimeType = OVERLAY_SOUND_MIME_TYPES.find((type) => type === file.type);
		if (!mimeType) {
			toast.error("Use an MP3, WAV, OGG, WebM, or M4A audio file.");
			return;
		}
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			let binary = "";
			for (let offset = 0; offset < bytes.length; offset += 0x8000) {
				binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
			}
			uploadSound.mutate({ fileName: file.name, mimeType, base64: btoa(binary) });
		} catch {
			toast.error("That sound file could not be read.");
		}
	}

	const token = settings?.overlayToken;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl panel-card p-5">
				<div className="min-w-0 flex-1">
					<h2 className="font-heading text-lg font-bold">Overlays</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Add each as an OBS <span className="text-foreground">Browser</span> source with a
						transparent background, sized to the dimensions on each card — then place it anywhere in
						your scene. Each URL holds a secret token — keep them private, and reset below if one
						ever leaks.
					</p>
				</div>
				<Button
					variant="outline"
					nativeButton={false}
					className="shrink-0 rounded-lg"
					render={
						<a
							href={origin ? `${origin}/overlay/demo` : undefined}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Preview all overlays with sample data"
						/>
					}
				>
					<Eye className="size-4" />
					Preview all
				</Button>
			</div>

			{SOURCES.map((s) => {
				const baseUrl = origin && token ? `${origin}${s.path}?t=${token}` : "";
				return (
					<OverlayCard
						key={s.path}
						{...s}
						baseUrl={baseUrl}
						demoBaseUrl={origin ? `${origin}${s.path}` : ""}
						mirrorable={"mirrorable" in s && s.mirrorable}
						compactSize={"compactSize" in s ? s.compactSize : undefined}
						loading={isLoading}
					/>
				);
			})}

			<section aria-label="Overlay sound settings" className="rounded-2xl panel-card p-5">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<div className="flex items-center gap-2">
							<Volume2 className="size-5 text-primary" />
							<h3 className="font-heading text-lg font-bold">Overlay sounds</h3>
						</div>
						<p className="mt-1 max-w-2xl text-sm text-muted-foreground">
							Turn on only the moments you want. Pick a built-in style for each cue, or upload one
							short sound to replace the one-shot cues.
						</p>
					</div>
				</div>

				<div className="mt-4 grid gap-3 sm:grid-cols-2">
					<SoundToggle
						id="wheel-spin-sound"
						label="Wheel ticks"
						description="Soft clicks play during the spin; the spin starts silently."
						checked={settings?.overlaySounds.wheelTickEnabled ?? false}
						disabled={isLoading || updateSounds.isPending}
						onCheckedChange={(checked) => updateSounds.mutate({ wheelTickEnabled: checked })}
						onPreview={() => playWheelTickSequence(previewSound(settings?.overlaySounds), 1.5, 12)}
					/>
					<SoundToggle
						id="wheel-pick-sound"
						label="Dare picked"
						description="Play when the wheel lands on a dare. Selecting a preset previews it."
						event="wheel-pick"
						preset={settings?.overlaySounds.wheelPickPreset ?? "hype-reveal"}
						presets={REWARD_SOUND_PRESETS}
						onPresetChange={(wheelPickPreset) => updateSounds.mutate({ wheelPickPreset })}
						onPresetPreview={(wheelPickPreset) =>
							playOverlaySound(
								previewSound(settings?.overlaySounds, null, { wheelPickPreset }),
								"wheel-pick",
							)
						}
						checked={settings?.overlaySounds.wheelPickEnabled ?? false}
						disabled={isLoading || updateSounds.isPending}
						onCheckedChange={(checked) => updateSounds.mutate({ wheelPickEnabled: checked })}
						onPreview={() => playOverlaySound(previewSound(settings?.overlaySounds), "wheel-pick")}
					/>
					<SoundToggle
						id="reward-unlock-sound"
						label="Reward unlock"
						description="Play when a reward unlocks on stream."
						event="reward"
						preset={settings?.overlaySounds.rewardPreset ?? "bright-chime"}
						presets={REWARD_SOUND_PRESETS}
						onPresetChange={(rewardPreset) => updateSounds.mutate({ rewardPreset })}
						onPresetPreview={(rewardPreset) =>
							playOverlaySound(
								previewSound(settings?.overlaySounds, null, { rewardPreset }),
								"reward",
							)
						}
						checked={settings?.overlaySounds.rewardUnlockEnabled ?? false}
						disabled={isLoading || updateSounds.isPending}
						onCheckedChange={(checked) => updateSounds.mutate({ rewardUnlockEnabled: checked })}
						onPreview={() => playOverlaySound(previewSound(settings?.overlaySounds), "reward")}
					/>
					<SoundToggle
						id="all-rewards-sound"
						label="All rewards unlocked"
						description="Play a party cue when the final reward unlocks."
						event="all-rewards"
						preset={settings?.overlaySounds.allRewardsPreset ?? "party-pop"}
						presets={REWARD_SOUND_PRESETS}
						onPresetChange={(allRewardsPreset) => updateSounds.mutate({ allRewardsPreset })}
						onPresetPreview={(allRewardsPreset) =>
							playOverlaySound(
								previewSound(settings?.overlaySounds, null, { allRewardsPreset }),
								"all-rewards",
							)
						}
						checked={settings?.overlaySounds.allRewardsEnabled ?? false}
						disabled={isLoading || updateSounds.isPending}
						onCheckedChange={(checked) => updateSounds.mutate({ allRewardsEnabled: checked })}
						onPreview={() => playOverlaySound(previewSound(settings?.overlaySounds), "all-rewards")}
					/>
					<SoundToggle
						id="timer-warning-sound"
						label="Final 30 seconds"
						description="Play an alarm once when a running timer enters its final 30 seconds."
						event="timer-warning"
						preset={settings?.overlaySounds.timerWarningPreset ?? "classic-alarm"}
						presets={TIMER_WARNING_SOUND_PRESETS}
						onPresetChange={(timerWarningPreset) => updateSounds.mutate({ timerWarningPreset })}
						onPresetPreview={(timerWarningPreset) =>
							playOverlaySound(
								previewSound(settings?.overlaySounds, null, { timerWarningPreset }),
								"timer-warning",
							)
						}
						checked={settings?.overlaySounds.timerWarningEnabled ?? false}
						disabled={isLoading || updateSounds.isPending}
						onCheckedChange={(checked) => updateSounds.mutate({ timerWarningEnabled: checked })}
						onPreview={() =>
							playOverlaySound(previewSound(settings?.overlaySounds), "timer-warning")
						}
					/>
					<SoundToggle
						id="timer-end-sound"
						label="Timer ending"
						description="Play when the countdown reaches zero."
						event="timer"
						preset={settings?.overlaySounds.timerPreset ?? "game-over"}
						presets={TIMER_SOUND_PRESETS}
						onPresetChange={(timerPreset) => updateSounds.mutate({ timerPreset })}
						onPresetPreview={(timerPreset) =>
							playOverlaySound(
								previewSound(settings?.overlaySounds, null, { timerPreset }),
								"timer",
							)
						}
						checked={settings?.overlaySounds.timerEndEnabled ?? false}
						disabled={isLoading || updateSounds.isPending}
						onCheckedChange={(checked) => updateSounds.mutate({ timerEndEnabled: checked })}
						onPreview={() => playOverlaySound(previewSound(settings?.overlaySounds), "timer")}
					/>
				</div>

				<div className="mt-4 grid gap-3 rounded-xl border border-border/70 bg-background/30 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
					<div className="min-w-0">
						<Label htmlFor="overlay-sound-file" className="text-sm font-semibold">
							Custom sound
						</Label>
						<p className="mt-1 text-xs text-muted-foreground">
							MP3, WAV, OGG, WebM, or M4A · up to 256 KiB. It replaces the pick, reward, and timer
							cues; wheel clicks stay built in. Upload audio you have rights to use.
						</p>
						{settings?.overlaySounds.customSound && (
							<p className="mt-2 truncate text-xs text-foreground/80">
								{settings.overlaySounds.customSound.fileName} ·{" "}
								{Math.max(1, Math.ceil(settings.overlaySounds.customSound.sizeBytes / 1024))} KiB
							</p>
						)}
					</div>
					<div className="flex flex-wrap items-center gap-2 sm:justify-end">
						{settings?.overlaySounds.customSound && (
							<>
								<Button
									variant="outline"
									size="sm"
									className="rounded-lg"
									disabled={!soundAsset.data || soundAsset.data.id !== customSoundId}
									onClick={() =>
										playOverlaySound(
											previewSound(
												settings.overlaySounds,
												soundAsset.data
													? {
															mimeType: soundAsset.data.mimeType,
															base64: soundAsset.data.base64,
														}
													: null,
											),
											"reward",
										)
									}
								>
									<Volume2 className="size-3.5" />
									Preview custom
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="rounded-lg"
									disabled={removeSound.isPending}
									onClick={() => removeSound.mutate()}
								>
									Remove
								</Button>
							</>
						)}
						<Input
							id="overlay-sound-file"
							type="file"
							accept="audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/mp4,.mp3,.wav,.ogg,.webm,.m4a"
							className="max-w-[19rem]"
							disabled={uploadSound.isPending}
							onChange={(event) => {
								const file = event.currentTarget.files?.[0];
								event.currentTarget.value = "";
								if (file) void uploadSoundFile(file);
							}}
						/>
						{uploadSound.isPending && (
							<span className="text-xs text-muted-foreground">Uploading…</span>
						)}
					</div>
				</div>
				<p className="mt-3 text-xs text-muted-foreground">
					When the custom file is removed, enabled events return to the built-in effects.
				</p>
			</section>

			{/* Danger footer — destructive reset sits directly under the source list. */}
			<div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
				<div className="eyebrow text-[0.65rem] text-destructive">Danger</div>
				<div className="mt-2 flex flex-wrap items-center justify-between gap-3">
					<div className="min-w-0">
						<h3 className="font-heading text-sm font-bold">Reset overlay URLs</h3>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Rotates the token. Use if a URL leaked. Old URLs stop working immediately.
						</p>
					</div>
					<AlertDialog>
						<AlertDialogTrigger
							render={
								<Button
									variant="destructive"
									className="shrink-0 rounded-lg"
									disabled={rotate.isPending}
								>
									{rotate.isPending ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										<RotateCcw className="size-4" />
									)}
									Reset
								</Button>
							}
						/>
						<AlertDialogContent>
							<AlertDialogTitle>Reset overlay URLs?</AlertDialogTitle>
							<AlertDialogDescription>
								The current URLs stop working immediately — every OBS source using them goes blank
								until you paste the new ones. Only do this if a URL leaked.
							</AlertDialogDescription>
							<AlertDialogFooter>
								<AlertDialogClose
									render={
										<Button variant="outline" className="rounded-lg">
											Cancel
										</Button>
									}
								/>
								<AlertDialogClose
									onClick={() => rotate.mutate()}
									render={
										<Button variant="destructive" className="rounded-lg">
											Reset URLs
										</Button>
									}
								/>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</div>
		</div>
	);
}

function SoundToggle<Preset extends string = string>({
	id,
	label,
	description,
	event,
	preset,
	presets,
	onPresetChange,
	onPresetPreview,
	checked,
	disabled,
	onCheckedChange,
	onPreview,
}: {
	id: string;
	label: string;
	description: string;
	event?: OverlaySoundEvent;
	preset?: Preset;
	presets?: readonly { id: Preset; label: string }[];
	onPresetChange?: (preset: Preset) => void;
	onPresetPreview?: (preset: Preset) => void;
	checked: boolean;
	disabled: boolean;
	onCheckedChange: (checked: boolean) => void;
	onPreview: () => void;
}) {
	const canChoosePreset =
		event !== undefined &&
		preset !== undefined &&
		presets !== undefined &&
		onPresetChange !== undefined;
	return (
		<div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/30 p-3">
			<div className="flex items-start gap-3">
				<Checkbox
					id={id}
					checked={checked}
					disabled={disabled}
					onCheckedChange={(value) => onCheckedChange(value === true)}
				/>
				<div className="min-w-0">
					<Label htmlFor={id} className="cursor-pointer text-sm font-semibold">
						{label}
					</Label>
					<p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
				</div>
			</div>
			<div className="flex items-center gap-2">
				{canChoosePreset && (
					<select
						aria-label={`${SOUND_EVENT_LABELS[event]} sound effect`}
						className="h-8 min-w-0 flex-1 rounded-[0.6rem] border border-input bg-input/40 px-2.5 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
						value={preset}
						disabled={disabled}
						onChange={(change) => {
							const selected = change.currentTarget.value as Preset;
							onPresetChange(selected);
							onPresetPreview?.(selected);
						}}
					>
						{presets.map((option) => (
							<option key={option.id} value={option.id}>
								{option.label}
							</option>
						))}
					</select>
				)}
				<Button
					variant="outline"
					size="sm"
					className="shrink-0 rounded-lg"
					disabled={disabled}
					onClick={onPreview}
				>
					<Volume2 className="size-3.5" />
					Preview
				</Button>
			</div>
		</div>
	);
}

const SOUND_EVENT_LABELS: Record<OverlaySoundEvent, string> = {
	"wheel-pick": "Dare picked",
	reward: "Reward",
	"all-rewards": "All rewards unlocked",
	"timer-warning": "Final 30 seconds",
	timer: "Timer",
};

function previewSound(
	sounds?: SettingsDoc["overlaySounds"],
	customSound: PlayableOverlaySound["customSound"] = null,
	presetOverrides: Partial<
		Pick<
			PlayableOverlaySound,
			"wheelPickPreset" | "rewardPreset" | "allRewardsPreset" | "timerWarningPreset" | "timerPreset"
		>
	> = {},
): PlayableOverlaySound {
	return {
		wheelTickEnabled: true,
		wheelPickEnabled: true,
		rewardUnlockEnabled: true,
		allRewardsEnabled: true,
		timerEndEnabled: true,
		timerWarningEnabled: true,
		customSound,
		wheelPickPreset: sounds?.wheelPickPreset ?? "hype-reveal",
		rewardPreset: sounds?.rewardPreset ?? "bright-chime",
		allRewardsPreset: sounds?.allRewardsPreset ?? "party-pop",
		timerWarningPreset: sounds?.timerWarningPreset ?? "classic-alarm",
		timerPreset: sounds?.timerPreset ?? "game-over",
		...presetOverrides,
	};
}

function OverlayCard({
	icon: Icon,
	title,
	size,
	blurb,
	baseUrl,
	demoBaseUrl,
	mirrorable,
	compactSize,
	loading,
}: {
	icon: typeof Gauge;
	title: string;
	size: string;
	blurb: string;
	baseUrl: string;
	demoBaseUrl: string;
	mirrorable?: boolean;
	compactSize?: string;
	loading: boolean;
}) {
	const { copied, copy } = useCopyToClipboard();
	// Mask the token by default — the operator may be screen-sharing this gated
	// panel on stream, and a visible `?t=` would leak the secret to chat.
	const [revealed, setRevealed] = useState(false);
	// Mirror the card to the right edge of its source via ?side=right.
	const [mirrored, setMirrored] = useState(false);
	const [compact, setCompact] = useState(false);
	const params = new URLSearchParams();
	if (compact && compactSize) params.set("minimal", "1");
	if (mirrorable && mirrored) params.set("side", "right");
	const extraParams = params.toString();
	const url = baseUrl && extraParams ? `${baseUrl}&${extraParams}` : baseUrl;
	const demoParams = new URLSearchParams({ demo: "1" });
	if (compact && compactSize) demoParams.set("minimal", "1");
	if (mirrorable && mirrored) demoParams.set("side", "right");
	const demoUrl = demoBaseUrl ? `${demoBaseUrl}?${demoParams}` : "";
	const display = url ? (revealed ? url : url.replace(/\?t=[^&]*/, "?t=••••••••••••")) : "";
	// Stable id so the Reveal control is programmatically tied to the value it toggles.
	const fieldId = `overlay-url-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

	return (
		<div className="rounded-2xl panel-card p-5">
			<div className="flex items-center gap-2">
				<Icon className="size-5 text-primary" />
				<h3 className="font-heading text-lg font-bold">{title}</h3>
				<span className="ml-auto rounded-full border border-border bg-background/60 px-2 py-0.5 font-mono text-xs text-muted-foreground">
					{compact && compactSize ? compactSize : size}
				</span>
			</div>
			<p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
			{compactSize && (
				<div className="mt-2 flex flex-wrap items-center justify-between gap-2">
					<span className="text-xs text-muted-foreground">Optional compact layout</span>
					<Button
						variant={compact ? "default" : "outline"}
						size="sm"
						className="rounded-lg"
						onClick={() => setCompact((value) => !value)}
						aria-label={compact ? "Use standard overlay layout" : "Use compact overlay layout"}
						aria-pressed={compact}
					>
						{compact ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
						{compact ? "Compact on" : "Compact mode"}
					</Button>
				</div>
			)}
			<div className="mt-3 flex flex-wrap items-center gap-2">
				{/* aria-live announces the masked↔revealed swap to assistive tech. */}
				<code
					id={fieldId}
					aria-live="polite"
					className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-xs"
				>
					{display || (loading ? "Loading…" : "…")}
				</code>
				{mirrorable && (
					<Button
						variant={mirrored ? "default" : "ghost"}
						size="sm"
						className="rounded-lg"
						onClick={() => setMirrored((m) => !m)}
						disabled={!baseUrl}
						aria-label="Mirror overlay to the right edge"
						aria-pressed={mirrored}
					>
						<FlipHorizontal2 className="size-4" />
					</Button>
				)}
				<Button
					variant="ghost"
					size="sm"
					className="rounded-lg"
					onClick={() => setRevealed((r) => !r)}
					disabled={!url}
					aria-label={revealed ? "Hide token" : "Reveal token"}
					aria-pressed={revealed}
					aria-controls={fieldId}
				>
					{revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
				</Button>
				<Button
					variant="outline"
					className="rounded-lg"
					onClick={() => copy(url, `${title} URL copied`)}
					disabled={!url}
				>
					{copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
					{copied ? "Copied" : "Copy"}
				</Button>
				{/* Open the live overlay in a new tab — handy to preview without OBS. */}
				<Button
					variant="outline"
					// Renders an <a>, not a native <button>, so drop the native-button semantics.
					nativeButton={false}
					// `disabled:` doesn't style anchors, so gate the click manually.
					className={`rounded-lg ${url ? "" : "pointer-events-none opacity-50"}`}
					aria-disabled={!url}
					render={
						<a
							href={url || undefined}
							target="_blank"
							rel="noopener noreferrer"
							aria-label={`Open ${title} overlay in a new tab`}
						/>
					}
				>
					<ExternalLink className="size-4" />
					Open
				</Button>
				<Button
					variant="outline"
					nativeButton={false}
					className={`rounded-lg ${demoUrl ? "" : "pointer-events-none opacity-50"}`}
					aria-disabled={!demoUrl}
					render={
						<a
							href={demoUrl || undefined}
							target="_blank"
							rel="noopener noreferrer"
							aria-label={`Preview ${title} with sample data`}
						/>
					}
				>
					<Eye className="size-4" />
					Demo
				</Button>
			</div>
		</div>
	);
}
