"use client";

import { useQuery } from "@tanstack/react-query";

import { OverlayShell } from "@/components/overlay/overlay-shell";
import { TimerView } from "@/components/overlay/timer-view";
import { usePlayableOverlaySound } from "@/components/overlay/use-playable-overlay-sound";
import { useOverlayDisplayOptions } from "@/components/overlay/use-overlay-display-options";
import { useOverlayToken } from "@/components/overlay/use-overlay-token";
import { TIMER_POLL_MS } from "@/utils/constants";
import { demoTimerData } from "@/utils/demo-data";
import { publicTrpc } from "@/utils/trpc";

/**
 * Wolfathon timer OBS browser source (1310×200, transparent). The overlay counts
 * down locally to the frame, so a 5s poll stays smooth while keeping daily request
 * volume well under the Cloudflare Workers free tier (a 2s poll ≈ 43k req/day).
 */
export default function TimerOverlayPage() {
	const token = useOverlayToken();
	const { ready, demo, minimal } = useOverlayDisplayOptions();
	const { data, error } = useQuery({
		...publicTrpc.timer.getPublic.queryOptions({ token: token ?? "" }),
		enabled: ready && !demo && token !== null,
		refetchInterval: TIMER_POLL_MS,
		refetchIntervalInBackground: true,
	});
	const sound = usePlayableOverlaySound(data?.sound, token, ready && !demo);

	if (!ready) return null;
	if (demo) {
		return (
			<div
				className="@container fixed inset-0 overflow-hidden bg-transparent"
				data-testid="overlay-demo-timer"
			>
				<TimerView data={demoTimerData()} minimal={minimal} />
			</div>
		);
	}

	return (
		<OverlayShell token={token} error={error}>
			<TimerView data={data} minimal={minimal} sound={sound} />
		</OverlayShell>
	);
}
