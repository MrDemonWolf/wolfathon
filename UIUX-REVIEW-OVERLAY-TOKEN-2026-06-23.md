# UI/UX Review: Overlay token gate + control "Overlays" tab

**Reviewed:** 2026-06-23 · **Input:** Local code (React/TSX + theme CSS) · **Method:** NN/g heuristic evaluation + WCAG AA contrast computation

Scope = the surfaces changed by the overlay-token work: the new
`/control/overlays` tab ([overlays-tab.tsx](apps/web/src/components/control/overlays-tab.tsx)),
the retargeted landing + nav links, and the timer/rewards "Get URL" links. The
transparent OBS overlay pages (`/overlay/*`) are non-interactive render targets
and are excluded from a11y interaction checks.

## Executive summary

- **Contrast: all pairs pass WCAG AA.** Computed from actual theme hex values — body/muted text 6.97–7.46:1, foreground 16.3:1, destructive button text 4.78:1 (> 4.5), primary icons/pills 6.9–7.2:1. No contrast findings.
- **No catastrophic or major findings remain.** Four actionable issues were found and **fixed during this review** (listed below) — internal nav using full-page `<a>` reloads, a missing token-mask (on-stream leak vector), an invalid nested `<a><button>` control, and a flattened heading outline.
- Single worst issue (now fixed): the tokenized URL was rendered in plaintext on a panel the operator may screen-share live — masked by default with a reveal toggle.
- Residual items are **minor/cosmetic** and mostly deliberate (native confirm, desktop-first touch targets).

**Findings:** 🟥 0 catastrophic · 🟧 0 major · 🟨 2 minor · ⬜ 2 cosmetic · ✅ 4 fixed in-review

## Fixed during review

1. **Internal nav was a full-page reload.** `/control/overlays` links in the timer + rewards "Live preview" headers used a plain `<a href>` (full reload, no branded focus ring) → switched to Next `<Link>` + `focus-visible:ring`. Heuristic #4 Consistency & standards.
2. **Token rendered in plaintext (on-stream leak vector).** A streamer screen-sharing this gated panel would expose `?t=<secret>` to chat. Now masked by default (`?t=••••••••••••`) with an Eye/EyeOff reveal toggle (`aria-pressed`); Copy always writes the real token. Heuristic #5 Error prevention.
3. **Invalid nested interactive element.** The "open in new tab" control was `<a><Button/></a>` (a `<button>` inside an `<a>` — invalid HTML, double tab-stop) and its fallback `href` pointed at a tokenless, blank overlay. Removed in favor of the reveal toggle.
4. **Flattened heading outline.** Card titles were `<h2>`, siblings of the section's own `<h2>`. Demoted card titles to `<h3>` → clean `h1` (Control panel) › `h2` (Overlays) › `h3` (each source + Reset).

## Findings

### 🟨 Severity 2 — Minor

#### 5. Reset uses a native `window.confirm`, not the app's styled dialog idiom

- **What:** The destructive "Reset overlay URLs" guard is `window.confirm(...)`. The rest of the app signals via `sonner` toasts and styled surfaces; native dialogs look foreign, aren't keyboard-focus-managed like a real modal, and browsers can globally suppress them ("prevent this page from creating additional dialogs") after repeated use — which would silently skip the guard on a genuinely destructive action.
- **Where:** [overlays-tab.tsx](apps/web/src/components/control/overlays-tab.tsx) `reset()`.
- **Guideline:** Error Prevention + Consistency & Standards — confirmation for destructive actions, same patterns throughout.
- **Evidence:** [10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/) — #5 error prevention (confirm destructive actions) and #4 consistency (same interaction patterns across the product).
- **Fix:**
  - [ ] Replace with a styled confirm (an `AlertDialog` primitive added to `packages/ui`, matching the danger-zone pattern used elsewhere). Deliberately deferred — no dialog primitive exists in the repo yet, and the native confirm still prevents accidental resets.

#### 6. Icon-only buttons below the 1cm touch-target ideal

- **What:** The Eye (reveal) and ghost icon buttons render at the default button height (~36px). NN/g's touch-target floor is 1cm ≈ 44px; these clear the WCAG 2.5.8 hard floor (24px) but sit under the comfortable size for touch.
- **Where:** [overlays-tab.tsx](apps/web/src/components/control/overlays-tab.tsx) reveal/copy buttons.
- **Guideline:** Touch target sizing.
- **Evidence:** [Touch Targets on Touchscreens](https://www.nngroup.com/articles/touch-target-size/) — interactive targets should be ≥ 1cm × 1cm to prevent fat-finger errors.
- **Fix:**
  - [ ] If a touch/tablet operator path matters, bump icon buttons to `min-h-11 min-w-11`. Low priority — the control panel is a desktop-first operator tool and this matches the rest of the app's sizing.

### ⬜ Severity 1 — Cosmetic

#### 7. Public landing links route into the Access login wall with no forewarning

- **What:** The landing hero "Get overlay URLs →" and the Overlays card now link to the gated `/control/overlays`. A non-operator visitor lands on a Cloudflare Access login. The card copy ("Tokenized URLs live in the control panel") softens it, but the hero button gives no signal it requires login.
- **Where:** [(panel)/page.tsx](<apps/web/src/app/(panel)/page.tsx>).
- **Guideline:** Visibility of system status / user control. Low real impact — effectively only the operator visits.
- **Fix:**
  - [ ] Optional: append a lock affordance or "(operator login)" hint to the hero button.

#### 8. Double feedback on copy

- **What:** Copy fires both an inline "Copied" label swap and a toast — mild redundancy.
- **Where:** [overlays-tab.tsx](apps/web/src/components/control/overlays-tab.tsx) `copy()`.
- **Guideline:** Aesthetic & minimalist design.
- **Fix:**
  - [ ] Optional: keep one. Matches the existing `CopyUrl` pattern in twitch-panel, so leaving it is the consistent choice.

## Unverified (needs a running browser / OBS)

- Rendered focus-ring visibility and hover/active states — static review confirms the classes exist (`focus-visible:ring`, `active:scale`) but can't see them paint.
- Screen-reader announcement of the reveal toggle's `aria-pressed`/`aria-label` swap.
- The `window.confirm` → rotate → toast → URL-refresh flow end to end.
- Real overlay rendering in OBS with a valid vs. invalid `?t=` token.
- `truncate` on the code block may clip the masked URL tail at narrow widths (copy is unaffected) — verify at the panel's min column width.

## What's working well

- **Contrast is comfortably AA across the board** — measured, not eyeballed (4.78–17:1).
- **System status is visible** — `Loading…` placeholder, `disabled` copy/reveal during load, "Copied" + toast confirmation (heuristic #1).
- **Destructive action is gated** — confirm + a dedicated danger-zone box with `destructive` styling (heuristic #5).
- **Labels predict outcomes** — "Get URL →", `aria-label="Reveal token"`, "Reset" — no "click here" / "Submit" (heuristic #2, content guidelines).
- **Token masked by default** protects the secret on a panel that gets screen-shared on stream, while Copy still yields the working URL.
- **Active-nav state is correct** — exact-match in the segmented control, and the top nav no longer double-highlights Control + Overlays.

## Quick wins

- [x] Internal links → `<Link>` + focus ring (done)
- [x] Mask token, reveal toggle (done)
- [x] Remove nested `<a><button>` + tokenless fallback (done)
- [x] Heading outline h2 → h3 (done)
- [x] Add a shared `AlertDialog` and replace `window.confirm` (finding #5) — done: new [alert-dialog.tsx](packages/ui/src/components/alert-dialog.tsx) (Base UI, focus-trapped, keyboard-dismissable) now backs the Reset confirmation.
