"use client";

import { useQuery } from "@tanstack/react-query";

import { OverlayTokenError } from "@/components/overlay/overlay-token-error";
import { useOverlayToken } from "@/components/overlay/use-overlay-token";
import { WheelView } from "@/components/overlay/wheel-view";
import { publicTrpc } from "@/utils/trpc";

/**
 * Wheel-of-dares OBS browser source (square, transparent). Two polls: the slot
 * geometry changes rarely (~5s is plenty), while the live spin channel is polled
 * fast (~1.5s) so a triggered spin animates within a poll. The view dedupes by
 * `spinId`, so re-seeing the same pending spin never re-fires the animation.
 */
export default function WheelOverlayPage() {
	const token = useOverlayToken();
	const tokenInput = { token: token ?? "" };
	const enabled = token !== null;

	const { data: wheel, error } = useQuery({
		...publicTrpc.wheel.getPublic.queryOptions(tokenInput),
		enabled,
		refetchInterval: 5000,
		refetchIntervalInBackground: true,
	});

	const { data: pending } = useQuery({
		...publicTrpc.wheel.poll.queryOptions(tokenInput),
		enabled,
		refetchInterval: 1500,
		refetchIntervalInBackground: true,
	});

	return (
		<div className="@container fixed inset-0 overflow-hidden bg-transparent">
			<WheelView slots={wheel?.slots} theme={wheel?.theme} pending={pending ?? null} />
			<OverlayTokenError error={error} token={token} />
		</div>
	);
}
