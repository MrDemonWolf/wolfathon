# Wolfathon - A Clean Subathon Reward Tracker for Twitch

Wolfathon is a branded reward tracker for subathons. It shows your current
reward goal as a name only, never a number, and unlocks goals one at a time
as your event grows. There is no visible ceiling and no countdown timer, so a
big gifter never sees a final target and you keep your own timer running
separately. It ships as a transparent OBS overlay plus a private control
panel, deployed on Cloudflare.

Keep the rewards flowing. Keep your chat guessing.

## Features

- **Reward names only** - The overlay shows the current reward name and
  already-unlocked names. Amounts, totals, and future goals are never sent to
  the browser.
- **One-at-a-time unlocks** - Goals unlock top to bottom. Unlocking plays a
  short glow-and-scale celebration (no audio), then settles on the next reward.
- **No ceiling, no timer** - Future goals stay hidden, so there is no visible
  "top". Run your countdown in a separate tool.
- **Private notes** - Each goal has an internal `note` (for example, "10 subs")
  that is stripped server-side and never reaches the overlay.
- **Fast JSON import/export** - Paste or upload a goal list, validate it, then
  replace everything in one click. Export the live state, edit it, re-import.
- **Cloudflare Access security** - The control panel and its API sit behind
  Cloudflare Zero Trust. The public overlay stays open.
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
   - Overlay (OBS source): `http://localhost:3001/overlay`
   - API (overlay data): `http://localhost:3000`

   Local development (`bun run dev`) bypasses Cloudflare Access automatically,
   so the control panel works without Zero Trust on your machine. A real deploy
   always enforces Access. The database is seeded with a sample goal list on
   first run.

## Usage

### OBS browser source

Add the overlay as a browser source in OBS:

1. Sources, then add a **Browser** source.
2. URL: your deployed overlay URL, or `http://localhost:3001/overlay` in dev.
3. Width `1920`, Height `1080`.
4. Leave the background transparent. The overlay paints only its floating
   panels, nothing full-screen, so it composites cleanly over your scene.

The overlay polls for updates every 2 seconds, so edits in the control panel
appear on stream within about 2 seconds.

### Adding your logo

Drop your wolf mark at `apps/web/public/wolf_mark.png` and it is used
automatically across the overlay and panel. If the file is missing, a built-in
brand SVG mark is shown instead, so nothing ever renders broken.

### JSON import and export

The control panel has an Import / Export panel for reconfiguring goals fast.

- **Validate** - Checks your pasted or uploaded JSON without writing anything.
  Shows the parsed goal count and reward names, or a list of row errors.
- **Import (replace all)** - Validates, then asks you to confirm. On confirm it
  wipes the current goals, loads the new set, and resets progress to the first
  goal. Nothing is written unless validation passes.
- **Export** - Downloads the full current state (including notes), pretty
  printed, as `wolfathon-goals-YYYYMMDD-HHMM.json`.
- **Copy current JSON** - Copies that same document to your clipboard.
- **Copy schema** - Copies an import-ready example so an AI assistant can
  produce a valid goal list in one shot.

Accepted import shape (the minimal form):

```json
{
  "goals": [
    { "reward": "Q&A", "note": "1 sub" },
    { "reward": "Phasmophobia", "note": "5 subs" },
    { "reward": "Onesie reveal", "note": "10 subs" },
    { "reward": "Cake on cam", "note": "15 subs" },
    { "reward": "Confetti chaos", "note": "25 subs" },
    { "reward": "Stretch goal", "note": "dream" }
  ]
}
```

Rules: `goals` is a non-empty array (max 50). Each goal needs a non-empty
`reward` string (max 80 characters). `note` is optional and internal only.
Any `id` and unknown keys are ignored, and ids are generated server-side. A
full export document (the object produced by Export) is also accepted and
normalized the same way.

### What the overlay shows

| Element             | Shown on stream                                    |
| ------------------- | -------------------------------------------------- |
| Current reward      | The next locked goal's `reward` name, prominently  |
| Unlocked rewards    | A dimmed row of already-unlocked `reward` names     |
| Unlock event        | A short "Unlocked: <reward>" glow-and-scale flash   |
| Future goals        | Hidden entirely                                     |
| Numbers / amounts   | Never shown                                         |
| `note` field        | Never sent to the browser                           |

## Tech Stack

| Layer        | Technology                                  |
| ------------ | ------------------------------------------- |
| Monorepo     | Turborepo                                   |
| Web          | Next.js (overlay, control panel, PWA)       |
| Server       | Hono on Cloudflare Workers                  |
| API          | tRPC                                        |
| Database     | Cloudflare D1 (SQLite)                      |
| ORM          | Drizzle ORM                                 |
| Auth         | Cloudflare Access (Zero Trust)              |
| Styling      | Tailwind CSS, Montserrat and Roboto         |
| Deploy       | Alchemy (Cloudflare Workers and D1)         |
| Runtime      | Bun                                         |

## Development

### Prerequisites

- Bun 1.3 or newer
- A Cloudflare account (for deployment)
- The Cloudflare Wrangler CLI authenticated, or a scoped API token

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
- Domain logic and validation centralized in `packages/api` and reused by both
  the overlay and the control panel.

## Deploying to Cloudflare

Deployment uses Alchemy to provision the Worker, the Next app, and the D1
database, and to apply migrations.

1. Authenticate Cloudflare (either is fine):

   ```bash
   bunx wrangler login
   ```

   Or set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in
   `packages/infra/.env`.

2. Set a strong `ALCHEMY_PASSWORD` in `packages/infra/.env`.

3. Deploy:

   ```bash
   bun run deploy
   ```

   The Worker names are fixed, so the deploy lands on:

   - Web: `https://wolfathon.mrdemonwolf.workers.dev`
   - API: `https://wolfathon-api.mrdemonwolf.workers.dev`

   Infra wires the web app's `NEXT_PUBLIC_SERVER_URL` to the API Worker and
   defaults the server's `CORS_ORIGIN` to the web URL automatically, so no
   manual URL juggling is needed.

### Cloudflare Access (Zero Trust)

The app itself has no login. Security is enforced at the edge by Cloudflare
Access, plus a server-side JWT check. You protect two things on the web app:
the `/control` page and the `/api/trpc` operator API. The overlay stays public.

1. In the Cloudflare dashboard, open **Zero Trust**, then **Access**, then
   **Applications**, and add a **Self-hosted** application.

2. Set the application paths to cover the control panel and its API on the web
   domain:

   - `wolfathon.mrdemonwolf.workers.dev/control`
   - `wolfathon.mrdemonwolf.workers.dev/control/*`
   - `wolfathon.mrdemonwolf.workers.dev/api/trpc/*`

3. Add a policy that allows only your email (or your team).

4. After saving, open the application's settings and copy two values:

   - The **team domain**, for example `your-team.cloudflareaccess.com`
   - The application **Audience (AUD)** tag

5. Put them in `packages/infra/.env`:

   ```bash
   CF_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
   CF_ACCESS_AUD=your-application-aud-tag
   ```

6. Redeploy:

   ```bash
   bun run deploy
   ```

Access enforcement is automatic: a real deploy always enforces it, local
`alchemy dev` always bypasses it. After deploy, visiting `/control` requires a
Cloudflare Access login, and every protected tRPC call verifies the
`Cf-Access-Jwt-Assertion` header against your team's public keys with the
matching audience. If `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` are blank on a
deploy, the operator API fails closed and denies everything.

### Architecture note

The overlay polls `state.getPublic` on the public server Worker every 2 seconds.
The control panel calls protected procedures on the same-origin `/api/trpc`
route in the web app, which is where Cloudflare Access injects the verified
identity. Both backends share one D1 database. For instant push instead of
polling, a Durable Object plus WebSocket can replace the 2-second refetch later.

## Project Structure

```
wolfathon/
├── apps/
│   ├── web/         # Next.js: /overlay (OBS), /control (operator), /api/trpc
│   └── server/      # Hono on Cloudflare Workers: public overlay tRPC API
├── packages/
│   ├── api/         # tRPC routers, domain logic, Cloudflare Access verification
│   ├── db/          # Drizzle schema, D1 client, migrations
│   ├── env/         # Typed environment access
│   ├── ui/          # Shared design system (brand tokens, components)
│   ├── infra/       # Alchemy deploy config (Workers, D1, bindings)
│   └── config/      # Shared TypeScript config
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
