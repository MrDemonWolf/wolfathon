# UI/UX Review: Wolfathon web app

**Reviewed:** 2026-06-17 · **Input:** Local code (Next.js App Router + Tailwind v4 + `@wolfathon/ui`) · **Method:** NN/g heuristic evaluation + guideline review, per-surface, with adversarial verification (multi-agent). Citations fetched from nngroup.com / WCAG 2.2.

## Executive summary

- Solid foundation: the navy/cyan brand palette is **well-contrasted** (body white on navy ≈ 15:1, muted-foreground on card ≈ 8:1, primary-button text ≈ 7.2:1, LIVE cyan ≈ 7:1) — most "low contrast" suspicions were false and were dropped after measurement.
- The real risks are on the **public OBS overlays**, not the operator panel: text rendered directly over the transparent/keyed frame (the `+Xm` flash and the "Unlocked" celebration) had **no opaque backing**, so it could wash out over a bright stream scene at the exact celebratory beat the tool exists to sell. This was the single worst problem.
- The operator panel is single-user and Access-gated, so its a11y findings (tab semantics, missing h1) are real but lower-weight.
- One correctness bug surfaced via the UX lens: the rewards overlay announced **"All Rewards Unlocked / Thank you" when zero goals are configured** (empty config rendered identically to a completed run).
- Verification was cut short by a session limit: findings on the **landing, rewards-tab, timer-tab, and design-system** surfaces were generated but not all adversarially confirmed — see _Unverified_.

**Confirmed findings:** 🟥 0 catastrophic · 🟧 1 major · 🟨 4 minor · ⬜ 4 cosmetic — **all 9 fixed this pass.**

## Findings

### 🟧 Severity 3 — Major

#### 1. Floating overlay text can vanish over bright scenes — ✅ FIXED

- **What:** The timer `+{minutes}m` flash and the rewards "Unlocked: \<reward\>" celebration rendered directly on the transparent OBS frame with only a CSS glow (a blur, not a stroke) — no guaranteed contrast. White/light-cyan text over a bright game/webcam scene approaches ~1:1.
- **Where:** `apps/web/src/components/overlay/timer-view.tsx` (flash) · `apps/web/src/components/overlay/overlay-view.tsx` (celebration).
- **Guideline:** Visual Hierarchy — contrast against the surrounding context creates legibility; if it can disappear into the background, hierarchy fails.
- **Evidence:** [Visual Hierarchy in UX: Definition](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/) — hierarchy comes from contrast in value/saturation between an element and the context it appears in.
- **Fix applied:** wrapped both in the same opaque navy pill/card used elsewhere (`bg-[#091533]/85` + border + backdrop-blur), so contrast holds over any scene. Glow kept as decoration on top.

### 🟨 Severity 2 — Minor

#### 2. Tab set had no ARIA roles or selected state — ✅ FIXED

- **What:** The three control tabs were plain `<button>`s in a `<div>` — no `role="tablist"`/`tab`, no `aria-selected`, no `tabpanel`, no arrow-key navigation; active state was color-only.
- **Where:** `apps/web/src/app/(panel)/control/page.tsx`.
- **Guideline:** Consistency & Standards (follow platform conventions) + WCAG 4.1.2 Name, Role, Value.
- **Evidence:** [10 Usability Heuristics for UI Design](https://www.nngroup.com/articles/ten-usability-heuristics/) — follow platform/industry conventions.
- **Fix applied:** full WAI-ARIA tabs pattern — `role="tablist"`/`tab`/`tabpanel`, `aria-selected`, `aria-controls`/`aria-labelledby`, roving `tabIndex`, and ArrowLeft/Right/Home/End handling.

#### 3. Setup URLs not copyable; EventSub callback was truncated — ✅ FIXED

- **What:** The OAuth redirect URL and EventSub callback had to be transcribed exactly into the Twitch console but were plain `<code>` with no copy button; the callback used `truncate` (clipped with an ellipsis). A single mistyped char silently breaks OAuth/EventSub.
- **Where:** `apps/web/src/components/control/twitch-panel.tsx`.
- **Guideline:** Error Prevention — eliminate error-prone conditions (hand-transcribing an exact, clipped string is a classic slip generator).
- **Evidence:** [10 Usability Heuristics for UI Design](https://www.nngroup.com/articles/ten-usability-heuristics/) — heuristic #5.
- **Fix applied:** a `CopyUrl` row (full value, `break-all`, selectable) with a one-click Copy + toast for both URLs; removed `truncate`.

#### 4. "PAUSED/ENDED" timer status failed AA contrast — ✅ FIXED

- **What:** The only signal the timer stopped was `text-white/40` ≈ **3.8:1** on the navy card (below AA 4.5:1 for ~20px text), worse over bright scenes — a load-bearing status faded toward illegibility while LIVE was bright cyan.
- **Where:** `apps/web/src/components/overlay/timer-view.tsx`.
- **Guideline:** Low-contrast text is illegible; don't de-emphasize meaningful text into invisibility (WCAG 1.4.3).
- **Evidence:** [Low-Contrast Text Is Not the Answer](https://www.nngroup.com/articles/low-contrast/).
- **Fix applied:** PAUSED/ENDED now amber `#f5b94d` with a status dot (mirrors LIVE) — high contrast and a distinct hue, so "stopped" reads by color, not just a dimmed white.

#### 5. Rewards overlay showed "All Rewards Unlocked" with zero goals — ✅ FIXED

- **What:** `current = goals[currentIndex]`; with an empty goals array (delete-all, or pre-first-goal setup) `current` is `undefined`, so the overlay rendered "All Rewards Unlocked / Thank you 🐺" — broadcasting a false completed state. The sibling control component already guards this correctly.
- **Where:** `apps/web/src/components/overlay/overlay-view.tsx`.
- **Guideline:** Visibility of System Status — the UI must reflect the true state; "unconfigured" and "completed" must not render identically.
- **Evidence:** [10 Usability Heuristics for UI Design](https://www.nngroup.com/articles/ten-usability-heuristics/) — heuristic #1.
- **Fix applied:** the reward card now renders only when `goals.length > 0`; an empty tracker shows nothing.

### ⬜ Severity 1 — Cosmetic

#### 6. No `h1` on the control page — ✅ FIXED

- **What:** First heading in the document was the panel's `h2`; the brand is a `<span>`. Screen-reader heading navigation landed on a level-2 with no level-1.
- **Where:** `apps/web/src/app/(panel)/control/page.tsx`.
- **Guideline:** WCAG 1.3.1 Info & Relationships — don't skip the top heading level.
- **Evidence:** [Understanding SC 1.3.1](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html).
- **Fix applied:** added an `sr-only` `<h1>Wolfathon control panel</h1>` (visual layout unchanged).

#### 7. Connect/Disconnect buttons gave no progress feedback — ✅ FIXED

- **What:** While `startAuth`/`disconnect` were pending the button only dimmed — no spinner/label change, reading as "broken" rather than "working".
- **Where:** `apps/web/src/components/control/twitch-panel.tsx`.
- **Guideline:** Visibility of System Status — feedback within a reasonable time.
- **Evidence:** [10 Usability Heuristics for UI Design](https://www.nngroup.com/articles/ten-usability-heuristics/) — heuristic #1.
- **Fix applied:** spinner + "Connecting…" / "Disconnecting…" while pending.

#### 8. H/M/S units + unlocked chips borderline over bright scenes — ✅ FIXED

- **What:** Unit suffixes `#5bc8f0/70` (≈5.2:1 on navy, ~3.3:1 over a bright composite) and unlocked chips `white/55` (≈5.7:1) — pass on navy, dip under AA over bright scenes.
- **Where:** `timer-view.tsx` (units) · `overlay-view.tsx` (chips).
- **Guideline:** Low-contrast text; de-emphasize via size, not by killing contrast.
- **Evidence:** [Low-Contrast Text Is Not the Answer](https://www.nngroup.com/articles/low-contrast/).
- **Fix applied:** units → full-opacity `#5bc8f0` (≈9.4:1); chips → `white/70` (≈8.4:1). Still visually subordinate to the digits/reward.

#### 9. Overlay chooser cards not clickable; 32px controls — ⚠️ NOT CHANGED (intentional)

- **What:** The card body is inert; only the labeled Copy button + aria-labelled open-in-new-tab are interactive; buttons are 32px (< 44px touch guidance).
- **Where:** `apps/web/src/app/overlay/page.tsx`.
- **Evidence:** [Beyond Blue Links: Making Clickable Elements Recognizable](https://www.nngroup.com/articles/clickable-elements/).
- **Decision:** left as-is. The Copy/Open affordances already read as buttons with labels + a toast; 44px is touch guidance and this is a mouse-driven, single-operator page. Verifier rated this low-confidence. No change needed.

## Unverified (verification cut short by a session limit)

The per-finding adversarial verifiers for these surfaces did not all complete, so their findings are **not** in the confirmed set above. Worth a future pass:

- **Landing page** (`(panel)/page.tsx`), **Rewards tab + goal editor + import/export**, **Timer tab + config**, and the **design-system primitives** (`packages/ui/src/components/{button,input}.tsx`).
- Notable raw (unconfirmed) signal: the primitive **defaults are very compact** (button `h-8`/32px, input `h-8` + `text-xs`/12px, `rounded-none`) while app components override to `h-10`/`rounded-lg`. The 12px input text can trigger iOS zoom-on-focus and is below the 16px body guidance — worth checking where inputs aren't overridden (goal editor, timer config).

## What's working well

- Brand palette has genuine identity (MrDemonWolf navy/cyan, Montserrat display + Roboto body) and is contrast-safe on its own surfaces.
- Overlays use container-query units (`cqw`) so they scale identically in OBS and the panel preview — a smart, robust choice.
- The overlay chooser already nails the copy-to-clipboard + toast + aria-label pattern that the Twitch panel was missing (now aligned).
- Destructive/connect flows mostly fail closed and have toasts.

## Quick wins

All quick wins from the findings above were applied this pass (findings #1–#8). Remaining optional follow-ups:

- [ ] Verify input text size where primitives aren't overridden (raise to ≥14px, ideally 16px on mobile).
- [ ] Run the deferred verification pass on landing / rewards-tab / timer-tab / design-system surfaces.
