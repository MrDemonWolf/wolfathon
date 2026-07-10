# Wolfathon - A Clean Subathon Toolkit for Twitch

Wolfathon is a branded subathon toolkit for Twitch streamers. It pairs a
reward tracker that shows your current goal as a name only, never a number,
with a countdown timer that auto-adds time from subs, gifts, bits, and channel
points via Twitch EventSub. It ships as transparent OBS overlays plus a private
control panel, deployed on Cloudflare.

Keep the rewards flowing. Keep the clock ticking.

## Table of Contents

- [Demo](#demo)
- [Features](#features)
- [Getting Started](#getting-started)
- [Usage](#usage)
  - [OBS browser sources](#obs-browser-sources)
  - [Wolfathon timer](#wolfathon-timer)
  - [Twitch setup (auto-time)](#twitch-setup-auto-time)
  - [Backup and restore (JSON)](#backup-and-restore-json)
  - [What the rewards overlay shows](#what-the-rewards-overlay-shows)
  - [Wheel of dares](#wheel-of-dares)
  - [Chat bot](#chat-bot)
  - [Giveaway](#giveaway)
  - [Customizer (overlay look)](#customizer-overlay-look)
  - [Adding your logo](#adding-your-logo)
- [Tech Stack](#tech-stack)
- [Development](#development)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
  - [Development Scripts](#development-scripts)
  - [Code Quality](#code-quality)
- [Deploying to Cloudflare](#deploying-to-cloudflare)
  - [Continuous deployment (GitHub Actions)](#continuous-deployment-github-actions)
  - [Cloudflare Access (Zero Trust)](#cloudflare-access-zero-trust)
  - [Architecture note](#architecture-note)
- [Project Structure](#project-structure)
- [License](#license)
- [Contact](#contact)

## Demo

![Wolfathon demo](assets/demo.gif)

## Features

- **Wolfathon timer** - A timestamp-driven countdown that auto-adds time from
  Twitch subs (per tier), gifted subs, bits (prorated, so any cheer counts), and
  channel-point redemptions. Every amount is configurable; the overlay counts
  down to the frame and survives an OBS refresh. Channel-point rewards can be
  created straight from the Twitch API (up to two), and the time-add emote burst
  has a 1x / 2x / 3x size control.
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
- **Combined backup** - One JSON file bundles your rewards and timer config:
  validate, replace in one click, export, or copy a ready-made prompt so you
  can have Claude edit the config and paste it back to restore.
- **Wheel of dares (Howlwheel)** - A weighted spinner of chat dares. Edit,
  weight, colour, and drag-reorder slots from the dashboard, then spin to a
  weighted-random result or send the wheel to a specific slot. The token-gated
  OBS overlay stays hidden until you spin (then whirls a long, settling spin and
  reveals the result — a "Keep wheel on screen" toggle parks it permanently),
  with the centre logo spinning along. It can also **auto-spin every N counted
  subs** (default 10, configurable), announcing the dare in chat.
- **Chat bot** - Connect a separate bot account and it answers chat commands
  (`!wolfathon`, `!timer`, `!goals`, `!wheel`, `!giveaway`) from the server,
  reusing the EventSub webhook — no process to babysit. Live commands pick from
  ready-made phrasings (no free text to fumble), and it **announces gifted
  subs** in chat, batched per burst so a sub-train never spams. Toggle each
  command and rate-limit normal viewers (mods/VIPs/broadcaster bypass).
- **Giveaway tracker** - A two-phase prize draw. Hit **Start** and the first
  viewers to gift a threshold of subs are captured as gift-sub winners (you
  confirm each). Then **open `!enter`** when you're ready, watch the live
  entrant pool, and draw raffle winners with the crypto CSPRNG. A drawn winner
  must type **`!claim`** within five minutes or you redraw (the bot announces
  the draw, claim, and timeout). Set a **rules/TOS link** (a gist or any URL)
  that auto-fills `!giveaway`. Gift and raffle winners stay in separate lists;
  any pick can be rerolled, the pool can be cleared on its own, and nobody wins
  twice.
- **Cloudflare Access security** - The control panel and its API sit behind
  Cloudflare Zero Trust. The overlays stay open (OBS can't sign in to Access)
  but are gated by a secret token in their URL, resettable from the control
  panel. Twitch secrets never reach a public response.
- **Installable PWA** - The control panel installs as a standalone app.
- **Customizer** - Tune the overlay look from Settings: colours, font, corner
  radius, the eyebrow label, and per-overlay show/hide toggles, with a live
  preview of both the timer and rewards surfaces side by side. Each overlay
  renders at a fixed native size (scale the OBS source to fit your scene).
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

   - Control panel: `http://localhost:3001/dashboard`
   - Overlay URLs (tokenized): control panel → **Settings → Overlays**
   - API (overlay data + Twitch webhook): `http://localhost:3000`

   Local development (`bun run dev`) bypasses Cloudflare Access automatically,
   so the control panel works without Zero Trust on your machine. A real deploy
   always enforces Access. The database seeds sample goals and a default timer
   on first run.

## Usage

The control panel lives at `/dashboard`. Its top nav holds the four live
sections — **Rewards**, **Timer**, **Giveaways**, and **Wheel** — and the gear
opens **Settings**, where the set-once panes live: **Twitch**, **Bot**,
**Overlays**, **Customizer**, and **Backup**.

### OBS browser sources

Open the control panel → **Settings → Overlays** and copy each source URL
straight into OBS. Add each as a **Browser** source with a transparent
background, sized as noted below — the overlays paint only the panel, nothing
else full-screen.

Each URL carries a secret `?t=<token>` — the public overlay API serves nothing
without it, so an OBS source works while a guessed bare path does not. The
**Reset** button on Settings → Overlays rotates the token and instantly kills
the old URLs (re-paste the new ones into OBS). If a source ever shows a small
"Overlay token invalid" hint in the corner, its URL is stale — re-copy it.
Each source also has an **Open in new tab** button to preview the live overlay
in a browser without wiring up OBS first. The rewards source additionally has a
**Mirror** toggle that flips the card to hug the right edge of its scene
(`&side=right` in the URL) for right-anchored layouts.

| Source  | URL                    | Size (W×H)  | Shows                                                        |
| ------- | ---------------------- | ----------- | ------------------------------------------------------------ |
| Timer   | `/overlay/timer?t=…`   | `1310×200`  | Compact countdown bar (D/H/M/S); emotes flood it on each add |
| Rewards | `/overlay/rewards?t=…` | `760×540`   | Current reward name + unlock celebration                     |
| Wheel   | `/overlay/wheel?t=…`   | `1080×1080` | Wheel of dares; hidden until you spin, then reveals the dare |

Each overlay is its own source — drag them where you want in OBS. Each renders
at the fixed native size above and fills its source, so to fit a different scene
just scale the **Browser** source in OBS (or size the source to match).

Both poll every 2 seconds, so control-panel edits and Twitch events appear on
stream within about 2 seconds (the timer keeps counting smoothly between
polls).

### Wolfathon timer

The control panel's **Timer** tab has two halves:

- **Controls** - Start / Pause / Reset, quick add buttons (+1, +5, +10, +30,
  -5 minutes) and a custom amount, plus "simulate event" buttons (Sub T1/T2/T3,
  Gift, 100 bits) that apply the configured minutes for testing.
- **Time rules** - Edit every amount: starting time, cap (0 = no cap), minutes
  per sub tier (T1/T2/T3/Prime), per gifted sub, and per 100 bits — bits are
  prorated, so a small cheer still adds its share of a minute. Pick the time-add
  emote size (1x / 2x / 3x). And manage up to **two channel-point rewards**,
  created right on Twitch from here (this needs the `channel:manage:redemptions`
  scope, so reconnect Twitch once to grant it); remove either at any time.

### Twitch setup (auto-time)

Auto-time uses Twitch EventSub, which needs a Twitch app and a one-time
authorization. The **Twitch** tab walks you through it:

1. Create an application at [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps).
   Set the **OAuth Redirect URL** to `<web origin>/api/twitch/callback`
   (the **Twitch** tab shows the exact value). Client Type **Confidential**.
   Copy the **Client ID** and generate a **Client Secret**.
2. Put them in the environment as `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`
   (repo secrets or `apps/web/.env`) and redeploy. Keep `/api/twitch/callback`
   outside the Cloudflare Access app (Access covers only `/dashboard` +
   `/api/trpc`).
3. On **Settings → Twitch** (it shows "Loaded from environment ✓"),
   click **Connect Twitch**. You're redirected to Twitch to approve, then back
   — the panel flips to **Connected**.
4. On connect, the server creates EventSub webhook subscriptions for
   `channel.subscribe`, `channel.subscription.message`,
   `channel.subscription.gift`, `channel.cheer`,
   `channel.channel_points_custom_reward_redemption.add`,
   `channel.chat.message` (raffle entries), and `stream.offline` /
   `stream.online`. The Twitch status shows the live count as "X of N
   subscriptions"; if a partial connect leaves some out, it names exactly which
   types failed so you can reconnect to retry just those.

The `stream.offline` / `stream.online` subscriptions **auto-pause the timer
when your stream ends and resume it when you go live again**, so an outage or
a forgotten "end stream" doesn't burn Wolfathon time. Auto-resume only fires if
the pause was automatic — a manual pause is never overridden. Toggle the whole
behavior with **Auto-pause when the stream goes offline** on the Timer tab
(default on).

Scopes requested: `channel:read:subscriptions`, `bits:read`,
`channel:read:redemptions`. The EventSub callback is your API Worker at
`/twitch/eventsub`; every event is HMAC-verified, deduplicated, and rejected
if the signature is wrong or older than 10 minutes. The app credentials come
from the Worker env (`TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`); only the
resulting OAuth tokens are stored in D1, and none of it appears in any public
response.

### Backup and restore (JSON)

**Settings → Backup** exports and restores everything in one combined file —
your rewards and timer config bundled together — so a single file fully
restores the tracker:

- **Validate** - Checks pasted/uploaded JSON without writing. Shows a preview
  or a list of human-readable errors.
- **Import (replace)** - Validates, asks you to confirm, then replaces both
  halves. Nothing is written unless validation passes (no partial writes).
- **Export** / **Copy current JSON** - Download or copy the current backup,
  pretty-printed (`wolfathon-backup-…json`).
- **Copy Claude prompt** - Copies a ready prompt (schema + your current config)
  to paste into claude.ai. Ask for the change you want, paste the JSON it
  returns back into the box, and import.

The backup file wraps the two documents below under a version tag. The rewards
half (minimal form):

```json
{
	"goals": [
		{ "reward": "Q&A", "note": "1 sub" },
		{ "reward": "Onesie reveal", "note": "10 subs" },
		{ "reward": "Stretch goal", "note": "dream" }
	]
}
```

The timer half:

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

### Wheel of dares

The control panel's **Wheel** tab manages a spinner of chat dares. Each slot
has a label, a **weight** (a higher weight = a bigger slice and better odds),
an optional colour, and an enable toggle; drag the handle to reorder. **Spin
(random)** picks a weighted-random enabled slot server-side, and each slot has
a **Spin to this** for a hand-picked result. The wheel seeds with a default set
of dares on first run, and the last 25 spins show under **Recent spins**.

Add the **Wheel** OBS source (square, `1080×1080`) from **Settings →
Overlays**. By default the overlay stays hidden until you spin: it whirls a
long, settling multi-turn spin (the centre logo spinning with it), reveals the
dare under the fixed top pointer, then hides again — flip **Keep wheel on
screen** in the Customizer to park it permanently. It honours
`prefers-reduced-motion` (lands without the whirl), shows only enabled slots,
and never receives the token or any internal field.

The wheel can also **auto-spin every N counted subs** — set the cadence on the
Wheel tab (default 10, or Off to spin only by hand). When a sub milestone is
crossed the overlay plays the spin and, if the chat bot is connected, it
announces the dare it landed on.

### Chat bot

Wolfathon can answer chat commands from a **separate bot account**. It runs on
the server (no extra process — it reuses the Twitch EventSub webhook), so it
keeps working after you close the dashboard.

**Connect it** from **Settings → Bot**: log into Twitch as your _bot_ account
first (in another browser/profile, or log out of your main account), then
click **Connect bot** and approve. The bot grants only `user:write:chat` +
`user:bot`; it _hears_ chat through the broadcaster's existing chat
subscription, so the broadcaster account must stay connected.

Five built-in commands ship, each with an enable toggle and editable triggers:

| Command      | Aliases                      | Reply                                         |
| ------------ | ---------------------------- | --------------------------------------------- |
| `!wolfathon` | `!subathon` `!wolf` `!about` | live status line (intro + time + subs + goal) |
| `!giveaway`  | `!gw` `!giveaways`           | your giveaway rules/TOS link (set it once)    |
| `!timer`     | `!time`                      | live time left on the Wolfathon               |
| `!goals`     | `!goal`                      | live next-reward progress (next target only)  |
| `!wheel`     | `!dares`                     | how the Howlwheel works + the live dare count |

Every reply is built from live data — there's no free text to fumble. For each
command you pick one of a few built-in **reply formats** (e.g. the `!wheel`
"How it works" explainer, or which parts the `!wolfathon` status line includes);
`!giveaway` fills in the rules link you set on the Giveaway tab. The bot also
**announces gifted subs** in chat — turn it on with **Announce gift subs**, and
a sub-train is batched into one line (e.g. "🎁 14 subs gifted by 3 people · +28m
on the clock!") so chat never spams. A master switch turns the whole bot on/off,
and a per-command **cooldown** rate-limits normal viewers; broadcaster, mods,
and VIPs bypass it. If the bot's sign-in is later revoked, the Bot tab shows a
**reconnect** prompt instead of going silently dead.

### Giveaway

The control panel's **Giveaway** tab runs a prize draw in two phases.

1. **Start** the round. Only gift subs that arrive _after_ Start count, so
   pre-show hype gifts don't pre-decide the winners. Once started, the header
   shows a live "Tracking gift subs" state and the qualifying gifters appear in
   the order they crossed the threshold; confirm the first N as **gift-sub
   winners**.
2. **Open `!enter`** (the raffle command is configurable) when you want the
   raffle. Chat entries are ignored until you open the window — the toggle is
   disabled until the round is started — and each login can enter once. The
   **raffle pool** lists entrants live (newest first, with a filter and Twitch
   links); **Draw winner** picks from the pool with the same crypto CSPRNG used
   for the wheel, so a real draw can't be predicted or rigged.

A drawn raffle winner has to **claim** before they keep it: the bot posts
"🎉 @them you won — type `!claim` within 5 minutes or I redraw", confirms with
"✅ @them claimed" when they do, and on the next chat line after the window
posts "⏰ didn't claim in time" so you can redraw. The panel shows a live
countdown and a **Redraw** button.

Gift-sub winners and raffle winners show in **separate lists**, each with a
shipped checkbox and a private shipping note (never sent anywhere public). A
**Reroll** on any raffle winner swaps them for a fresh draw without re-picking
the person rerolled out, and anyone who has already won (either phase) is
excluded from new draws. **Clear pool** empties just the entrants (and any
pending claim) so `!enter` can fill a fresh wave while existing winners stand;
**Reset round** wipes everything and un-starts for a clean next one.

Configuration is **one-tap presets** (no fiddly form): pick the raffle command
(`!enter` / `!join` / `!giveaway`, or Custom) and the gift threshold (3 / 5 / 10,
or Custom), and set a **rules/TOS link** — a GitHub gist or any URL — that the
`!giveaway` command auto-fills. Nothing in this tab is ever exposed publicly —
it is operator-only behind Cloudflare Access.

### Customizer (overlay look)

**Settings → Customizer** tunes how the overlays paint: accent colours, font,
corner radius, the eyebrow label, and per-overlay show/hide toggles (units,
progress bar, unlocked row, status, and the rest), plus a **Keep wheel on
screen** toggle (off by default — the wheel only appears when it spins). Each
overlay renders at a fixed native size — scale the OBS source to fit your scene.
A live preview renders the timer and rewards surfaces with sample data
so you can compare before saving; the wheel overlay inherits the same theme.

### Adding your logo

Drop your wolf mark (head only) at `apps/web/public/logo.svg` and it is used
automatically across the overlays and panel. Put your favicon at
`apps/web/src/app/favicon.ico` (Next serves it automatically). If `logo.svg`
is missing, a built-in brand SVG mark is shown instead, so nothing ever
renders broken.

## Tech Stack

| Layer    | Technology                              |
| -------- | --------------------------------------- |
| Monorepo | Turborepo                               |
| Web      | Next.js (overlays, control panel, PWA)  |
| Server   | Hono on Cloudflare Workers              |
| API      | tRPC                                    |
| Database | Cloudflare D1 (SQLite)                  |
| ORM      | Drizzle ORM                             |
| Auth     | Cloudflare Access (Zero Trust)          |
| Twitch   | EventSub webhooks + OAuth redirect flow |
| Styling  | Tailwind CSS, Montserrat and Roboto     |
| Deploy   | Alchemy (Cloudflare Workers and D1)     |
| CI/CD    | GitHub Actions                          |
| Runtime  | Bun (deploy runs under Node via tsx)    |

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
- `bun run test` - Run the domain test suite (`packages/api/src`).
- `bun run check` - Lint with ESLint and check formatting with Prettier.
- `bun run format` - Format the repo with Prettier.
- `bun run db:generate` - Generate the Drizzle migration from the schema.
- `bun run deploy` - Deploy web, server, and D1 to Cloudflare.
- `bun run destroy` - Tear down the deployed Cloudflare resources.

### Code Quality

- End-to-end TypeScript with strict settings.
- Shared design tokens and components in `packages/ui`.
- Domain logic and validation centralized in `packages/api` and reused by the
  overlays, the control panel, and the Twitch webhook.
- Pure-function domain modules (timer, wheel, giveaway, theme, backup) covered
  by `bun test`, kept separate from persistence so they stay easy to test.

## Deploying to Cloudflare

Deployment uses Alchemy to provision the Workers, the Next app, and the D1
database, and to apply migrations. The deploy runs under Node via `tsx` (Bun
segfaults executing the Alchemy program), which `bun run deploy` handles for
you.

1. Authenticate Cloudflare with a scoped API token (Alchemy uses its own auth,
   not Wrangler's). Create a token with **Workers** and **D1** edit
   permissions, then set it in `packages/infra/.env`:

   ```bash
   CLOUDFLARE_API_TOKEN=your-token
   CLOUDFLARE_ACCOUNT_ID=your-account-id
   ALCHEMY_PASSWORD=a-strong-secret
   ALCHEMY_STATE_TOKEN=shared-state-store-token
   ```

   `ALCHEMY_PASSWORD` encrypts local Alchemy state; `ALCHEMY_STATE_TOKEN`
   authenticates to the shared `alchemy-state` state-store Worker (see the
   architecture note below). Both are required for a deploy.

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
- **Deploy** (`deploy.yml`) - after CI succeeds on `main`, runs
  `bun run deploy` and smoke-tests the API.

Set these as repository secrets (Settings → Secrets and variables → Actions):
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ALCHEMY_PASSWORD`,
`ALCHEMY_STATE_TOKEN`, (optionally) `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD`,
and — for Twitch — `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`. Deploy state
lives in a shared, account-wide `alchemy-state` Worker (a Durable-Object-backed
`CloudflareStateStore`, keyed by `ALCHEMY_STATE_TOKEN` and namespaced per app),
so any runner reconciles the same state without a local state file; all
Cloudflare resources also use `adopt: true` to reconcile the live resources.
(Turbo strict env mode requires these to be declared as `passThroughEnv` in
`turbo.json` — already configured.)

### Cloudflare Access (Zero Trust)

The app itself has no login. Security is enforced at the edge by Cloudflare
Access plus a server-side JWT check. You protect the `/dashboard` control
panel and the `/api/trpc` operator API on the web app; the overlays and the
Twitch webhook stay public.

1. In the Cloudflare dashboard, open **Zero Trust → Access → Applications**
   and add a **Self-hosted** application.

2. Set the application paths on the web domain:

   - `wolfathon.mrdemonwolf.workers.dev/dashboard`
   - `wolfathon.mrdemonwolf.workers.dev/dashboard/*`
   - `wolfathon.mrdemonwolf.workers.dev/api/trpc/*`

   Do **not** add `/api/twitch/callback` here — Twitch must reach it without
   an Access login (it is protected by a CSRF `state` token instead).

3. Add a policy that allows only your email (or your team).

4. Copy the **team domain** (for example `your-team.cloudflareaccess.com`)
   and the application **Audience (AUD)** tag.

5. Put them in `packages/infra/.env` (and the repo secrets for CI):

   ```bash
   CF_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
   CF_ACCESS_AUD=your-application-aud-tag
   ```

6. Redeploy with `bun run deploy`.

Access enforcement is automatic: a real deploy always enforces it, local
`alchemy dev` always bypasses it. If `CF_ACCESS_TEAM_DOMAIN` /
`CF_ACCESS_AUD` are blank on a deploy, the operator API fails closed and
denies everything.

### Architecture note

Overlays poll the public server Worker (`state.getPublic`, `timer.getPublic`).
The control panel calls protected procedures on the same-origin `/api/trpc`
route in the web app, where Cloudflare Access injects the verified identity.
Twitch posts EventSub webhooks to the public server Worker, which verifies the
HMAC and adds time. All three share one D1 database (rewards, timer, and
Twitch secrets live in separate rows). For instant push instead of polling, a
Durable Object plus WebSocket can replace the 2-second refetch later.

## Project Structure

```
wolfathon/
├── apps/
│   ├── web/         # Next.js: /overlay/{timer,rewards,wheel} (OBS), /dashboard, /api/trpc
│   └── server/      # Hono on Cloudflare Workers: public API + Twitch EventSub webhook
├── packages/
│   ├── api/         # tRPC routers, timer/Twitch/wheel/giveaway domain, Access verification
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

Made with love by [MrDemonWolf, Inc.](https://www.mrdemonwolf.com)
