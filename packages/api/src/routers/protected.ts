import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
	bumpPassedGoals,
	type Data,
	type Goal,
	MAX_GOALS,
	MAX_REWARD_LENGTH,
	MAX_TARGET,
	validateImport,
} from "../state";
import { readState, writeState } from "../store";
import { type ThemeError, validateOverlayTheme } from "../theme";
import { timerRouter } from "./timer";
import { streamElementsRouter } from "./streamelements";
import { twitchRouter } from "./twitch";

const rewardSchema = z.string().trim().min(1, "Reward must not be empty.").max(MAX_REWARD_LENGTH);

/** One goal as accepted by `state.replace` — ids/flags are optional and re-normalized. */
const goalSchema = z.object({
	id: z.string().optional(),
	reward: rewardSchema,
	note: z.string().optional(),
	unlocked: z.boolean().optional(),
	target: z.number().int().nonnegative().max(MAX_TARGET).nullable().optional(),
});

const dataSchema = z.object({
	goals: z.array(goalSchema).min(1).max(MAX_GOALS),
	currentIndex: z.number().int().nonnegative().optional(),
	currentSubs: z.number().int().nonnegative().optional(),
	/** Optional — when present, validated + saved in the same write as the goals. */
	theme: z.unknown().optional(),
});

function normalizeNote(note: string | undefined): string | undefined {
	const trimmed = note?.trim();
	return trimmed ? trimmed : undefined;
}

/**
 * Operator-only API. Every procedure requires a Cloudflare Access user.
 * Reads here return the RAW state (notes included) — only the overlay's
 * public router strips notes.
 */
export const protectedRouter = router({
	state: router({
		/** Full state including notes — powers Export and the control panel. */
		getRaw: protectedProcedure.query(async ({ ctx }) => readState(ctx.db)),

		/**
		 * Replace the entire state with an operator-provided document. On save,
		 * any numeric target at/below the current sub count is auto-bumped ~10% so
		 * goals stay ahead of the count. Theme is preserved (goal edits never touch it).
		 */
		replace: protectedProcedure.input(dataSchema).mutation(async ({ ctx, input }) => {
			const existing = await readState(ctx.db);
			const goals: Goal[] = input.goals.map((g) => ({
				id: g.id ?? crypto.randomUUID(),
				reward: g.reward.trim(),
				note: normalizeNote(g.note),
				unlocked: g.unlocked ?? false,
				...(g.target != null ? { target: g.target } : {}),
			}));
			const currentSubs = input.currentSubs ?? existing.currentSubs ?? 0;
			const { goals: bumpedGoals, bumped } = bumpPassedGoals(goals, currentSubs);
			// Theme rides along when present; otherwise the existing one is preserved.
			let theme = existing.theme;
			if (input.theme !== undefined) {
				const themeErrors: ThemeError[] = [];
				theme = validateOverlayTheme(input.theme, themeErrors);
				if (themeErrors.length > 0) {
					return {
						ok: false as const,
						errors: themeErrors.map((e) => ({ path: e.path, message: e.message })),
					};
				}
			}
			const state = await writeState(ctx.db, {
				goals: bumpedGoals,
				currentIndex: input.currentIndex ?? 0,
				currentSubs,
				theme,
			});
			return { ok: true as const, state, bumped };
		}),

		/** Adjust the running sub count (positive or negative); clamps at zero. */
		adjustSubs: protectedProcedure
			.input(z.object({ delta: z.number().int() }))
			.mutation(async ({ ctx, input }) => {
				const data = await readState(ctx.db);
				const currentSubs = Math.max(0, (data.currentSubs ?? 0) + input.delta);
				return writeState(ctx.db, { ...data, currentSubs });
			}),

		/** Set the running sub count to an exact value. */
		setSubs: protectedProcedure
			.input(z.object({ value: z.number().int().nonnegative() }))
			.mutation(async ({ ctx, input }) => {
				const data = await readState(ctx.db);
				return writeState(ctx.db, { ...data, currentSubs: input.value });
			}),

		/** Update only the overlay theme, preserving goals. */
		setTheme: protectedProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
			const errors: ThemeError[] = [];
			const theme = validateOverlayTheme(input, errors);
			if (errors.length > 0) {
				return {
					ok: false as const,
					errors: errors.map((e) => ({ path: e.path, message: e.message })),
				};
			}
			const data = await readState(ctx.db);
			const state = await writeState(ctx.db, { ...data, theme });
			return { ok: true as const, state };
		}),

		/**
		 * Validate an import document WITHOUT writing (powers the Validate button).
		 * Returns a parsed preview or a structured list of row errors.
		 */
		validate: protectedProcedure.input(z.unknown()).mutation(({ input }) => {
			const result = validateImport(input);
			if (!result.ok) return { ok: false as const, errors: result.errors };
			return { ok: true as const, count: result.rewards.length, rewards: result.rewards };
		}),

		/**
		 * Validate, then REPLACE ALL goals and reset progress. Never partial-writes:
		 * on any validation error nothing is written and the errors are returned.
		 */
		import: protectedProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => {
			const result = validateImport(input);
			if (!result.ok) return { ok: false as const, errors: result.errors };
			// Importing goals shouldn't reset colours or the sub count: keep the
			// existing values unless the imported document explicitly carries them.
			const obj = typeof input === "object" && input !== null ? (input as object) : {};
			const existing = await readState(ctx.db);
			const theme = "theme" in obj ? result.data.theme : existing.theme;
			const currentSubs = "currentSubs" in obj ? result.data.currentSubs : existing.currentSubs;
			const state = await writeState(ctx.db, { ...result.data, theme, currentSubs });
			return { ok: true as const, state, rewards: result.rewards };
		}),
	}),

	goals: router({
		/** Unlock the current (first locked) goal and advance to the next one. */
		unlockNext: protectedProcedure.mutation(async ({ ctx }) => {
			const data = await readState(ctx.db);
			const target = data.goals.findIndex((g) => !g.unlocked);
			if (target !== -1) {
				data.goals[target]!.unlocked = true;
			}
			return writeState(ctx.db, data);
		}),

		/** Add a goal, optionally at a specific position (defaults to the end). */
		add: protectedProcedure
			.input(
				z.object({
					reward: rewardSchema,
					note: z.string().optional(),
					index: z.number().int().optional(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const data = await readState(ctx.db);
				if (data.goals.length >= MAX_GOALS) {
					throw new TRPCError({ code: "BAD_REQUEST", message: `Max ${MAX_GOALS} goals.` });
				}
				const goal: Goal = {
					id: crypto.randomUUID(),
					reward: input.reward.trim(),
					note: normalizeNote(input.note),
					unlocked: false,
				};
				const at =
					input.index === undefined
						? data.goals.length
						: Math.max(0, Math.min(input.index, data.goals.length));
				data.goals.splice(at, 0, goal);
				return writeState(ctx.db, data);
			}),

		/** Remove a goal by id. */
		remove: protectedProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ ctx, input }) => {
				const data = await readState(ctx.db);
				const next: Data = {
					goals: data.goals.filter((g) => g.id !== input.id),
					currentIndex: 0,
					currentSubs: data.currentSubs,
					theme: data.theme,
				};
				return writeState(ctx.db, next);
			}),

		/** Reorder goals to match the provided id list (must reference every goal). */
		reorder: protectedProcedure
			.input(z.object({ ids: z.array(z.string()) }))
			.mutation(async ({ ctx, input }) => {
				const data = await readState(ctx.db);
				const byId = new Map(data.goals.map((g) => [g.id, g]));
				if (input.ids.length !== data.goals.length || input.ids.some((id) => !byId.has(id))) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Reorder must reference every goal exactly once.",
					});
				}
				const goals = input.ids.map((id) => byId.get(id)!);
				return writeState(ctx.db, {
					goals,
					currentIndex: 0,
					currentSubs: data.currentSubs,
					theme: data.theme,
				});
			}),
	}),

	timer: timerRouter,
	twitch: twitchRouter,
	streamElements: streamElementsRouter,
});

export type ProtectedRouter = typeof protectedRouter;
