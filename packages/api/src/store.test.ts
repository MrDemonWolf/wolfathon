import { expect, test } from "bun:test";

import { mutateWithCas } from "./store";

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
	return {
		get: () => json,
		set: (v: string) => {
			json = v;
		},
		ops: {
			read: async () => (json == null ? null : { value: JSON.parse(json) as Doc, token: json }),
			cas: async (token: string, next: Doc) => {
				if (json !== token) return false; // another writer changed the row first
				json = JSON.stringify(next);
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

test("throws after exhausting attempts when the CAS never lands", async () => {
	const s = makeStore(JSON.stringify({ ms: 0, subs: 0 }));
	const ops = { ...s.ops, cas: async () => false };
	await expect(
		mutateWithCas<Doc>(
			ops,
			() => ({ ms: 0, subs: 0 }),
			(d) => d,
		),
	).rejects.toThrow(/exceeded/);
});
