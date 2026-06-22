import { expect, test } from "bun:test";

import { expandHex } from "./theme";

test("expands #rgb shorthand to #rrggbb", () => {
	expect(expandHex("#abc")).toBe("#aabbcc");
	expect(expandHex("#0af")).toBe("#00aaff");
});

test("passes a 6-digit hex through unchanged", () => {
	expect(expandHex("#00aced")).toBe("#00aced");
	expect(expandHex("#AABBCC")).toBe("#AABBCC");
});

test("trims surrounding whitespace before matching", () => {
	expect(expandHex("  #abc  ")).toBe("#aabbcc");
});

test("falls back to brand blue for invalid input", () => {
	expect(expandHex("nope")).toBe("#00aced");
	expect(expandHex("#ab")).toBe("#00aced");
	expect(expandHex("#abcd")).toBe("#00aced");
	expect(expandHex("")).toBe("#00aced");
});

test("honours a custom fallback", () => {
	expect(expandHex("garbage", "#ffffff")).toBe("#ffffff");
});
