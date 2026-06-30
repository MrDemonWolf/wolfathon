import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { setCooldown, setEnabled, updateCommand } from "../bot";
import { protectedProcedure, router } from "../index";
import { mutateBot, readBot, readTwitch, writeTwitch } from "../store";
import { BOT_SCOPES, buildAuthorizeUrl } from "../twitch";

/**
 * Operator-only chat-bot control. Returns the bot command config + a MASKED
 * connection status (login only — never the bot's tokens, which live in the
 * secret `twitch` doc). The bot's actual chat replies happen in the EventSub
 * webhook (apps/server), not here.
 */
export const botRouter = router({
	get: protectedProcedure.query(async ({ ctx }) => {
		const [config, twitch] = await Promise.all([readBot(ctx.db), readTwitch(ctx.db)]);
		return {
			config,
			connection: {
				connected: Boolean(twitch.bot),
				login: twitch.bot?.login,
				// Token refresh was rejected — the operator must reconnect the bot account.
				needsReconnect: Boolean(twitch.bot?.tokenInvalid),
			},
			hasCredentials: Boolean(ctx.twitch?.clientId && ctx.twitch?.clientSecret),
		};
	}),

	/**
	 * Begin the bot account's OAuth grant — a SEPARATE Twitch login from the
	 * broadcaster. Mints a `bot.`-prefixed CSRF state so the shared callback routes
	 * it to the bot path, and forces the consent screen so the operator can pick a
	 * different account than the one already logged in.
	 */
	startAuth: protectedProcedure.mutation(async ({ ctx }) => {
		const clientId = ctx.twitch?.clientId;
		if (!clientId || !ctx.twitch?.clientSecret) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in the environment, then redeploy.",
			});
		}
		if (!ctx.twitch?.redirectUri) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "OAuth redirect URI not configured.",
			});
		}
		const state = `bot.${crypto.randomUUID().replace(/-/g, "")}`;
		const doc = await readTwitch(ctx.db);
		await writeTwitch(ctx.db, { ...doc, botOauthState: state });
		return {
			url: buildAuthorizeUrl({
				clientId,
				redirectUri: ctx.twitch.redirectUri,
				state,
				scopes: BOT_SCOPES,
				forceVerify: true,
			}),
		};
	}),

	/** Forget the connected bot account (leaves command config intact). */
	disconnect: protectedProcedure.mutation(async ({ ctx }) => {
		const doc = await readTwitch(ctx.db);
		await writeTwitch(ctx.db, { ...doc, bot: undefined, botOauthState: undefined });
		return { connected: false };
	}),

	setEnabled: protectedProcedure
		.input(z.object({ enabled: z.boolean() }))
		.mutation(async ({ ctx, input }) => mutateBot(ctx.db, (doc) => setEnabled(doc, input.enabled))),

	setCooldown: protectedProcedure
		.input(z.object({ seconds: z.number() }))
		.mutation(async ({ ctx, input }) =>
			mutateBot(ctx.db, (doc) => setCooldown(doc, input.seconds)),
		),

	updateCommand: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				enabled: z.boolean().optional(),
				response: z.string().optional(),
				triggers: z.array(z.string()).max(16).optional(),
				formatKey: z.string().optional(),
				parts: z.array(z.string()).max(16).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { id, ...patch } = input;
			return mutateBot(ctx.db, (doc) => updateCommand(doc, id, patch));
		}),
});

export type BotRouter = typeof botRouter;
