# UI/UX Review: Theme editor + overflow fixes

**Reviewed:** 2026-06-22 · **Input:** local code (`theme-editor.tsx`, `timer-view.tsx`, `overlay-view.tsx`) + live preview at 300/360/440 px panel widths · **Method:** NN/g heuristic evaluation + WCAG checks

> Follow-up to [UIUX-REVIEW-TIMER-THEME.md](UIUX-REVIEW-TIMER-THEME.md). Covers the shared `ThemeEditor`, the responsive-overflow fix, and the DB query failure.

## Executive summary
- The shared theme editor is solid after this pass: presets, fonts, and corners reflow cleanly at every panel width (300–440 px), each font previews in its own typeface, and a live gradient swatch mirrors the choice.
- **Worst problem (fixed):** the editor used the **viewport** breakpoint `sm:grid-cols-5` while living in a ~340 px side panel, forcing 5 columns into too little width — labels crammed/overflowed. Replaced with container-adaptive `auto-fit` grids.
- The reported DB error (`select … from "tracker_state" … params: timer`) is an environment issue, not UI — the local D1 migration wasn't applied. Fixed by applying it; root cause + guard noted below.
- No catastrophic findings. The remaining open items are minor/cosmetic (touch-target sizes, an 11 px hex label).

**Findings:** 🟥 0 catastrophic · 🟧 1 major (fixed) · 🟨 2 minor · ⬜ 1 cosmetic

## Findings

### 🟧 Severity 3 — Major (fixed this session)

#### 1. Editor grids crammed/overflowed in the narrow side panel
- **What:** Preset/font/corners rows used `grid-cols-3 sm:grid-cols-5`. `sm:` keys off the **viewport** (≥640 px), but the editor renders inside a fixed ~340 px control-panel column — so at desktop width it forced 5 columns into ~68 px cells and the font labels ("Montserrat") crammed against each other.
- **Where:** `apps/web/src/components/control/theme-editor.tsx` — preset, font, corners grids.
- **Guideline:** Content must reflow to the available container without clipping or horizontal scroll; responsive layout should respond to the space a component actually has, not the whole window.
- **Evidence:** [Understanding SC 1.4.10: Reflow (WCAG 2.1 AA)](https://www.w3.org/WAI/WCAG21/Understanding/reflow.html) — content should reflow within the available space without loss. [Responsive Web Design and User Experience](https://www.nngroup.com/articles/responsive-web-design-definition/) — layouts should adapt to the available space, not a fixed assumption.
- **Fix (applied):**
  - [x] Swapped to `grid-template-columns: repeat(auto-fit, minmax(Xrem, 1fr))` (4.5 rem presets, 5 rem fonts, 6 rem corners) so columns derive from the panel's real width.
  - [x] Verified at 300/360/440 px: every row wraps, no clipping, font buttons measure 92 px at the 1024 px control panel (0 overflowing elements in a DOM scan).

### 🟨 Severity 2 — Minor

#### 2. Touch targets below the 1 cm minimum
- **What:** The custom-stop remove button is `size-3.5` (14 px) icon + `p-1.5` (6 px) ≈ 26 px; the show-label/show-status checkboxes are `size-4` (16 px). Both are under the NN/g 1 cm (~44 px) guidance.
- **Where:** `theme-editor.tsx` — remove-stop `<button>`, `Toggle` checkbox.
- **Guideline:** Touch targets should be ~1 cm × 1 cm to tap quickly without slips.
- **Evidence:** [Touch Targets on Touchscreens](https://www.nngroup.com/articles/touch-target-size/) — minimum 1 cm × 1 cm; small, crowded targets cause errors.
- **Fix:**
  - [ ] Pad the remove button to ≥44 px and the checkboxes to a larger hit area (e.g. wrap the box + label so the whole label row is clickable — it already is via `<label>`, so just enlarge the box to `size-5`).

#### 3. Status semantics rely on icon shape alone (timer)
- **What:** Running vs stopped is now a ▶/⏸ glyph with no text. Clear to most, but a single unlabeled icon carries the whole state; the `showStatus` toggle can also hide it entirely.
- **Where:** `timer-view.tsx` status chip.
- **Guideline:** Communicate state clearly and redundantly where it matters.
- **Evidence:** [Visibility of System Status](https://www.nngroup.com/articles/visibility-system-status/) — make the current state obvious so users trust it.
- **Fix:**
  - [ ] Optional: add an `aria-label`/`title` ("Running"/"Paused") to the icon for screen readers and hover, since the text label was removed.

### ⬜ Severity 1 — Cosmetic

#### 4. Custom hex readout is 11 px
- **What:** The per-stop and text-colour hex labels are `text-[11px] text-muted-foreground` — at the floor of comfortable legibility, though secondary to the visible swatch.
- **Where:** `theme-editor.tsx` custom-stop + text-colour readouts.
- **Evidence:** [Legibility, Readability, and Comprehension](https://www.nngroup.com/articles/legibility-readability-comprehension/) — avoid tiny text even for secondary labels.
- **Fix:**
  - [ ] Bump to 12–13 px.

## Not a UI finding — DB query failure (resolved)
- **What:** `Failed query: select "id","data","updated_at" from "tracker_state" where id = ? params: timer`. The local D1 database had no `tracker_state` table because the migration step (`predev:bare` → `db:local`) hadn't run.
- **Fix (applied):** ran `bun run db:local` (applies `0000_glorious_spiral.sql` to the local D1). Real pages now load with no console errors.
- **Guard:** start local dev via `bun run dev:bare` (or `turbo -F web dev` if wired) so `predev:bare` always applies migrations first — don't run bare `next dev`, which skips it.

## What's working well
- **Recognition over recall:** each font button renders its own label *in that font* — the user sees Montserrat vs Poppins without guessing.
- **Visibility of system status:** the live gradient swatch + the in-panel overlay preview reflect every theme change immediately.
- **Reflow:** after the fix, the editor degrades gracefully from 440 px down to 300 px with no clipping — the component adapts to its container, not the window.
- **Readable by default:** auto text colour + dark-card handling keep the countdown/reward legible across presets (carried over from the prior review's fix).

## Quick wins (all applied this session)
- [x] Remove-stop button enlarged to a 36 px (`size-9`) hit area; toggle boxes to `size-5` (20 px).
- [x] Added `role="img"` + `aria-label`/`title` ("Running"/"Paused") to the play/pause status icon.
- [x] Bumped the hex readouts from 11 px to `text-xs` (12 px).

Findings #2–#4 above are addressed; the remaining touch-target gap (36 px vs the ideal 44 px) is acceptable for a mouse-first control panel and can be revisited if used on tablets.
