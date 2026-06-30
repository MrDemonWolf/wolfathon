import { z } from "zod";

import {
	addWinner,
	applyConfig,
	applyGiveawayEvent,
	drawRaffle,
	removeWinner,
	rerollRaffle,
	resetPool,
	resetRound,
	setShipped,
	setWinnerNote,
	startGiveaway,
} from "../giveaway";
import { protectedProcedure, router } from "../index";
import { readGiveaway, writeGiveaway } from "../store";

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
		.mutation(async ({ ctx, input }) => {
			const doc = await readGiveaway(ctx.db);
			return writeGiveaway(ctx.db, applyConfig(doc, input));
		}),

	/** Start the round so gift events begin counting (gifts before this are ignored). */
	start: protectedProcedure.mutation(async ({ ctx }) => {
		const doc = await readGiveaway(ctx.db);
		return writeGiveaway(ctx.db, startGiveaway(doc, Date.now()));
	}),

	/** Confirm a qualifying gifter as a winner (the "auto-capture, you confirm" step). */
	addGiftWinner: protectedProcedure
		.input(z.object({ login: loginSchema }))
		.mutation(async ({ ctx, input }) => {
			const doc = await readGiveaway(ctx.db);
			const gifter = doc.gifters.find((g) => g.login === input.login);
			const name = gifter?.name ?? input.login;
			return writeGiveaway(
				ctx.db,
				addWinner(doc, { login: input.login, name, source: "gift" }, Date.now()),
			);
		}),

	/**
	 * Draw one raffle winner from the open pool. Arms a pending `!claim`; the
	 * public Worker announces it and handles the claim/timeout IN CHAT — this
	 * mutation only mutates the doc and never sends chat directly.
	 */
	drawRaffle: protectedProcedure.mutation(async ({ ctx }) => {
		const doc = await readGiveaway(ctx.db);
		const { doc: next, winner } = drawRaffle(doc, Date.now());
		await writeGiveaway(ctx.db, next);
		return { winner };
	}),

	/** Swap a raffle winner for a fresh draw (excludes the person rerolled out). */
	reroll: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const doc = await readGiveaway(ctx.db);
			const { doc: next, winner } = rerollRaffle(doc, input.id, Date.now());
			await writeGiveaway(ctx.db, next);
			return { winner };
		}),

	/**
	 * Manually add a raffle entrant — fallback for testing or if the chat ingest
	 * is unavailable. Bypasses the open/closed gate by design (operator action).
	 */
	addEntrant: protectedProcedure
		.input(z.object({ login: loginSchema, name: z.string().trim().max(50).optional() }))
		.mutation(async ({ ctx, input }) => {
			const doc = await readGiveaway(ctx.db);
			const next = applyGiveawayEvent(
				{ ...doc, config: { ...doc.config, open: true } },
				{ kind: "entry", login: input.login, name: input.name?.trim() || input.login },
				Date.now(),
			);
			// Preserve the operator's real open/closed setting.
			return writeGiveaway(ctx.db, { ...next, config: doc.config });
		}),

	setShipped: protectedProcedure
		.input(z.object({ id: z.string(), shipped: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const doc = await readGiveaway(ctx.db);
			return writeGiveaway(ctx.db, setShipped(doc, input.id, input.shipped));
		}),

	setNote: protectedProcedure
		.input(z.object({ id: z.string(), note: z.string().max(500) }))
		.mutation(async ({ ctx, input }) => {
			const doc = await readGiveaway(ctx.db);
			return writeGiveaway(ctx.db, setWinnerNote(doc, input.id, input.note));
		}),

	removeWinner: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const doc = await readGiveaway(ctx.db);
			return writeGiveaway(ctx.db, removeWinner(doc, input.id));
		}),

	/**
	 * Empty the raffle pool (entrants + any pending claim) without un-starting the
	 * round or clearing gift winners — for reopening `!enter` for a fresh wave.
	 */
	resetPool: protectedProcedure.mutation(async ({ ctx }) => {
		const doc = await readGiveaway(ctx.db);
		return writeGiveaway(ctx.db, resetPool(doc));
	}),

	/** Clear gifters, entrants, and winners for a fresh round (keeps config). */
	resetRound: protectedProcedure.mutation(async ({ ctx }) => {
		const doc = await readGiveaway(ctx.db);
		return writeGiveaway(ctx.db, resetRound(doc));
	}),
});

export type GiveawayRouter = typeof giveawayRouter;
