import { expect, test } from "bun:test";

import { secureRandom } from "./random";

test("secureRandom stays in [0,1) and floors to a uniform in-range index", () => {
	for (let i = 0; i < 10_000; i++) {
		const r = secureRandom();
		expect(r).toBeGreaterThanOrEqual(0);
		expect(r).toBeLessThan(1);
		// The way both draws use it: Math.floor(r * n) must never reach n.
		expect(Math.floor(r * 7)).toBeLessThan(7);
	}
});

test("secureRandom is not a constant", () => {
	const seen = new Set(Array.from({ length: 100 }, () => secureRandom()));
	expect(seen.size).toBeGreaterThan(50);
});
