"use client";

import { useQuery } from "@tanstack/react-query";

import { OverlayTokenError } from "@/components/overlay/overlay-token-error";
import { OverlayView } from "@/components/overlay/overlay-view";
import { useOverlayToken } from "@/components/overlay/use-overlay-token";
import { publicTrpc } from "@/utils/trpc";

/**
 * Rewards OBS browser source (1920×1080, transparent). Rewards change rarely
 * (only on a sub/unlock), so a 10s poll is plenty and keeps daily request volume
 * well under the Cloudflare Workers free tier.
 */
export default function RewardsOverlayPage() {
	const token = useOverlayToken();
	const { data, error } = useQuery({
		...publicTrpc.state.getPublic.queryOptions({ token: token ?? "" }),
		enabled: token !== null,
		refetchInterval: 10000,
		refetchIntervalInBackground: true,
	});

	return (
		<div className="@container fixed inset-0 overflow-hidden bg-transparent">
			<OverlayView data={data} />
			<OverlayTokenError error={error} />
		</div>
	);
}
