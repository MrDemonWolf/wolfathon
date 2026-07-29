import { TRPCError } from "@trpc/server";
import { expect, test } from "bun:test";

import { mutateWithCas, nextRev, revMatches, staleRevError } from "./store";

/**
 * Regression tests for the optimistic-concurrency loop behind every mutate*
 * helper. The real hazard (race-1 in the audit): a burst of Twitch EventSub
 * deliveries interleaves, and a plain read→write drops a timer add or a sub when
 * a later write clobbers an earlier one. We exercise the pure retry loop against
 * an in-memory store so the lost-update protection has a deterministic test
 * without a live D1.
 */

type Doc = { ms: number; subs: number };

/** Minimal in-memory CAS store mirroring the D1 ops mutateDoc wires up. */
function makeStore(initial: string | null) {
	let json = initial; // null = row absent
	let writes = 0;
	return {
		get: () => json,
		/** How many times `cas` actually wrote — a no-op apply must not bump this. */
		writes: () => writes,
		set: (v: string) => {
			json = v;
		},
		ops: {
			read: async () => (json == null ? null : { value: JSON.parse(json) as Doc, token: json }),
			cas: async (token: string, next: Doc) => {
				const data = JSON.stringify(next);
				if (data === token) return true; // unchanged — mutateDoc skips the UPDATE
				if (json !== token) return false; // another writer changed the row first
				json = data;
				writes++;
				return true;
			},
			seed: async (value: Doc) => {
				if (json == null) json = JSON.stringify(value);
			},
		},
	};
}

test("applies the mutation and persists it", async () => {
	const s = makeStore(JSON.stringify({ ms: 0, subs: 0 }));
	const result = await mutateWithCas<Doc>(
		s.ops,
		() => ({ ms: 0, subs: 0 }),
		(d) => ({ ms: d.ms + 5, subs: d.subs + 1 }),
	);
	expect(result).toEqual({ ms: 5, subs: 1 });
	expect(JSON.parse(s.get() ?? "{}")).toEqual({ ms: 5, subs: 1 });
});

test("retries on a lost update so concurrent deliveries both survive", async () => {
	const s = makeStore(JSON.stringify({ ms: 0, subs: 0 }));
	let injected = false;
	const ops = {
		...s.ops,
		read: async () => {
			const r = await s.ops.read();
			// Simulate a concurrent delivery committing once — after our first read but
			// before our CAS — so the first CAS loses and we must re-read + re-apply.
			if (!injected) {
				injected = true;
				s.set(JSON.stringify({ ms: 5, subs: 1 }));
			}
			return r;
		},
	};
	const result = await mutateWithCas<Doc>(
		ops,
		() => ({ ms: 0, subs: 0 }),
		(d) => ({ ms: d.ms + 10, subs: d.subs + 1 }),
	);
	// Concurrent +5/+1 then our +10/+1 both land — nothing is clobbered.
	expect(result).toEqual({ ms: 15, subs: 2 });
	expect(JSON.parse(s.get() ?? "{}")).toEqual({ ms: 15, subs: 2 });
});

test("a connection-field merge preserves a concurrently-written field (OAuth callback vs webhook)", async () => {
	// finding-2 regression: the OAuth callback merges only the connection-owned
	// fields via CAS. A webhook writing recentEventIds between the callback's read
	// and its CAS must survive — the callback must not clobber it with a stale doc.
	type Twitch = { connected?: boolean; accessToken?: string; recentEventIds?: string[] };
	const s = makeStore(JSON.stringify({ recentEventIds: ["evt-1"] } satisfies Twitch));
	let injected = false;
	const ops = {
		...s.ops,
		read: async () => {
			const r = await s.ops.read();
			if (!injected) {
				injected = true; // a webhook appends an event id after our read, before our CAS
				s.set(JSON.stringify({ recentEventIds: ["evt-1", "evt-2"] } satisfies Twitch));
			}
			return r;
		},
	};
	const result = await mutateWithCas<Twitch>(
		ops,
		() => ({}),
		(cur) => ({
			...cur,
			connected: true,
			accessToken: "tok",
		}),
	);
	// Both the webhook's recentEventIds AND our connection fields land.
	expect(result).toEqual({
		recentEventIds: ["evt-1", "evt-2"],
		connected: true,
		accessToken: "tok",
	});
});

test("seeds an absent row then applies", async () => {
	const s = makeStore(null);
	const result = await mutateWithCas<Doc>(
		s.ops,
		() => ({ ms: 0, subs: 0 }),
		(d) => ({ ...d, subs: d.subs + 1 }),
	);
	expect(result).toEqual({ ms: 0, subs: 1 });
});

test("exhausting attempts surfaces a typed CONFLICT, not a bare Error", async () => {
	// Reachable under a big gift bomb. A dropped write means lost Wolfathon time, so
	// the operator must get something actionable rather than a generic 500 carrying
	// an internal function name.
	const s = makeStore(JSON.stringify({ ms: 0, subs: 0 }));
	const ops = { ...s.ops, cas: async () => false };
	const run = mutateWithCas<Doc>(
		ops,
		() => ({ ms: 0, subs: 0 }),
		(d) => d,
	);
	await expect(run).rejects.toBeInstanceOf(TRPCError);
	await expect(run).rejects.toMatchObject({ code: "CONFLICT" });
	await expect(run).rejects.toThrow(/didn't save/);
});

test("an apply that changes nothing writes nothing", async () => {
	// The chat firehose leans on this: a `!command` with nothing to record must not
	// rewrite the whole doc just to store the value it already held. Content compare,
	// not reference — the read-boundary normalizers always return a fresh object, so
	// an identity check would never fire for the state/timer/wheel/bot docs.
	const s = makeStore(JSON.stringify({ ms: 7, subs: 3 }));
	const byRef = await mutateWithCas<Doc>(
		s.ops,
		() => ({ ms: 0, subs: 0 }),
		(d) => d,
	);
	expect(byRef).toEqual({ ms: 7, subs: 3 });
	const rebuilt = await mutateWithCas<Doc>(
		s.ops,
		() => ({ ms: 0, subs: 0 }),
		(d) => ({ ...d }),
	);
	expect(rebuilt).toEqual({ ms: 7, subs: 3 });
	expect(s.writes()).toBe(0);
	expect(s.get()).toBe(JSON.stringify({ ms: 7, subs: 3 }));
});

// ---- region revs (optimistic concurrency for operator saves) ----------------

test("nextRev bumps only when the guarded region actually changed", () => {
	const goals = [{ id: "a", unlocked: false }];
	// Deep-equal but a different object — the panel rebuilds arrays constantly, so
	// identity would bump on every save and make every second tab conflict.
	expect(nextRev(goals, [{ id: "a", unlocked: false }], 3)).toBe(3);
	expect(nextRev(goals, [{ id: "a", unlocked: true }], 3)).toBe(4);
	// A document written before revs shipped reads as 0.
	expect(nextRev(goals, [{ id: "b", unlocked: false }], undefined)).toBe(1);
});

test("revMatches opts out on an absent base and treats a missing stored rev as zero", () => {
	// Backup restores and scripts send no rev at all — they must never conflict.
	expect(revMatches(undefined, 7)).toBe(true);
	expect(revMatches(0, undefined)).toBe(true);
	expect(revMatches(2, 2)).toBe(true);
	expect(revMatches(2, 3)).toBe(false);
});

test("a rejected save writes nothing — the throw escapes the CAS loop", async () => {
	const s = makeStore(JSON.stringify({ ms: 1, subs: 1 }));
	const before = s.get();
	await expect(
		mutateWithCas<Doc>(
			s.ops,
			() => ({ ms: 0, subs: 0 }),
			() => {
				throw staleRevError("goals");
			},
		),
	).rejects.toMatchObject({ code: "CONFLICT" });
	expect(s.get()).toBe(before);
	expect(s.writes()).toBe(0);
});
