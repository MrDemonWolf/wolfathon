/**
 * Small cross-module helpers shared by the pure domain modules, kept here instead
 * of re-typed per file so validation, clamping, and token generation read the
 * same everywhere. Pure — no DB, no I/O.
 */

/** True for a non-null, non-array object (the JSON "plain object" shape). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Coerce an arbitrary value to a rounded integer clamped to `[min, max]`. A
 * non-number / non-finite value (including `undefined`) falls back to `fallback`.
 * Shared by the giveaway config clamps and the wheel weight clamp — callers that
 * pass an already in-range `fallback` get it back untouched.
 */
export function clampInt(
	value: unknown,
	{ min, max, fallback }: { min: number; max: number; fallback: number },
): number {
	const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
	return Math.max(min, Math.min(max, n));
}

/** First whitespace-delimited token of a chat line, lowercased ("" if blank — falsy either way). */
export function firstToken(text: string): string | undefined {
	return text.trim().split(/\s+/)[0]?.toLowerCase();
}

/** A fresh 122-bit URL-safe token: a UUIDv4 with the hyphens stripped (32 hex chars). */
export function randomToken(): string {
	return crypto.randomUUID().replace(/-/g, "");
}
