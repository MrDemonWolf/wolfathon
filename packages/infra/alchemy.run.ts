import alchemy from "alchemy";
import { Nextjs } from "alchemy/cloudflare";
import { Worker } from "alchemy/cloudflare";
import { D1Database } from "alchemy/cloudflare";
import { DurableObjectNamespace } from "alchemy/cloudflare";
import { config } from "dotenv";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

// Run under Node (via tsx) rather than Bun — Bun 1.3.x segfaults executing this
// Alchemy program. The deploy/destroy scripts in package.json use tsx; `--destroy`
// selects the teardown phase, otherwise Alchemy auto-detects (deploy / dev).
const app = await alchemy("wolfathon", {
	phase: process.argv.includes("--destroy") ? "destroy" : undefined,
});

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
	// Adopt existing resources by name so CI/CD can deploy without sharing the
	// local Alchemy state file (each run reconciles the live resource).
	adopt: true,
});

// StreamElements realtime listener — a single Durable Object holds the socket and
// applies tips to the timer/goals. Defined by the `SEListener` class exported from
// the server Worker below. Idle until SE_JWT is set.
const seListener = DurableObjectNamespace("se-listener", {
	className: "SEListener",
	sqlite: true,
});

export const server = await Worker("wolfathon-api", {
	// Explicit script name → wolfathon-api.<subdomain>.workers.dev
	// (without this, Alchemy prefixes app + stage onto the name).
	name: "wolfathon-api",
	adopt: true,
	cwd: "../../apps/server",
	entrypoint: "src/index.ts",
	compatibility: "node",
	url: true,
	bindings: {
		DB: db,
		CORS_ORIGIN,
		// StreamElements tip listener (Durable Object). The channel JWT lives in D1
		// (set from the control panel), so no creds here. The cron below + the DO's
		// alarm keep the socket alive.
		SE_LISTENER: seListener,
	},
	// Bootstrap/keepalive tick for the StreamElements listener DO.
	crons: ["* * * * *"],
	dev: {
		port: 3000,
	},
});

export const web = await Nextjs("wolfathon", {
	// Explicit script name → wolfathon.<subdomain>.workers.dev
	name: "wolfathon",
	adopt: true,
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
		// Twitch app credentials for the OAuth redirect flow (server-side only).
		TWITCH_CLIENT_ID: process.env.TWITCH_CLIENT_ID ?? "",
		TWITCH_CLIENT_SECRET: process.env.TWITCH_CLIENT_SECRET ?? "",
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
