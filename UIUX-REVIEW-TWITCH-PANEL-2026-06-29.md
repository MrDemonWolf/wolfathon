# UI/UX Review: Twitch settings panel

**Reviewed:** 2026-06-29 · **Input:** Local code (`apps/web/src/components/control/twitch-panel.tsx`) + operator screenshot of the degraded "connected" state · **Method:** NN/g heuristic evaluation + guideline review

## Executive summary

- The panel handles its state matrix well — loading, not-configured, not-connected, connected, and degraded all render in a stable row that never swaps the whole screen. That's a real strength.
- **The single worst problem:** the degraded state shows a green "all good" check icon _and_ a raw HTTP 403 JSON blob _and_ a cause explanation that is wrong for the event that actually failed. Three signals, all misaligned, on the one state where the operator most needs clarity.
- The actionable diagnostic (`channel.chat.message: 403 {…}`) is rendered in the smallest, lowest-contrast text on the card (10px at ~3.14:1 — below AA).
- Destructive **Disconnect** is the loudest button, but the error tells the operator to click **Reconnect**.
- No measured contrast failures in the primary status text; the only contrast miss is the mono error reason.

**Findings:** 🟥 0 catastrophic · 🟧 3 major · 🟨 3 minor · ⬜ 1 cosmetic

## Findings

### 🟧 Severity 3 — Major

#### 1. Raw HTTP 403 JSON shown as the error message

- **What:** The degraded state prints the verbatim API payload: `channel.chat.message: 403 {"error":"Forbidden","status":403,"message":"subscription missing proper authorization"}`. This is a developer log line, not an operator-facing message. It states neither what it means for the streamer nor what to do.
- **Where:** `twitch-panel.tsx:94-98` — `failedSubscriptionReasons.join(" · ")` in the mono `<span>`.
- **Guideline:** Heuristic 9 — help users recognize, diagnose, and recover from errors. Messages should be in plain language, express the problem precisely, and constructively suggest a fix; raw codes and system jargon fail all three.
- **Evidence:** [Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/) — error text should explain the problem in human language and point to the next action, not echo system internals.
- **Fix:**
  - [ ] Map each failed subscription type to a human sentence (e.g. "Chat reading needs an extra permission — click Reconnect and approve all boxes").
  - [ ] Keep the raw `status + body` only behind a "Show technical details" disclosure for support, not in the default view.

#### 2. Green success check contradicts the degraded state

- **What:** When `failedSubscriptionTypes` is non-empty, the panel still renders the `CheckCircle2` success icon (primary blue, #00aced) next to "Connected as mrdemonwolf", with the error spelled out immediately below it. The top-line glyph says "all good"; the body says "something's broken." Conflicting status at a glance.
- **Where:** `twitch-panel.tsx:81-104` — the `connected` branch always uses `CheckCircle2`; it does not switch on `failedSubscriptionTypes.length`.
- **Guideline:** Heuristic 1 — visibility of system status. The primary status indicator must reflect the actual state; a partial/degraded connection is not a success state.
- **Evidence:** [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) — keep users informed about system state through appropriate, accurate feedback.
- **Fix:**
  - [ ] When `failedSubscriptionTypes.length > 0`, swap to `AlertTriangle` in a warning/amber tone and a heading like "Connected — some events need attention".
  - [ ] Reserve the green `CheckCircle2` for the truly-all-good case (`failedSubscriptionTypes.length === 0`).

#### 3. "Affiliate or Partner" explanation is wrong for the event that failed

- **What:** The fixed copy says the failed events "only work on Affiliate or Partner channels — if yours isn't one yet, that's expected." But the failing event is `channel.chat.message`, which works on **every** channel; its 403 is a missing-scope problem, not an affiliate gate. The message sends the operator chasing the wrong cause (and may make them shrug off a real, fixable auth issue).
- **Where:** `twitch-panel.tsx:89-93` — the explanation is hard-coded regardless of _which_ subscription types failed.
- **Guideline:** Heuristic 2 (match between system and the real world) + Heuristic 9 (accurate diagnosis). The explanation must match the actual failure.
- **Evidence:** [Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/) — an error message that misstates the cause is worse than none; it should precisely express what went wrong.
- **Fix:**
  - [ ] Branch the explanation on the failed type set: scope/auth failures (`channel.chat.message`, `*.bot`) → "Reconnect and approve all permissions"; subscription/bits/points failures → the Affiliate/Partner note.
  - [ ] Only show the Affiliate caveat for the event types it actually applies to.

### 🟨 Severity 2 — Minor

#### 4. Destructive button outweighs the recommended action

- **What:** In the connected/degraded state the row shows **Reconnect** (outline, quiet) beside **Disconnect** (`variant="destructive"`, solid red). The error text instructs "click Reconnect," yet Disconnect is the visually dominant control. Emphasis points away from the recovery path.
- **Where:** `twitch-panel.tsx:129-151`.
- **Guideline:** Visual hierarchy / Heuristic 1 — the most prominent control should be the recommended next action.
- **Evidence:** [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) — guide users toward the right action through appropriate visual weight.
- **Fix:**
  - [ ] In the degraded state, make Reconnect the primary (filled) button and demote Disconnect to a quiet/ghost or text button.

#### 5. Disconnect fires with no confirmation

- **What:** `onClick={() => disconnect.mutate()}` runs immediately. Disconnect tears down all EventSub subscriptions; an accidental click silently stops time-adding mid-stream. The repo already has an `AlertDialog` primitive for exactly this.
- **Where:** `twitch-panel.tsx:139-150`.
- **Guideline:** Heuristic 5 — error prevention; confirm consequential/irreversible-in-the-moment actions. (Severity 2, not 3, because it's recoverable via Reconnect.)
- **Evidence:** [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) — prevent problems before they occur; confirm destructive actions.
- **Fix:**
  - [ ] Wrap Disconnect in the existing `AlertDialog` ("Disconnect Twitch? Time will stop being added until you reconnect.").

#### 6. The key diagnostic is the least readable text on the card

- **What:** The mono error reason uses `text-[10px]` at `opacity-70`. Measured contrast of `--destructive` (#f0556a) at 70% over the card (#111726) is **3.14:1** — below the WCAG AA 4.5:1 floor for normal text — and 10px is under the 16px body baseline. The most important text for troubleshooting is the hardest to read.
- **Where:** `twitch-panel.tsx:95-97`.
- **Guideline:** Accessibility — text contrast + legibility. (The full-opacity destructive body text at 5.29:1 passes; only the dimmed mono line fails.)
- **Evidence:** [Low-Contrast Text Is Not the Answer](https://www.nngroup.com/articles/low-contrast/) — dimming text to look "subtle" trades away legibility for users who most need to read it; WCAG 1.4.3 sets 4.5:1 for normal text.
- **Fix:**
  - [ ] Drop the `opacity-70`; use full `--muted-foreground` (#94a3b8 = 6.97:1) or full `--destructive` (5.29:1).
  - [ ] Raise the size to ≥12px; 10px mono is hard on most displays.

### ⬜ Severity 1 — Cosmetic

#### 7. Pane starts at `<h2>` with no `<h1>`

- **What:** The panel's top heading is `<h2>Twitch</h2>`; the page wrapper (`settings/twitch/page.tsx`) adds no `<h1>`. If the settings layout doesn't provide an `<h1>` for the active pane, the document outline skips level 1.
- **Where:** `twitch-panel.tsx:63` + `settings/twitch/page.tsx`.
- **Guideline:** Heading structure — one `<h1>` per view, no skipped levels.
- **Evidence:** [Visual Hierarchy in UX](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/) — heading levels should form a correct outline.
- **Fix:**
  - [ ] Confirm the settings layout renders an `<h1>` (page title) for the active section; if not, promote the pane title or add a visually-hidden `<h1>`.

## Unverified (needs a different input to check)

- **Focus-visible styles** on the four buttons — comes from the shared `Button` primitive; not inspected here. Verify `:focus-visible` ring renders on keyboard nav.
- **Toast behavior** for the redirect round-trip (`twitch?=connected|partial|...`) — logic looks correct in code, but actual toast rendering/timing not observed.
- **Real rendered contrast** of the amber/warning treatment proposed in finding #2 — pick the token and re-measure.

## What's working well

- Stable status row: every state renders in the same container, so reconnecting never swaps the whole screen (`twitch-panel.tsx:69-70` comment shows this was deliberate).
- Loading state is explicit ("Checking connection…" with spinner) — Heuristic 1 satisfied for the wait.
- The redirect round-trip surfaces a result toast and strips the query param so refresh doesn't re-toast (`twitch-panel.tsx:34-47`).
- Primary status text, helper text, and the status icon all pass AA contrast (16.32:1, 6.97:1, 6.92:1).
- "Send test" microcopy honestly warns it adds time and to reset after — good expectation-setting.

## Quick wins

- [ ] Swap the success check for a warning icon + "some events need attention" heading when any subscription failed (finding #2).
- [ ] Branch the cause text so `channel.chat.message` failures don't blame the Affiliate gate (finding #3).
- [ ] Replace the raw 403 JSON with a plain sentence; hide the payload behind "technical details" (finding #1).
- [ ] Remove `opacity-70` and bump the mono reason to ≥12px (finding #6).
- [ ] Wrap Disconnect in the existing `AlertDialog` (finding #5).
