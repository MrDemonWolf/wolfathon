import { createContext } from "@wolfathon/api/context";
import { publicRouter } from "@wolfathon/api/routers/index";
import { createDb } from "@wolfathon/db";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

/**
 * DEV-ONLY same-origin public API. Lets the `/overlay` pages fetch note-stripped
 * state without running the separate public Worker (`apps/server`) locally.
 *
 * In production the overlays hit `NEXT_PUBLIC_SERVER_URL` (the public Worker,
 * which lives OUTSIDE Cloudflare Access by design — see the Access topology), so
 * this route hard-404s when `NODE_ENV === "production"`. It must never become a
 * second public surface in prod.
 */
type WebEnv = { DB: D1Database };

function handler(req: Request) {
	if (process.env.NODE_ENV === "production") {
		return new Response("Not found", { status: 404 });
	}
	const env = getCloudflareContext().env as unknown as WebEnv;
	const db = createDb(env.DB);

	return fetchRequestHandler({
		endpoint: "/api/public-trpc",
		req,
		router: publicRouter,
		createContext: () =>
			createContext({
				db,
				headers: req.headers,
				access: { teamDomain: undefined, aud: undefined, disabled: true },
			}),
	});
}

export { handler as GET, handler as POST };

export const dynamic = "force-dynamic";
