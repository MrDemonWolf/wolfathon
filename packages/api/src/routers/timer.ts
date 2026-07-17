import { TRPCError } from "@trpc/server";
import type { Db } from "@wolfathon/db";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
	applyTimerEventAndBumpSubs,
	mutateTimer,
	mutateTwitch,
	readTimer,
	readTwitch,
} from "../store";
import { requireCreds } from "./creds";
import {
	applyEvent,
	MAX_CHANNEL_POINT_RULES,
	pause,
	reset,
	start,
	type TimerEvent,
	validateTimerConfig,
} from "../timer";
import {
	createCustomReward,
	deleteCustomReward,
	refreshAndPersistUserToken,
	tokenFresh,
	TwitchAuthError,
	type TwitchDoc,
} from "../twitch";

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

/**
 * A valid broadcaster USER token, refreshing (and persisting the rotated tokens)
 * when within a minute of expiry — mirrors the bot's `ensureBotToken` path. The
 * broadcaster's token is what Helix custom-reward management requires; a refresh
 * rejection surfaces a clear "reconnect Twitch" instead of a raw 401.
 */
async function ensureBroadcasterToken(
	db: Db,
	doc: TwitchDoc,
	clientId: string,
	clientSecret: string,
): Promise<string> {
	if (!doc.broadcasterId || !doc.accessToken || !doc.refreshToken) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Connect Twitch first." });
	}
	if (tokenFresh(doc.expiresAt)) return doc.accessToken;
	try {
		return await refreshAndPersistUserToken({
			clientId,
			clientSecret,
			refreshToken: doc.refreshToken,
			persist: (t) => mutateTwitch(db, (d) => ({ ...d, ...t })),
		});
	} catch (err) {
		// A 4xx refresh means the grant is dead (revoked / scope changed) — tell the
		// operator to reconnect. A 5xx/network blip is transient.
		const status = err instanceof TwitchAuthError ? err.status : 0;
		if (status >= 400 && status < 500) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Twitch authorization expired — reconnect Twitch in Settings → Twitch.",
			});
		}
		throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn't reach Twitch." });
	}
}

/** Map a Helix custom-reward error to a clear operator-facing tRPC error. */
function rewardError(err: unknown): TRPCError {
	if (err instanceof TwitchAuthError) {
		if (err.status === 401 || err.status === 403) {
			return new TRPCError({
				code: "UNAUTHORIZED",
				message:
					"Twitch rejected the request — reconnect Twitch to grant the channel-point reward scope.",
			});
		}
		if (err.status === 400) {
			return new TRPCError({
				code: "BAD_REQUEST",
				message: "Twitch rejected the reward (duplicate title or invalid cost).",
			});
		}
	}
	return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Twitch reward request failed." });
}

const rewardTitleSchema = z.string().trim().min(1).max(45);

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
	applyEvent: protectedProcedure.input(eventSchema).mutation(async ({ ctx, input }) => {
		const { timer } = await applyTimerEventAndBumpSubs(ctx.db, input, Date.now(), true);
		return timer;
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
		const doc = await mutateTimer(ctx.db, (prev) => ({ config: result.config, state: prev.state }));
		return { ok: true as const, doc };
	}),

	/**
	 * Create a channel-point reward on Twitch and store its rule (rewardId + title +
	 * minutes). Rejects at the 2-rule cap. The reward is owned on the broadcaster's
	 * channel, so it needs their user token + `channel:manage:redemptions`.
	 */
	createChannelReward: protectedProcedure
		.input(z.object({ title: rewardTitleSchema, minutes: z.number().min(0).max(525_600) }))
		.mutation(async ({ ctx, input }) => {
			const { clientId, clientSecret } = requireCreds(ctx);
			const twitch = await readTwitch(ctx.db);
			const timer = await readTimer(ctx.db);
			if (timer.config.channelPoints.length >= MAX_CHANNEL_POINT_RULES) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `At the ${MAX_CHANNEL_POINT_RULES}-reward limit — remove one first.`,
				});
			}
			const userToken = await ensureBroadcasterToken(ctx.db, twitch, clientId, clientSecret);
			let reward: { id: string; title: string };
			try {
				reward = await createCustomReward({
					clientId,
					userToken,
					broadcasterId: twitch.broadcasterId!,
					title: input.title,
					// A nominal cost — the operator can tune the price in Twitch's reward
					// editor; what matters here is the redemption firing a timer add.
					cost: 1,
				});
			} catch (err) {
				throw rewardError(err);
			}
			// CAS the rule in, re-checking the cap inside the apply (a concurrent create
			// could have raced us between the read above and here).
			const saved = await mutateTimer(ctx.db, (doc) => {
				if (doc.config.channelPoints.length >= MAX_CHANNEL_POINT_RULES) return doc;
				return {
					...doc,
					config: {
						...doc.config,
						channelPoints: [
							...doc.config.channelPoints,
							{ rewardId: reward.id, rewardTitle: reward.title, minutes: input.minutes },
						],
					},
				};
			});
			// If the CAS hit the cap (a concurrent create won the last slot), our reward
			// was never stored — it would linger on Twitch adding no time and be
			// unremovable from the panel. Compensate by deleting it (best-effort, like
			// removeChannelReward) and report the conflict.
			if (!saved.config.channelPoints.some((r) => r.rewardId === reward.id)) {
				try {
					await deleteCustomReward({
						clientId,
						userToken,
						broadcasterId: twitch.broadcasterId!,
						rewardId: reward.id,
					});
				} catch {
					// swallow — the reward may linger on Twitch; the operator can delete it
					// in Twitch's editor. Still surface the conflict below.
				}
				throw new TRPCError({
					code: "CONFLICT",
					message: `At the ${MAX_CHANNEL_POINT_RULES}-reward limit — another reward was just added.`,
				});
			}
			return saved;
		}),

	/**
	 * Remove a channel-point reward: delete it on Twitch (best-effort) and drop the
	 * local rule. Identify it by `rewardId` (preferred) or list `index`.
	 */
	removeChannelReward: protectedProcedure
		.input(
			z
				.object({ rewardId: z.string().optional(), index: z.number().int().min(0).optional() })
				.refine((v) => v.rewardId !== undefined || v.index !== undefined, {
					message: "rewardId or index required",
				}),
		)
		.mutation(async ({ ctx, input }) => {
			const { clientId, clientSecret } = requireCreds(ctx);
			const twitch = await readTwitch(ctx.db);
			const timer = await readTimer(ctx.db);
			const rules = timer.config.channelPoints;
			const idx =
				input.rewardId !== undefined
					? rules.findIndex((r) => r.rewardId === input.rewardId)
					: (input.index ?? -1);
			const rule = idx >= 0 ? rules[idx] : undefined;
			if (!rule) {
				throw new TRPCError({ code: "NOT_FOUND", message: "No such channel-point reward." });
			}
			// ponytail: best-effort Twitch delete. If Twitch rejects it (already deleted,
			// scope lost, transient blip) we STILL drop the local rule so the panel can't
			// get stuck above the 2 cap with an orphan the operator can't clear. The
			// reward may linger on Twitch; the operator can delete it in Twitch's editor.
			if (rule.rewardId && twitch.broadcasterId && twitch.accessToken && twitch.refreshToken) {
				try {
					const userToken = await ensureBroadcasterToken(ctx.db, twitch, clientId, clientSecret);
					await deleteCustomReward({
						clientId,
						userToken,
						broadcasterId: twitch.broadcasterId,
						rewardId: rule.rewardId,
					});
				} catch {
					// swallow — drop the local rule regardless (see ponytail above).
				}
			}
			return mutateTimer(ctx.db, (doc) => ({
				...doc,
				config: {
					...doc.config,
					channelPoints: doc.config.channelPoints.filter((r, i) =>
						rule.rewardId ? r.rewardId !== rule.rewardId : i !== idx,
					),
				},
			}));
		}),
});

export type TimerRouter = typeof timerRouter;
