# Wolfathon - A Clean Subathon Toolkit for Twitch

Wolfathon is a branded subathon toolkit for Twitch streamers. It pairs a
reward tracker that shows your current goal as a name only, never a number,
with a countdown timer that auto-adds time from subs, gifts, bits, and channel
points via Twitch EventSub. It ships as transparent OBS overlays plus a private
control panel, deployed on Cloudflare.

Keep the rewards flowing. Keep the clock ticking.

## Features

- **Subathon timer** - A timestamp-driven countdown that auto-adds time from
  Twitch subs (per tier), gifted subs, bits, and channel-point redemptions.
  Every amount is configurable; the overlay counts down to the frame and
  survives an OBS refresh.
- **Twitch auto-time (EventSub)** - Connect once with the OAuth redirect flow.
  Events arrive at the server Worker as HMAC-verified webhooks, so there is no
  bot to babysit and no browser that has to stay open.
- **Reward names only** - The rewards overlay shows the current reward name and
  already-unlocked names. Amounts, totals, and future goals are never sent to
  the browser.
- **One-at-a-time unlocks** - Goals unlock top to bottom with a short
  glow-and-scale celebration (no audio), then settle on the next reward.
- **Private notes** - Each goal has an internal `note` (for example, "10 subs")
  that is stripped server-side and never reaches the overlay.
- **Claude-friendly import/export** - For both rewards and the timer config:
  paste or upload JSON, validate, replace in one click, export, and copy a
  ready-made prompt so you can have Claude generate a new config to paste back.
- **Cloudflare Access security** - The control panel and its API sit behind
  Cloudflare Zero Trust; the public overlays stay open. Twitch secrets never
  reach a public response.
- **Installable PWA** - The control panel installs as a standalone app.
- **Brand-ready** - MrDemonWolf navy and cyan, Montserrat and Roboto, with
  macOS-style rounded panels.

## Getting Started

1. Install dependencies:

   ```bash
   bun install
   ```

2. Generate the database migration:

   ```bash
   bun run db:generate
   ```

3. Start the web app and the API together:

   ```bash
   bun run dev
   ```

4. Open the surfaces:

   - Control panel: `http://localhost:3001/control`
   - Overlay chooser: `http://localhost:3001/overlay`
   - Timer overlay: `http://localhost:3001/overlay/timer`
   - Rewards overlay: `http://localhost:3001/overlay/rewards`
   - API (overlay data + Twitch webhook): `http://localhost:3000`

   Local development (`bun run dev`) bypasses Cloudflare Access automatically,
   so the control panel works without Zero Trust on your machine. A real deploy
   always enforces Access. The database seeds sample goals and a default timer
   on first run.

## Usage

### OBS browser sources

Open `/overlay` (the chooser) and copy each source URL straight into OBS. Add
each as a **Browser** source at width `1920`, height `1080`, with a transparent
background — the overlays paint only floating panels, nothing full-screen.

| Source  | URL              | Shows                                          |
| ------- | ---------------- | ---------------------------------------------- |
| Timer   | `/overlay/timer` | Big HH:MM:SS countdown with a "+Xm" add flash  |
| Rewards | `/overlay/rewards` | Current reward name + unlock celebration     |

Both poll every 2 seconds, so control-panel edits and Twitch events appear on
stream within about 2 seconds (the timer keeps counting smoothly between polls).

### Subathon timer

The control panel's **Timer** tab has two halves:

- **Controls** - Start / Pause / Reset, quick add buttons (+1, +5, +10, +30,
  -5 minutes) and a custom amount, plus "simulate event" buttons (Sub T1/T2/T3,
  Gift, 100 bits) that apply the configured minutes for testing.
- **Time rules** - Edit every amount: starting time, cap (0 = no cap), minutes
  per sub tier (T1/T2/T3/Prime), per gifted sub, per 100 bits, and a list of
  channel-point reward rules (match by title, or by id once redeemed).

### Twitch setup (auto-time)

Auto-time uses Twitch EventSub, which needs a Twitch app and a one-time
authorization. The **Twitch** tab walks you through it:

1. Create an application at [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps).
   Set the **OAuth Redirect URL** to `<web origin>/api/twitch/callback`
   (the **Twitch** tab shows the exact value). Client Type **Confidential**.
   Copy the **Client ID** and generate a **Client Secret**.
2. Put them in the environment as `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`
   (repo secrets or `apps/web/.env`) and redeploy. Keep `/api/twitch/callback`
   outside the Cloudflare Access app (Access covers only `/control` + `/api/trpc`).
3. In the control panel **Twitch** tab (it shows "Loaded from environment ✓"),
   click **Connect Twitch**. You're redirected to Twitch to approve, then back —
   the panel flips to **Connected**.
4. On connect, the server creates EventSub webhook subscriptions for
   `channel.subscribe`, `channel.subscription.message`,
   `channel.subscription.gift`, `channel.cheer`, and
   `channel.channel_points_custom_reward_redemption.add`.

Scopes requested: `channel:read:subscriptions`, `bits:read`,
`channel:read:redemptions`. The EventSub callback is your API Worker at
`/twitch/eventsub`; every event is HMAC-verified, deduplicated, and rejected if
the signature is wrong or older than 10 minutes. The app credentials come from
the Worker env (`TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`); only the resulting
OAuth tokens are stored in D1, and none of it appears in any public response.

### JSON import and export (rewards and timer)

Each tab has an Import / Export panel:

- **Validate** - Checks pasted/uploaded JSON without writing. Shows a preview or
  a list of human-readable errors.
- **Import (replace)** - Validates, asks you to confirm, then replaces. Nothing
  is written unless validation passes (no partial writes).
- **Export** / **Copy current JSON** - Download or copy the current config,
  pretty-printed (`wolfathon-goals-…json` / `wolfathon-timer-…json`).
- **Copy Claude prompt** - Copies a ready prompt (schema + your current config)
  to paste into claude.ai. Ask for the change you want, paste the JSON it
  returns back into the box, and import.

Rewards import shape (minimal form):

```json
{
  "goals": [
    { "reward": "Q&A", "note": "1 sub" },
    { "reward": "Onesie reveal", "note": "10 subs" },
    { "reward": "Stretch goal", "note": "dream" }
  ]
}
```

Timer config shape:

```json
{
  "startMinutes": 60,
  "maxMinutes": 0,
  "sub": { "t1": 5, "t2": 10, "t3": 25, "prime": 5 },
  "giftSubMinutes": 5,
  "bitsPer100Minutes": 1,
  "channelPoints": [{ "rewardTitle": "Add 5 minutes", "minutes": 5 }]
}
```

### What the rewards overlay shows

| Element           | Shown on stream                                   |
| ----------------- | ------------------------------------------------- |
| Current reward    | The next locked goal's `reward` name, prominently |
| Unlocked rewards  | A dimmed row of already-unlocked `reward` names   |
| Future goals      | Hidden entirely                                   |
| Numbers / amounts | Never shown                                       |
| `note` field      | Never sent to the browser                         |

### Adding your logo

Drop your wolf mark (head only) at `apps/web/public/logo.svg` and it is used
automatically across the overlays and panel. Put your favicon at
`apps/web/src/app/favicon.ico` (Next serves it automatically). If `logo.svg` is
missing, a built-in brand SVG mark is shown instead, so nothing ever renders
broken.

## Tech Stack

| Layer    | Technology                                |
| -------- | ----------------------------------------- |
| Monorepo | Turborepo                                 |
| Web      | Next.js (overlays, control panel, PWA)    |
| Server   | Hono on Cloudflare Workers                |
| API      | tRPC                                      |
| Database | Cloudflare D1 (SQLite)                    |
| ORM      | Drizzle ORM                               |
| Auth     | Cloudflare Access (Zero Trust)            |
| Twitch   | EventSub webhooks + OAuth redirect flow   |
| Styling  | Tailwind CSS, Montserrat and Roboto       |
| Deploy   | Alchemy (Cloudflare Workers and D1)       |
| CI/CD    | GitHub Actions                            |
| Runtime  | Bun (deploy runs under Node via tsx)      |

## Development

### Prerequisites

- Bun 1.3 or newer
- A Cloudflare account (for deployment)
- The Cloudflare Wrangler CLI authenticated, or a scoped API token (Workers +
  D1 edit)

### Setup

1. Install dependencies:

   ```bash
   bun install
   ```

2. Copy the environment templates and fill them in:

   ```bash
   cp apps/web/.env.example apps/web/.env
   cp apps/server/.env.example apps/server/.env
   cp packages/infra/.env.example packages/infra/.env
   ```

3. Generate the database migration:

   ```bash
   bun run db:generate
   ```

4. Start development:

   ```bash
   bun run dev
   ```

### Development Scripts

- `bun run dev` - Start the web app and server together (via Alchemy).
- `bun run dev:web` - Start only the web app.
- `bun run dev:server` - Start only the server.
- `bun run build` - Build all applications.
- `bun run check-types` - Type-check across the monorepo.
- `bun run db:generate` - Generate the Drizzle migration from the schema.
- `bun run deploy` - Deploy web, server, and D1 to Cloudflare.
- `bun run destroy` - Tear down the deployed Cloudflare resources.

### Code Quality

- End-to-end TypeScript with strict settings.
- Shared design tokens and components in `packages/ui`.
- Domain logic and validation centralized in `packages/api` and reused by the
  overlays, the control panel, and the Twitch webhook.

## Deploying to Cloudflare

Deployment uses Alchemy to provision the Workers, the Next app, and the D1
database, and to apply migrations. The deploy runs under Node via `tsx` (Bun
segfaults executing the Alchemy program), which `bun run deploy` handles for you.

1. Authenticate Cloudflare with a scoped API token (Alchemy uses its own auth,
   not Wrangler's). Create a token with **Workers** and **D1** edit permissions,
   then set it in `packages/infra/.env`:

   ```bash
   CLOUDFLARE_API_TOKEN=your-token
   CLOUDFLARE_ACCOUNT_ID=your-account-id
   ALCHEMY_PASSWORD=a-strong-secret
   ```

2. Deploy:

   ```bash
   bun run deploy
   ```

   The Worker names are fixed, so the deploy lands on:

   - Web: `https://wolfathon.mrdemonwolf.workers.dev`
   - API: `https://wolfathon-api.mrdemonwolf.workers.dev`

   Infra wires the web app's `NEXT_PUBLIC_SERVER_URL` to the API Worker and
   defaults the server's `CORS_ORIGIN` to the web URL automatically.

### Continuous deployment (GitHub Actions)

Two workflows in `.github/workflows` deploy on every push to `main`:

- **CI** (`ci.yml`) - type-checks and builds on pull requests and pushes.
- **Deploy** (`deploy.yml`) - after CI succeeds on `main`, runs `bun run deploy`
  and smoke-tests the API.

Set these as repository secrets (Settings → Secrets and variables → Actions):
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ALCHEMY_PASSWORD`,
(optionally) `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD`, and — for Twitch —
`TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`. All Cloudflare resources
use `adopt: true` so the runner reconciles the live resources without sharing
local Alchemy state. (Turbo strict env mode requires these to be declared as
`passThroughEnv` in `turbo.json` — already configured.)

### Cloudflare Access (Zero Trust)

The app itself has no login. Security is enforced at the edge by Cloudflare
Access plus a server-side JWT check. You protect the `/control` page and the
`/api/trpc` operator API on the web app; the overlays and the Twitch webhook
stay public.

1. In the Cloudflare dashboard, open **Zero Trust → Access → Applications** and
   add a **Self-hosted** application.

2. Set the application paths on the web domain:

   - `wolfathon.mrdemonwolf.workers.dev/control`
   - `wolfathon.mrdemonwolf.workers.dev/control/*`
   - `wolfathon.mrdemonwolf.workers.dev/api/trpc/*`

   Do **not** add `/api/twitch/callback` here — Twitch must reach it without an
   Access login (it is protected by a CSRF `state` token instead).

3. Add a policy that allows only your email (or your team).

4. Copy the **team domain** (for example `your-team.cloudflareaccess.com`) and
   the application **Audience (AUD)** tag.

5. Put them in `packages/infra/.env` (and the repo secrets for CI):

   ```bash
   CF_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
   CF_ACCESS_AUD=your-application-aud-tag
   ```

6. Redeploy with `bun run deploy`.

Access enforcement is automatic: a real deploy always enforces it, local
`alchemy dev` always bypasses it. If `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD`
are blank on a deploy, the operator API fails closed and denies everything.

### Architecture note

Overlays poll the public server Worker (`state.getPublic`, `timer.getPublic`).
The control panel calls protected procedures on the same-origin `/api/trpc`
route in the web app, where Cloudflare Access injects the verified identity.
Twitch posts EventSub webhooks to the public server Worker, which verifies the
HMAC and adds time. All three share one D1 database (rewards, timer, and Twitch
secrets live in separate rows). For instant push instead of polling, a Durable
Object plus WebSocket can replace the 2-second refetch later.

## Project Structure

```
wolfathon/
├── apps/
│   ├── web/         # Next.js: /overlay/{timer,rewards} (OBS), /control, /api/trpc
│   └── server/      # Hono on Cloudflare Workers: public API + Twitch EventSub webhook
├── packages/
│   ├── api/         # tRPC routers, timer + Twitch domain, Access verification
│   ├── db/          # Drizzle schema, D1 client, migrations
│   ├── env/         # Typed environment access
│   ├── ui/          # Shared design system (brand tokens, components)
│   ├── infra/       # Alchemy deploy config (Workers, D1, bindings)
│   └── config/      # Shared TypeScript config
├── .github/workflows/  # CI + Deploy
├── turbo.json
└── package.json
```

## License

![GitHub license](https://img.shields.io/github/license/mrdemonwolf/wolfathon.svg?style=for-the-badge&logo=github)

## Contact

Questions or feedback? Join the community:

- Discord: [Join my server](https://mrdwolf.net/discord)

## Footer

Made with love by [MrDemonWolf, Inc.](https://www.mrdemonwolf.com)
