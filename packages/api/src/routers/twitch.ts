import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { readTwitch, writeTwitch } from "../store";
import {
	buildAuthorizeUrl,
	type ChannelEmote,
	deleteSubscriptions,
	getAppToken,
	getChannelEmotes,
	sendTestNotification,
	toStatus,
} from "../twitch";

/** App credentials come from the web Worker env, surfaced via ctx.twitch. */
function requireCreds(ctx: { twitch?: { clientId?: string; clientSecret?: string } }) {
	const clientId = ctx.twitch?.clientId;
	const clientSecret = ctx.twitch?.clientSecret;
	if (!clientId || !clientSecret) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in the environment, then redeploy.",
		});
	}
	return { clientId, clientSecret };
}

/** Operator-only Twitch setup. Returns masked status — never secrets/tokens. */
export const twitchRouter = router({
	getStatus: protectedProcedure.query(async ({ ctx }) =>
		toStatus(await readTwitch(ctx.db), Boolean(ctx.twitch?.clientId && ctx.twitch?.clientSecret)),
	),

	/**
	 * Begin the Authorization Code flow. Stores a CSRF `state` on the twitch row
	 * and returns the Twitch consent URL for the browser to navigate to.
	 */
	startAuth: protectedProcedure.mutation(async ({ ctx }) => {
		const { clientId } = requireCreds(ctx);
		if (!ctx.twitch?.redirectUri) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "OAuth redirect URI not configured.",
			});
		}
		const doc = await readTwitch(ctx.db);
		const state = crypto.randomUUID().replace(/-/g, "");
		await writeTwitch(ctx.db, { ...doc, oauthState: state });
		return { url: buildAuthorizeUrl({ clientId, redirectUri: ctx.twitch.redirectUri, state }) };
	}),

	/** Channel emotes for the overlay emoji picker. Needs a connected broadcaster. */
	listEmotes: protectedProcedure
		.input(z.object({ refresh: z.boolean().optional() }).optional())
		.query(async ({ ctx, input }) => {
			const { clientId, clientSecret } = requireCreds(ctx);
			const doc = await readTwitch(ctx.db);
			if (!doc.broadcasterId) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Connect Twitch first." });
			}
			// Cache the emote list per broadcaster (Workers Cache API, per-colo + TTL'd)
			// so opening the picker / reloading / a second operator doesn't re-hit the
			// Twitch API each time. The list changes rarely; `refresh` (Reload button)
			// bypasses the read to force a fresh fetch. `caches` is absent under `next
			// dev`, so guard it and just fetch directly there.
			const key = new Request(`https://cache.wolfathon/emotes/${doc.broadcasterId}`);
			// `caches.default` is a Workers extension. Cast globalThis via unknown so
			// this compiles under both the web (DOM lib) and server (workers-types)
			// tsconfigs, and read defensively so `next dev` (no `caches`) just no-ops.
			const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
			if (cache && !input?.refresh) {
				const hit = await cache.match(key);
				if (hit) return (await hit.json()) as ChannelEmote[];
			}
			const appToken = await getAppToken(clientId, clientSecret);
			const emotes = await getChannelEmotes(clientId, appToken, doc.broadcasterId);
			await cache
				?.put(key, Response.json(emotes, { headers: { "cache-control": "max-age=3600" } }))
				.catch(() => {});
			return emotes;
		}),

	/**
	 * Fire a real, signed EventSub notification at our own public webhook to prove
	 * the live chain works (signature + reachability + parse). Carries the test
	 * sentinel, so the webhook accepts it WITHOUT adding time — safe mid-subathon.
	 */
	sendTestEvent: protectedProcedure.mutation(async ({ ctx }) => {
		const doc = await readTwitch(ctx.db);
		if (!doc.connected || !doc.webhookSecret || !doc.broadcasterId) {
			throw new TRPCError({ code: "BAD_REQUEST", message: "Connect Twitch first." });
		}
		if (!ctx.callbackUrl) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Webhook URL not configured.",
			});
		}
		const status = await sendTestNotification({
			callbackUrl: ctx.callbackUrl,
			secret: doc.webhookSecret,
			broadcasterId: doc.broadcasterId,
			broadcasterLogin: doc.broadcasterLogin,
		});
		return { status, ok: status >= 200 && status < 300 };
	}),

	disconnect: protectedProcedure.mutation(async ({ ctx }) => {
		const doc = await readTwitch(ctx.db);
		const clientId = ctx.twitch?.clientId;
		const clientSecret = ctx.twitch?.clientSecret;
		const hasCreds = Boolean(clientId && clientSecret);

		let unsubscribed = true;
		if (hasCreds && doc.subscriptionIds?.length) {
			try {
				const appToken = await getAppToken(clientId!, clientSecret!);
				await deleteSubscriptions(clientId!, appToken, doc.subscriptionIds);
			} catch {
				unsubscribed = false;
			}
		}
		// Clean unsubscribe → fully reset. If the Twitch-side delete failed, keep the
		// subscription ids + webhook secret so the still-live subs keep verifying
		// (no orphans) and the next connect/disconnect can reconcile them.
		await writeTwitch(
			ctx.db,
			unsubscribed
				? {}
				: {
						broadcasterId: doc.broadcasterId,
						broadcasterLogin: doc.broadcasterLogin,
						webhookSecret: doc.webhookSecret,
						subscriptionIds: doc.subscriptionIds,
					},
		);
		return toStatus(await readTwitch(ctx.db), hasCreds);
	}),
});

export type TwitchRouter = typeof twitchRouter;
