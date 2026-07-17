import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { mutateWheel, readWheel } from "../store";
import {
	enabledSlots,
	MAX_LABEL_LEN,
	MAX_WEIGHT,
	removeSlot,
	reorderSlots,
	resolveSpin,
	upsertSlot,
} from "../wheel";

const labelSchema = z.string().trim().max(MAX_LABEL_LEN);
const colorSchema = z.string().trim().max(7);

/**
 * Operator-only wheel-of-dares control. The raw doc (all slots incl. disabled,
 * full history) is operator-only; the overlay's note/secret-stripped view lives
 * in the public router. Slot edits clear any armed spin (see ../wheel) so a stale
 * index can't point at the wrong slot after a structural change.
 */
export const wheelRouter = router({
	getRaw: protectedProcedure.query(async ({ ctx }) => readWheel(ctx.db)),

	/** Insert (blank/absent id + label) or update a slot by id. */
	upsertSlot: protectedProcedure
		.input(
			z.object({
				id: z.string().optional(),
				label: labelSchema.optional(),
				weight: z.number().int().min(1).max(MAX_WEIGHT).optional(),
				/** "" clears the colour back to the palette default. */
				color: colorSchema.optional(),
				enabled: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => mutateWheel(ctx.db, (doc) => upsertSlot(doc, input))),

	removeSlot: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => mutateWheel(ctx.db, (doc) => removeSlot(doc, input.id))),

	reorderSlots: protectedProcedure
		.input(z.object({ ids: z.array(z.string()) }))
		.mutation(async ({ ctx, input }) =>
			mutateWheel(ctx.db, (doc) => {
				const next = reorderSlots(doc, input.ids);
				// reorderSlots returns the SAME ref only when it rejected the list (wrong
				// length, a duplicate id, or an unknown id) — surface that, never write a
				// silent no-op.
				if (next === doc) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Reorder must list every slot id exactly once.",
					});
				}
				return next;
			}),
		),

	history: protectedProcedure.query(async ({ ctx }) => (await readWheel(ctx.db)).history),

	/** Wipe the spin log — a fresh slate for the next subathon. Slots untouched. */
	clearHistory: protectedProcedure.mutation(async ({ ctx }) =>
		mutateWheel(ctx.db, (doc) => ({ ...doc, history: [] })),
	),

	/**
	 * Spin. With `slotId`, lands on that enabled slot; without, the server picks a
	 * weighted-random enabled slot. Appends a history entry and arms `pendingSpin`
	 * so the overlay animates. Returns the chosen label + index. The spin result is
	 * captured from inside the CAS apply so a retry re-picks and the returned values
	 * always match the persisted doc.
	 */
	trigger: protectedProcedure
		.input(z.object({ slotId: z.string().optional() }))
		.mutation(async ({ ctx, input }) => {
			const spinId = crypto.randomUUID();
			const out = { spinId, targetIndex: -1, label: null as string | null };
			await mutateWheel(ctx.db, (doc) => {
				if (enabledSlots(doc).length === 0) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Enable at least one slot to spin.",
					});
				}
				const result = resolveSpin(doc, { slotId: input.slotId, spinId, now: Date.now() });
				out.targetIndex = result.targetIndex;
				out.label = result.winner?.label ?? null;
				return result.doc;
			});
			return out;
		}),
});

export type WheelRouter = typeof wheelRouter;
