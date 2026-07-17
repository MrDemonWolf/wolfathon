import { describe, expect, it } from "bun:test";

import { clampInt, firstToken, isPlainObject, randomToken } from "./util";

describe("isPlainObject", () => {
	it("accepts plain objects only", () => {
		expect(isPlainObject({})).toBe(true);
		expect(isPlainObject({ a: 1 })).toBe(true);
	});
	it("rejects null, arrays, and primitives", () => {
		expect(isPlainObject(null)).toBe(false);
		expect(isPlainObject([])).toBe(false);
		expect(isPlainObject("x")).toBe(false);
		expect(isPlainObject(3)).toBe(false);
		expect(isPlainObject(undefined)).toBe(false);
	});
});

describe("clampInt", () => {
	const opts = { min: 1, max: 10, fallback: 3 };
	it("rounds and clamps to range", () => {
		expect(clampInt(5.4, opts)).toBe(5);
		expect(clampInt(100, opts)).toBe(10);
		expect(clampInt(-2, opts)).toBe(1);
	});
	it("falls back for non-finite / non-number / undefined", () => {
		expect(clampInt(undefined, opts)).toBe(3);
		expect(clampInt(NaN, opts)).toBe(3);
		expect(clampInt("7", opts)).toBe(3);
	});
});

describe("firstToken", () => {
	it("returns the lowercased first token", () => {
		expect(firstToken("  !Enter now  ")).toBe("!enter");
		expect(firstToken("HELLO world")).toBe("hello");
	});
	it("returns a falsy empty string for blank input (matches the original expression)", () => {
		expect(firstToken("   ")).toBe("");
		expect(firstToken("")).toBe("");
	});
});

describe("randomToken", () => {
	it("is 32 hex chars with no hyphens, and unique per call", () => {
		const a = randomToken();
		expect(a).toMatch(/^[0-9a-f]{32}$/);
		expect(a).not.toBe(randomToken());
	});
});
