/**
 * Operator settings doc (singleton row `"settings"` in `tracker_state`).
 *
 * Holds the overlay token: a shared secret embedded in the OBS browser-source
 * URLs (`/overlay/*?t=<token>`). The public overlay API rejects any read whose
 * token does not match, so the URLs can sit in a public Worker (OBS cannot
 * authenticate through Cloudflare Access) without exposing the data to anyone
 * who guesses the path. Rotating the token instantly invalidates old URLs.
 */
export type SettingsDoc = { overlayToken: string };

/** A fresh 122-bit URL-safe token (hex, hyphen-stripped UUIDv4). */
export function newOverlayToken(): string {
	return crypto.randomUUID().replace(/-/g, "");
}

export function defaultSettingsDoc(): SettingsDoc {
	return { overlayToken: newOverlayToken() };
}
