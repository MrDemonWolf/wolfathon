# UI/UX Review: Wolfathon operator frontend (shadcn reskin)

**Reviewed:** 2026-06-19 · **Input:** Local code (Next.js / Tailwind v4 / `@wolfathon/ui`) · **Method:** NN/g heuristic evaluation + guideline review

Scope: the operator-facing surfaces reskinned this pass — landing, panel chrome + footer, control tabs, timer control, timer config, Twitch panel, design tokens, button variants. The on-air OBS overlay graphics (`timer-view.tsx`, `overlay-view.tsx`) were intentionally excluded.

## Executive summary

- The reskin is **measurably solid on contrast** — every text/background pair I computed lands at AA or better, most at AAA (≥7:1). No contrast findings.
- The single most important fix in this pass was a **bug, not a style issue**: the control-panel countdown was frozen (computed once per render, no interval), violating NN/g Heuristic #1 *Visibility of System Status*. It now ticks every second.
- **No catastrophic (4) findings.** The one **Major (3)** is a pre-existing error-prevention gap: `Reset` wipes the live subathon clock on a single click with no confirmation.
- Remaining findings are touch-target sizing (mitigated by this being a desktop, Access-gated dashboard) and minor consistency/responsive polish.
- Keyboard focus indicators were missing on the hand-rolled link/card controls and were **added during this pass**; verify them in a live browser.

**Findings:** 🟥 0 catastrophic · 🟧 1 major · 🟨 2 minor · ⬜ 2 cosmetic

## Findings

### 🟧 Severity 3 — Major

#### 1. `Reset` destroys the live countdown with one unconfirmed click
- **What:** In `timer-panel.tsx` the `Reset` button (`variant="destructive"`) calls `reset.mutate()` immediately, resetting remaining time to the configured start and discarding all accumulated subathon time. The only feedback is a success toast *after* the fact. During a live stream this is effectively irreversible and high-consequence; it sits directly beside `Start`/`Pause`, raising misclick odds.
- **Where:** `apps/web/src/components/control/timer-panel.tsx` — transport row, the `Reset` `<Button>`.
- **Guideline:** Error Prevention — eliminate error-prone conditions or confirm before committing a high-consequence, irreversible action.
- **Evidence:** [10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/) — Heuristic #5: prefer designs that prevent problems from occurring; present users with a confirmation option before they commit to a destructive action.
- **Why Major not Catastrophic:** it doesn't block the task and is infrequent, but a single misclick can ruin a multi-hour live event.
- **Fix:**
  - [ ] Add a confirm step before reset — a small confirm dialog ("Reset clears all accumulated time. Reset now?") or a two-step / hold-to-confirm button.
  - [ ] Optionally separate `Reset` from `Start`/`Pause` (move it to the end / give it more spacing) to reduce adjacency misclicks.

### 🟨 Severity 2 — Minor

#### 2. Several controls are below NN/g's 1cm minimum touch target
- **What:** Measured heights — Button `default` = 32px (`h-8`), `sm` = 28px, `icon-sm` = 28px; the config "remove rule" uses `icon-sm` (28px) and emoji preset tiles are 36px (`size-9`). NN/g's recommended minimum interactive target is **1cm × 1cm (~38–44px CSS px)**. The reworked timer/Twitch actions correctly use `size="lg"` (36px), but the config panel's icon and small buttons remain under target.
- **Where:** `apps/web/src/components/control/timer-config-panel.tsx` (remove-rule icon button, preset tiles, "Add" buttons); `packages/ui/src/components/button.tsx` (`default`/`sm`/`icon-sm` sizes).
- **Guideline:** Touch target sizing for accurate, low-error selection.
- **Evidence:** [Touch Targets on Touchscreens](https://www.nngroup.com/articles/touch-target-size/) — interactive elements should be at least 1cm × 1cm to support accurate selection and avoid fat-finger errors.
- **Why only Minor:** this panel is a desktop operator dashboard behind Cloudflare Access, primarily used with a mouse at a desk; touch frequency is low. Raise severity if a tablet workflow is expected.
- **Fix:**
  - [ ] For the densest rows, bump `icon-sm` → `icon-lg` (36px) and `default` → `lg` where touch matters.
  - [ ] If touch is genuinely out of scope, document "desktop/mouse only" and leave as-is.

#### 3. Card corner radius is inconsistent across panels
- **What:** Reworked panels use `rounded-xl`; older panels still use `rounded-2xl` (`timer-config-panel.tsx`, `import-export-panel.tsx`, overlay chooser `SourceCard`). With `--radius: 0.625rem`, that's ~0.875rem vs ~1.125rem — a visible step between adjacent cards in the same column.
- **Where:** mixed `rounded-2xl` / `rounded-xl` across `apps/web/src/components/control/*` and `apps/web/src/app/overlay/page.tsx`.
- **Guideline:** Consistency and Standards — the same element type should look the same throughout.
- **Evidence:** [10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/) — Heuristic #4: follow internal consistency so users don't wonder whether different appearances mean different things.
- **Fix:**
  - [ ] Standardize all `panel-card` surfaces on `rounded-xl`.

### ⬜ Severity 1 — Cosmetic

#### 4. Deployed-commit link is hidden on mobile
- **What:** The footer commit hash (now a clickable GitHub link) renders only at ≥640px (`hidden … sm:inline`). On phones the deploy-version affordance is unreachable.
- **Where:** `apps/web/src/app/(panel)/layout.tsx` footer.
- **Guideline:** Visibility of System Status (which build is live) — minor here because it's a diagnostic detail, not a task control.
- **Evidence:** [10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/) — Heuristic #1.
- **Fix:**
  - [ ] Drop the `sm:` gate (the 7-char hash fits) or wrap the footer items so the link survives on narrow widths.

#### 5. Quiet eyebrow labels are low-emphasis by design — confirm intent
- **What:** `.eyebrow` ("Subathon toolkit", "Operator") is now `muted-foreground` (#94a3b8, ~7:1 — passes), uppercase, tracked. Contrast is fine; the note is that these section kickers are now visually very quiet. Intentional for a "calm shadcn" look, but verify they still read as labels and not disabled text.
- **Where:** `packages/ui/src/styles/globals.css` `.eyebrow`; used on landing, control, overlay chooser.
- **Guideline:** Aesthetic and Minimalist Design vs. legibility of secondary labels.
- **Evidence:** [10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/) — Heuristic #8.
- **Fix:**
  - [ ] If they read as disabled, nudge to a slightly brighter token or add the brand blue back on the eyebrow only.

## Unverified (needs a running browser / different input to check)
- **Rendered keyboard-focus ring visibility.** Explicit `focus-visible:ring-2 ring-ring` classes were added to the landing CTAs, surface cards, and nav links this pass, but the actual rendered ring (offset, against `panel-card` borders) wasn't confirmed in a live browser. Evidence basis for adding them: [Keyboard-Only Navigation for Improved Accessibility](https://www.nngroup.com/articles/keyboard-accessibility/) — interactive elements must show an obvious keyboard-focus indicator.
- **Timer live-tick at runtime.** The frozen-clock fix is verified by code logic + a clean typecheck, not by observing a running countdown.
- **Hover / loading / disabled states.** Present in code (spinners, `disabled:opacity-50`, hover colors) but not visually verified.

## What's working well
- **Contrast is strong and measured:** foreground/bg 17.5:1, muted-fg 7.0–7.5:1, primary text 6.9–7.4:1, blue button text 7.2:1, destructive text 5.3:1 — all ≥ AA, most ≥ AAA.
- **Status uses redundant encoding:** LIVE/PAUSED/ENDED is conveyed by text label + color + a dot, not color alone (good for color-blind operators).
- **Accessible tabs:** the control panel implements the WAI-ARIA tabs pattern with roving `tabindex` and arrow-key navigation.
- **Visibility of system status restored:** the countdown now updates every second instead of sitting frozen until the next mutation (NN/g Heuristic #1).
- **Progressive disclosure on Twitch:** first-run setup URLs are folded into a native `<details>`, so the default view is just Connect + test (NN/g Heuristic #8, Aesthetic and Minimalist Design).

## Quick wins
- [ ] Add a confirm (or hold-to-confirm) to the timer `Reset` button — finding #1, highest impact.
- [ ] Standardize all cards on `rounded-xl` — finding #3.
- [ ] Un-hide the footer commit link on mobile — finding #4.
- [ ] Bump the config panel's `icon-sm` controls to 36px — finding #2 (skip if desktop-only is acceptable).
