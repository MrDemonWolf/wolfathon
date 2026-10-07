import { randomToken } from "./util";

/** Upload limits keep small alert sounds in one D1 value instead of adding object storage. */
export const MAX_OVERLAY_SOUND_BYTES = 256 * 1024;
export const MAX_OVERLAY_SOUND_BASE64_LENGTH = Math.ceil(MAX_OVERLAY_SOUND_BYTES / 3) * 4;

export const OVERLAY_SOUND_MIME_TYPES = [
	"audio/mpeg",
	"audio/wav",
	"audio/ogg",
	"audio/webm",
	"audio/mp4",
] as const;

export const REWARD_SOUND_PRESET_IDS = [
	"bright-chime",
	"sparkle",
	"victory-fanfare",
	"warm-bell",
	"party-pop",
	"hype-reveal",
] as const;
export const TIMER_SOUND_PRESET_IDS = [
	"game-over",
	"gentle-alarm",
	"classic-alarm",
	"cinematic-blast",
] as const;
export const TIMER_WARNING_SOUND_PRESET_IDS = ["gentle-alarm", "classic-alarm"] as const;
export const REWARD_SOUND_PRESETS: readonly { id: RewardSoundPreset; label: string }[] = [
	{ id: "bright-chime", label: "Bright chime" },
	{ id: "sparkle", label: "Sparkle" },
	{ id: "victory-fanfare", label: "Victory fanfare" },
	{ id: "warm-bell", label: "Warm bell" },
	{ id: "party-pop", label: "Party pop" },
	{ id: "hype-reveal", label: "Hype reveal" },
];
export const TIMER_SOUND_PRESETS: readonly { id: TimerSoundPreset; label: string }[] = [
	{ id: "game-over", label: "Game over" },
	{ id: "gentle-alarm", label: "Gentle alarm" },
	{ id: "classic-alarm", label: "Classic alarm" },
	{ id: "cinematic-blast", label: "Cinematic blast" },
];
export const TIMER_WARNING_SOUND_PRESETS: readonly {
	id: TimerWarningSoundPreset;
	label: string;
}[] = [
	{ id: "gentle-alarm", label: "Gentle alarm" },
	{ id: "classic-alarm", label: "Classic alarm" },
];

export type OverlaySoundMimeType = (typeof OVERLAY_SOUND_MIME_TYPES)[number];
export type OverlaySoundEvent = "wheel-pick" | "reward" | "all-rewards" | "timer-warning" | "timer";
export type OverlaySoundScope = "wheel" | "reward" | "timer";
export type RewardSoundPreset = (typeof REWARD_SOUND_PRESET_IDS)[number];
export type TimerSoundPreset = (typeof TIMER_SOUND_PRESET_IDS)[number];
export type TimerWarningSoundPreset = (typeof TIMER_WARNING_SOUND_PRESET_IDS)[number];

export type OverlaySoundMeta = {
	id: string;
	fileName: string;
	mimeType: OverlaySoundMimeType;
	sizeBytes: number;
};

/** Encoded file lives in its own D1 row so public polling never reads the audio blob. */
export type OverlaySoundAsset = OverlaySoundMeta & { base64: string };

export type OverlaySoundConfig = {
	wheelTickEnabled: boolean;
	wheelPickEnabled: boolean;
	rewardUnlockEnabled: boolean;
	allRewardsEnabled: boolean;
	timerEndEnabled: boolean;
	timerWarningEnabled: boolean;
	wheelPickPreset: RewardSoundPreset;
	rewardPreset: RewardSoundPreset;
	allRewardsPreset: RewardSoundPreset;
	timerWarningPreset: TimerWarningSoundPreset;
	timerPreset: TimerSoundPreset;
	customSound: OverlaySoundMeta | null;
};

export type PublicOverlaySoundConfig = Omit<OverlaySoundConfig, "customSound"> & {
	customSoundId: string | null;
};

/** Pick the configured reward cue without silencing a final unlock when party audio is off. */
export function rewardUnlockSoundEvent(
	sound: Pick<OverlaySoundConfig, "rewardUnlockEnabled" | "allRewardsEnabled"> | null | undefined,
	finalUnlock: boolean,
): Extract<OverlaySoundEvent, "reward" | "all-rewards"> | null {
	if (finalUnlock && sound?.allRewardsEnabled) return "all-rewards";
	return sound?.rewardUnlockEnabled ? "reward" : null;
}

/** Operator settings doc (singleton row `settings` in `tracker_state`). */
export type SettingsDoc = { overlayToken: string; overlaySounds: OverlaySoundConfig };

/** A fresh overlay token (a 32-char hex {@link randomToken}). */
export function newOverlayToken(): string {
	return randomToken();
}

export function defaultSettingsDoc(): SettingsDoc {
	return {
		overlayToken: newOverlayToken(),
		overlaySounds: {
			wheelTickEnabled: false,
			wheelPickEnabled: false,
			rewardUnlockEnabled: false,
			allRewardsEnabled: false,
			timerEndEnabled: false,
			timerWarningEnabled: false,
			wheelPickPreset: "hype-reveal",
			rewardPreset: "bright-chime",
			allRewardsPreset: "party-pop",
			timerWarningPreset: "classic-alarm",
			timerPreset: "game-over",
			customSound: null,
		},
	};
}

/** Backfill settings persisted before overlay sounds were added. */
export function withSettingsDefaults(raw: Partial<SettingsDoc>): SettingsDoc {
	const sounds = raw.overlaySounds;
	const legacyWheelSpinEnabled = (
		sounds as (OverlaySoundConfig & { wheelSpinEnabled?: boolean }) | undefined
	)?.wheelSpinEnabled;
	const meta = sounds?.customSound;
	const validMime = OVERLAY_SOUND_MIME_TYPES.includes(meta?.mimeType as OverlaySoundMimeType);
	const customSound =
		meta &&
		typeof meta.id === "string" &&
		typeof meta.fileName === "string" &&
		validMime &&
		typeof meta.sizeBytes === "number" &&
		meta.sizeBytes > 0 &&
		meta.sizeBytes <= MAX_OVERLAY_SOUND_BYTES
			? meta
			: null;

	return {
		overlayToken:
			typeof raw.overlayToken === "string" && raw.overlayToken
				? raw.overlayToken
				: newOverlayToken(),
		overlaySounds: {
			wheelTickEnabled: sounds?.wheelTickEnabled === true || legacyWheelSpinEnabled === true,
			wheelPickEnabled: sounds?.wheelPickEnabled === true,
			rewardUnlockEnabled: sounds?.rewardUnlockEnabled === true,
			allRewardsEnabled: sounds?.allRewardsEnabled === true,
			timerEndEnabled: sounds?.timerEndEnabled === true,
			timerWarningEnabled: sounds?.timerWarningEnabled === true,
			wheelPickPreset: REWARD_SOUND_PRESET_IDS.includes(
				sounds?.wheelPickPreset as RewardSoundPreset,
			)
				? (sounds?.wheelPickPreset as RewardSoundPreset)
				: "hype-reveal",
			rewardPreset: REWARD_SOUND_PRESET_IDS.includes(sounds?.rewardPreset as RewardSoundPreset)
				? (sounds?.rewardPreset as RewardSoundPreset)
				: "bright-chime",
			allRewardsPreset: REWARD_SOUND_PRESET_IDS.includes(
				sounds?.allRewardsPreset as RewardSoundPreset,
			)
				? (sounds?.allRewardsPreset as RewardSoundPreset)
				: "party-pop",
			timerWarningPreset: TIMER_WARNING_SOUND_PRESET_IDS.includes(
				sounds?.timerWarningPreset as TimerWarningSoundPreset,
			)
				? (sounds?.timerWarningPreset as TimerWarningSoundPreset)
				: "classic-alarm",
			timerPreset: TIMER_SOUND_PRESET_IDS.includes(sounds?.timerPreset as TimerSoundPreset)
				? (sounds?.timerPreset as TimerSoundPreset)
				: "game-over",
			customSound,
		},
	};
}

/** Public overlays learn only whether to play and which version of the audio to fetch. */
export function publicOverlaySoundConfig(
	settings: SettingsDoc,
	scope: OverlaySoundScope,
): PublicOverlaySoundConfig {
	const enabled =
		scope === "wheel"
			? settings.overlaySounds.wheelPickEnabled
			: scope === "reward"
				? settings.overlaySounds.rewardUnlockEnabled || settings.overlaySounds.allRewardsEnabled
				: settings.overlaySounds.timerEndEnabled || settings.overlaySounds.timerWarningEnabled;
	return {
		wheelTickEnabled: settings.overlaySounds.wheelTickEnabled,
		wheelPickEnabled: settings.overlaySounds.wheelPickEnabled,
		rewardUnlockEnabled: settings.overlaySounds.rewardUnlockEnabled,
		allRewardsEnabled: settings.overlaySounds.allRewardsEnabled,
		timerEndEnabled: settings.overlaySounds.timerEndEnabled,
		timerWarningEnabled: settings.overlaySounds.timerWarningEnabled,
		customSoundId: enabled ? (settings.overlaySounds.customSound?.id ?? null) : null,
		wheelPickPreset: settings.overlaySounds.wheelPickPreset,
		rewardPreset: settings.overlaySounds.rewardPreset,
		allRewardsPreset: settings.overlaySounds.allRewardsPreset,
		timerWarningPreset: settings.overlaySounds.timerWarningPreset,
		timerPreset: settings.overlaySounds.timerPreset,
	};
}
