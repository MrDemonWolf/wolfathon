"use client";

import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";

import type { IEError } from "./import-export-panel";

/** Shared try/catch → IEError adapter for the import/export tRPC calls. */
export async function guard<T>(fn: () => Promise<T>, onErr: (errors: IEError[]) => T): Promise<T> {
	try {
		return await fn();
	} catch (e) {
		return onErr([{ label: "Error", message: e instanceof Error ? e.message : "request failed" }]);
	}
}

export type Draft<T> = {
	draft: T | null;
	setDraft: Dispatch<SetStateAction<T | null>>;
	dirty: boolean;
	/**
	 * The last known-saved value. Lets a tab diff against it and send only the
	 * fields the operator actually changed, instead of PUTting a whole document
	 * snapshotted at page load over fields the server owns.
	 */
	saved: T | null;
	/**
	 * The server moved while we held unsaved edits — this draft is built on an old
	 * base, so saving it would write over whatever changed. Surfaced by the DirtyBar.
	 */
	stale: boolean;
	/** Reset the draft to the current server value, dropping unsaved edits. */
	discard: () => void;
	/** Adopt a known-saved value and mark the draft clean (save/import success). */
	seed: (value: T) => void;
};

/**
 * Draft / dirty-state scaffolding shared by the control tabs. Seeds the draft on
 * first load and re-seeds when the server *reference* changes while we have no
 * unsaved edits (an import, or Twitch bumping a count). Gating on the reference
 * makes a re-seed loop impossible. Dirty is diffed on the `persistedKey`
 * projection, so server-derived fields don't count as edits.
 *
 * While the draft IS dirty the incoming revision is deliberately left unconsumed:
 * consuming it (marking it seen without applying it) would strand the tab on a
 * stale base forever, because with no further server-reference change there is
 * nothing left to trigger a re-seed. Instead we hold the edits and raise `stale`.
 */
export function useDraft<S, T>(
	server: S | null | undefined,
	select: (s: S) => T,
	persistedKey: (draft: T) => string,
): Draft<T> {
	const [draft, setDraft] = useState<T | null>(null);
	const [stale, setStale] = useState(false);
	/** The last known-saved value plus its projection key (what `dirty` diffs against). */
	const savedRef = useRef<{ value: T; key: string } | null>(null);
	const seenRef = useRef<S | null | undefined>(undefined);

	useEffect(() => {
		if (!server || server === seenRef.current) return;
		const next = select(server);
		const key = persistedKey(next);
		if (draft !== null && persistedKey(draft) !== savedRef.current?.key) {
			// Unsaved edits — keep them, and leave this revision unseen so it still
			// lands once the operator saves or discards.
			if (key !== savedRef.current?.key) setStale(true);
			return;
		}
		seenRef.current = server;
		setStale(false);
		// A poll that returns the value we already hold: nothing to apply, and
		// re-seeding would churn the draft object for no reason.
		if (draft !== null && key === savedRef.current?.key) return;
		setDraft(structuredClone(next));
		savedRef.current = { value: next, key };
	}, [server, draft, select, persistedKey]);

	const dirty = draft != null && persistedKey(draft) !== savedRef.current?.key;

	// Warn before a tab close/reload throws away unsaved edits (the draft lives in
	// memory and only persists on Save).
	useEffect(() => {
		if (!dirty) return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	}, [dirty]);

	function seed(value: T) {
		setDraft(structuredClone(value));
		savedRef.current = { value, key: persistedKey(value) };
		setStale(false);
	}

	function discard() {
		if (server) seed(select(server));
	}

	return { draft, setDraft, dirty, saved: savedRef.current?.value ?? null, stale, discard, seed };
}
