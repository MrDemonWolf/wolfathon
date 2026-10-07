import { expect, test } from "bun:test";

import { tokenMatches } from "./routers/public";
import {
	defaultSettingsDoc,
	newOverlayToken,
	publicOverlaySoundConfig,
	rewardUnlockSoundEvent,
	withSettingsDefaults,
	type SettingsDoc,
} from "./settings";

test("final reward unlock uses party cue when enabled, then falls back to regular cue", () => {
	expect(
		rewardUnlockSoundEvent({ rewardUnlockEnabled: false, allRewardsEnabled: true }, true),
	).toBe("all-rewards");
	expect(
		rewardUnlockSoundEvent({ rewardUnlockEnabled: true, allRewardsEnabled: false }, true),
	).toBe("reward");
	expect(
		rewardUnlockSoundEvent({ rewardUnlockEnabled: false, allRewardsEnabled: false }, true),
	).toBeNull();
	expect(
		rewardUnlockSoundEvent({ rewardUnlockEnabled: false, allRewardsEnabled: true }, false),
	).toBeNull();
	expect(
		rewardUnlockSoundEvent({ rewardUnlockEnabled: true, allRewardsEnabled: true }, false),
	).toBe("reward");
});

test("overlay token is a 32-char hex secret with no hyphens", () => {
	const token = newOverlayToken();
	expect(token).toMatch(/^[0-9a-f]{32}$/);
});

test("overlay tokens are unique per call (rotation actually rotates)", () => {
	const tokens = new Set(Array.from({ length: 100 }, newOverlayToken));
	expect(tokens.size).toBe(100);
});

test("token gate: only an exact non-empty match passes", () => {
	const t = newOverlayToken();
	expect(tokenMatches(t, t)).toBe(true);
	expect(tokenMatches(t, "")).toBe(false); // tokenless / fresh OBS URL
	expect(tokenMatches(t, `${t}x`)).toBe(false); // wrong token
	expect(tokenMatches(t, t.toUpperCase())).toBe(false); // case-sensitive
	expect(tokenMatches("", "")).toBe(false); // empty stored never grants access
});

test("older settings rows backfill overlay sound options disabled by default", () => {
	const settings = withSettingsDefaults({ overlayToken: "old-token" });
	expect(settings.overlayToken).toBe("old-token");
	expect(settings.overlaySounds).toEqual({
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
	});
});

test("settings backfill rejects unknown built-in sound preset ids", () => {
	const settings = withSettingsDefaults({
		overlayToken: "old-token",
		overlaySounds: {
			wheelSpinEnabled: true,
			wheelPickEnabled: true,
			rewardUnlockEnabled: true,
			timerEndEnabled: true,
			allRewardsEnabled: true,
			timerWarningEnabled: true,
			wheelPickPreset: "unsupported-pick",
			rewardPreset: "not-a-preset",
			allRewardsPreset: "unsupported-party",
			timerWarningPreset: "cinematic-blast",
			timerPreset: "unavailable-alarm",
			customSound: null,
		},
	} as unknown as Partial<SettingsDoc>);
	expect(settings.overlaySounds.wheelTickEnabled).toBe(true);
	expect(settings.overlaySounds.wheelPickPreset).toBe("hype-reveal");
	expect(settings.overlaySounds.rewardPreset).toBe("bright-chime");
	expect(settings.overlaySounds.allRewardsPreset).toBe("party-pop");
	expect(settings.overlaySounds.timerWarningPreset).toBe("classic-alarm");
	expect(settings.overlaySounds.timerPreset).toBe("game-over");
});

test("public sound settings expose only enabled events and the active sound id", () => {
	const settings = defaultSettingsDoc();
	settings.overlaySounds.customSound = {
		id: "sound-v1",
		fileName: "chime.mp3",
		mimeType: "audio/mpeg",
		sizeBytes: 1024,
	};
	expect(publicOverlaySoundConfig(settings, "wheel")).toEqual({
		wheelTickEnabled: false,
		wheelPickEnabled: false,
		rewardUnlockEnabled: false,
		allRewardsEnabled: false,
		timerEndEnabled: false,
		timerWarningEnabled: false,
		customSoundId: null,
		wheelPickPreset: "hype-reveal",
		rewardPreset: "bright-chime",
		allRewardsPreset: "party-pop",
		timerWarningPreset: "classic-alarm",
		timerPreset: "game-over",
	});
	settings.overlaySounds.wheelTickEnabled = true;
	expect(publicOverlaySoundConfig(settings, "wheel")).toEqual({
		wheelTickEnabled: true,
		wheelPickEnabled: false,
		rewardUnlockEnabled: false,
		allRewardsEnabled: false,
		timerEndEnabled: false,
		timerWarningEnabled: false,
		customSoundId: null,
		wheelPickPreset: "hype-reveal",
		rewardPreset: "bright-chime",
		allRewardsPreset: "party-pop",
		timerWarningPreset: "classic-alarm",
		timerPreset: "game-over",
	});
	settings.overlaySounds.wheelPickEnabled = true;
	expect(publicOverlaySoundConfig(settings, "wheel").customSoundId).toBe("sound-v1");
	settings.overlaySounds.timerEndEnabled = true;
	expect(publicOverlaySoundConfig(settings, "reward")).toEqual({
		wheelTickEnabled: true,
		wheelPickEnabled: true,
		rewardUnlockEnabled: false,
		allRewardsEnabled: false,
		timerEndEnabled: true,
		timerWarningEnabled: false,
		customSoundId: null,
		wheelPickPreset: "hype-reveal",
		rewardPreset: "bright-chime",
		allRewardsPreset: "party-pop",
		timerWarningPreset: "classic-alarm",
		timerPreset: "game-over",
	});
	expect(publicOverlaySoundConfig(settings, "timer").customSoundId).toBe("sound-v1");
	settings.overlaySounds.wheelTickEnabled = false;
	settings.overlaySounds.wheelPickEnabled = false;
	settings.overlaySounds.timerEndEnabled = false;
	settings.overlaySounds.timerWarningEnabled = false;
	settings.overlaySounds.rewardUnlockEnabled = true;
	expect(publicOverlaySoundConfig(settings, "timer").customSoundId).toBeNull();
	expect(publicOverlaySoundConfig(settings, "reward").customSoundId).toBe("sound-v1");
	settings.overlaySounds.rewardUnlockEnabled = false;
	settings.overlaySounds.allRewardsEnabled = true;
	expect(publicOverlaySoundConfig(settings, "reward").customSoundId).toBe("sound-v1");
});
