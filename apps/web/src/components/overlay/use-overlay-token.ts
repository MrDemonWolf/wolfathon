"use client";

import { useEffect, useState } from "react";

/**
 * Read the overlay `?t=` secret client-side (avoids the useSearchParams Suspense
 * dance). Returns null until the first client render resolves it — callers hold
 * their query with `enabled: token !== null` — then the token string ("" if
 * absent). Shared by both OBS overlay pages.
 */
export function useOverlayToken(): string | null {
	const [token, setToken] = useState<string | null>(null);
	useEffect(() => setToken(new URLSearchParams(window.location.search).get("t") ?? ""), []);
	return token;
}
