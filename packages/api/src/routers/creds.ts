import { TRPCError } from "@trpc/server";

/** The Twitch app creds + redirect URI surfaced on ctx (from the web Worker env, not the DB). */
type CredCtx = { twitch?: { clientId?: string; clientSecret?: string; redirectUri?: string } };

/**
 * The Twitch app credentials, or a clear operator-facing error when the env vars
 * aren't set. App creds come from the web Worker env (surfaced via `ctx.twitch`),
 * NOT the DB — see twitch.ts. Shared by the timer / twitch / bot routers so the
 * "set these and redeploy" message stays identical everywhere.
 */
export function requireCreds(ctx: CredCtx): { clientId: string; clientSecret: string } {
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

/** The configured OAuth redirect URI, or a clear error. Shared by the redirect-flow starts. */
export function requireRedirectUri(ctx: CredCtx): string {
	const redirectUri = ctx.twitch?.redirectUri;
	if (!redirectUri) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "OAuth redirect URI not configured.",
		});
	}
	return redirectUri;
}
