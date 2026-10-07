"use client";

import { useQuery } from "@tanstack/react-query";

import { OverlayShell } from "@/components/overlay/overlay-shell";
import { OverlayView } from "@/components/overlay/overlay-view";
import { usePlayableOverlaySound } from "@/components/overlay/use-playable-overlay-sound";
import { useOverlayDisplayOptions } from "@/components/overlay/use-overlay-display-options";
import { useOverlayToken } from "@/components/overlay/use-overlay-token";
import { REWARDS_POLL_MS } from "@/utils/constants";
import { demoRewardsData } from "@/utils/demo-data";
import { publicTrpc } from "@/utils/trpc";

/**
 * Rewards OBS browser source (760×540, transparent). Rewards change rarely
 * (only on a sub/unlock), so a 10s poll is plenty and keeps daily request volume
 * well under the Cloudflare Workers free tier.
 */
export default function RewardsOverlayPage() {
	const token = useOverlayToken();
	const { ready, demo, minimal, align } = useOverlayDisplayOptions();
	const { data, error } = useQuery({
		...publicTrpc.state.getPublic.queryOptions({ token: token ?? "" }),
		enabled: ready && !demo && token !== null,
		refetchInterval: REWARDS_POLL_MS,
		refetchIntervalInBackground: true,
	});
	const sound = usePlayableOverlaySound(data?.sound, token, ready && !demo);

	if (!ready) return null;
	if (demo) {
		return (
			<div
				className="@container fixed inset-0 overflow-hidden bg-transparent"
				data-testid="overlay-demo-rewards"
			>
				<OverlayView data={demoRewardsData()} align={align} minimal={minimal} />
			</div>
		);
	}

	return (
		<OverlayShell token={token} error={error}>
			<OverlayView data={data} align={align} minimal={minimal} sound={sound} />
		</OverlayShell>
	);
}
