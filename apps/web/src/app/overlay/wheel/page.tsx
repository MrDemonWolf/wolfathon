"use client";

import { useQuery } from "@tanstack/react-query";

import { OverlayTokenError } from "@/components/overlay/overlay-token-error";
import { useOverlayToken } from "@/components/overlay/use-overlay-token";
import { WheelView } from "@/components/overlay/wheel-view";
import { publicTrpc } from "@/utils/trpc";

/**
 * Wheel-of-dares OBS browser source (square, transparent). One poll (~3s) carries
 * the slot geometry, theme, and the live spin channel together, so a triggered
 * spin animates within a poll. The view dedupes by `spinId`, so re-seeing the
 * same pending spin never re-fires the animation.
 */
export default function WheelOverlayPage() {
	const token = useOverlayToken();
	const tokenInput = { token: token ?? "" };
	const enabled = token !== null;

	const { data: wheel, error } = useQuery({
		...publicTrpc.wheel.getPublic.queryOptions(tokenInput),
		enabled,
		refetchInterval: 3000,
		refetchIntervalInBackground: true,
	});

	return (
		<div className="@container fixed inset-0 overflow-hidden bg-transparent">
			<WheelView slots={wheel?.slots} theme={wheel?.theme} pending={wheel?.pending ?? null} />
			<OverlayTokenError error={error} token={token} />
		</div>
	);
}
