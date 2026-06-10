import type { Db } from "@wolfathon/db";

import { type AccessConfig, type AccessUser, verifyAccess } from "./access";

export type CreateContextInput = {
  /** Drizzle client bound to the request's D1 database. */
  db: Db;
  /** Incoming request headers (used to read Cloudflare Access assertions). */
  headers: Headers;
  /** Access configuration for verifying the operator. */
  access: AccessConfig;
  /** Public EventSub webhook callback URL (server Worker), for Twitch setup. */
  callbackUrl?: string;
};

/**
 * Build the per-request tRPC context. `user` is non-null only when Cloudflare
 * Access has authenticated the request; `protectedProcedure` enforces it.
 */
export async function createContext(input: CreateContextInput): Promise<{
  db: Db;
  user: AccessUser | null;
  callbackUrl?: string;
}> {
  const user = await verifyAccess(input.headers, input.access);
  return { db: input.db, user, callbackUrl: input.callbackUrl };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
