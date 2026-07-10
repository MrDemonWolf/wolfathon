"use client";

import { OverlayTokenError } from "./overlay-token-error";

/**
 * The fixed, transparent, container-query frame every OBS source paints into,
 * with the token-error hint overlaid. Children are the overlay view itself.
 * (The per-page token + polling query stays inline — it's three lines and typing
 * a shared wrapper around tRPC's queryOptions costs more than it saves.)
 */
export function OverlayShell({
	token,
	error,
	children,
}: {
	token: string | null;
	error: unknown;
	children: React.ReactNode;
}) {
	return (
		<div className="@container fixed inset-0 overflow-hidden bg-transparent">
			{children}
			<OverlayTokenError error={error} token={token} />
		</div>
	);
}
