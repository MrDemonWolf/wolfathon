import { QueryCache, QueryClient } from "@tanstack/react-query";
import type { ProtectedRouter, PublicRouter } from "@wolfathon/api/routers/index";
import { env } from "@wolfathon/env/web";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";

export const queryClient = new QueryClient({
	defaultOptions: {
		// Avoid hammering protected endpoints when Access isn't configured yet.
		// staleTime: panel data is served from cache on a quick tab revisit (no
		// loading flash / duplicate fetch). Overlay queries set their own
		// refetchInterval and mutations invalidate explicitly, so edits stay fresh.
		queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 },
	},
	queryCache: new QueryCache({
		onError: (error, query) => {
			// "Cloudflare Access required" is expected until Access is set up — don't
			// toast it (it would spam the public pages too).
			if (error.message.includes("Cloudflare Access")) return;
			toast.error(error.message, {
				action: {
					label: "retry",
					onClick: () => {
						query.invalidate();
					},
				},
			});
		},
	}),
});

/**
 * Public client → the overlay Worker (`apps/server`) in production. In local dev
 * we hit a same-origin dev-only route handler instead, so the `/overlay` pages
 * preview without running the separate public Worker. Note-stripped, open.
 * Used by `/overlay`.
 */
const publicUrl =
	process.env.NODE_ENV === "development"
		? "/api/public-trpc"
		: `${env.NEXT_PUBLIC_SERVER_URL}/trpc`;

const publicClient = createTRPCClient<PublicRouter>({
	links: [httpBatchLink({ url: publicUrl })],
});

export const publicTrpc = createTRPCOptionsProxy<PublicRouter>({
	client: publicClient,
	queryClient,
});

/**
 * Operator client → same-origin `/api/trpc` route handler, which sits behind
 * Cloudflare Access. Same-origin means the Access cookie rides along.
 * Used by the operator panel (served at the app root).
 */
const controlClient = createTRPCClient<ProtectedRouter>({
	links: [
		httpBatchLink({
			url: "/api/trpc",
			fetch: (url, options) => fetch(url, { ...options, credentials: "include" }),
		}),
	],
});

export const controlTrpc = createTRPCOptionsProxy<ProtectedRouter>({
	client: controlClient,
	queryClient,
});
