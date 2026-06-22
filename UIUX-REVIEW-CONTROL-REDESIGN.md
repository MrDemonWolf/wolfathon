# UI/UX Review: Control panel redesign (Rewards / Timer / Twitch)

**Reviewed:** 2026-06-22 · **Input:** local code + live preview of `/control` at 1280px · **Method:** NN/g heuristic evaluation

## Executive summary
- The Rewards and Timer tabs now follow one consistent model: every edit updates the live preview instantly, and nothing persists until an explicit **Save**, with a **Discard** escape hatch — strong on both *visibility of system status* and *user control & freedom*.
- Sub-goals are now structured (`target`), the overlay shows a next-goal progress bar (`7 / 10 subs`), and a save-time auto-bump keeps milestones ahead of the live sub count.
- **Worst remaining problem:** the save/discard bar is sticky at the bottom of the editor *column*, so on a tall page the Save button can sit below the fold while you edit goals near the top — you may not see it until you scroll.
- No catastrophic findings. The dirty-state model, live preview, and progress bar all verified working (no console errors, 0 errors across tab remounts).

**Findings:** 🟥 0 catastrophic · 🟧 1 major · 🟨 2 minor · ⬜ 1 cosmetic

## Findings

### 🟧 Severity 3 — Major
#### 1. The Save/Discard bar can sit below the fold
- **What:** The dirty bar is `sticky bottom-4` within the left editor column. With 6+ goals + subs + theme + import/export stacked, the column is tall; while editing a goal near the top, the unsaved-changes bar (and Save) is off-screen until you scroll down. Users may not realize changes aren't persisted, or hunt for Save.
- **Where:** `dirty-bar.tsx` placement inside `rewards-tab.tsx` / `timer-tab.tsx` left column.
- **Guideline:** Keep system status — and the primary action to resolve it — visible.
- **Evidence:** [Visibility of System Status](https://www.nngroup.com/articles/visibility-system-status/) — communicate state where the user can act on it.
- **Fix:**
  - [ ] Make the bar sticky to the **viewport bottom** spanning the whole tab (fixed/sticky at page level), or mirror a compact Save affordance in the always-visible tab header when dirty.
  - [ ] Optionally warn on tab-switch / navigation away while dirty.

### 🟨 Severity 2 — Minor
#### 2. Unlock is destructive-ish but has only an in-draft undo
- **What:** "Unlock next" / the per-row lock toggle changes state in the draft; the real-world effect (revealing a reward + overlay celebration) only happens on Save. Good — but there's no confirm, and once saved the only "undo" is to re-lock and save again.
- **Where:** `goal-editor.tsx` unlock controls.
- **Guideline:** Support easy reversal of consequential actions.
- **Evidence:** [User Control and Freedom](https://www.nngroup.com/articles/user-control-and-freedom/) — let users backtrack on changes; Discard covers pre-save, but post-save needs an easy re-lock (it exists via the toggle).
- **Fix:**
  - [ ] Keep as-is (Discard + re-lock cover it); consider a subtle "saved · overlay will celebrate on next poll" note so the operator knows unlock is now live.

#### 3. Target/subs number inputs have no inline validation messaging
- **What:** Targets and the sub count accept free numbers; negatives/blanks are coerced silently. Auto-bump only flags passed targets ("≤ N — bumps on save"). Fine, but an empty-reward goal is silently dropped on Save (toast only if all empty).
- **Where:** `goal-editor.tsx`, `subs-control.tsx`.
- **Guideline:** Help users notice and recover from input issues.
- **Evidence:** [User Control and Freedom](https://www.nngroup.com/articles/user-control-and-freedom/) — make the result of edits predictable.
- **Fix:**
  - [ ] Flag empty-reward rows inline ("needs a name to save") rather than dropping silently.

### ⬜ Severity 1 — Cosmetic
#### 4. "subs" unit label repeats on every row
- **What:** Each goal row shows a small "subs" suffix next to the target; with many rows it's visually repetitive.
- **Where:** `goal-editor.tsx` target field.
- **Fix:**
  - [ ] Optional: move the unit into the input placeholder or a single column header.

## Unverified (needs a different input)
- Auto-bump on Save end-to-end against a live DB (verified by unit tests + the editor's "bumps on save" flag; not exercised against the running server here to avoid mutating local state).
- Twitch-fed sub counter in production (the webhook increment is wired but needs a real EventSub round-trip).

## What's working well
- **Visibility of system status:** the live preview mirrors every unsaved edit (progress bar, theme, goals) and an amber "Preview shows unsaved changes" note + the dirty bar make the draft state unmistakable.
- **User control & freedom:** Discard is a clean one-click revert to the saved state; Save is explicit, so edits never persist by surprise.
- **Recognition over recall:** sub-goal targets sit right next to each reward; the "≤ N — bumps on save" hint explains the auto-bump *before* it happens.
- **Consistency:** Rewards and Timer share the exact same draft → live-preview → Save/Discard model; the Twitch tab stays action-based (connect/test) and consistent in styling.

## Quick wins
- [x] **Applied:** Save/Discard bar promoted to a viewport-level floating bar (`fixed bottom-4`, centered) — always visible while dirty (finding #1 resolved).
- [ ] Flag empty-reward rows inline instead of dropping them on Save.
