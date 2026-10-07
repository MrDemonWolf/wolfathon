"use client";

import dynamic from "next/dynamic";
import type { OverlayPendingSpin } from "@wolfathon/api/wheel";
import { Button } from "@wolfathon/ui/components/button";
import { RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { OverlayView } from "@/components/overlay/overlay-view";
import {
	playTimerEndPreviewCue,
	playTimerPreviewCue,
	type PlayableOverlaySound,
} from "@/utils/overlay-sound";
import {
	demoOverlayTheme,
	demoRewardsData,
	demoTimerData,
	demoWheelSlots,
	REWARD_DEMO_STAGES,
	TIMER_DEMO_STAGES,
	type RewardDemoStage,
	type TimerDemoStage,
} from "@/utils/demo-data";

import { PreviewFrame } from "./preview-frame";

const SAMPLE_PREVIEW_SOUND: PlayableOverlaySound = {
	wheelTickEnabled: true,
	wheelPickEnabled: true,
	rewardUnlockEnabled: true,
	allRewardsEnabled: true,
	timerEndEnabled: true,
	timerWarningEnabled: true,
	customSound: null,
	wheelPickPreset: "hype-reveal",
	rewardPreset: "bright-chime",
	allRewardsPreset: "party-pop",
	timerWarningPreset: "classic-alarm",
	timerPreset: "game-over",
};
const TIMER_STAGE_LABELS: Record<TimerDemoStage, string> = {
	running: "Running",
	paused: "Paused",
	"last-30-seconds": "Final 30 seconds",
	"time-added": "Time added",
	ended: "Ended",
};
const REWARD_STAGE_LABELS: Record<RewardDemoStage, string> = {
	progress: "Progress",
	almost: "Almost there",
	unlocked: "Just unlocked",
	complete: "All unlocked",
};

// These animated views use browser time and SVG trigonometry; render them after
// hydration so their first values are generated in the browser only.
const TimerView = dynamic(
	() => import("@/components/overlay/timer-view").then((module) => module.TimerView),
	{ ssr: false },
);
const WheelView = dynamic(
	() => import("@/components/overlay/wheel-view").then((module) => module.WheelView),
	{ ssr: false },
);

export function DemoOverlayGallery() {
	const [theme] = useState(() => demoOverlayTheme());
	const [rewardStage, setRewardStage] = useState<RewardDemoStage>("progress");
	const [timerStage, setTimerStage] = useState<TimerDemoStage>("running");
	const rewards = useMemo(() => demoRewardsData(rewardStage), [rewardStage]);
	const timer = useMemo(() => demoTimerData(Date.now(), timerStage), [timerStage]);
	const [slots] = useState(() => demoWheelSlots());
	const [spin, setSpin] = useState<OverlayPendingSpin>(null);
	const [spinning, setSpinning] = useState(false);
	const spinNumber = useRef(0);
	const spinLock = useRef<ReturnType<typeof setTimeout> | null>(null);
	const clearSpin = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (spinLock.current) clearTimeout(spinLock.current);
			if (clearSpin.current) clearTimeout(clearSpin.current);
		},
		[],
	);

	function spinDemoWheel() {
		if (spinning) return;
		setSpinning(true);
		const spinId = `demo-${++spinNumber.current}`;
		const totalWeight = slots.reduce((total, slot) => total + slot.weight, 0);
		const [randomValue] = crypto.getRandomValues(new Uint32Array(1));
		let bucket = (randomValue ?? 0) % totalWeight;
		let targetIndex = 0;
		for (const slot of slots) {
			if (bucket < slot.weight) {
				targetIndex = slot.index;
				break;
			}
			bucket -= slot.weight;
		}
		setSpin({ spinId, targetIndex, at: Date.now() });
		clearSpin.current = setTimeout(() => setSpin(null), 500);
		spinLock.current = setTimeout(() => setSpinning(false), 12_000);
	}

	return (
		<div className="min-h-screen bg-[#071020] px-4 py-8 text-white sm:px-6 lg:px-10">
			<main className="mx-auto flex max-w-7xl flex-col gap-6">
				<header className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<p className="eyebrow text-primary">Preview • sample data</p>
						<h1 className="mt-1 font-heading text-3xl font-bold">Wolfathon overlays</h1>
						<p className="mt-2 max-w-2xl text-sm text-white/65">
							A safe preview of the timer, rewards, and wheel. Sample data only; this page does not
							connect to your stream or change your settings.
						</p>
					</div>
					<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70">
						No token or account required
					</span>
				</header>

				<section aria-label="Timer overlay previews" className="flex flex-col gap-3">
					<StagePicker
						label="Timer example stage"
						value={timerStage}
						options={TIMER_DEMO_STAGES.map((stage) => ({
							value: stage,
							label: TIMER_STAGE_LABELS[stage],
						}))}
						onChange={(stage) => {
							if (stage === "time-added") playTimerPreviewCue();
							setTimerStage(stage);
						}}
						previewLabel="Preview timer ending"
						onPreview={() => playTimerEndPreviewCue(SAMPLE_PREVIEW_SOUND)}
					/>
					<div className="grid gap-4 lg:grid-cols-2">
						<PreviewFrame label="Timer • standard" aspectClass="aspect-[131/20]">
							<TimerView data={timer} sound={SAMPLE_PREVIEW_SOUND} />
						</PreviewFrame>
						<PreviewFrame label="Timer • compact" aspectClass="aspect-[25/4]">
							<TimerView data={timer} minimal sound={SAMPLE_PREVIEW_SOUND} />
						</PreviewFrame>
					</div>
				</section>

				<section aria-label="Rewards overlay previews" className="flex flex-col gap-3">
					<StagePicker
						label="Rewards example stage"
						value={rewardStage}
						options={REWARD_DEMO_STAGES.map((stage) => ({
							value: stage,
							label: REWARD_STAGE_LABELS[stage],
						}))}
						onChange={setRewardStage}
					/>
					<div className="grid gap-4 lg:grid-cols-2">
						<PreviewFrame label="Rewards • standard" aspectClass="aspect-[38/27]">
							<OverlayView data={rewards} sound={SAMPLE_PREVIEW_SOUND} />
						</PreviewFrame>
						<PreviewFrame label="Rewards • compact" aspectClass="aspect-[38/9]">
							<OverlayView data={rewards} minimal sound={SAMPLE_PREVIEW_SOUND} />
						</PreviewFrame>
					</div>
				</section>

				<section
					aria-label="Wheel of dares preview"
					className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]"
				>
					<div className="min-w-0">
						<PreviewFrame label="Wheel of dares • sample slots" aspectClass="aspect-square">
							<WheelView slots={slots} theme={theme} pending={spin} sound={SAMPLE_PREVIEW_SOUND} />
						</PreviewFrame>
					</div>
					<div className="flex flex-col justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
						<div>
							<h2 className="font-heading text-lg font-bold">Try a sample spin</h2>
							<p className="mt-1 text-sm text-white/65">
								Spin the real wheel animation with local sample dares. Nothing is sent to your live
								overlay.
							</p>
						</div>
						<Button onClick={spinDemoWheel} disabled={spinning} className="w-fit rounded-lg">
							<RotateCw className="size-4" />
							{spinning ? "Wheel spinning…" : "Spin sample wheel"}
						</Button>
						<ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-white/55">
							{slots.map((slot) => (
								<li key={slot.index}>{slot.label}</li>
							))}
						</ul>
					</div>
				</section>
			</main>
		</div>
	);
}

function StagePicker<T extends string>({
	label,
	value,
	options,
	onChange,
	previewLabel,
	onPreview,
}: {
	label: string;
	value: T;
	options: { value: T; label: string }[];
	onChange: (value: T) => void;
	previewLabel?: string;
	onPreview?: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<span className="eyebrow text-[0.65rem]">{label}</span>
			<div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
				{options.map((option) => (
					<Button
						key={option.value}
						size="sm"
						variant={value === option.value ? "secondary" : "ghost"}
						aria-pressed={value === option.value}
						className="h-7 rounded-lg px-2.5 text-xs"
						onClick={() => onChange(option.value)}
					>
						{option.label}
					</Button>
				))}
				{previewLabel && onPreview && (
					<Button
						size="sm"
						variant="outline"
						className="h-7 rounded-lg px-2.5 text-xs"
						onClick={onPreview}
					>
						{previewLabel}
					</Button>
				)}
			</div>
		</div>
	);
}
