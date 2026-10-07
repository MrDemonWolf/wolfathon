import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { resetRound } from "../giveaway";
import { type Goal, MAX_GOALS, MAX_REWARD_LENGTH, MAX_TARGET, validateImport } from "../state";
import {
	MAX_OVERLAY_SOUND_BASE64_LENGTH,
	MAX_OVERLAY_SOUND_BYTES,
	OVERLAY_SOUND_MIME_TYPES,
	REWARD_SOUND_PRESET_IDS,
	TIMER_SOUND_PRESET_IDS,
	TIMER_WARNING_SOUND_PRESET_IDS,
	newOverlayToken,
} from "../settings";
import {
	mutateGiveaway,
	mutateSettings,
	mutateState,
	mutateTimer,
	mutateWheel,
	deleteOverlaySound,
	readOverlaySound,
	readSettings,
	readState,
	revMatches,
	staleRevError,
	writeOverlaySound,
} from "../store";
import { type OverlayTheme, type ThemeError, validateOverlayTheme } from "../theme";
import { reset as resetTimerState } from "../timer";
import { botRouter } from "./bot";
import { giveawayRouter } from "./giveaway";
import { timerRouter } from "./timer";
import { twitchRouter } from "./twitch";
import { wheelRouter } from "./wheel";

const rewardSchema = z.string().trim().min(1, "Reward must not be empty.").max(MAX_REWARD_LENGTH);
const overlaySoundBase64 = z
	.string()
	.min(4)
	.max(MAX_OVERLAY_SOUND_BASE64_LENGTH)
	.regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);

function safeOverlaySoundFileName(fileName: string): string {
	return Array.from(fileName)
		.filter((char) => {
			const code = char.charCodeAt(0);
			return code >= 0x20 && (code < 0x7f || code > 0x9f);
		})
		.join("")
		.slice(0, 100);
}

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
	currentSubs: z.number().int().nonnegative().optional(),
	/** Optional — when present, validated + saved in the same write as the goals. */
	theme: z.unknown().optional(),
	/** Optional — absent preserves the stored choice. */
	freezeMetTargets: z.boolean().optional(),
	/**
	 * The `goalsRev` this edit was built from. A mismatch means someone else changed
	 * the goals since this page loaded, and the save is rejected instead of silently
	 * overwriting them. Omit to opt out (scripts, restores).
	 */
	baseGoalsRev: z.number().int().nonnegative().optional(),
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
			const state = await mutateState(ctx.db, (existing) => {
				// Checked INSIDE the CAS apply so the comparison is against the row we are
				// about to write, not a racy pre-read. A throw here escapes the retry loop
				// uncaught, so a rejected save writes nothing at all.
				if (!revMatches(input.baseGoalsRev, existing.goalsRev)) throw staleRevError("goals");
				return {
					goals,
					// Derived from the unlocked flags by `recompute` on the way out — anything
					// set here is overwritten, so it isn't accepted from the client at all.
					currentIndex: existing.currentIndex,
					currentSubs: input.currentSubs ?? existing.currentSubs ?? 0,
					// Theme rides along when present; otherwise the existing one is preserved.
					theme: nextTheme ?? existing.theme,
					freezeMetTargets: input.freezeMetTargets ?? existing.freezeMetTargets,
					// Server-owned; `mutateState` recomputes it on write.
					goalsRev: existing.goalsRev,
				};
			});
			return { ok: true as const, state };
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
				freezeMetTargets:
					"freezeMetTargets" in obj ? result.data.freezeMetTargets : existing.freezeMetTargets,
			}));
			return { ok: true as const, state, rewards: result.rewards };
		}),
	}),

	settings: router({
		get: protectedProcedure.query(async ({ ctx }) => readSettings(ctx.db)),
		getSoundAsset: protectedProcedure
			.input(z.object({ id: z.string().uuid() }))
			.query(async ({ ctx, input }) => {
				const settings = await readSettings(ctx.db);
				if (settings.overlaySounds.customSound?.id !== input.id) return null;
				const asset = await readOverlaySound(ctx.db, input.id);
				return asset?.id === input.id
					? { id: asset.id, mimeType: asset.mimeType, base64: asset.base64 }
					: null;
			}),
		updateOverlaySounds: protectedProcedure
			.input(
				z
					.object({
						wheelTickEnabled: z.boolean().optional(),
						wheelPickEnabled: z.boolean().optional(),
						rewardUnlockEnabled: z.boolean().optional(),
						allRewardsEnabled: z.boolean().optional(),
						timerEndEnabled: z.boolean().optional(),
						timerWarningEnabled: z.boolean().optional(),
						wheelPickPreset: z.enum(REWARD_SOUND_PRESET_IDS).optional(),
						rewardPreset: z.enum(REWARD_SOUND_PRESET_IDS).optional(),
						allRewardsPreset: z.enum(REWARD_SOUND_PRESET_IDS).optional(),
						timerWarningPreset: z.enum(TIMER_WARNING_SOUND_PRESET_IDS).optional(),
						timerPreset: z.enum(TIMER_SOUND_PRESET_IDS).optional(),
					})
					.refine(
						(input) =>
							input.wheelTickEnabled !== undefined ||
							input.wheelPickEnabled !== undefined ||
							input.rewardUnlockEnabled !== undefined ||
							input.allRewardsEnabled !== undefined ||
							input.timerEndEnabled !== undefined ||
							input.timerWarningEnabled !== undefined ||
							input.wheelPickPreset !== undefined ||
							input.rewardPreset !== undefined ||
							input.allRewardsPreset !== undefined ||
							input.timerWarningPreset !== undefined ||
							input.timerPreset !== undefined,
					),
			)
			.mutation(async ({ ctx, input }) =>
				mutateSettings(ctx.db, (settings) => ({
					...settings,
					overlaySounds: { ...settings.overlaySounds, ...input },
				})),
			),
		uploadOverlaySound: protectedProcedure
			.input(
				z.object({
					fileName: z.string().trim().min(1).max(100),
					mimeType: z.enum(OVERLAY_SOUND_MIME_TYPES),
					base64: overlaySoundBase64,
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const padding = input.base64.endsWith("==") ? 2 : input.base64.endsWith("=") ? 1 : 0;
				const sizeBytes = (input.base64.length / 4) * 3 - padding;
				if (sizeBytes > MAX_OVERLAY_SOUND_BYTES) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Sound files must be 256 KiB or smaller.",
					});
				}
				const id = crypto.randomUUID();
				const asset = { ...input, id, sizeBytes };
				await writeOverlaySound(ctx.db, asset);
				let previousSoundId: string | undefined;
				const settings = await mutateSettings(ctx.db, (current) => {
					previousSoundId = current.overlaySounds.customSound?.id;
					return {
						...current,
						overlaySounds: {
							...current.overlaySounds,
							customSound: {
								id,
								fileName: safeOverlaySoundFileName(input.fileName),
								mimeType: input.mimeType,
								sizeBytes,
							},
						},
					};
				});
				if (previousSoundId && previousSoundId !== id) {
					await deleteOverlaySound(ctx.db, previousSoundId);
				}
				return settings;
			}),
		removeOverlaySound: protectedProcedure.mutation(async ({ ctx }) => {
			let previousSoundId: string | undefined;
			const settings = await mutateSettings(ctx.db, (current) => {
				previousSoundId = current.overlaySounds.customSound?.id;
				return {
					...current,
					overlaySounds: { ...current.overlaySounds, customSound: null },
				};
			});
			if (previousSoundId) await deleteOverlaySound(ctx.db, previousSoundId);
			return settings;
		}),
		/** Rotate the overlay token — instantly breaks old URLs (re-paste in OBS). */
		rotateOverlayToken: protectedProcedure.mutation(async ({ ctx }) =>
			mutateSettings(ctx.db, (settings) => ({ ...settings, overlayToken: newOverlayToken() })),
		),
	}),

	/**
	 * One-click "start fresh for the next subathon": wipe all live PROGRESS but
	 * keep every bit of CONFIG. Timer → back to base, subs → 0, all goals re-locked,
	 * wheel spin history cleared (dares kept), giveaway round reset (command/threshold
	 * kept). Twitch/bot connections and the overlay token are untouched, so OBS keeps
	 * working. ponytail: four separate CAS writes, not one transaction — a failure
	 * mid-way leaves a partial reset; re-running finishes it. Fine for a manual op.
	 * They touch four different rows with no ordering between them, so they run
	 * concurrently; `Promise.all` still rejects on the first failure, which keeps the
	 * re-run-to-finish behaviour.
	 */
	resetForNextSubathon: protectedProcedure.mutation(async ({ ctx }) => {
		await Promise.all([
			mutateState(ctx.db, (state) => ({
				...state,
				goals: state.goals.map((g) => ({ ...g, unlocked: false })),
				currentSubs: 0,
			})),
			mutateTimer(ctx.db, (timer) => ({ ...timer, state: resetTimerState(timer.config) })),
			mutateWheel(ctx.db, (wheel) => ({ ...wheel, history: [] })),
			mutateGiveaway(ctx.db, (giveaway) => {
				if (giveaway.pendingRaffleDraw) {
					throw new TRPCError({
						code: "CONFLICT",
						message:
							"The raffle hash is published. Wait for the result to reveal before resetting the round.",
					});
				}
				return resetRound(giveaway);
			}),
		]);
		return { ok: true as const };
	}),

	timer: timerRouter,
	twitch: twitchRouter,
	giveaway: giveawayRouter,
	wheel: wheelRouter,
	bot: botRouter,
});

export type ProtectedRouter = typeof protectedRouter;
