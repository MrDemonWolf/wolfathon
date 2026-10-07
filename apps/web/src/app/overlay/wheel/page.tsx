"use client";

import { useQuery } from "@tanstack/react-query";

import { OverlayShell } from "@/components/overlay/overlay-shell";
import { usePlayableOverlaySound } from "@/components/overlay/use-playable-overlay-sound";
import { useOverlayDisplayOptions } from "@/components/overlay/use-overlay-display-options";
import { useOverlayToken } from "@/components/overlay/use-overlay-token";
import { WheelView } from "@/components/overlay/wheel-view";
import { LIVE_POLL_MS } from "@/utils/constants";
import { demoOverlayTheme, demoWheelSlots } from "@/utils/demo-data";
import { publicTrpc } from "@/utils/trpc";

/**
 * Wheel-of-dares OBS browser source (square, transparent). One poll (~3s) carries
 * the slot geometry, theme, and the live spin channel together, so a triggered
 * spin animates within a poll. The view dedupes by `spinId`, so re-seeing the
 * same pending spin never re-fires the animation.
 */
export default function WheelOverlayPage() {
	const token = useOverlayToken();
	const { ready, demo } = useOverlayDisplayOptions();
	const { data: wheel, error } = useQuery({
		...publicTrpc.wheel.getPublic.queryOptions({ token: token ?? "" }),
		enabled: ready && !demo && token !== null,
		refetchInterval: LIVE_POLL_MS,
		refetchIntervalInBackground: true,
	});
	const sound = usePlayableOverlaySound(wheel?.sound, token, ready && !demo);

	if (!ready) return null;
	if (demo) {
		return (
			<div
				className="@container fixed inset-0 overflow-hidden bg-transparent"
				data-testid="overlay-demo-wheel"
			>
				<WheelView slots={demoWheelSlots()} theme={demoOverlayTheme()} pending={null} />
			</div>
		);
	}

	return (
		<OverlayShell token={token} error={error}>
			<WheelView
				slots={wheel?.slots}
				theme={wheel?.theme}
				pending={wheel?.pending ?? null}
				sound={sound}
			/>
		</OverlayShell>
	);
}
