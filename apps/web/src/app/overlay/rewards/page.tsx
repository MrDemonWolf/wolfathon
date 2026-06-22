"use client";

import { useQuery } from "@tanstack/react-query";

import { OverlayView } from "@/components/overlay/overlay-view";
import { publicTrpc } from "@/utils/trpc";

/**
 * Rewards OBS browser source (1920×1080, transparent). Rewards change rarely
 * (only on a sub/unlock), so a 10s poll is plenty and keeps daily request volume
 * well under the Cloudflare Workers free tier.
 */
export default function RewardsOverlayPage() {
	const { data } = useQuery({
		...publicTrpc.state.getPublic.queryOptions(),
		refetchInterval: 10000,
		refetchIntervalInBackground: true,
	});

	return (
		<div className="@container fixed inset-0 overflow-hidden bg-transparent">
			<OverlayView data={data} />
		</div>
	);
}
