import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { readSe, writeSe } from "../store";
import { defaultSeDoc, toSeStatus } from "../streamelements";

/**
 * Operator-only StreamElements control. The channel JWT is stored in D1 (like the
 * Twitch tokens) so it can be pasted/rotated from the Access-gated control panel
 * WITHOUT a redeploy — the listener DO reads it on its next cron tick (~1 min).
 * `getStatus` never returns the jwt.
 */
export const streamElementsRouter = router({
	getStatus: protectedProcedure.query(async ({ ctx }) => toSeStatus(await readSe(ctx.db))),

	connect: protectedProcedure
		.input(
			z.object({
				jwt: z.string().trim().min(20, "That doesn't look like a StreamElements JWT."),
				channelId: z.string().trim().max(64).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const prev = await readSe(ctx.db);
			// connected:false + clear the error → the DO flips it true once authed.
			await writeSe(ctx.db, {
				...prev,
				jwt: input.jwt,
				channelId: input.channelId,
				connected: false,
				lastError: undefined,
			});
			return { ok: true as const };
		}),

	disconnect: protectedProcedure.mutation(async ({ ctx }) => {
		await writeSe(ctx.db, defaultSeDoc());
		return { ok: true as const };
	}),
});

export type StreamElementsRouter = typeof streamElementsRouter;
