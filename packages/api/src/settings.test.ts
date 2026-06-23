import { expect, test } from "bun:test";

import { tokenMatches } from "./routers/public";
import { newOverlayToken } from "./settings";

test("overlay token is a 32-char hex secret with no hyphens", () => {
	const token = newOverlayToken();
	expect(token).toMatch(/^[0-9a-f]{32}$/);
});

test("overlay tokens are unique per call (rotation actually rotates)", () => {
	const tokens = new Set(Array.from({ length: 100 }, newOverlayToken));
	expect(tokens.size).toBe(100);
});

test("token gate: only an exact non-empty match passes", () => {
	const t = newOverlayToken();
	expect(tokenMatches(t, t)).toBe(true);
	expect(tokenMatches(t, "")).toBe(false); // tokenless / fresh OBS URL
	expect(tokenMatches(t, `${t}x`)).toBe(false); // wrong token
	expect(tokenMatches(t, t.toUpperCase())).toBe(false); // case-sensitive
	expect(tokenMatches("", "")).toBe(false); // empty stored never grants access
});
