import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, router } from "../index";
import { publicOverlaySoundConfig } from "../settings";
import { stripNotes } from "../state";
import { readOverlaySound, readSettings, readState, readTimer, readWheel } from "../store";
import { toPublicTimer } from "../timer";
import { freshOverlaySpin, toPublicWheel } from "../wheel";

/**
 * The only API surface exposed to the public overlays. Every response is
 * note/secret-stripped — internal notes and Twitch credentials never leave the
 * server.
 *
 * Each read also requires the overlay token (the `?t=` in the OBS source URL).
 * OBS browser sources can't authenticate through Cloudflare Access, so this
 * shared secret is what keeps the public Worker from serving anyone who knows
 * the path. Rotate it from the control panel to kill old URLs.
 */
const tokenInput = z.object({ token: z.string() });

/**
 * The overlay-token gate decision. A non-empty given token must exactly equal
 * the stored one. An empty given (or empty stored) never matches, so a fresh /
 * tokenless URL is always rejected.
 *
 * A plain compare is fine: the token is a 122-bit random secret, so a timing
 * side-channel reveals nothing brute-forceable over the network.
 * ponytail: constant-time compare adds nothing here; revisit only if the token
 * shrinks or becomes guessable.
 */
export function tokenMatches(stored: string, given: string): boolean {
	return given.length > 0 && given === stored;
}

/** Reject reads whose token doesn't match the stored one. */
function assertToken(stored: string, given: string): void {
	if (!tokenMatches(stored, given)) {
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid overlay token." });
	}
}

/** Same gate with settings included in the projection, still parallel with the main document read. */
async function gatedWithSettings<T, R>(
	db: Parameters<typeof readSettings>[0],
	token: string,
	load: () => Promise<T>,
	project: (settings: Awaited<ReturnType<typeof readSettings>>, loaded: T) => R,
): Promise<R> {
	const [settings, loaded] = await Promise.all([readSettings(db), load()]);
	assertToken(settings.overlayToken, token);
	return project(settings, loaded);
}

export const publicRouter = router({
	state: router({
		getPublic: publicProcedure.input(tokenInput).query(({ ctx, input }) =>
			gatedWithSettings(
				ctx.db,
				input.token,
				() => readState(ctx.db),
				(settings, state) => ({
					...stripNotes(state),
					sound: publicOverlaySoundConfig(settings, "reward"),
				}),
			),
		),
	}),
	timer: router({
		getPublic: publicProcedure.input(tokenInput).query(({ ctx, input }) =>
			gatedWithSettings(
				ctx.db,
				input.token,
				async () => {
					const [doc, state] = await Promise.all([readTimer(ctx.db), readState(ctx.db)]);
					// Theme is shared with the rewards card and lives in the rewards doc.
					return toPublicTimer(doc, Date.now(), state.theme);
				},
				(settings, timer) => ({ ...timer, sound: publicOverlaySoundConfig(settings, "timer") }),
			),
		),
	}),
	wheel: router({
		/**
		 * Everything one overlay poll needs: render-only slots (no ids beyond render,
		 * never the token), the theme, and the live `pending` spin. Folded into a
		 * single call so the overlay polls once, not twice. `pending` does NOT clear
		 * on read — multiple browser sources are safe and the overlay dedupes by
		 * `spinId`; a structural slot edit clears it server-side.
		 */
		getPublic: publicProcedure.input(tokenInput).query(({ ctx, input }) =>
			gatedWithSettings(
				ctx.db,
				input.token,
				async () => {
					const [wheel, state] = await Promise.all([readWheel(ctx.db), readState(ctx.db)]);
					return { wheel, state };
				},
				(settings, { wheel, state }) => ({
					...toPublicWheel(wheel),
					// Theme is shared with the timer + rewards card and lives in the state doc.
					theme: state.theme,
					pending: freshOverlaySpin(wheel, Date.now()),
					sound: publicOverlaySoundConfig(settings, "wheel"),
				}),
			),
		),
	}),
	sound: router({
		/** Audio bytes are fetched only once per custom sound version, never on each overlay poll. */
		getAsset: publicProcedure
			.input(tokenInput.extend({ id: z.string().uuid() }))
			.query(async ({ ctx, input }) => {
				const settings = await readSettings(ctx.db);
				assertToken(settings.overlayToken, input.token);
				if (settings.overlaySounds.customSound?.id !== input.id) return null;
				const asset = await readOverlaySound(ctx.db, input.id);
				if (!asset || asset.id !== input.id) return null;
				return { id: asset.id, mimeType: asset.mimeType, base64: asset.base64 };
			}),
	}),
});

export type PublicRouter = typeof publicRouter;
