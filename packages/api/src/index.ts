import { initTRPC, TRPCError } from "@trpc/server";

import type { Context } from "./context";

/**
 * Drop `stack` from an error response.
 *
 * tRPC attaches a stack trace unless it believes it is running in production, and
 * a Worker's `NODE_ENV` is not a reliable signal — so the deployed PUBLIC overlay
 * API was returning internal file paths and line numbers to anyone who sent a bad
 * overlay token. Free reconnaissance with no upside: the full error still reaches
 * the Worker logs, which is where diagnosis belongs.
 *
 * Stripped unconditionally rather than gated on an env check, so this cannot
 * silently start leaking again because a build flag moved.
 *
 * Exported for the regression test — `errorFormatter` has no other seam.
 */
export function stripErrorStack<T extends { data: Record<string, unknown> }>(shape: T): T {
	if (!("stack" in shape.data)) return shape;
	const { stack: _stack, ...data } = shape.data;
	return { ...shape, data };
}

const t = initTRPC.context<Context>().create({
	errorFormatter: ({ shape }) => stripErrorStack(shape),
});

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
