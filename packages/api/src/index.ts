import { initTRPC, TRPCError } from "@trpc/server";

import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;

/** Open to anyone — used only by the overlay's note-stripped reads. */
export const publicProcedure = t.procedure;

/**
 * Requires a Cloudflare Access-authenticated operator. The `user` is guaranteed
 * non-null inside the resolver.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Cloudflare Access required." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
