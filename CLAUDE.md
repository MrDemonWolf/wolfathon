# CLAUDE.md — Wolfathon

Guidance for AI agents working in this repo. Full setup/usage lives in
[`README.md`](README.md); operator onboarding in [`SETUP.md`](SETUP.md). This
file only captures what those don't make obvious.

## What it is

A branded Twitch subathon toolkit: a reward tracker (names, never numbers), a
timestamp-driven countdown that auto-adds time from Twitch EventSub (subs,
gifts, bits, channel points), a wheel of dares, a chat bot, and a giveaway
tracker — shipped as transparent OBS overlays plus a private operator panel,
deployed on Cloudflare.

## Stack

Better-T-Stack monorepo (Turborepo): Next.js web (`apps/web`) + Hono Worker
(`apps/server`) + tRPC + Drizzle on Cloudflare D1, deployed via Alchemy.
Runtime is Bun.

## Build / dev / deploy gotchas

- **`bun run deploy` runs under Node via `tsx` — Bun segfaults executing the
  Alchemy program.** `bun run deploy` already handles this; don't run the
  Alchemy program directly under Bun.
- **`bun run dev` can segfault the same way.** To run the web app standalone:
  `cd apps/web && NEXT_PUBLIC_SERVER_URL=… bun run dev:bare` (Next on :3001,
  miniflare D1 via the OpenNext dev hook).
- Local dev **bypasses Cloudflare Access automatically**; a real deploy always
  enforces it. If `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` are blank on a
  deploy, the operator API **fails closed** and denies everything.
- Deploy state lives in a **shared account-wide `alchemy-state` Worker**
  (`CloudflareStateStore`), keyed by `ALCHEMY_STATE_TOKEN` and namespaced per
  app — there is no local state file. A deploy needs both `ALCHEMY_STATE_TOKEN`
  and `ALCHEMY_PASSWORD` plus the Cloudflare + `CF_ACCESS_*` + `TWITCH_*`
  secrets (see README → Deploying to Cloudflare).
- Fresh worktree: run `bun install` before anything.

## Architecture (the one thing to internalize)

Three surfaces, one D1:

- **Public server Worker** (`apps/server`) — overlays poll `state.getPublic` /
  `timer.getPublic`; Twitch posts HMAC-verified EventSub webhooks here.
- **Protected `/api/trpc`** — same-origin route in the web app, gated by
  Cloudflare Access (OBS can't sign in to Access, so overlays can't use it).
- **Overlays** are gated instead by a secret `?t=<token>` in the URL (a
  `settings` singleton in D1, rotatable from Settings → Overlays).

Routes: operator panel at `/dashboard/*`; OBS sources at
`/overlay/{timer,rewards,wheel}`.

## Where logic lives — reuse it, don't re-implement

- **Pure domain modules** in `packages/api/src` (`timer.ts`, `wheel.ts`,
  `giveaway.ts`, `theme.ts`, `state.ts`, backup) are kept separate from
  persistence and covered by `bun test` (`bun run test`). Validation (Zod),
  the CSPRNG draw, token-gating, and time math live here and are shared by the
  overlays, the panel, and the Twitch webhook — add domain logic here, not in a
  component or router.
- **Shared UI** in `packages/ui/src` — components (`button`, `card`, `input`,
  `checkbox`, `label`, `alert-dialog`, `dropdown-menu`, `skeleton`, `sonner`),
  the `cn` helper (`lib/utils`), and `use-copy-to-clipboard`. Use these; do not
  hand-roll a button/card/input or a second copy-to-clipboard.
- Operator tab components live in `apps/web/src/components/control`, overlay
  rendering in `apps/web/src/components/overlay`.

## Working conventions

- **Building or changing UI:** use the `/frontend-design` skill for the build,
  and run `/uiux-review` (NN/g heuristics) before considering UI work done.
- **Avoid duplication:** reach for an existing `packages/ui` primitive or a
  `packages/api` domain helper before writing new code; prefer extracting a
  shared helper over copy-paste.
- Deployed URLs are fixed: web `wolfathon.mrdemonwolf.workers.dev`, API
  `wolfathon-api.mrdemonwolf.workers.dev`.
- READMEs follow the MrDemonWolf house format (see the `mrdw-readme` skill).
