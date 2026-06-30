"use client";

import { useQuery } from "@tanstack/react-query";

import { OverlayTokenError } from "@/components/overlay/overlay-token-error";
import { TimerView } from "@/components/overlay/timer-view";
import { useOverlayToken } from "@/components/overlay/use-overlay-token";
import { publicTrpc } from "@/utils/trpc";

/**
 * Wolfathon timer OBS browser source (1920×1080, transparent). The overlay counts
 * down locally to the frame, so a 5s poll stays smooth while keeping daily request
 * volume well under the Cloudflare Workers free tier (a 2s poll ≈ 43k req/day).
 */
export default function TimerOverlayPage() {
	const token = useOverlayToken();
	const { data, error } = useQuery({
		...publicTrpc.timer.getPublic.queryOptions({ token: token ?? "" }),
		enabled: token !== null,
		refetchInterval: 5000,
		refetchIntervalInBackground: true,
	});

	return (
		<div className="@container fixed inset-0 overflow-hidden bg-transparent">
			<TimerView data={data} />
			<OverlayTokenError error={error} token={token} />
		</div>
	);
}
