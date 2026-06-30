import { expect, test } from "bun:test";

import { tokenMatches } from "./routers/public";
import { defaultWheelDoc, resolveSpin, toPublicWheel, upsertSlot } from "./wheel";

/**
 * Leak/auth boundary for the public wheel reads. The public router procedures
 * are a 2-line composition of `assertToken(stored, given)` + the pure
 * `toPublicWheel` / `pendingSpin` projection; there's no live D1 in unit tests
 * (house style — see store.test.ts), so we prove the guarantee at exactly that
 * boundary: the same `tokenMatches` gate and the same projection the router runs.
 */

test("overlay-token gate: only a non-empty exact match passes", () => {
	const stored = "a".repeat(32);
	expect(tokenMatches(stored, stored)).toBe(true);
	expect(tokenMatches(stored, "")).toBe(false); // tokenless URL
	expect(tokenMatches(stored, "wrong")).toBe(false);
	expect(tokenMatches("", "")).toBe(false); // unseeded store never matches
});

test("public wheel read leaks no token, no slot id, no internal fields", () => {
	// A doc with an armed spin + a disabled slot + private history.
	let doc = defaultWheelDoc();
	doc = upsertSlot(doc, { id: doc.slots[0]!.id, enabled: false });
	doc = resolveSpin(doc, { spinId: "secret-spin", now: 1, rand: () => 0 }).doc;

	const blob = JSON.stringify(toPublicWheel(doc));
	// No secret/internal field names survive into the public payload.
	for (const banned of ["overlayToken", "token", "enabled", "history", "pendingSpin"]) {
		expect(blob.includes(banned)).toBe(false);
	}
	// No slot UUID leaks (every default slot id is a UUID).
	for (const s of doc.slots) expect(blob.includes(s.id)).toBe(false);

	// Only the render-only keys are present, and disabled slots are excluded.
	const pub = toPublicWheel(doc);
	expect(pub.slots.length).toBe(13);
	for (const s of pub.slots) {
		expect(Object.keys(s).sort()).toEqual(["color", "index", "label", "weight"]);
	}
});
