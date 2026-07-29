"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Copy-to-clipboard with a transient "copied" flash. Shared by the copy buttons
 * that do the same writeText → flash → reset dance (overlay URL cards, the winner
 * list, import/export). Pass `successMessage` to also fire a toast. Empty values
 * are a no-op.
 */
export function useCopyToClipboard(resetMs = 1500): {
	copied: boolean;
	copy: (value: string, successMessage?: string) => Promise<void>;
} {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Clear any pending reset on unmount so we never setState on a gone component.
	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	const copy = useCallback(
		async (value: string, successMessage?: string) => {
			if (!value) return;
			try {
				await navigator.clipboard.writeText(value);
			} catch {
				// Denied permission or a non-secure context. Every call site is
				// fire-and-forget, so without this the flash silently never fires AND the
				// rejection goes unhandled — the operator is left thinking they copied.
				toast.error("Couldn't copy — copy it manually.");
				return;
			}
			setCopied(true);
			if (successMessage) toast.success(successMessage);
			if (timer.current) clearTimeout(timer.current);
			timer.current = setTimeout(() => setCopied(false), resetMs);
		},
		[resetMs],
	);

	return { copied, copy };
}
