import { stripNotes, type Data, type PublicData } from "@wolfathon/api/state";
import {
	defaultOverlayTheme,
	resolveThemeGradient,
	resolveTextColor,
	type OverlayTheme,
} from "@wolfathon/api/theme";
import type { PublicTimer } from "@wolfathon/api/timer";
import { WHEEL_PALETTE, type PublicWheelSlot } from "@wolfathon/api/wheel";

export const REWARD_DEMO_STAGES = ["progress", "almost", "unlocked", "complete"] as const;
export type RewardDemoStage = (typeof REWARD_DEMO_STAGES)[number];

export const TIMER_DEMO_STAGES = [
	"running",
	"paused",
	"last-30-seconds",
	"time-added",
	"ended",
] as const;
export type TimerDemoStage = (typeof TIMER_DEMO_STAGES)[number];

/** Shared sample theme used by the token-free overlay previews. */
export function demoOverlayTheme(): OverlayTheme {
	return { ...defaultOverlayTheme(), showWheelIdle: true };
}

/** Public rewards payload built through the same privacy filter as live data. */
export function demoRewardsData(stage: RewardDemoStage = "progress"): PublicData {
	const theme = demoOverlayTheme();
	const unlockedCount = stage === "complete" ? 5 : stage === "unlocked" ? 3 : 2;
	const currentSubs =
		stage === "almost" ? 49 : stage === "unlocked" ? 50 : stage === "complete" ? 100 : 42;
	const data: Data = {
		goals: [
			{
				id: "sample-1",
				reward: "Pick the next stream game",
				unlocked: unlockedCount > 0,
				target: 10,
			},
			{ id: "sample-2", reward: "Chat chooses a dare", unlocked: unlockedCount > 1, target: 25 },
			{ id: "sample-3", reward: "VIP for one month", unlocked: unlockedCount > 2, target: 50 },
			{ id: "sample-4", reward: "Play with a viewer", unlocked: unlockedCount > 3, target: 75 },
			{
				id: "sample-5",
				reward: "Mystery wolf-pack reward",
				unlocked: unlockedCount > 4,
				target: 100,
			},
		],
		currentIndex: unlockedCount,
		currentSubs,
		theme,
		freezeMetTargets: true,
		goalsRev: 0,
	};
	return stripNotes(data);
}

/** A running countdown with representative stream settings and no live events. */
export function demoTimerData(now = Date.now(), stage: TimerDemoStage = "running"): PublicTimer {
	const theme = demoOverlayTheme();
	const running = stage === "running" || stage === "last-30-seconds" || stage === "time-added";
	const remainingMs =
		stage === "last-30-seconds"
			? 24_000
			: stage === "ended"
				? 0
				: 26 * 60 * 60 * 1000 + 42 * 60 * 1000 + 18 * 1000;
	return {
		running,
		endsAt: running ? now + remainingMs : null,
		remainingMs,
		serverNow: now,
		emojis: ["🐺", "🌙", "✨", "🐾"],
		emoteCount: 8,
		emoteScale: 2,
		emoteDirection: "up",
		gradient: resolveThemeGradient(theme),
		textColor: resolveTextColor(theme),
		font: theme.font,
		corners: theme.corners,
		autoPaused: stage === "paused",
		showLabel: theme.showLabel,
		label: theme.label,
		showStatus: theme.showStatus,
		showUnits: theme.showUnits,
		showEventSource: true,
		lastEvent: stage === "time-added" ? { at: now, minutes: 15, label: "Tier 1 Sub" } : null,
	};
}

const DEMO_DARES = [
	"Howl on mic",
	"10 push-ups",
	"Pick a song",
	"Dance break",
	"Best villain laugh",
	"Chat picks a dare",
	"Compliment someone",
	"Meme voice for 1 min",
];

/** Enabled wheel slices with example weights and the normal wheel palette. */
export function demoWheelSlots(): PublicWheelSlot[] {
	return DEMO_DARES.map((label, index) => ({
		index,
		label,
		color: WHEEL_PALETTE[index % WHEEL_PALETTE.length] ?? "#2f6df0",
		weight: index === 0 ? 2 : 1,
	}));
}
