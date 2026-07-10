"use client";

import { useQuery } from "@tanstack/react-query";

import { OverlayShell } from "@/components/overlay/overlay-shell";
import { useOverlayToken } from "@/components/overlay/use-overlay-token";
import { WheelView } from "@/components/overlay/wheel-view";
import { LIVE_POLL_MS } from "@/utils/constants";
import { publicTrpc } from "@/utils/trpc";

/**
 * Wheel-of-dares OBS browser source (square, transparent). One poll (~3s) carries
 * the slot geometry, theme, and the live spin channel together, so a triggered
 * spin animates within a poll. The view dedupes by `spinId`, so re-seeing the
 * same pending spin never re-fires the animation.
 */
export default function WheelOverlayPage() {
	const token = useOverlayToken();
	const { data: wheel, error } = useQuery({
		...publicTrpc.wheel.getPublic.queryOptions({ token: token ?? "" }),
		enabled: token !== null,
		refetchInterval: LIVE_POLL_MS,
		refetchIntervalInBackground: true,
	});

	return (
		<OverlayShell token={token} error={error}>
			<WheelView slots={wheel?.slots} theme={wheel?.theme} pending={wheel?.pending ?? null} />
		</OverlayShell>
	);
}
