import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
	addWinner,
	applyConfig,
	applyGiveawayEvent,
	eligibleRaffleLogins,
	newRaffleServerSeed,
	removeWinner,
	raffleCommitmentHash,
	RAFFLE_PROOF_REVEAL_DELAY_MS,
	resolveCommittedRaffleDraw,
	resetPool,
	resetRound,
	setShipped,
	setWinnerNote,
	startGiveaway,
	toGiveawayControl,
} from "../giveaway";
import { protectedProcedure, router } from "../index";
import { mutateGiveaway, readGiveaway } from "../store";
import { wheelDraw } from "../wheel";

const loginSchema = z
	.string()
	.trim()
	.min(1)
	.max(50)
	.transform((s) => s.toLowerCase());

function assertNoPendingRaffleDraw(doc: Awaited<ReturnType<typeof readGiveaway>>) {
	if (doc.pendingRaffleDraw) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"The raffle hash is published. Wait for the result to reveal before changing winners or the pool.",
		});
	}
}

async function prepareRaffleDraw(db: Parameters<typeof readGiveaway>[0], targetWinnerId?: string) {
	const now = Date.now();
	const before = await readGiveaway(db);
	assertNoPendingRaffleDraw(before);
	if (targetWinnerId) {
		const target = before.winners.find((winner) => winner.id === targetWinnerId);
		if (!target || target.source !== "raffle") {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "That raffle winner can no longer be rerolled.",
			});
		}
	}
	const pool = eligibleRaffleLogins(before, targetWinnerId);
	if (pool.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: targetWinnerId
				? "No eligible entrants are left to reroll to."
				: "No entrants left to draw.",
		});
	}
	const drawId = crypto.randomUUID();
	const serverSeed = newRaffleServerSeed();
	const commitmentHash = await raffleCommitmentHash(serverSeed, drawId, pool);
	const revealAt = now + RAFFLE_PROOF_REVEAL_DELAY_MS;
	await mutateGiveaway(db, (doc) => {
		assertNoPendingRaffleDraw(doc);
		if (JSON.stringify(eligibleRaffleLogins(doc, targetWinnerId)) !== JSON.stringify(pool)) {
			throw new TRPCError({
				code: "CONFLICT",
				message: "The raffle pool changed. Publish a new draw hash.",
			});
		}
		return {
			...doc,
			pendingRaffleDraw: {
				drawId,
				kind: targetWinnerId ? "reroll" : "draw",
				...(targetWinnerId ? { targetWinnerId } : {}),
				commitmentHash,
				serverSeed,
				pool,
				queuedEntrants: [],
				createdAt: now,
				revealAt,
			},
		};
	});
	return { drawId, commitmentHash, revealAt, poolSize: pool.length };
}

/**
 * Operator-only giveaway control. The raw doc (gifters / entrants / winners,
 * including private notes and revealed proof seeds) is operator-only. The live
 * commitment seed is stripped until its reveal.
 */
export const giveawayRouter = router({
	getRaw: protectedProcedure.query(async ({ ctx }) =>
		toGiveawayControl(await readGiveaway(ctx.db)),
	),

	/** Full proof pools load only when the operator opens the proof history. */
	history: protectedProcedure.query(async ({ ctx }) => (await readGiveaway(ctx.db)).raffleHistory),

	setConfig: protectedProcedure
		.input(
			z.object({
				command: z.string().optional(),
				giftThreshold: z.number().optional(),
				giftWinnerSlots: z.number().optional(),
				raffleWinnerSlots: z.number().optional(),
				open: z.boolean().optional(),
				/** Rules/TOS link (gist or any URL) the `!giveaway` command points at. */
				tosUrl: z.string().max(400).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) =>
			mutateGiveaway(ctx.db, (doc) => {
				assertNoPendingRaffleDraw(doc);
				return applyConfig(doc, input);
			}),
		),

	/** Start the round so gift events begin counting (gifts before this are ignored). */
	start: protectedProcedure.mutation(async ({ ctx }) =>
		mutateGiveaway(ctx.db, (doc) => startGiveaway(doc, Date.now())),
	),

	/** Confirm a qualifying gifter as a winner (the "auto-capture, you confirm" step). */
	addGiftWinner: protectedProcedure
		.input(z.object({ login: loginSchema }))
		.mutation(async ({ ctx, input }) =>
			mutateGiveaway(ctx.db, (doc) => {
				assertNoPendingRaffleDraw(doc);
				const gifter = doc.gifters.find((g) => g.login === input.login);
				const name = gifter?.name ?? input.login;
				return addWinner(doc, { login: input.login, name, source: "gift" }, Date.now());
			}),
		),

	/**
	 * Add a winner directly by login — the manual override for winners picked
	 * outside the auto-capture flow (e.g. gift-sub winners already chosen). Dedups
	 * by login; `name` falls back to the login when omitted.
	 */
	addManualWinner: protectedProcedure
		.input(
			z.object({
				login: loginSchema,
				name: z.string().trim().max(50).optional(),
				source: z.enum(["gift", "raffle"]).default("gift"),
			}),
		)
		.mutation(async ({ ctx, input }) =>
			mutateGiveaway(ctx.db, (doc) => {
				assertNoPendingRaffleDraw(doc);
				return addWinner(
					doc,
					{ login: input.login, name: input.name?.trim() || input.login, source: input.source },
					Date.now(),
				);
			}),
		),

	/**
	 * Publish the commitment hash and freeze the eligible pool. The matching seed
	 * stays private until revealRaffleDraw after the short publication delay.
	 */
	drawRaffle: protectedProcedure.mutation(async ({ ctx }) => prepareRaffleDraw(ctx.db)),

	/** Start a committed reroll, excluding the replaced winner from its pool. */
	reroll: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => prepareRaffleDraw(ctx.db, input.id)),

	/** Reveal the published seed and record the auditable winner and pool snapshot. */
	revealRaffleDraw: protectedProcedure
		.input(z.object({ drawId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const before = await readGiveaway(ctx.db);
			const commitment = before.pendingRaffleDraw;
			if (!commitment) {
				const previous = before.raffleHistory.find((record) => record.drawId === input.drawId);
				if (previous) return previous;
				throw new TRPCError({ code: "NOT_FOUND", message: "The raffle draw hash has expired." });
			}
			if (commitment.drawId !== input.drawId) {
				throw new TRPCError({ code: "CONFLICT", message: "This raffle hash is no longer active." });
			}
			if (Date.now() < commitment.revealAt) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "The raffle hash is still being published.",
				});
			}
			const draw = await wheelDraw(
				commitment.serverSeed,
				commitment.drawId,
				commitment.pool.length,
			);
			const out: { result: ReturnType<typeof resolveCommittedRaffleDraw> | null } = {
				result: null,
			};
			await mutateGiveaway(ctx.db, (doc) => {
				const current = doc.pendingRaffleDraw;
				if (!current) {
					const previous = doc.raffleHistory.find((record) => record.drawId === input.drawId);
					if (previous) return doc;
					throw new TRPCError({ code: "NOT_FOUND", message: "The raffle draw hash has expired." });
				}
				if (current.drawId !== input.drawId || current.serverSeed !== commitment.serverSeed) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "This raffle hash is no longer active.",
					});
				}
				if (Date.now() < current.revealAt) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "The raffle hash is still being published.",
					});
				}
				try {
					out.result = resolveCommittedRaffleDraw(doc, {
						drawId: input.drawId,
						drawHash: draw.drawHash,
						drawCounter: draw.drawCounter,
						bucket: draw.bucket,
						now: Date.now(),
					});
					return out.result.doc;
				} catch (error) {
					throw new TRPCError({
						code: "CONFLICT",
						message: error instanceof Error ? error.message : "Could not reveal the raffle draw.",
					});
				}
			});
			if (out.result) return out.result.record;
			const previous = (await readGiveaway(ctx.db)).raffleHistory.find(
				(record) => record.drawId === input.drawId,
			);
			if (previous) return previous;
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "The raffle draw did not resolve.",
			});
		}),

	/**
	 * Manually add a raffle entrant — fallback for testing or if the chat ingest
	 * is unavailable. Bypasses the open/closed gate by design (operator action).
	 */
	addEntrant: protectedProcedure
		.input(z.object({ login: loginSchema, name: z.string().trim().max(50).optional() }))
		.mutation(async ({ ctx, input }) =>
			mutateGiveaway(ctx.db, (doc) => {
				assertNoPendingRaffleDraw(doc);
				const next = applyGiveawayEvent(
					{ ...doc, config: { ...doc.config, open: true } },
					{ kind: "entry", login: input.login, name: input.name?.trim() || input.login },
					Date.now(),
				);
				// Preserve the operator's real open/closed setting.
				return { ...next, config: doc.config };
			}),
		),

	setShipped: protectedProcedure
		.input(z.object({ id: z.string(), shipped: z.boolean() }))
		.mutation(async ({ ctx, input }) =>
			mutateGiveaway(ctx.db, (doc) => setShipped(doc, input.id, input.shipped)),
		),

	setNote: protectedProcedure
		.input(z.object({ id: z.string(), note: z.string().max(500) }))
		.mutation(async ({ ctx, input }) =>
			mutateGiveaway(ctx.db, (doc) => setWinnerNote(doc, input.id, input.note)),
		),

	removeWinner: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) =>
			mutateGiveaway(ctx.db, (doc) => {
				assertNoPendingRaffleDraw(doc);
				return removeWinner(doc, input.id);
			}),
		),

	/**
	 * Empty the raffle pool (entrants + any pending claim) without un-starting the
	 * round or clearing gift winners — for reopening `!enter` for a fresh wave.
	 */
	resetPool: protectedProcedure.mutation(async ({ ctx }) =>
		mutateGiveaway(ctx.db, (doc) => {
			assertNoPendingRaffleDraw(doc);
			return resetPool(doc);
		}),
	),

	/** Clear gifters, entrants, and winners for a fresh round (keeps config). */
	resetRound: protectedProcedure.mutation(async ({ ctx }) =>
		mutateGiveaway(ctx.db, (doc) => {
			assertNoPendingRaffleDraw(doc);
			return resetRound(doc);
		}),
	),
});
