"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { TimerView } from "@/components/overlay/timer-view";
import { publicTrpc } from "@/utils/trpc";

/**
 * Subathon timer OBS browser source (1920×1080, transparent). The overlay counts
 * down locally to the frame, so a 5s poll stays smooth while keeping daily request
 * volume well under the Cloudflare Workers free tier (a 2s poll ≈ 43k req/day).
 */
export default function TimerOverlayPage() {
	// The `?t=` secret gates the public read. Read it client-side (avoids the
	// useSearchParams Suspense dance) and hold the query until it's known.
	const [token, setToken] = useState<string | null>(null);
	useEffect(() => setToken(new URLSearchParams(window.location.search).get("t") ?? ""), []);

	const { data } = useQuery({
		...publicTrpc.timer.getPublic.queryOptions({ token: token ?? "" }),
		enabled: token !== null,
		refetchInterval: 5000,
		refetchIntervalInBackground: true,
	});

	return (
		<div className="@container fixed inset-0 overflow-hidden bg-transparent">
			<TimerView data={data} />
		</div>
	);
}
