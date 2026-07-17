"use client";

import { useQuery } from "@tanstack/react-query";

import { OverlayShell } from "@/components/overlay/overlay-shell";
import { TimerView } from "@/components/overlay/timer-view";
import { useOverlayToken } from "@/components/overlay/use-overlay-token";
import { TIMER_POLL_MS } from "@/utils/constants";
import { publicTrpc } from "@/utils/trpc";

/**
 * Wolfathon timer OBS browser source (1310×200, transparent). The overlay counts
 * down locally to the frame, so a 5s poll stays smooth while keeping daily request
 * volume well under the Cloudflare Workers free tier (a 2s poll ≈ 43k req/day).
 */
export default function TimerOverlayPage() {
	const token = useOverlayToken();
	const { data, error } = useQuery({
		...publicTrpc.timer.getPublic.queryOptions({ token: token ?? "" }),
		enabled: token !== null,
		refetchInterval: TIMER_POLL_MS,
		refetchIntervalInBackground: true,
	});

	return (
		<OverlayShell token={token} error={error}>
			<TimerView data={data} />
		</OverlayShell>
	);
}
