"use client";

import { TRPCClientError } from "@trpc/client";
import { useCallback, useState } from "react";

/**
 * Conflict state for a tab whose save carries a base revision.
 *
 * The server rejects a save built on a revision someone else has since replaced
 * (`state.replace` / `timer.setConfig` → CONFLICT). That is not an error the
 * operator can retry blindly: their edits are still on screen and still valid,
 * they just no longer apply to the document on the server. So the tab holds the
 * edits, refetches so the newest revision is in hand, and offers two explicit ways
 * out via the DirtyBar — take theirs, or overwrite with theirs' revision attached.
 */
export function useSaveConflict(refetch: () => void) {
	const [conflict, setConflict] = useState(false);

	/** True when this error was a base-revision conflict (and arms the bar). */
	const handle = useCallback(
		(error: unknown): boolean => {
			if (!(error instanceof TRPCClientError) || error.data?.code !== "CONFLICT") return false;
			setConflict(true);
			// Pull the newest revision in so "Save mine anyway" has something to attach
			// to and "Load latest" has something to load.
			refetch();
			return true;
		},
		[refetch],
	);

	const clear = useCallback(() => setConflict(false), []);

	return { conflict, handle, clear };
}
