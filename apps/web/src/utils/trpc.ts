import { QueryCache, QueryClient } from "@tanstack/react-query";
import type { ProtectedRouter, PublicRouter } from "@wolfathon/api/routers/index";
import { env } from "@wolfathon/env/web";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
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
 * Public client → the overlay Worker (`apps/server`). Note-stripped, open.
 * Used by `/overlay`.
 */
const publicClient = createTRPCClient<PublicRouter>({
  links: [httpBatchLink({ url: `${env.NEXT_PUBLIC_SERVER_URL}/trpc` })],
});

export const publicTrpc = createTRPCOptionsProxy<PublicRouter>({
  client: publicClient,
  queryClient,
});

/**
 * Operator client → same-origin `/api/trpc` route handler, which sits behind
 * Cloudflare Access. Same-origin means the Access cookie rides along.
 * Used by `/control`.
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
