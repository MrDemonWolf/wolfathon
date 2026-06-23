"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { OverlayView } from "@/components/overlay/overlay-view";
import { publicTrpc } from "@/utils/trpc";

/**
 * Rewards OBS browser source (1920×1080, transparent). Rewards change rarely
 * (only on a sub/unlock), so a 10s poll is plenty and keeps daily request volume
 * well under the Cloudflare Workers free tier.
 */
export default function RewardsOverlayPage() {
	// The `?t=` secret gates the public read. Read it client-side (avoids the
	// useSearchParams Suspense dance) and hold the query until it's known.
	const [token, setToken] = useState<string | null>(null);
	useEffect(() => setToken(new URLSearchParams(window.location.search).get("t") ?? ""), []);

	const { data } = useQuery({
		...publicTrpc.state.getPublic.queryOptions({ token: token ?? "" }),
		enabled: token !== null,
		refetchInterval: 10000,
		refetchIntervalInBackground: true,
	});

	return (
		<div className="@container fixed inset-0 overflow-hidden bg-transparent">
			<OverlayView data={data} />
		</div>
	);
}
