import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@wolfathon/api/context";
import { publicRouter } from "@wolfathon/api/routers/index";
import { createDb } from "@wolfathon/db";
import { env } from "@wolfathon/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

/**
 * Public overlay API (Cloudflare Worker).
 *
 * Hosts only the note-stripped `publicRouter`, so this Worker is intentionally
 * open — the OBS overlay polls `state.getPublic` here. Operator (protected)
 * procedures live behind Cloudflare Access in the web app's `/api/trpc` route,
 * NOT here. See README → "Architecture".
 */
const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.use(
  "/trpc/*",
  trpcServer({
    router: publicRouter,
    createContext: (_opts, c) =>
      createContext({
        db: createDb(env.DB),
        headers: c.req.raw.headers,
        // No protected procedures are mounted here, so Access is irrelevant.
        access: { teamDomain: undefined, aud: undefined, disabled: false },
      }),
  }),
);

app.get("/", (c) => c.text("Wolfathon public API — OK"));

export default app;
