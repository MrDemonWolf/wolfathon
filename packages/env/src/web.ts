/// <reference types="@cloudflare/workers-types" />
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	client: {
		NEXT_PUBLIC_SERVER_URL: z.url(),
	},
	runtimeEnv: {
		NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
	},
	emptyStringAsUndefined: true,
});

/**
 * Cloudflare bindings the web Worker receives, declared once and kept in lockstep
 * with `packages/infra/alchemy.run.ts`. The Next route handlers read these via
 * `getCloudflareContext().env`. All optional except `DB`, so narrower routes
 * (e.g. public-trpc reads only `DB`) still satisfy the type.
 */
export type WebBindings = {
	DB: D1Database;
	CORS_ORIGIN?: string;
	CF_ACCESS_TEAM_DOMAIN?: string;
	CF_ACCESS_AUD?: string;
	ACCESS_DISABLED?: string;
	NEXT_PUBLIC_SERVER_URL?: string;
	TWITCH_CLIENT_ID?: string;
	TWITCH_CLIENT_SECRET?: string;
};
