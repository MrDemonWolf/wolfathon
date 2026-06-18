import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

/**
 * Build a Drizzle client bound to a D1 database.
 *
 * The binding is passed in explicitly (rather than read from `cloudflare:workers`)
 * so the same helper works in both runtimes that touch the DB:
 *  - the Hono Worker (`apps/server`), which has `env.DB`
 *  - the Next route handler (`apps/web`), which reads the binding via
 *    `getCloudflareContext().env.DB`
 */
export function createDb(d1: D1Database) {
	return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;

export * from "./schema";
