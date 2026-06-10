import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { readTwitch, writeTwitch } from "../store";
import {
  createSubscriptions,
  deleteSubscriptions,
  getAppToken,
  getBroadcaster,
  pollDeviceFlow,
  startDeviceFlow,
  toStatus,
} from "../twitch";

/** Operator-only Twitch setup. Returns masked status — never secrets/tokens. */
export const twitchRouter = router({
  getStatus: protectedProcedure.query(async ({ ctx }) => toStatus(await readTwitch(ctx.db))),

  setCredentials: protectedProcedure
    .input(z.object({ clientId: z.string().trim().min(1), clientSecret: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const doc = await readTwitch(ctx.db);
      await writeTwitch(ctx.db, { ...doc, clientId: input.clientId, clientSecret: input.clientSecret });
      return toStatus(await readTwitch(ctx.db));
    }),

  /** Begin Device Code Flow; returns the code the broadcaster enters. */
  startDeviceAuth: protectedProcedure.mutation(async ({ ctx }) => {
    const doc = await readTwitch(ctx.db);
    if (!doc.clientId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Set Twitch credentials first." });
    }
    const start = await startDeviceFlow(doc.clientId);
    await writeTwitch(ctx.db, { ...doc, deviceCode: start.device_code });
    return {
      userCode: start.user_code,
      verificationUri: start.verification_uri,
      interval: start.interval,
      expiresIn: start.expires_in,
    };
  }),

  /**
   * Poll for authorization. On success: store tokens, resolve the broadcaster,
   * (re)create EventSub webhook subscriptions pointing at the server Worker.
   */
  pollDeviceAuth: protectedProcedure.mutation(async ({ ctx }) => {
    const doc = await readTwitch(ctx.db);
    if (!doc.clientId || !doc.clientSecret) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Set Twitch credentials first." });
    }
    if (!doc.deviceCode) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Start the device authorization first." });
    }
    if (!ctx.callbackUrl) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Server callback URL not configured." });
    }

    const poll = await pollDeviceFlow(doc.clientId, doc.deviceCode);
    if (poll.status === "pending") return { status: "pending" as const };

    const broadcaster = await getBroadcaster(doc.clientId, poll.accessToken);
    const webhookSecret = doc.webhookSecret ?? crypto.randomUUID().replace(/-/g, "");
    const appToken = await getAppToken(doc.clientId, doc.clientSecret);

    // Drop any prior subscriptions of ours before recreating, to avoid dupes.
    if (doc.subscriptionIds?.length) {
      await deleteSubscriptions(doc.clientId, appToken, doc.subscriptionIds);
    }
    const { ids, errors } = await createSubscriptions({
      clientId: doc.clientId,
      appToken,
      broadcasterId: broadcaster.id,
      callback: ctx.callbackUrl,
      secret: webhookSecret,
    });

    await writeTwitch(ctx.db, {
      ...doc,
      deviceCode: undefined,
      accessToken: poll.accessToken,
      refreshToken: poll.refreshToken,
      expiresAt: Date.now() + poll.expiresIn * 1000,
      broadcasterId: broadcaster.id,
      broadcasterLogin: broadcaster.login,
      webhookSecret,
      subscriptionIds: ids,
      connected: ids.length > 0,
    });

    return { status: "ok" as const, login: broadcaster.login, subscriptionCount: ids.length, errors };
  }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    const doc = await readTwitch(ctx.db);
    if (doc.clientId && doc.clientSecret && doc.subscriptionIds?.length) {
      try {
        const appToken = await getAppToken(doc.clientId, doc.clientSecret);
        await deleteSubscriptions(doc.clientId, appToken, doc.subscriptionIds);
      } catch {
        // best-effort cleanup
      }
    }
    // Keep credentials, drop tokens + subscriptions.
    await writeTwitch(ctx.db, { clientId: doc.clientId, clientSecret: doc.clientSecret });
    return toStatus(await readTwitch(ctx.db));
  }),
});

export type TwitchRouter = typeof twitchRouter;
