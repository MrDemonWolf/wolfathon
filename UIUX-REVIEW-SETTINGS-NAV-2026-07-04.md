# UI/UX Review: Dashboard → Settings navigation

**Reviewed:** 2026-07-04 · **Input:** Local code (`apps/web/src/app/dashboard/settings/layout.tsx`) + live render at `localhost:3001/dashboard/settings/*` (desktop 1280 + mobile 375) · **Method:** NN/g heuristic evaluation + guideline review

This review covers the **settings sub-navigation redesign** — swapping the horizontal segmented pill bar for a grouped vertical sidebar. It evaluates both the old pattern (why it was changed) and the new one (does it hold up).

## Executive summary

- The **old** settings nav was a horizontal **segmented control** with 5 items sitting directly under the header's own horizontal pill nav — two same-looking horizontal bars stacked, and on mobile the segmented row used `overflow-x-auto`, scrolling _Customizer_ and _Backup_ off-screen with no affordance.
- The **new** nav is a left-aligned **vertical sidebar**, chunked into _Connections / Overlays / Data_, each item carrying an icon + one-line subtitle, with a brand-blue active rail. It stacks full-width on mobile (every item visible, zero horizontal scroll).
- This directly resolves the two real problems: **(a)** hidden/low-discoverability items on small screens, and **(b)** two competing horizontal nav levels reading as one.
- **No catastrophic or major findings** in the redesign itself. Measured contrast on the lowest-contrast text (subtitles / inactive labels `#94a3b8` on `#0a0f1c`) is **~7.5:1**, passing WCAG AA and AAA.
- One pre-existing, out-of-scope issue was noticed in the header nav (not part of this change).

**Findings:** 🟥 0 catastrophic · 🟧 0 major · 🟨 2 minor · ⬜ 1 cosmetic · (1 out-of-scope observation)

## Findings

### 🟨 Severity 2 — Minor

#### 1. Mobile: full nav list pushes primary content below the fold

- **What:** On mobile the sidebar stacks _above_ the content, so every visit to any settings sub-page requires scrolling past all 5 items (with 2-line descriptions ≈ 400px) before reaching the panel. The old segmented bar was more compact vertically. This is the standard trade for killing the horizontal-scroll problem, but it's still an interaction cost on the most-used pane.
- **Where:** `< md` breakpoint; `nav` renders before `{children}` in the stacked single-column grid.
- **Guideline:** Prioritize content; minimize interaction cost on mobile.
- **Evidence:** [Tabs, Used Right](https://www.nngroup.com/articles/tabs-used-right/) — few, always-visible groupings beat controls that add steps to reach content; the fix should not trade one interaction cost for another.
- **Fix:**
  - [ ] Leave as-is if acceptable (settings is a set-once, low-frequency area — this is a defensible default).
  - [ ] OR on `< md`, collapse the sidebar to a native `<details>`/accordion showing only the current section label, expanding on tap.
  - [ ] OR keep the descriptions desktop-only (`hidden md:block` on the `hint` span) to shorten the mobile list.

#### 2. Sticky sidebar can exceed viewport height on short windows

- **What:** The sidebar is `md:sticky md:top-24`. With three groups + headers it's ~360px tall — fine on any normal window, but on a very short desktop window the bottom item could sit below the fold with the sidebar pinned. Low likelihood, easy to pre-empt.
- **Where:** `nav` element, `md:sticky md:top-24 md:self-start`.
- **Guideline:** Visibility of navigation options (Heuristic 6, recognition over recall).
- **Evidence:** [Left-Side Vertical Navigation on Desktop](https://www.nngroup.com/articles/vertical-nav/) — vertical nav must stay visible/scannable; keep it usable when it's taller than the viewport.
- **Fix:**
  - [ ] Add `md:max-h-[calc(100svh-7rem)] md:overflow-y-auto` to the `nav` so it scrolls internally when pinned rather than clipping.

### ⬜ Severity 1 — Cosmetic

#### 3. Single-item "Data" group is visually lopsided

- **What:** _Connections_ and _Overlays_ have two items each; _Data_ has only _Backup_. A group heading over one item is slightly disproportionate.
- **Where:** `GROUPS[2]` (`Data` → `Backup`).
- **Guideline:** Chunking — groups should carry meaningful weight.
- **Evidence:** [How Chunking Helps Content Processing](https://www.nngroup.com/articles/chunking/) — chunks should be meaningful units; a one-item chunk adds a label with little grouping payoff.
- **Fix:**
  - [ ] Acceptable as future-proofing (import/export/reset may grow here). If it stays a single item long-term, consider folding _Backup_ under *Overlays*→rename to _Data & overlays_, or drop the _Data_ heading and let _Backup_ sit ungrouped at the bottom.

## Out-of-scope observation (pre-existing; not part of this change)

- **Header nav clips on narrow mobile.** At the 375px preset render, the header's own `<nav>` (`Rewards / Timer / Giveaways / Wheel | ⚙ Settings`) is a single non-wrapping flex row (`flex items-center gap-1`) and the _Settings_ item visibly clips at the right edge. This lives in `apps/web/src/app/dashboard/layout.tsx`, not the settings layout I changed, so it's untouched here. Worth a separate fix (allow the inner nav to wrap, or move it to an overflow menu at `sm`). Flagged, not measured precisely — the preview browser pins `innerWidth` at 432 so I could only confirm it from the screenshot.

## Why the redesign is correct (evidence for the pattern change)

- **Segmented control → vertical list.** A segmented/tab control is for _viewing one panel among a small set of peer options_, and "the fewer tabs, the better" — once the list overflows it becomes a carousel and hidden items lose discoverability. That is exactly what the old `overflow-x-auto` produced on mobile. Source: [Tabs, Used Right](https://www.nngroup.com/articles/tabs-used-right/).
- **Two stacked horizontal bars → one vertical axis.** NN/g warns against stacking tab rows because it destroys spatial memory and makes the active indicator ambiguous. Header pills + settings pills were effectively two stacked rows; giving settings a distinct vertical axis removes that ambiguity. Source: [Tabs, Used Right](https://www.nngroup.com/articles/tabs-used-right/) ("Use Only One Row of Tabs").
- **Vertical sidebar scales + scans.** Left-aligned vertical nav is the recommended pattern for broad/growing IAs and is easy to scan top-down. Source: [Left-Side Vertical Navigation on Desktop](https://www.nngroup.com/articles/vertical-nav/).
- **Icons keep their labels.** Every item pairs an icon with a text label + subtitle — icons alone are ambiguous; text labels are necessary to communicate meaning. Source: [Icon Usability](https://www.nngroup.com/articles/icon-usability/).
- **Grouping reduces load.** _Connections / Overlays / Data_ chunk 5 flat items into meaningful units, aiding scanning and recall. Source: [How Chunking Helps Content Processing](https://www.nngroup.com/articles/chunking/).

## What's working well

- Active state is signalled by **three redundant cues** (brand-blue left rail + tinted background + white vs. muted label) — not color alone, so it survives color-blindness and the WCAG "don't rely on color" rule.
- Touch targets: each row is icon + two text lines at `py-2`, ≈ 50px tall — above the 44px minimum.
- `aria-current="page"` on the active link and a labelled `<nav aria-label="Settings sections">` give assistive tech correct structure; visible `focus-visible:ring` preserved.
- Cohesive with the existing design system (reused `eyebrow`, brand `--primary`, `--muted-foreground`, montserrat heading) — a pattern change, not a repaint.

## Quick wins

- [ ] Add `md:max-h-[calc(100svh-7rem)] md:overflow-y-auto` to the sidebar `nav` (finding #2).
- [ ] Consider `hidden md:block` on the subtitle span to shorten the mobile list (finding #1).
- [ ] Separately: let the header nav wrap or collapse at `sm` (out-of-scope observation).
