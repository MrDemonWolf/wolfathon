import { z } from "zod";

import { setAnnounceGifts, setCooldown, setEnabled, updateCommand } from "../bot";
import { protectedProcedure, router } from "../index";
import { mutateBot, mutateTwitch, readBot, readTwitch } from "../store";
import { BOT_SCOPES, buildAuthorizeUrl } from "../twitch";
import { randomToken } from "../util";
import { requireCreds, requireRedirectUri } from "./creds";

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
		const { clientId } = requireCreds(ctx);
		const redirectUri = requireRedirectUri(ctx);
		// `bot.`-prefixed state routes the shared callback to the bot-account path.
		const state = `bot.${randomToken()}`;
		// CAS merge — don't clobber a concurrent broadcaster connect / webhook write.
		await mutateTwitch(ctx.db, (cur) => ({ ...cur, botOauthState: state }));
		return {
			url: buildAuthorizeUrl({
				clientId,
				redirectUri,
				state,
				scopes: BOT_SCOPES,
				forceVerify: true,
			}),
		};
	}),

	/** Forget the connected bot account (leaves command config intact). */
	disconnect: protectedProcedure.mutation(async ({ ctx }) => {
		await mutateTwitch(ctx.db, (cur) => ({ ...cur, bot: undefined, botOauthState: undefined }));
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

	/** Toggle the batched gift-sub chat announcement. */
	setAnnounceGifts: protectedProcedure
		.input(z.object({ announceGifts: z.boolean() }))
		.mutation(async ({ ctx, input }) =>
			mutateBot(ctx.db, (doc) => setAnnounceGifts(doc, input.announceGifts)),
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
