import { createContext } from "@wolfathon/api/context";
import { protectedRouter } from "@wolfathon/api/routers/index";
import { createDb } from "@wolfathon/db";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

/**
 * Operator API (protected). Served same-origin from the web app so the
 * Cloudflare Access cookie + `Cf-Access-Jwt-Assertion` header are present on
 * every request. Place this path AND `/control` behind a Cloudflare Access
 * application (see README → "Cloudflare Access").
 */

/** Bindings configured for the web Worker in `packages/infra/alchemy.run.ts`. */
type WebEnv = {
  DB: D1Database;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  ACCESS_DISABLED?: string;
  NEXT_PUBLIC_SERVER_URL?: string;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
};

function handler(req: Request) {
  const env = getCloudflareContext().env as unknown as WebEnv;
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
          disabled: env.ACCESS_DISABLED === "true",
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
