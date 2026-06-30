import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { applyTimerEventAndBumpSubs, mutateTimer, readTimer } from "../store";
import { applyEvent, pause, reset, start, type TimerEvent, validateTimerConfig } from "../timer";

const tierSchema = z.enum(["t1", "t2", "t3", "prime"]);

const whoSchema = z.string().trim().min(1).max(60).optional();
const eventSchema: z.ZodType<TimerEvent> = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("sub"), tier: tierSchema, who: whoSchema }),
	z.object({
		kind: z.literal("gift"),
		tier: tierSchema,
		count: z.number().int().min(1),
		who: whoSchema,
	}),
	z.object({ kind: z.literal("bits"), bits: z.number().int().min(1), who: whoSchema }),
	z.object({
		kind: z.literal("points"),
		rewardId: z.string().optional(),
		rewardTitle: z.string().optional(),
		who: whoSchema,
	}),
	z.object({ kind: z.literal("manualMinutes"), minutes: z.number() }),
]);

/** Operator-only timer control. Reads return the full doc (config + state). */
export const timerRouter = router({
	getRaw: protectedProcedure.query(async ({ ctx }) => readTimer(ctx.db)),

	start: protectedProcedure.mutation(({ ctx }) =>
		mutateTimer(ctx.db, (doc) => ({ ...doc, state: start(doc.state, Date.now()) })),
	),

	pause: protectedProcedure.mutation(({ ctx }) =>
		mutateTimer(ctx.db, (doc) => ({ ...doc, state: pause(doc.state, Date.now()) })),
	),

	reset: protectedProcedure.mutation(({ ctx }) =>
		mutateTimer(ctx.db, (doc) => ({ ...doc, state: reset(doc.config) })),
	),

	/** Add (or subtract, if negative) minutes manually. */
	addMinutes: protectedProcedure
		.input(z.object({ minutes: z.number() }))
		.mutation(({ ctx, input }) =>
			mutateTimer(ctx.db, (doc) => ({
				...doc,
				state: applyEvent(
					doc.config,
					doc.state,
					{ kind: "manualMinutes", minutes: input.minutes },
					Date.now(),
				).state,
			})),
		),

	/**
	 * Fire a configured event for the control panel's test buttons. This is a
	 * preview: it drives the overlay alert so the overlay can be tested, but does
	 * NOT add time or bump the sub count. Real events arrive via the EventSub
	 * webhook, which calls `applyTimerEventAndBumpSubs` directly (no preview).
	 */
	applyEvent: protectedProcedure
		.input(eventSchema)
		.mutation(({ ctx, input }) => applyTimerEventAndBumpSubs(ctx.db, input, Date.now(), true)),

	/** Validate a config import without writing (powers the Validate button). */
	validateConfig: protectedProcedure.input(z.unknown()).mutation(({ input }) => {
		const result = validateTimerConfig(input);
		if (!result.ok) return { ok: false as const, errors: result.errors };
		return { ok: true as const, config: result.config };
	}),

	/** Validate, then replace the timer config (keeps the running state). */
	setConfig: protectedProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
		const result = validateTimerConfig(input);
		if (!result.ok) return { ok: false as const, errors: result.errors };
		const doc = await mutateTimer(ctx.db, (prev) => ({ config: result.config, state: prev.state }));
		return { ok: true as const, doc };
	}),
});

export type TimerRouter = typeof timerRouter;
