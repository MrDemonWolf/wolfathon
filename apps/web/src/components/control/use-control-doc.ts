"use client";

import { type QueryKey, useQuery, type UseQueryOptions } from "@tanstack/react-query";

import { queryClient } from "@/utils/trpc";

/**
 * Load one operator "getRaw" doc: run its tRPC query and hand back an `invalidate`
 * already bound to that query's key. Collapses the identical `queryOptions()` →
 * `useQuery` → `invalidate` triple every control tab was repeating. Pass the
 * result of `controlTrpc.X.getRaw.queryOptions(...)`.
 */
export function useControlDoc<TQueryFnData, TError, TData, TQueryKey extends QueryKey>(
	options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> & { queryKey: TQueryKey },
) {
	const query = useQuery(options);
	const invalidate = () => queryClient.invalidateQueries({ queryKey: options.queryKey });
	return { ...query, invalidate };
}
