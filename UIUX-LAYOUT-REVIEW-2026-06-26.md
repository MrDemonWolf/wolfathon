# Wolfathon Control Panel — Layout & UX Review

**Reviewed:** 2026-06-26 · **Input:** local React/Tailwind code + operator screenshot · **Method:** NN/g heuristic evaluation + layout audit
**Scope:** every operator surface (Rewards, Timer, Twitch, StreamElements, Overlays, landing) + the panel shell.

This is a **research/proposal** doc. Only the Goals editor was rebuilt in this pass (see §1); everything else is a prioritized idea list to implement selectively.

---

## Executive summary

- The app already has a coherent brand kit (slate + one blue accent, Montserrat/Roboto, `panel-card`/`eyebrow`/`segmented`). The problem is **not** the look — it's **density and hierarchy**: most panels are flat stacks of equally-weighted form fields with no "what do I touch right now?" focal point.
- The single worst pattern, repeated everywhere: **the live/active control and the dozens of config knobs share the same visual weight.** Operators run this live mid-stream; the one thing they need _now_ (unlock next goal, add time, current target) should dominate, and setup knobs should recede.
- **Shipped this pass:** the Goals editor now leads with a live "next reward" hub (progress counter + target stepper + unlock) and the per-row target only appears where it matters. See §1.

**Findings:** 🟥 0 catastrophic · 🟧 4 major · 🟨 6 minor · ⬜ 3 cosmetic

---

## 1. Goals / Rewards editor — REBUILT ✅

**What changed** (`apps/web/src/components/control/goal-editor.tsx`):

- **Banner is now the live hub.** Next reward name + a real `currentSubs / target subs` counter + progress bar + a **−/+ target stepper** so the operator bumps the target _before_ unlocking, exactly where they're looking. Unlock button stays.
- **The live counter appears only on the next goal** (per request). The overlay only ever consumes `nextTarget` (`packages/api/src/state.ts:50`), so showing a live counter on every row was noise that didn't map to anything.
- **Rows declutter by state.** Target input now shows **only on future (locked, not-next) rows** as optional pre-planning; unlocked/past rows and the next row drop it (the banner owns the active target). The private note moved to a quieter second line.
- **Friendlier copy.** `≤ 10 — bumps on save` → `below current — adjusts on save`; added a plain-language helper line (`12 more subs to go.` / `Target reached — unlock when you're ready.`).
- **Clearer state:** `Next` and `Unlocked` chips, dimmed reward text on unlocked rows.

**Guideline:** Visual Hierarchy + Recognition rather than recall — the most-used action gets the most weight; live numbers replace the operator having to remember where they are. Evidence: [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) (#6 recognition over recall, #8 aesthetic & minimalist design).

**Trade-off noted:** a future goal's target is now edited either in its row (while future) or in the banner (once it's next). If you import a list with every target pre-set and want to edit a _non-next_ one without reordering, that path is gone. Matches the stated just-in-time workflow; say the word if you want per-row editing back for all rows.

---

## Findings (rest of app)

### 🟧 Severity 3 — Major

#### 2. Timer config is a spreadsheet of 8 unlabeled number fields

- **What:** `timer-config-panel.tsx` renders 8 time-rule number inputs in a 2–3 col grid with `aria-label`s but **no visible labels**, plus an embedded emoji/emote sub-app. New operators can't tell which field is which without clicking.
- **Where:** Timer tab → config card.
- **Guideline:** Form fields need persistent visible labels, not placeholder-only. Evidence: [Placeholders in Form Fields Are Harmful](https://www.nngroup.com/articles/form-design-placeholders/).
- **Fix:**
  - [ ] Add visible `<label>` above each number field (sub→time, gift→time, etc.).
  - [ ] Group the 8 rules under 2 subheadings (e.g. "Subs & gifts", "Bits & channel points") instead of one undifferentiated grid.
  - [ ] Move the emoji/emote editor behind a "Customize emotes" disclosure — it's a separate concern dominating the card.

#### 3. No single focal action on the Timer panel

- **What:** Status bar, transport, "add time" presets, and "simulate events" all stack at `mt-3`/`mt-4` with equal weight. The live actions (Play/Pause, +time) read the same as the dev-only "simulate" buttons.
- **Where:** Timer tab → `timer-panel.tsx`.
- **Guideline:** Aesthetic & minimalist / visual hierarchy — primary live controls should dominate; debug tools should recede. Evidence: [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) (#8).
- **Fix:**
  - [ ] Promote the status + transport + add-time into one prominent "live" block (mirror the Goals banner treatment).
  - [ ] Demote "Simulate events" into a collapsed `<details>` labeled "Testing tools".

#### 4. Import/Export crams 6 icon-buttons into one row

- **What:** Validate / Import / Upload / Export / Copy JSON / Copy Claude prompt wrap unpredictably; the result card appears far below the textarea; the schema example is hidden in a bottom link.
- **Where:** every tab's `import-export-panel.tsx`.
- **Guideline:** Grouping & chunking reduce scanning cost; related controls should be visually clustered. Evidence: [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) (#4 consistency, #8 minimalism).
- **Fix:**
  - [ ] Split into two clusters: **In** (paste/upload → Validate → Import) and **Out** (Export / Copy JSON / Copy prompt).
  - [ ] Put the validation result inline next to the textarea, not below the button row.
  - [ ] Collapse the whole panel behind a "Backup / import" disclosure — it's an occasional task taking permanent prime space on every tab.

#### 5. Twitch panel: connected vs disconnected are two different layouts + dev jargon

- **What:** The disconnected state is a credentials walkthrough assuming `dev.twitch.tv` fluency; the connected state is a thin status bar. Reconnecting feels like a different screen. EventSub callback hides in a footer.
- **Where:** Twitch tab → `twitch-panel.tsx`.
- **Guideline:** Consistency & standards; help users recognize state. Evidence: [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) (#4).
- **Fix:**
  - [ ] Keep a stable top status row in both states (just swap the body below it).
  - [ ] Number the setup as explicit steps (1 create app → 2 paste redirect → 3 connect) with the redirect URL copy-button inline at step 2.

### 🟨 Severity 2 — Minor

#### 6. `rounded-2xl` vs `rounded-xl` used inconsistently across panels

- **Fix:** [ ] Pick one card radius token and apply it to every `panel-card`. Overlays + StreamElements use `xl`; the rest use `2xl`.

#### 7. Panel headers inconsistently use `flex justify-between`

- **What:** Timer-config and Overlays put an action in the header row; Timer-panel and Twitch don't — headers don't line up tab to tab.
- **Fix:** [ ] Standardize a `PanelHeader` shape (title left, optional action right) and reuse it.

#### 8. Inconsistent / missing empty + loading states

- **What:** Some surfaces show a spinner, some a toast, some nothing (channel-point rules have no empty state).
- **Guideline:** Visibility of system status. Evidence: [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) (#1).
- **Fix:** [ ] One shared empty-state + skeleton pattern (the dashed-border "No goals yet" box from Goals is a good template).

#### 9. Theme editor live swatch shows no text overlay

- **What:** The `h-8` gradient bar can't tell you whether "auto" text is legible on the chosen gradient.
- **Fix:** [ ] Render the actual reward text on the swatch, or reuse the real `OverlayPreview` instead of a bare bar.

#### 10. Overlays "Reset" sits in a detached card far from the URLs

- **Fix:** [ ] Move Reset (rotate token) into each overlay card's overflow, or a clearly-labeled "Danger" footer directly under the source list.

#### 11. Copy-token always copies the real token even while masked

- **What:** Eye toggle masks the token, but Copy still sends the secret — minor expectation mismatch.
- **Fix:** [ ] Add a one-shot "Copied ✓" confirmation so the operator knows the real token went to the clipboard.

### ⬜ Severity 1 — Cosmetic

#### 12. `DirtyBar` fixed bottom bar can collide with mobile browser chrome

- **Fix:** [ ] Add `pb-[env(safe-area-inset-bottom)]` and cap width on very narrow screens.

#### 13. "Discard" in DirtyBar is `variant="ghost"` — almost invisible next to Save

- **Fix:** [ ] Bump to `variant="outline"` so the destructive-ish action is at least visible (still subordinate to Save).

#### 14. Landing `panel-card panel-card-rail` double-class + layered hover shadows

- **Fix:** [ ] Confirm `panel-card-rail` is intentional; simplify the two-layer hover shadow to one.

---

## The one cross-cutting idea (do this first)

**Adopt the "live hub vs. setup" split everywhere**, the way the Goals banner now does it:

> Each tab leads with ONE prominent block holding the actions you touch live (transport, unlock, add-time, current numbers). Everything else — credentials, time-rule tuning, emote lists, import/export, theme — sits below or behind a disclosure.

This is a single reusable pattern (a `LiveHub` card + a `<details>`-style "Setup" section), not a redesign. It directly attacks the root issue (everything weighted equally) and reuses the existing brand kit. Estimated: Timer is the highest-value next target (most live-critical, currently the flattest).

## Quick wins (under an hour each)

- [ ] Standardize card radius (`rounded-2xl` everywhere) — finding #6.
- [ ] `DirtyBar`: Discard → `variant="outline"` + safe-area padding — #12, #13.
- [ ] Add visible labels to the 8 timer number fields — #2.
- [ ] Collapse "Simulate events" into a Testing-tools disclosure — #3.
- [ ] "Copied ✓" confirmation on overlay token copy — #11.

## What's working well

- Strong, restrained brand system already in place — this is refinement, not a rescue.
- Goals live preview + sticky right column is the right model; extend it to Timer.
- Token masking on Overlays and the StreamElements connect state-machine are thoughtful.

## Unverified (needs a running instance / different input)

- Keyboard focus order through the dense forms (static code can't confirm tab order feels right).
- Mobile/narrow reflow of the auto-fit grids in theme + timer config — needs a live viewport check.
