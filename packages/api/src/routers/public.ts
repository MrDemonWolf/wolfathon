import { publicProcedure, router } from "../index";
import { stripNotes } from "../state";
import { readState } from "../store";

/**
 * The only API surface exposed to the public overlay. Every response is
 * note-stripped — internal notes never leave the server.
 */
export const publicRouter = router({
  state: router({
    getPublic: publicProcedure.query(async ({ ctx }) => stripNotes(await readState(ctx.db))),
  }),
});

export type PublicRouter = typeof publicRouter;
