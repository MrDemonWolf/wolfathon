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
 */
export function useDraft<S, T>(
	server: S | null | undefined,
	select: (s: S) => T,
	persistedKey: (draft: T) => string,
): Draft<T> {
	const [draft, setDraft] = useState<T | null>(null);
	const savedRef = useRef<string>("");
	const seenRef = useRef<S | null | undefined>(undefined);

	useEffect(() => {
		if (!server || server === seenRef.current) return;
		seenRef.current = server;
		if (draft === null || persistedKey(draft) === savedRef.current) {
			const next = select(server);
			setDraft(structuredClone(next));
			savedRef.current = persistedKey(next);
		}
	}, [server, draft, select, persistedKey]);

	const dirty = draft != null && persistedKey(draft) !== savedRef.current;

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
		savedRef.current = persistedKey(value);
	}

	function discard() {
		if (server) seed(select(server));
	}

	return { draft, setDraft, dirty, discard, seed };
}
