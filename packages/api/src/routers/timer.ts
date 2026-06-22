import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { subsFromEvent } from "../state";
import { readState, readTimer, writeState, writeTimer } from "../store";
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

	start: protectedProcedure.mutation(async ({ ctx }) => {
		const doc = await readTimer(ctx.db);
		return writeTimer(ctx.db, { ...doc, state: start(doc.state, Date.now()) });
	}),

	pause: protectedProcedure.mutation(async ({ ctx }) => {
		const doc = await readTimer(ctx.db);
		return writeTimer(ctx.db, { ...doc, state: pause(doc.state, Date.now()) });
	}),

	reset: protectedProcedure.mutation(async ({ ctx }) => {
		const doc = await readTimer(ctx.db);
		return writeTimer(ctx.db, { ...doc, state: reset(doc.config) });
	}),

	/** Add (or subtract, if negative) minutes manually. */
	addMinutes: protectedProcedure
		.input(z.object({ minutes: z.number() }))
		.mutation(async ({ ctx, input }) => {
			const doc = await readTimer(ctx.db);
			const { state } = applyEvent(
				doc.config,
				doc.state,
				{ kind: "manualMinutes", minutes: input.minutes },
				Date.now(),
			);
			return writeTimer(ctx.db, { ...doc, state });
		}),

	/** Fire a configured event (the control panel's test buttons + EventSub reuse this shape). */
	applyEvent: protectedProcedure.input(eventSchema).mutation(async ({ ctx, input }) => {
		const doc = await readTimer(ctx.db);
		const { state } = applyEvent(doc.config, doc.state, input, Date.now());
		await writeTimer(ctx.db, { ...doc, state });
		// Sub/gift events also bump the goals' running sub count.
		const subs = subsFromEvent(input);
		if (subs > 0) {
			const data = await readState(ctx.db);
			await writeState(ctx.db, { ...data, currentSubs: (data.currentSubs ?? 0) + subs });
		}
		return { ...doc, state };
	}),

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
		const doc = await readTimer(ctx.db);
		const next = await writeTimer(ctx.db, { config: result.config, state: doc.state });
		return { ok: true as const, doc: next };
	}),
});

export type TimerRouter = typeof timerRouter;
