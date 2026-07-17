import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { resetRound } from "../giveaway";
import { type Goal, MAX_GOALS, MAX_REWARD_LENGTH, MAX_TARGET, validateImport } from "../state";
import { newOverlayToken } from "../settings";
import {
	mutateGiveaway,
	mutateState,
	mutateTimer,
	mutateWheel,
	readSettings,
	readState,
	writeSettings,
} from "../store";
import { type OverlayTheme, type ThemeError, validateOverlayTheme } from "../theme";
import { reset as resetTimerState } from "../timer";
import { botRouter } from "./bot";
import { giveawayRouter } from "./giveaway";
import { timerRouter } from "./timer";
import { twitchRouter } from "./twitch";
import { wheelRouter } from "./wheel";

const rewardSchema = z.string().trim().min(1, "Reward must not be empty.").max(MAX_REWARD_LENGTH);

/** One goal as accepted by `state.replace` — ids/flags are optional and re-normalized. */
const goalSchema = z.object({
	id: z.string().optional(),
	reward: rewardSchema,
	note: z.string().optional(),
	unlocked: z.boolean().optional(),
	target: z.number().int().nonnegative().max(MAX_TARGET).nullable().optional(),
	/** Operator-only: hide this reward from the overlay (a secret/surprise goal). */
	hidden: z.boolean().optional(),
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
		 * Replace the entire state with an operator-provided document. Targets are
		 * saved exactly as sent — nothing is auto-raised. Raising goals that have
		 * fallen at/below the sub count is an explicit, operator-driven action in the
		 * control panel (the "Raise past goals" button), never a silent save-time edit.
		 * Theme is preserved (goal edits never touch it).
		 */
		replace: protectedProcedure.input(dataSchema).mutation(async ({ ctx, input }) => {
			const goals: Goal[] = input.goals.map((g) => ({
				id: g.id ?? crypto.randomUUID(),
				reward: g.reward.trim(),
				note: normalizeNote(g.note),
				unlocked: g.unlocked ?? false,
				...(g.target != null ? { target: g.target } : {}),
				...(g.hidden ? { hidden: true } : {}),
			}));
			// Validate an incoming theme up front (it doesn't depend on the current doc)
			// so a bad theme returns errors without any write.
			let nextTheme: OverlayTheme | undefined;
			if (input.theme !== undefined) {
				const themeErrors: ThemeError[] = [];
				nextTheme = validateOverlayTheme(input.theme, themeErrors);
				if (themeErrors.length > 0) {
					return {
						ok: false as const,
						errors: themeErrors.map((e) => ({ path: e.path, message: e.message })),
					};
				}
			}
			const state = await mutateState(ctx.db, (existing) => ({
				goals,
				currentIndex: input.currentIndex ?? 0,
				currentSubs: input.currentSubs ?? existing.currentSubs ?? 0,
				// Theme rides along when present; otherwise the existing one is preserved.
				theme: nextTheme ?? existing.theme,
			}));
			return { ok: true as const, state };
		}),

		/** Adjust the running sub count (positive or negative); clamps at zero. */
		adjustSubs: protectedProcedure
			.input(z.object({ delta: z.number().int() }))
			.mutation(async ({ ctx, input }) =>
				mutateState(ctx.db, (data) => ({
					...data,
					currentSubs: Math.max(0, (data.currentSubs ?? 0) + input.delta),
				})),
			),

		/** Set the running sub count to an exact value. */
		setSubs: protectedProcedure
			.input(z.object({ value: z.number().int().nonnegative() }))
			.mutation(async ({ ctx, input }) =>
				mutateState(ctx.db, (data) => ({ ...data, currentSubs: input.value })),
			),

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
			const state = await mutateState(ctx.db, (data) => ({ ...data, theme }));
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
			const state = await mutateState(ctx.db, (existing) => ({
				...result.data,
				theme: "theme" in obj ? result.data.theme : existing.theme,
				currentSubs: "currentSubs" in obj ? result.data.currentSubs : existing.currentSubs,
			}));
			return { ok: true as const, state, rewards: result.rewards };
		}),
	}),

	goals: router({
		/** Unlock the current (first locked) goal and advance to the next one. */
		unlockNext: protectedProcedure.mutation(async ({ ctx }) =>
			mutateState(ctx.db, (data) => {
				const target = data.goals.findIndex((g) => !g.unlocked);
				if (target === -1) return data;
				return {
					...data,
					goals: data.goals.map((g, i) => (i === target ? { ...g, unlocked: true } : g)),
				};
			}),
		),

		/** Add a goal, optionally at a specific position (defaults to the end). */
		add: protectedProcedure
			.input(
				z.object({
					reward: rewardSchema,
					note: z.string().optional(),
					index: z.number().int().optional(),
				}),
			)
			.mutation(async ({ ctx, input }) =>
				mutateState(ctx.db, (data) => {
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
					const goals = [...data.goals];
					goals.splice(at, 0, goal);
					return { ...data, goals };
				}),
			),

		/** Remove a goal by id. */
		remove: protectedProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ ctx, input }) =>
				mutateState(ctx.db, (data) => ({
					...data,
					goals: data.goals.filter((g) => g.id !== input.id),
				})),
			),

		/** Reorder goals to match the provided id list (must reference every goal). */
		reorder: protectedProcedure
			.input(z.object({ ids: z.array(z.string()) }))
			.mutation(async ({ ctx, input }) =>
				mutateState(ctx.db, (data) => {
					const byId = new Map(data.goals.map((g) => [g.id, g]));
					if (input.ids.length !== data.goals.length || input.ids.some((id) => !byId.has(id))) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Reorder must reference every goal exactly once.",
						});
					}
					return { ...data, goals: input.ids.map((id) => byId.get(id)!) };
				}),
			),
	}),

	/** Overlay token: the shared secret in the OBS source URLs. */
	settings: router({
		get: protectedProcedure.query(async ({ ctx }) => readSettings(ctx.db)),
		/** Rotate the overlay token — instantly breaks old URLs (re-paste in OBS). */
		rotateOverlayToken: protectedProcedure.mutation(async ({ ctx }) =>
			writeSettings(ctx.db, { overlayToken: newOverlayToken() }),
		),
	}),

	/**
	 * One-click "start fresh for the next subathon": wipe all live PROGRESS but
	 * keep every bit of CONFIG. Timer → back to base, subs → 0, all goals re-locked,
	 * wheel spin history cleared (dares kept), giveaway round reset (command/threshold
	 * kept). Twitch/bot connections and the overlay token are untouched, so OBS keeps
	 * working. ponytail: four separate CAS writes, not one transaction — a failure
	 * mid-way leaves a partial reset; re-running finishes it. Fine for a manual op.
	 */
	resetForNextSubathon: protectedProcedure.mutation(async ({ ctx }) => {
		await mutateState(ctx.db, (state) => ({
			...state,
			goals: state.goals.map((g) => ({ ...g, unlocked: false })),
			currentSubs: 0,
		}));
		await mutateTimer(ctx.db, (timer) => ({ ...timer, state: resetTimerState(timer.config) }));
		await mutateWheel(ctx.db, (wheel) => ({ ...wheel, history: [] }));
		await mutateGiveaway(ctx.db, (giveaway) => resetRound(giveaway));
		return { ok: true as const };
	}),

	timer: timerRouter,
	twitch: twitchRouter,
	giveaway: giveawayRouter,
	wheel: wheelRouter,
	bot: botRouter,
});

export type ProtectedRouter = typeof protectedRouter;
