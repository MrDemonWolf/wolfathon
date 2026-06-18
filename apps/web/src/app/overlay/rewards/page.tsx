"use client";

import { useQuery } from "@tanstack/react-query";

import { OverlayView } from "@/components/overlay/overlay-view";
import { publicTrpc } from "@/utils/trpc";

/**
 * Rewards OBS browser source (1920×1080, transparent). Polls the public
 * note-stripped state every 2s.
 */
export default function RewardsOverlayPage() {
	const { data } = useQuery({
		...publicTrpc.state.getPublic.queryOptions(),
		refetchInterval: 2000,
		refetchIntervalInBackground: true,
	});

	return (
		<div className="@container fixed inset-0 overflow-hidden bg-transparent">
			<OverlayView data={data} />
		</div>
	);
}
