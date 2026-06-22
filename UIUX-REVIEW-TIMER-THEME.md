# UI/UX Review: Timer overlay + theme options

**Reviewed:** 2026-06-22 · **Input:** local code (`timer-view.tsx`, `timer-config-panel.tsx`) + live preview screenshots (brand / sunset / custom / chrome-off / paused) · **Method:** NN/g heuristic evaluation + guideline review

## Executive summary

- The overlay is glanceable and on-brand by default: large tabular countdown, brand-blue gradient, visible LIVE/PAUSED state. Status communication is a genuine strength.
- **Worst problem:** the `mono` preset (and any light custom stops) keep the countdown text hard-coded white, producing white-on-near-white at ~1.2–1.7:1 contrast — the timer becomes unreadable, which defeats the overlay's only job.
- Theme text color does not adapt to the chosen gradient; legibility depends entirely on the operator picking dark-enough colors.
- Options panel touch targets (remove-stop, checkboxes) are below the NN/g 1 cm minimum — minor on a mouse-driven control panel, but streamers do use tablets.
- No catastrophic (sev-4) findings in the default configuration; the sev-3 below is reachable only when a light theme is selected.

**Findings:** 🟥 0 catastrophic · 🟧 1 major · 🟨 3 minor · ⬜ 2 cosmetic

> **Fixed in this session:** #1 (countdown ink now auto-switches dark/white from gradient luminance — mono/light themes verified readable) and #3 (status-chip plate raised to `bg-black/50`). The remaining findings are open.

## Findings

### 🟧 Severity 3 — Major

#### 1. Countdown text is hard-coded white, so light gradients render it unreadable
- **What:** The time/units are always white (`text-white`, units `text-white/75`). Two of the offered themes are light:
  - `mono` stops `#8aa0bf · #b9c8de · #e2e8f0` → white-on-stop contrast ≈ **1.7 : 1**, **1.7 : 1**, **1.2 : 1**.
  - `brand`'s lightest stop `#5bc8f0` → ≈ **1.9 : 1** under the right-hand digits.
  - Custom mode lets an operator pick any stops, including pale ones, with no guard.
  All are far below the WCAG AA threshold (4.5 : 1 normal, 3 : 1 large). Units at 75% opacity are worse.
- **Where:** `apps/web/src/components/overlay/timer-view.tsx` — `Segment` (`text-[8.6cqw]` white) and the `M/H/D/S` unit spans (`text-white/75`); gradient from `data.gradient` via `gradientCss`. Preset table in `packages/api/src/timer.ts` (`TIMER_THEME_PRESETS.mono`).
- **Guideline:** Legibility requires high character/background contrast, and ideally a plain (not busy/textured) backing — a multi-stop gradient is exactly the varying background NN/g warns about.
- **Evidence:** [Low-Contrast Text Is Not the Answer](https://www.nngroup.com/articles/low-contrast/) — low-contrast text is illegible and inaccessible; check the combination against the font size. [Legibility, Readability, and Comprehension](https://www.nngroup.com/articles/legibility-readability-comprehension/) — ensure high contrast and prefer a plain background over a textured one.
- **Fix:**
  - [ ] Derive the text color from the gradient's perceived luminance — switch the countdown to a dark ink (e.g. `#04122b`, the brand `--primary-foreground`) when the mid-stop is light, white when dark.
  - [ ] OR drop `mono` from the presets / re-tune it darker, and in the custom editor show a live contrast warning when a chosen stop would fail against the text color.
  - [ ] Raise the unit opacity from `text-white/75` to full, relying on size (not opacity) for de-emphasis.
  - [ ] Keep the existing dark `text-shadow` as a secondary aid, not the primary contrast source.

### 🟨 Severity 2 — Minor

#### 2. "Remove stop" target is ~18 px — below the 1 cm minimum
- **What:** The per-stop delete is an `X` at `size-3.5` (14 px) inside `p-0.5` (2 px) → ~18 px hit area, sitting tight against the color swatch and hex label. The custom-stop checkboxes are `size-4` (16 px).
- **Where:** `timer-config-panel.tsx` — `ThemeEditor` remove-stop `<button>` and the `Toggle` checkboxes.
- **Guideline:** Touch targets should be ~1 cm × 1 cm (≈44 px) to be tapped quickly without slips; crowded small targets cause mis-taps.
- **Evidence:** [Touch Targets on Touchscreens](https://www.nngroup.com/articles/touch-target-size/) — minimum 1 cm × 1 cm physical size; spacing prevents accidental taps.
- **Fix:**
  - [ ] Pad the remove button to a ≥24 px (ideally 44 px) hit area (`p-2`, or wrap in a larger clickable).
  - [ ] Add spacing between swatch / hex / delete so adjacent targets don't crowd.
  - [ ] Consider a slightly larger custom checkbox/switch.

#### 3. Status chip text sits on a 25%-opacity black plate
- **What:** "LIVE"/"PAUSED" is white on `bg-black/25` over a bright gradient. Backdrop-blur helps, but effective contrast varies with the stop behind it and isn't guaranteed to clear AA.
- **Where:** `timer-view.tsx` — status chip (`bg-black/25 ... backdrop-blur-md`).
- **Guideline:** Same legibility/low-contrast guidance as #1, for a small secondary label.
- **Evidence:** [Low-Contrast Text Is Not the Answer](https://www.nngroup.com/articles/low-contrast/) — verify contrast against the actual background, not the intended one.
- **Fix:**
  - [ ] Raise the plate to `bg-black/45–55` (it's a small overlay element; opacity won't read as heavy).
  - [ ] Verify the worst-case (lightest stop behind the chip) reaches ≥4.5 : 1.

#### 4. Theme text color can't be verified to follow stream contrast — but the capsule mitigates it
- **What:** The overlay is transparent and floats over arbitrary stream content; the opaque capsule shields the text, which is good. What can't be verified from code is that operators size the OBS source sensibly (the cqw-based type assumes the documented ~720×150 / wide bar).
- **Where:** `apps/web/src/app/overlay/timer/page.tsx` (1920×1080 transparent source) + capsule sizing.
- **Guideline:** Legibility — plain backing improves character recognition (the opaque capsule already does this).
- **Evidence:** [Legibility, Readability, and Comprehension](https://www.nngroup.com/articles/legibility-readability-comprehension/) — plain background over textured improves legibility.
- **Fix:**
  - [ ] Keep documenting the recommended source size in the panel's copyable instructions (already partly present).

### ⬜ Severity 1 — Cosmetic

#### 5. Hex readout is 11 px muted-foreground
- **What:** The custom-stop hex label is `text-[11px] font-mono text-muted-foreground` — small and low-emphasis. It's a secondary readout next to the visible swatch, so impact is low, but it's at the floor of comfortable legibility.
- **Where:** `timer-config-panel.tsx` — custom stop `<span className="font-mono text-[11px] …">`.
- **Guideline:** Use a reasonably large font; avoid tiny text even for secondary labels.
- **Evidence:** [Legibility, Readability, and Comprehension](https://www.nngroup.com/articles/legibility-readability-comprehension/) — tiny text dooms legibility; younger and older users alike dislike squinting.
- **Fix:**
  - [ ] Bump to 12–13 px and/or `text-foreground/70`.

#### 6. "ENDED" state reuses the paused amber-grey
- **What:** Running→`Live`, paused & ended both use the muted grey gradient; only the chip word differs ("Paused" vs "Ended"). Distinguishable, but the two terminal states look identical at a glance.
- **Where:** `timer-view.tsx` — paused/ended share the `#6b7488…#a8895f` gradient.
- **Guideline:** Visibility of system status — distinct states should be distinguishable.
- **Evidence:** [Visibility of System Status](https://www.nngroup.com/articles/visibility-system-status/) — communicate the current state clearly so users trust what they see.
- **Fix:**
  - [ ] Optional: give "ENDED" a slightly different treatment (e.g. dimmer, or a small "0:00" emphasis) if telling the two apart on-stream matters.

## Unverified (needs a different input to check)
- Keyboard focus visibility on the color inputs / checkboxes — native controls, likely fine, but not confirmed by screenshot.
- Computed contrast of the status chip in production over a live stream background (depends on the bright stop actually behind it at render).
- Whether operators size the OBS browser source to the bar as documented (runtime/operator behavior, not in code).

## What's working well
- **Status visibility (Heuristic #1):** LIVE/PAUSED chip + a live gradient swatch + a live overlay preview in the panel give immediate, honest feedback of both timer state and theme — textbook visibility of system status.
- **Glanceability:** large centered tabular-nums countdown collapses to just seconds under a minute — easy to read in a quick glance.
- **Safe defaults & no color-only meaning:** brand preset is dark-enough by default; presets are labeled with text *and* a swatch, not color alone.
- **Motion respects users:** the fill/flood/sheen animations are gated behind `prefers-reduced-motion` in the shared stylesheet.

## Quick wins
- [ ] Auto-pick dark vs white countdown ink from gradient luminance (kills finding #1 outright).
- [ ] Re-tune or drop the `mono` preset so no built-in option ships unreadable.
- [ ] Enlarge the remove-stop hit area to ≥24 px and space it from the swatch.
- [ ] Bump the status chip plate to `bg-black/50`.
