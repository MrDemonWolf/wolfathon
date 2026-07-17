import { z } from "zod";

import {
	addWinner,
	applyConfig,
	applyGiveawayEvent,
	drawRaffle,
	type Entrant,
	removeWinner,
	rerollRaffle,
	resetPool,
	resetRound,
	setShipped,
	setWinnerNote,
	startGiveaway,
} from "../giveaway";
import { protectedProcedure, router } from "../index";
import { mutateGiveaway, readGiveaway } from "../store";

const loginSchema = z
	.string()
	.trim()
	.min(1)
	.max(50)
	.transform((s) => s.toLowerCase());

/**
 * Operator-only giveaway control. The raw doc (gifters / entrants / winners,
 * including private winner notes) is operator-only; nothing here is public.
 */
export const giveawayRouter = router({
	getRaw: protectedProcedure.query(async ({ ctx }) => readGiveaway(ctx.db)),

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
		.mutation(async ({ ctx, input }) => mutateGiveaway(ctx.db, (doc) => applyConfig(doc, input))),

	/** Start the round so gift events begin counting (gifts before this are ignored). */
	start: protectedProcedure.mutation(async ({ ctx }) =>
		mutateGiveaway(ctx.db, (doc) => startGiveaway(doc, Date.now())),
	),

	/** Confirm a qualifying gifter as a winner (the "auto-capture, you confirm" step). */
	addGiftWinner: protectedProcedure
		.input(z.object({ login: loginSchema }))
		.mutation(async ({ ctx, input }) =>
			mutateGiveaway(ctx.db, (doc) => {
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
			mutateGiveaway(ctx.db, (doc) =>
				addWinner(
					doc,
					{ login: input.login, name: input.name?.trim() || input.login, source: input.source },
					Date.now(),
				),
			),
		),

	/**
	 * Draw one raffle winner from the open pool. Arms a pending `!claim`; the
	 * public Worker announces it and handles the claim/timeout IN CHAT — this
	 * mutation only mutates the doc and never sends chat directly. The winner is
	 * captured from inside the CAS apply, so a retry re-draws and the returned
	 * winner always matches the persisted doc.
	 */
	drawRaffle: protectedProcedure.mutation(async ({ ctx }) => {
		const out: { winner: Entrant | null } = { winner: null };
		await mutateGiveaway(ctx.db, (doc) => {
			const result = drawRaffle(doc, Date.now());
			out.winner = result.winner;
			return result.doc;
		});
		return out;
	}),

	/** Swap a raffle winner for a fresh draw (excludes the person rerolled out). */
	reroll: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const out: { winner: Entrant | null } = { winner: null };
			await mutateGiveaway(ctx.db, (doc) => {
				const result = rerollRaffle(doc, input.id, Date.now());
				out.winner = result.winner;
				return result.doc;
			});
			return out;
		}),

	/**
	 * Manually add a raffle entrant — fallback for testing or if the chat ingest
	 * is unavailable. Bypasses the open/closed gate by design (operator action).
	 */
	addEntrant: protectedProcedure
		.input(z.object({ login: loginSchema, name: z.string().trim().max(50).optional() }))
		.mutation(async ({ ctx, input }) =>
			mutateGiveaway(ctx.db, (doc) => {
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
			mutateGiveaway(ctx.db, (doc) => removeWinner(doc, input.id)),
		),

	/**
	 * Empty the raffle pool (entrants + any pending claim) without un-starting the
	 * round or clearing gift winners — for reopening `!enter` for a fresh wave.
	 */
	resetPool: protectedProcedure.mutation(async ({ ctx }) =>
		mutateGiveaway(ctx.db, (doc) => resetPool(doc)),
	),

	/** Clear gifters, entrants, and winners for a fresh round (keeps config). */
	resetRound: protectedProcedure.mutation(async ({ ctx }) =>
		mutateGiveaway(ctx.db, (doc) => resetRound(doc)),
	),
});

export type GiveawayRouter = typeof giveawayRouter;
