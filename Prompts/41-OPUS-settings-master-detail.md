# 41 — OPUS — Settings: desktop master–detail

Branch `claude/infallible-rosalind-fb4788`. Files touched: `index.html`, `css/settings.css`,
`js/app.js`, `CLAUDE.md`. **Done and verified in the browser** — the checklist at the bottom is
for eyeballing on your own machine.

---

## Why

Settings' desktop landing put the four groups into a `1fr 1fr` grid. That was worse than the
single column it replaced:

- The groups hold **2 / 3 / 3 / 2** rows, so no two cards ever lined up — a broken checkerboard.
- The same row was a **different width** depending on which column it landed in.
- The lower half of the page sat empty, so the screen looked unfinished.
- It read as four unrelated dashboard widgets, not one navigation surface.

Rejected alternatives, recorded so they are not tried again: forcing the groups to equal heights
(moves the empty space *inside* Personal and Data and support); four columns (cramped rows,
horizontal scanning); masonry (keeps the uneven heights, unpredictable reading order); and
stretching the single list to full window width (a 1000px+ row puts its label and its chevron
absurdly far apart).

## What it is now

```
┌──────────────────────────────────────────────────────────────┐
│ Profile and sync status (full width, spans both panes)      │
├───────────────────────┬──────────────────────────────────────┤
│ Search settings       │ Health & goals                      │
│                       │                                      │
│ PERSONAL              │ The selected section renders HERE,   │
│ Account & sync        │ inline, instead of replacing the     │
│ Health & goals        │ whole screen with an overlay.        │
│ ───────────────────   │                                      │
│ PLANNING              │                                      │
│ Training setup        │                                      │
│ Budget setup          │                                      │
│ Habits                │                                      │
│ ───────────────────   │                                      │
│ APP EXPERIENCE  …     │                                      │
│ ───────────────────   │                                      │
│ DATA & SUPPORT  …     │                                      │
└───────────────────────┴──────────────────────────────────────┘
```

**The split point is 1180px, not the app's usual 1024px desktop line.** At 1024 the 260px
sidebar leaves the detail pane narrower than the phone measure these forms were drawn at, and a
cramped pane is worse than a clean full-screen push. Between 1024 and 1180 Settings is a single
column at a 760px measure with the same full-screen detail overlay as always. Mobile is
completely unchanged.

## How it works

- `index.html` — search + list moved inside `.stg-workspace` › `.stg-nav-pane`, with a
  `.stg-detail-pane` sibling (sticky head: `#stg-detail-title` + a `Done` button). The profile
  and install cards stay above, spanning both panes.
- `css/settings.css` — `.stg-detail-pane{display:none}` by default; at ≥1180 the workspace
  becomes `340px minmax(0,1fr)` with a 22px gap inside a 1240px `.settings-main`. The left side
  is ONE surface: `#stg-list-root:not(.is-search)` carries the card and the four `.stg-group`s
  inside drop their own background, border and press-lift, separated by dividers. Selected row
  gets an accent tint, a `::before` accent bar and a bolder label; `.stg-nav-chev` is hidden at
  this width only.
- `js/app.js` — `STG_SPLIT_MIN=1180` / `stgSplit()` decide the mount target.
  `openSettingsSection()` moves the **same** section element into `#stg-detail-body` (split) or
  `#settings-detail-content` (overlay) — one code path, two targets — and switches to the
  Settings view first in split mode, so a call from Home's habits card doesn't mount into a
  screen you can't see. A `resize` listener re-mounts across the boundary, or the section is
  stranded in a `display:none` container. `stgSyncNavActive()` moves the selected row in place
  rather than re-rendering the list (which would recompute ten live summaries and discard any
  search results on screen).
- The pane is never blank. `renderSettingsOverview()` builds a "Settings overview" card from
  `SETTINGS_OVERVIEW_KEYS` using the **same registry summaries the nav rows show**, so no value
  is written out twice, plus three quick actions. It returns early when a section is mounted —
  the sections are moved rather than rebuilt, so an `innerHTML` wipe would not come back.

Training setup, Budget setup and Run setup again deliberately keep their own full-screen
overlays even in split mode: they are collection editors with their own top-bar Save and are not
in `SETTINGS_SECTION_KEYS`. Their nav rows therefore never take the selected state.

Also in this branch, separately: the dead `toggleSettingsSection` / `applySettingsCollapsed` /
`syncSettingsCollapsedToFirebase` / `settingsCollapsed` surface was removed — it drove
`ssc-`/`sc-`/`sh-<key>` ids that stopped existing when budget income/savings/fixed/variable moved
to the Budget editor. `daily_settings_collapsed` is left in storage, unread.

---

## Verification checklist

**Desktop, window 1180px or wider:**

1. Settings opens with no console errors and all ten rows listed.
2. The profile card spans the full width above both panes.
3. The left nav is one surface — four labelled groups, thin dividers between them, every row
   the same width. No gaps between floating cards.
4. Nav rows have no chevron.
5. The right pane shows **Settings overview**: six live rows (Account & sync, Weather,
   Appearance, Training setup, Home Layout, Habits) each with its current value, then Review
   backup / Customise Home / Update health goals.
6. Click **Health & goals** — it renders in the right pane, no full-screen overlay, the nav
   stays put. The row takes an accent tint and an accent bar on its left edge.
7. Click **Appearance** straight after, without pressing Back — the pane swaps and the accent
   bar moves.
8. The pane header shows the section name left and **Done** right; Done returns the pane to the
   overview and clears the selected row.
9. Scroll a long section (Health, or Data & backup) — the pane header stays put.
10. Type `weight` in search: the grouped nav is replaced by results, each showing its parent
    section underneath, with no card-inside-a-card framing. Clicking "Weight goal" opens Health
    & goals in the pane with the weight-goal card scrolled to and briefly outlined.
11. Clear the search — the four groups come back intact.
12. Training setup and Budget setup still open their own full-screen editors and still save.
    Run setup again still launches onboarding.
13. From Home, the habits card's edit entry point jumps to Settings and mounts Habits in the pane.
14. Toggle dark/light — the nav surface, accent bar and pane header all follow the theme.

**Desktop, window between 1024 and 1180:**

15. Single column at a ~760px measure; each item pushes the full-screen overlay with its Back
    button, exactly as before.

**Resize:**

16. With a section open at 1400px, drag the window under 1180 — it becomes the full-screen
    overlay with the section still in it. Drag back over 1180 — it returns to the pane. Nothing
    disappears either way.

**Phone:**

17. Grouped single-column list, chevrons present, each item pushes a full-screen page with
    "← Settings". Nothing about mobile has changed.
