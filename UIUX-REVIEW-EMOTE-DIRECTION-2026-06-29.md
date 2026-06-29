# UI/UX Review: Timer → "Emote direction" picker

**Reviewed:** 2026-06-29 · **Input:** local code (`apps/web/src/components/control/timer-config-panel.tsx`) + screenshot · **Method:** NN/g heuristic evaluation + guideline review

## Executive summary

- The control sets which way emotes fly across the timer bar on a time-add. Functionally correct, but the _before_ state made the operator decode the behavior from text rather than see it.
- Worst problem: the picker described motion in jargon ("the burst travels across the bar on a time-add") and doubled the directional cue (arrow icon **plus** "Left → Right" text) while showing none of the actual movement — pure recall, no recognition.
- No catastrophic or major (sev 3–4) findings. All issues are sev 1–2 polish.
- Fixes were applied in the same pass (see "Resolution"). This report documents the before-state findings and what changed.

**Findings:** 🟥 0 catastrophic · 🟧 0 major · 🟨 2 minor · ⬜ 2 cosmetic

## Findings

### 🟨 Severity 2 — Minor

#### 1. Control relied on recall, not recognition — no preview of the actual motion

- **What:** Three buttons labeled "Up", "Left → Right", "Right → Left" with a static arrow. The operator had to imagine the result and click-and-check on a live overlay to confirm. The whole choice is about _motion_, yet nothing moved.
- **Where:** `timer-config-panel.tsx`, the `role="radiogroup"` "Emote direction" group.
- **Guideline:** Recognition Rather Than Recall (heuristic #6) — show the outcome instead of making users remember/derive it.
- **Evidence:** [10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/) — minimize memory load by making options and their effects visible rather than recalled.
- **Fix:**
  - [x] Add a live mini-preview to each tile: the operator's own emote glyph drifting in the real overlay direction (up rises; "left" = right→left; "right" = left→right), playing on the selected tile.
  - [x] Mirror the real overlay keyframes so the preview matches what viewers will see.

#### 2. Helper copy used internal jargon ("burst", "bar", "time-add")

- **What:** Subtitle read "Which way the burst travels across the bar on a time-add." "Burst" and "time-add" are dev/overlay terms, not operator language; "the bar" assumes the reader maps it to the timer capsule.
- **Where:** Same section, helper `<p>`.
- **Guideline:** Match Between the System and the Real World (heuristic #2) — speak the user's language.
- **Evidence:** [Match Between the System and the Real World](https://www.nngroup.com/articles/match-system-real-world/) — use familiar words and real-world concepts, not system-internal terms.
- **Fix:**
  - [x] Rewrote to "Which way the emotes travel when time is added."

### ⬜ Severity 1 — Cosmetic

#### 3. Redundant directional encoding (arrow icon + arrows inside the label text)

- **What:** Each button carried a lucide arrow **and** the words "Left → Right" / "Right → Left" — two static encodings of the same axis, adding visual noise without adding information.
- **Where:** Button contents.
- **Guideline:** Aesthetic and Minimalist Design (heuristic #8) — every extra unit competes with the relevant ones.
- **Evidence:** [10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/) — interfaces should not contain information that is irrelevant or rarely needed.
- **Fix:**
  - [x] The animated glyph now carries the "where it goes" signal; the arrow icon is retained only as the static / reduced-motion fallback, so the two cues are now complementary (motion + static) rather than duplicative.

#### 4. No visible "system status" distinction between resting options and the active one beyond border tint

- **What:** Selected vs unselected differed only by a faint border/background tint.
- **Where:** Button `active` styling.
- **Guideline:** Visibility of System Status (heuristic #1).
- **Evidence:** [Visibility of System Status](https://www.nngroup.com/articles/visibility-system-status/) — keep users informed about current state with clear feedback.
- **Fix:**
  - [x] Only the selected tile animates; unselected tiles show the glyph at 30% opacity. Motion now doubles as the selection indicator on top of the existing tint.

## Resolution (changes shipped this pass)

- `packages/ui/src/styles/globals.css` — added `wolf-prev-up/left/right` keyframes (faithful to the overlay's `wolf-fill` / `wolf-fill-x` motion) and registered them in the existing `prefers-reduced-motion` kill list.
- `timer-config-panel.tsx` — tiles became vertical: a clipped preview track (selected = animated glyph in the real direction, unselected = dimmed static glyph) over the label row; helper copy reworded; preview glyph = first non-URL emote from the config, falling back to 🐺.

## Accessibility notes

- Preview track is `aria-hidden` and `motion-reduce:hidden`; under reduced motion the arrow icon + text label carry the full meaning (no information lives only in animation).
- `role="radiogroup"` / `role="radio"` / `aria-checked` and the existing arrow-key handler are unchanged.

## Unverified (needs a different input to check)

- Color-contrast of the dimmed (30%) resting glyph against `bg-background/60` was not numerically measured — eyeball only. It is decorative (the text label is the real cue), so contrast is non-blocking, but worth a quick check if it should read clearly at rest.

## What's working well

- The labels were already _accurate_ ("Right → Left" truly is right→left); the gap was presentation, not correctness.
- Existing keyboard semantics (radiogroup + arrow keys) were already correct and were left intact.

## Quick wins

- [x] Reword jargon helper copy.
- [x] Add motion preview faithful to the overlay.
- [x] Make selection state legible via motion + dimming.
- [ ] (Optional) measure resting-glyph contrast; bump opacity if it should be clearly visible at rest.

---

Sources: [10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/) · [Match Between the System and the Real World](https://www.nngroup.com/articles/match-system-real-world/) · [Visibility of System Status](https://www.nngroup.com/articles/visibility-system-status/) · [Severity Ratings for Usability Problems](https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/)
