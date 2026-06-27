"use client";

import { TRPCClientError } from "@trpc/client";

/**
 * Tiny corner diagnostic for an OBS source whose `?t=` token is wrong or rotated.
 * Without it the public read just rejects and the source is permanently blank
 * with no hint. Renders ONLY on an explicit UNAUTHORIZED (the code assertToken
 * throws in the public router) — a normal not-yet-loaded / empty state shows
 * nothing, and transient network blips don't trip it, so a correctly-configured
 * source always stays clean. pointer-events-none so it never blocks the capture.
 */
export function OverlayTokenError({ error }: { error: unknown }) {
	const unauthorized = error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED";
	if (!unauthorized) return null;
	return (
		<div className="pointer-events-none fixed bottom-2 left-2 rounded bg-black/60 px-2 py-1 font-mono text-xs text-white/80">
			Overlay token invalid — re-copy the URL from Control Panel → Settings → Overlays
		</div>
	);
}
