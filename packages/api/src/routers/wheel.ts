import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { mutateWheel, readWheel } from "../store";
import {
	enabledSlots,
	isWheelSpinLocked,
	MAX_LABEL_LEN,
	MAX_WEIGHT,
	newWheelServerSeed,
	publicWheelCommitment,
	removeSlot,
	reorderSlots,
	resolveCommittedRandomSpin,
	resolveSpin,
	toWheelControl,
	type WheelDoc,
	WHEEL_RANDOM_COMMIT_DELAY_MS,
	wheelCommitmentHash,
	wheelDraw,
	upsertSlot,
} from "../wheel";

const labelSchema = z.string().trim().max(MAX_LABEL_LEN);
const colorSchema = z.string().trim().max(7);

function assertPoolNotCommitted(doc: WheelDoc) {
	if (doc.pendingCommitment) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "The random spin hash is published. Let the spin reveal before editing dares.",
		});
	}
}

/**
 * Operator-only wheel-of-dares control. The raw doc (all slots incl. disabled,
 * full history) is operator-only; the overlay's note/secret-stripped view lives
 * in the public router. Slot edits clear any armed spin (see ../wheel) so a stale
 * index can't point at the wrong slot after a structural change.
 */
export const wheelRouter = router({
	getRaw: protectedProcedure.query(async ({ ctx }) => toWheelControl(await readWheel(ctx.db))),

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
		.mutation(async ({ ctx, input }) =>
			mutateWheel(ctx.db, (doc) => {
				assertPoolNotCommitted(doc);
				return upsertSlot(doc, input);
			}),
		),

	removeSlot: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) =>
			mutateWheel(ctx.db, (doc) => {
				assertPoolNotCommitted(doc);
				return removeSlot(doc, input.id);
			}),
		),

	reorderSlots: protectedProcedure
		.input(z.object({ ids: z.array(z.string()) }))
		.mutation(async ({ ctx, input }) =>
			mutateWheel(ctx.db, (doc) => {
				assertPoolNotCommitted(doc);
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

	/** Publish a commitment hash; the matching seed stays private until revealRandom. */
	prepareRandom: protectedProcedure.mutation(async ({ ctx }) => {
		const now = Date.now();
		const spinId = crypto.randomUUID();
		const serverSeed = newWheelServerSeed();
		const before = await readWheel(ctx.db);
		if (isWheelSpinLocked(before, now)) {
			throw new TRPCError({
				code: "CONFLICT",
				message: "A wheel spin is already in progress. Wait for it to finish.",
			});
		}
		const pool = enabledSlots(before).map(({ label, weight }) => ({ label, weight }));
		if (pool.length === 0) {
			throw new TRPCError({ code: "BAD_REQUEST", message: "Enable at least one slot to spin." });
		}
		const commitmentHash = await wheelCommitmentHash(serverSeed, spinId, pool);
		const revealAt = now + WHEEL_RANDOM_COMMIT_DELAY_MS;
		await mutateWheel(ctx.db, (doc) => {
			if (isWheelSpinLocked(doc, Date.now())) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "A wheel spin is already in progress. Wait for it to finish.",
				});
			}
			const currentPool = enabledSlots(doc).map(({ label, weight }) => ({ label, weight }));
			if (JSON.stringify(currentPool) !== JSON.stringify(pool)) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "The dare pool changed. Try the random spin again.",
				});
			}
			return {
				...doc,
				pendingCommitment: { spinId, commitmentHash, serverSeed, pool, createdAt: now, revealAt },
			};
		});
		return publicWheelCommitment({
			...before,
			pendingCommitment: { spinId, commitmentHash, serverSeed, pool, createdAt: now, revealAt },
		});
	}),

	/** Reveal a published commitment, derive its weighted result, and arm the overlay. */
	revealRandom: protectedProcedure
		.input(z.object({ spinId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const before = await readWheel(ctx.db);
			const commitment = before.pendingCommitment;
			if (!commitment) {
				const previous = before.history.find((spin) => spin.id === input.spinId && spin.proof);
				if (previous?.proof) {
					return {
						spinId: previous.id,
						targetIndex: previous.proof.targetIndex,
						label: previous.label,
						proof: previous.proof,
					};
				}
				throw new TRPCError({ code: "NOT_FOUND", message: "The random spin hash has expired." });
			}
			if (commitment.spinId !== input.spinId) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "This random spin hash is no longer active.",
				});
			}
			if (Date.now() < commitment.revealAt) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "The spin hash is still being published.",
				});
			}
			const totalWeight = commitment.pool.reduce((total, slot) => total + slot.weight, 0);
			const draw = await wheelDraw(commitment.serverSeed, commitment.spinId, totalWeight);
			let result: {
				spinId: string;
				targetIndex: number;
				label: string;
				proof: NonNullable<(typeof before.history)[number]["proof"]>;
			} | null = null;
			await mutateWheel(ctx.db, (doc) => {
				const current = doc.pendingCommitment;
				if (!current) {
					const previous = doc.history.find((spin) => spin.id === input.spinId && spin.proof);
					if (previous?.proof) {
						result = {
							spinId: previous.id,
							targetIndex: previous.proof.targetIndex,
							label: previous.label,
							proof: previous.proof,
						};
						return doc;
					}
					throw new TRPCError({ code: "NOT_FOUND", message: "The random spin hash has expired." });
				}
				if (current.spinId !== input.spinId || current.serverSeed !== commitment.serverSeed) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "This random spin hash is no longer active.",
					});
				}
				if (Date.now() < current.revealAt) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "The spin hash is still being published.",
					});
				}
				try {
					const resolved = resolveCommittedRandomSpin(doc, {
						spinId: input.spinId,
						now: Date.now(),
						drawHash: draw.drawHash,
						drawCounter: draw.drawCounter,
					});
					result = {
						spinId: input.spinId,
						targetIndex: resolved.targetIndex,
						label: resolved.winner.label,
						proof: resolved.proof,
					};
					return resolved.doc;
				} catch (error) {
					throw new TRPCError({
						code: "CONFLICT",
						message: error instanceof Error ? error.message : "Could not reveal the random spin.",
					});
				}
			});
			if (!result)
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "The spin did not resolve.",
				});
			return result;
		}),

	/** Specific-slot spins are operator-selected and do not claim a random proof. */
	trigger: protectedProcedure
		.input(z.object({ slotId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const spinId = crypto.randomUUID();
			const now = Date.now();
			const out = { spinId, targetIndex: -1, label: null as string | null };
			await mutateWheel(ctx.db, (doc) => {
				// Run inside the CAS apply so competing requests re-check the persisted spin.
				if (isWheelSpinLocked(doc, now)) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "A wheel spin is already in progress. Wait for the result to finish.",
					});
				}
				if (enabledSlots(doc).length === 0) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Enable at least one slot to spin.",
					});
				}
				const result = resolveSpin(doc, { slotId: input.slotId, spinId, now });
				out.targetIndex = result.targetIndex;
				out.label = result.winner?.label ?? null;
				return result.doc;
			});
			return out;
		}),
});
