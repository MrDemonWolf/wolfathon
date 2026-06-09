import alchemy from "alchemy";
import { Nextjs } from "alchemy/cloudflare";
import { Worker } from "alchemy/cloudflare";
import { D1Database } from "alchemy/cloudflare";
import { config } from "dotenv";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

const app = await alchemy("wolfathon");

// Access bypass is allowed ONLY for local `alchemy dev` (app.local === true).
// A real deploy ALWAYS enforces Cloudflare Access — it can never be disabled by
// a stray .env, so the control panel can't ship unprotected.
const ACCESS_DISABLED = app.local ? "true" : "false";

// Fixed production hosts. Worker names below set their workers.dev subdomains:
//   web    -> wolfathon.mrdemonwolf.workers.dev
//   server -> wolfathon-api.mrdemonwolf.workers.dev
const WEB_URL = process.env.WEB_URL ?? "https://wolfathon.mrdemonwolf.workers.dev";
// Origin allowed to call the overlay API. Dev sets this in apps/server/.env;
// in production it defaults to the deployed web app.
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? WEB_URL;

const db = await D1Database("database", {
  migrationsDir: "../../packages/db/src/migrations",
});

export const server = await Worker("wolfathon-api", {
  cwd: "../../apps/server",
  entrypoint: "src/index.ts",
  compatibility: "node",
  url: true,
  bindings: {
    DB: db,
    CORS_ORIGIN,
  },
  dev: {
    port: 3000,
  },
});

export const web = await Nextjs("wolfathon", {
  cwd: "../../apps/web",
  bindings: {
    NEXT_PUBLIC_SERVER_URL: server.url!,
    DB: db,
    CORS_ORIGIN,
    // Cloudflare Access — gates `/control` + `/api/trpc`. See README.
    // Empty values fail closed (everything denied) unless ACCESS_DISABLED=true.
    CF_ACCESS_TEAM_DOMAIN: process.env.CF_ACCESS_TEAM_DOMAIN ?? "",
    CF_ACCESS_AUD: process.env.CF_ACCESS_AUD ?? "",
    ACCESS_DISABLED,
  },
  dev: {
    env: {
      PORT: "3001",
    },
  },
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
