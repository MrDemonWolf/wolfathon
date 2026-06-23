import { expect, test } from "bun:test";

import { newOverlayToken } from "./settings";

test("overlay token is a 32-char hex secret with no hyphens", () => {
	const token = newOverlayToken();
	expect(token).toMatch(/^[0-9a-f]{32}$/);
});

test("overlay tokens are unique per call (rotation actually rotates)", () => {
	const tokens = new Set(Array.from({ length: 100 }, newOverlayToken));
	expect(tokens.size).toBe(100);
});
