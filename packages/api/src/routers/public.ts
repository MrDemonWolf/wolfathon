import { publicProcedure, router } from "../index";
import { stripNotes } from "../state";
import { readState, readTimer } from "../store";
import { toPublicTimer } from "../timer";

/**
 * The only API surface exposed to the public overlays. Every response is
 * note/secret-stripped — internal notes and Twitch credentials never leave the
 * server.
 */
export const publicRouter = router({
  state: router({
    getPublic: publicProcedure.query(async ({ ctx }) => stripNotes(await readState(ctx.db))),
  }),
  timer: router({
    getPublic: publicProcedure.query(async ({ ctx }) => {
      const doc = await readTimer(ctx.db);
      return toPublicTimer(doc, Date.now());
    }),
  }),
});

export type PublicRouter = typeof publicRouter;
