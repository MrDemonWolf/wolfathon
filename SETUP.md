# Wolfathon — Setup Guide (the two things to finish)

Two short setups. ~10 minutes each. Do Part 1 first (it locks down your panel).
Each step = one action. Bold = the thing to click.

---

## Part 1 — Lock the control panel (Cloudflare Access)

**Why:** right now anyone with the URL can open `/control`, where your Twitch
secret lives. This puts a login in front of it.

**You need:** your Cloudflare account (the one Wolfathon deploys to).

### Steps

1. Go to **https://one.dash.cloudflare.com** (Cloudflare Zero Trust).
2. First time only: it asks you to **pick a team name**. Type anything (e.g.
   `mrdemonwolf`). Write down what you pick — your team domain becomes
   `THAT-NAME.cloudflareaccess.com`. ☐
3. Left sidebar → **Access** → **Applications** → **Add an application**. ☐
4. Tab **Self-hosted and private** → click **Public DNS** → **Continue with
   Self-hosted and private**. (Public DNS = gate a public hostname like
   `*.workers.dev`.) ☐
5. **Application name:** `Wolfathon Control`. ☐
6. **Add public hostname / destination** — add three (same hostname
   `wolfathon.mrdemonwolf.workers.dev`, different path each):
   - hostname `wolfathon.mrdemonwolf.workers.dev`, path `/control`
   - hostname `wolfathon.mrdemonwolf.workers.dev`, path `/control/*`
   - hostname `wolfathon.mrdemonwolf.workers.dev`, path `/api/trpc/*`
   ☐
7. **Next** / **Add a policy**:
   - **Policy name:** `Just me`
   - **Action:** Allow
   - **Add a rule** → **Selector: Emails** → **Value:** your email. ☐
8. **Next** → **Save** / **Add application**. ☐
9. Open the app → **Overview** tab → copy two values:
   - **Team domain** (e.g. `mrdemonwolf.cloudflareaccess.com`)
   - **Application Audience (AUD) Tag** (a long hex string) ☐

### Tell Wolfathon about it

Paste both values to Claude and say "set the Access secrets" — OR run these
yourself in the repo folder:

```bash
printf '%s' 'YOUR-TEAM.cloudflareaccess.com' | gh secret set CF_ACCESS_TEAM_DOMAIN --repo MrDemonWolf/wolfathon
printf '%s' 'YOUR-AUD-TAG' | gh secret set CF_ACCESS_AUD --repo MrDemonWolf/wolfathon
```

Then push anything (or re-run the **Deploy** workflow) to apply.

**You'll know it worked when:** opening `wolfathon.mrdemonwolf.workers.dev/control`
shows a Cloudflare login first, and after you log in the panel loads with no
"Cloudflare Access required" error.

---

## Part 2 — Connect Twitch (auto-add time)

**Why:** lets subs / gifts / bits / channel points add time to the timer
automatically. Yes — you create one Twitch "app" to get a Client ID + Secret.

**You need:** your Twitch account, logged in.

### A. Make the Twitch app (one time)

1. Go to **https://dev.twitch.tv/console/apps**. ☐
2. If asked, **Enable Two-Factor Auth** on your Twitch account first (Twitch
   requires it for developer apps). ☐
3. Click **Register Your Application**. ☐
4. Fill in:
   - **Name:** `Wolfathon` (must be unique; add a word if taken)
   - **OAuth Redirect URLs:**
     `https://wolfathon.mrdemonwolf.workers.dev/api/twitch/callback`
     (must match **exactly** — the Twitch tab shows you the right value) ☐
   - **Category:** `Broadcasting Suite`
   - **Client Type:** `Confidential` ☐
5. Click **Create**. ☐
6. Open the app → copy the **Client ID**. ☐
7. Click **New Secret** → copy the **Client Secret** (you only see it once —
   copy it now). ☐

### B. Add the credentials to the environment (one time)

The Client ID + Secret live in the **environment**, not the control panel.

1. Set them as GitHub repo secrets (or your local `apps/web/.env`):
   - `gh secret set TWITCH_CLIENT_ID` ☐
   - `gh secret set TWITCH_CLIENT_SECRET` ☐
2. **Redeploy** so the Worker picks them up (push to `main`, or re-run the
   Deploy workflow). ☐

> Heads-up: keep the `/api/twitch/callback` path **out** of the Cloudflare
> Access app. Access should only cover `/control` and `/api/trpc` — Twitch needs
> to reach the callback without an Access login.

### C. Connect it in Wolfathon

1. Open the control panel → **Twitch** tab. It should say
   **"Loaded from environment ✓"**. ☐
2. Click **Connect Twitch** → you're sent to Twitch → **Authorize**. ☐
3. Twitch sends you back; the panel flips to **Connected**. ☐

**You'll know it worked when:** the Twitch tab says "Connected as <you>" with a
subscription count. Test it: **Timer** tab → click **Sub T1** — the clock jumps
up by your configured minutes.

---

## Quick reference

| Thing | Where |
| --- | --- |
| Cloudflare Zero Trust | https://one.dash.cloudflare.com |
| Twitch apps | https://dev.twitch.tv/console/apps |
| OAuth Redirect URL | https://wolfathon.mrdemonwolf.workers.dev/api/twitch/callback |
| Your panel | https://wolfathon.mrdemonwolf.workers.dev/control |
| Timer overlay (OBS) | https://wolfathon.mrdemonwolf.workers.dev/overlay/timer |
| Rewards overlay (OBS) | https://wolfathon.mrdemonwolf.workers.dev/overlay/rewards |
