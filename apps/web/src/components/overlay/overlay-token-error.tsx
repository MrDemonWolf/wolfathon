"use client";

import { TRPCClientError } from "@trpc/client";

/**
 * Tiny corner diagnostic for an OBS source whose `?t=` token is missing or wrong.
 * Without it the public read just rejects and the source is permanently blank
 * with no hint. Renders ONLY on an explicit UNAUTHORIZED (the code assertToken
 * throws in the public router) — a normal not-yet-loaded / empty state shows
 * nothing, and transient network blips don't trip it, so a correctly-configured
 * source always stays clean. pointer-events-none so it never blocks the capture.
 *
 * `token` distinguishes a URL opened with no `?t=` at all (empty string) from one
 * with a token the server rejected, so the operator knows which to fix. Pinned
 * top-left (the reward card lives bottom-left) and opaque navy for legibility.
 */
export function OverlayTokenError({ error, token }: { error: unknown; token?: string | null }) {
	const unauthorized = error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED";
	if (!unauthorized) return null;
	const missing = !token;
	return (
		<div className="pointer-events-none fixed top-2 left-2 max-w-[60cqw] rounded-md bg-[#0a0f1c] px-2.5 py-1.5 font-mono text-xs text-white ring-1 ring-destructive">
			{missing
				? "No overlay token in this URL — open the ?t=… link from Control Panel → Settings → Overlays"
				: "Overlay token invalid — re-copy the URL from Control Panel → Settings → Overlays"}
		</div>
	);
}
