import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, router } from "../index";
import { stripNotes } from "../state";
import { readSettings, readState, readTimer, readWheel } from "../store";
import { toPublicTimer } from "../timer";
import { toPublicWheel } from "../wheel";

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

export const publicRouter = router({
	state: router({
		getPublic: publicProcedure.input(tokenInput).query(async ({ ctx, input }) => {
			assertToken((await readSettings(ctx.db)).overlayToken, input.token);
			return stripNotes(await readState(ctx.db));
		}),
	}),
	timer: router({
		getPublic: publicProcedure.input(tokenInput).query(async ({ ctx, input }) => {
			assertToken((await readSettings(ctx.db)).overlayToken, input.token);
			const [doc, state] = await Promise.all([readTimer(ctx.db), readState(ctx.db)]);
			// Theme is shared with the rewards card and lives in the rewards doc.
			return toPublicTimer(doc, Date.now(), state.theme);
		}),
	}),
	wheel: router({
		/** Enabled slots as render-only fields — no ids beyond render, never the token. */
		getPublic: publicProcedure.input(tokenInput).query(async ({ ctx, input }) => {
			assertToken((await readSettings(ctx.db)).overlayToken, input.token);
			const [wheel, state] = await Promise.all([readWheel(ctx.db), readState(ctx.db)]);
			// Theme is shared with the timer + rewards card and lives in the state doc.
			return { ...toPublicWheel(wheel), theme: state.theme };
		}),
		/**
		 * The live pending spin (or null) so the overlay can animate. Does NOT clear
		 * on read — multiple browser sources are safe and the overlay dedupes by
		 * `spinId`. A new structural slot edit clears it server-side.
		 */
		poll: publicProcedure.input(tokenInput).query(async ({ ctx, input }) => {
			assertToken((await readSettings(ctx.db)).overlayToken, input.token);
			return (await readWheel(ctx.db)).pendingSpin;
		}),
	}),
});

export type PublicRouter = typeof publicRouter;
