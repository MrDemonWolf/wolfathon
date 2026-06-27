import { createContext } from "@wolfathon/api/context";
import { protectedRouter } from "@wolfathon/api/routers/index";
import { createDb } from "@wolfathon/db";
import { type WebBindings } from "@wolfathon/env/web";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

/**
 * Operator API (protected). Served same-origin from the web app so the
 * Cloudflare Access cookie + `Cf-Access-Jwt-Assertion` header are present on
 * every request. Place this path AND the operator panel (the app root) behind a
 * Cloudflare Access application (see README → "Cloudflare Access").
 */

function handler(req: Request) {
	const env = getCloudflareContext().env as unknown as WebBindings;
	const db = createDb(env.DB);

	return fetchRequestHandler({
		endpoint: "/api/trpc",
		req,
		router: protectedRouter,
		createContext: () =>
			createContext({
				db,
				headers: req.headers,
				access: {
					teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
					aud: env.CF_ACCESS_AUD,
					// Bypass Access for `next dev` only. Fail-closed: a production build
					// has NODE_ENV="production", so this can never disable Access live —
					// the only other way off is the infra-set ACCESS_DISABLED (alchemy dev).
					disabled: env.ACCESS_DISABLED === "true" || process.env.NODE_ENV === "development",
				},
				callbackUrl: env.NEXT_PUBLIC_SERVER_URL
					? `${env.NEXT_PUBLIC_SERVER_URL}/twitch/eventsub`
					: undefined,
				twitch: {
					clientId: env.TWITCH_CLIENT_ID,
					clientSecret: env.TWITCH_CLIENT_SECRET,
					// Same-origin callback — must match the Twitch app's OAuth Redirect URL.
					redirectUri: `${new URL(req.url).origin}/api/twitch/callback`,
				},
			}),
	});
}

export { handler as GET, handler as POST };

// Never statically optimize — this depends on per-request Access headers + D1.
export const dynamic = "force-dynamic";
