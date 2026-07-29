"use client";

import { type QueryKey, useQuery, type UseQueryOptions } from "@tanstack/react-query";

import { CONTROL_POLL_MS } from "@/utils/constants";
import { queryClient } from "@/utils/trpc";

/**
 * Load one operator "getRaw" doc: run its tRPC query and hand back an `invalidate`
 * already bound to that query's key. Collapses the identical `queryOptions()` →
 * `useQuery` → `invalidate` triple every control tab was repeating. Pass the
 * result of `controlTrpc.X.getRaw.queryOptions(...)`.
 *
 * Polls at {@link CONTROL_POLL_MS} by default so an open draft can notice the
 * server moving underneath it. Applied BEFORE the spread, so a caller that needs a
 * faster cadence (wheel/giveaway at `LIVE_POLL_MS`) still wins.
 */
export function useControlDoc<TQueryFnData, TError, TData, TQueryKey extends QueryKey>(
	options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> & { queryKey: TQueryKey },
) {
	const query = useQuery({
		refetchInterval: CONTROL_POLL_MS,
		refetchIntervalInBackground: false,
		...options,
	});
	const invalidate = () => queryClient.invalidateQueries({ queryKey: options.queryKey });
	return { ...query, invalidate };
}
