"use client";

import type { PublicOverlaySoundConfig } from "@wolfathon/api/settings";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { PlayableOverlaySound } from "@/utils/overlay-sound";
import { publicTrpc } from "@/utils/trpc";

/** Load the shared custom cue only when a live overlay has a sound version to play. */
export function usePlayableOverlaySound(
	soundConfig: PublicOverlaySoundConfig | null | undefined,
	token: string | null,
	enabled: boolean,
): PlayableOverlaySound | null {
	const soundId = soundConfig?.customSoundId;
	const { data: soundAsset } = useQuery({
		...publicTrpc.sound.getAsset.queryOptions({
			token: token ?? "",
			id: soundId ?? "00000000-0000-4000-8000-000000000000",
		}),
		enabled: enabled && token !== null && soundId !== null && soundId !== undefined,
	});

	return useMemo(() => {
		if (!soundConfig) return null;
		return {
			wheelTickEnabled: soundConfig.wheelTickEnabled,
			wheelPickEnabled: soundConfig.wheelPickEnabled,
			rewardUnlockEnabled: soundConfig.rewardUnlockEnabled,
			allRewardsEnabled: soundConfig.allRewardsEnabled,
			timerEndEnabled: soundConfig.timerEndEnabled,
			timerWarningEnabled: soundConfig.timerWarningEnabled,
			customSound:
				soundAsset?.id === soundId && soundAsset
					? { mimeType: soundAsset.mimeType, base64: soundAsset.base64 }
					: null,
			wheelPickPreset: soundConfig.wheelPickPreset,
			rewardPreset: soundConfig.rewardPreset,
			allRewardsPreset: soundConfig.allRewardsPreset,
			timerWarningPreset: soundConfig.timerWarningPreset,
			timerPreset: soundConfig.timerPreset,
		};
	}, [soundConfig, soundAsset, soundId]);
}
