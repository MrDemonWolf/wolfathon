import { expect, test } from "bun:test";

import {
	defaultOverlayTheme,
	expandHex,
	gradientCss,
	luma,
	type OverlayTheme,
	OVERLAY_TOGGLE_KEYS,
	resolveTextColor,
	resolveThemeGradient,
	shade,
	THEME_PRESETS,
	type ThemeError,
	validateOverlayTheme,
	wheelPalette,
} from "./theme";

test("expands #rgb shorthand to #rrggbb", () => {
	expect(expandHex("#abc")).toBe("#aabbcc");
	expect(expandHex("#0af")).toBe("#00aaff");
});

test("passes a 6-digit hex through unchanged", () => {
	expect(expandHex("#00aced")).toBe("#00aced");
	expect(expandHex("#AABBCC")).toBe("#AABBCC");
});

test("shade darkens each channel by the factor", () => {
	expect(shade("#ffffff", 0.5)).toBe("#808080");
	expect(shade("#00aced", 0)).toBe("#000000");
	expect(shade("#102030", 1)).toBe("#102030");
});

test("wheelPalette maps the brand gradient to dark/accent/light chrome", () => {
	const p = wheelPalette(defaultOverlayTheme());
	// brand = ["#0077c8", "#00aced", "#5bc8f0"] sorted by luma → accent is the mid
	// stop, light the brightest, dark a deep tint of the darkest.
	expect(p.accent).toBe("#00aced");
	expect(p.light).toBe("#5bc8f0");
	expect(luma(p.dark)).toBeLessThan(luma(p.accent));
	expect(luma(p.darkDeep)).toBeLessThan(luma(p.dark));
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

test("luma spans black to white", () => {
	expect(Math.round(luma("#ffffff"))).toBe(255);
	expect(luma("#000000")).toBe(0);
});

const themeWith = (over: Partial<OverlayTheme>): OverlayTheme => ({
	...defaultOverlayTheme(),
	...over,
});

test("resolveTextColor auto-picks light text on a dark gradient and dark on a light one", () => {
	// avg luma <= 150 → white text
	expect(resolveTextColor(themeWith({ preset: "custom", gradient: ["#000000", "#000000"] }))).toBe(
		"#ffffff",
	);
	// avg luma > 150 → near-black text
	expect(resolveTextColor(themeWith({ preset: "custom", gradient: ["#ffffff", "#ffffff"] }))).toBe(
		"#04122b",
	);
	// an explicit hex bypasses the auto path
	expect(resolveTextColor(themeWith({ textColor: "#abcdef" }))).toBe("#abcdef");
});

test("resolveThemeGradient uses preset stops and falls back to brand for thin custom gradients", () => {
	expect(resolveThemeGradient(themeWith({ preset: "brand" }))).toEqual(THEME_PRESETS.brand);
	// custom with <2 stops → brand fallback
	expect(resolveThemeGradient(themeWith({ preset: "custom", gradient: ["#fff"] }))).toEqual(
		THEME_PRESETS.brand,
	);
	// custom with >=2 stops → the provided stops
	expect(
		resolveThemeGradient(themeWith({ preset: "custom", gradient: ["#111111", "#222222"] })),
	).toEqual(["#111111", "#222222"]);
});

test("every overlay element toggle defaults to true (no element hidden out of the box)", () => {
	const theme = defaultOverlayTheme();
	for (const key of OVERLAY_TOGGLE_KEYS) {
		expect(theme[key]).toBe(true);
	}
});

test("validateOverlayTheme accepts each element toggle and rejects non-booleans", () => {
	// all toggles off → all preserved, no errors
	const off = Object.fromEntries(OVERLAY_TOGGLE_KEYS.map((k) => [k, false]));
	const okErrors: ThemeError[] = [];
	const okTheme = validateOverlayTheme(off, okErrors);
	expect(okErrors).toEqual([]);
	for (const key of OVERLAY_TOGGLE_KEYS) {
		expect(okTheme[key]).toBe(false);
	}

	// a non-boolean toggle → one error per bad field, value falls back to default (true)
	const badErrors: ThemeError[] = [];
	const badTheme = validateOverlayTheme({ showUnits: "yes" }, badErrors);
	expect(badErrors).toEqual([{ path: "theme.showUnits", message: "must be a boolean" }]);
	expect(badTheme.showUnits).toBe(true);
});

test("gradientCss spreads stops 0→100% and falls back for a single stop", () => {
	const css = gradientCss(["#000000", "#ffffff"]);
	expect(css).toContain("#000000 0%");
	expect(css).toContain("#ffffff 100%");
	// fewer than 2 stops → the default brand-ish two-stop gradient
	const fallback = gradientCss(["#000000"]);
	expect(fallback).toContain("#00aced 0%");
	expect(fallback).toContain("#5bc8f0 100%");
});
