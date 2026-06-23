# Wolfathon — TODO

Short, ordered list of things only you can do (dashboard / secrets), plus
notes on a few design decisions.

## ASAP (do these when you get a chance)

### 1. Lock down the control panel with Cloudflare Access (security)

Right now `/control` loads for anyone with the URL. Writes already fail closed,
but the page itself is open. Fix:

1. Cloudflare dashboard → **Zero Trust → Access → Applications** → **Add a
   self-hosted application**.
2. Application paths (on `wolfathon.mrdemonwolf.workers.dev`):
   - `/control`
   - `/control/*`
   - `/api/trpc/*`
3. Add a policy that allows **only your email**.
4. Copy two values from the app's settings:
   - **Team domain** — e.g. `your-team.cloudflareaccess.com`
   - **Audience (AUD)** tag
5. Set them as repo secrets (CI already passes them through on deploy):
   ```bash
   printf '%s' 'your-team.cloudflareaccess.com' | gh secret set CF_ACCESS_TEAM_DOMAIN --repo MrDemonWolf/wolfathon
   printf '%s' 'your-aud-tag' | gh secret set CF_ACCESS_AUD --repo MrDemonWolf/wolfathon
   ```
   (Also put them in `packages/infra/.env` for local `bun run deploy`.)
6. Push anything (or re-run Deploy). Now `/control` sits behind Cloudflare login
   and the "Cloudflare Access required" error goes away once you're signed in.

### 2. Connect Twitch (turn on auto-time)

1. Create an app at https://dev.twitch.tv/console/apps. **Client Type:
   Confidential.** Set the **OAuth Redirect URL** to exactly
   `https://wolfathon.mrdemonwolf.workers.dev/api/twitch/callback`. Copy the
   **Client ID** and generate a **Client Secret**.
2. Set them as repo secrets, then redeploy (the Worker reads them from env):
   ```bash
   printf '%s' 'your-client-id'     | gh secret set TWITCH_CLIENT_ID --repo MrDemonWolf/wolfathon
   printf '%s' 'your-client-secret' | gh secret set TWITCH_CLIENT_SECRET --repo MrDemonWolf/wolfathon
   ```
   (Also put them in `apps/web/.env` for local `bun run dev`.) Keep
   `/api/twitch/callback` **out** of the Cloudflare Access app.
3. Control panel → **Twitch** tab (shows "Loaded from environment ✓") → click
   **Connect Twitch** → approve on Twitch → you're redirected back, Connected.
4. It auto-creates the EventSub subscriptions. Fire a test sub from the Timer tab
   to confirm time is added.

### 3. Rotate the Alchemy password (housekeeping)

`ALCHEMY_PASSWORD` is still the `please-change-this` default. Set a strong value
in `packages/infra/.env` **and** the `ALCHEMY_PASSWORD` repo secret. (Low risk —
it only encrypts ephemeral CI deploy state — but worth doing.)

## Notes / decisions

### Timer crash-safety — already handled, no periodic save needed

The timer is **timestamp-based**: D1 stores `endsAt` (absolute epoch ms) when
running, or `remainingMs` when paused, and it's written on **every** change
(start/pause/reset, manual add, and every Twitch event). Nothing ticks in
memory, so a crash of the Worker / PC / OBS loses nothing — on restart the
overlay reads `endsAt` back and resumes at the correct time.

Therefore a "save every N seconds" loop is intentionally **not** implemented: it
would re-write the same value repeatedly and eat into the D1 write budget
(Workers free tier = 100k writes/day). Writes only happen on real changes.

### Auto-pause when the stream goes offline — DONE

The timer counts real wall-clock time, so a stream/PC outage burns subathon time.
Uses the EventSub we already have: `stream.offline` auto-pauses, `stream.online`
auto-resumes. No extra scopes needed.

**DONE:** subscribes to `stream.offline` + `stream.online`. Offline auto-pauses;
online auto-resumes **only if the pause was automatic** (a pause-reason flag on
the timer state means a manual pause is never overridden). Opt-in via the Timer
tab toggle **Auto-pause when the stream goes offline** (config
`autoPauseOnOffline`, default on). The control Timer status chip shows
"PAUSED · OFFLINE" (amber) when auto-paused. Existing Twitch connections must
**reconnect once** (control panel -> Twitch -> Connect) to create the
`stream.online` sub.

### If you ever DO want a heartbeat (optional, later)

Only worth it if you add an in-memory accumulator that isn't already persisted.
If so, throttle it to >= 60s and only write when `endsAt`/`remainingMs` actually
changed. Don't write on a fixed interval unconditionally.

### Reducing D1 reads (only if you approach limits)

Overlays poll every 2s → ~86k reads/day with both sources open (fine vs the 5M
free tier). If you ever need to cut it: add a short `Cache-Control` on
`timer.getPublic` / `state.getPublic`, or raise the overlay `refetchInterval`.
The timer overlay counts down locally between polls, so a 5s interval still
looks smooth.

### High-volume events (only if you run massive gift bombs)

Each Twitch event writes the timer row **and** a dedupe-id row (2 writes/event).
A few thousand events/day is well under the cap. If you expect tens of thousands,
batch or drop the dedupe-row write (rely on `endsAt` idempotency instead).
