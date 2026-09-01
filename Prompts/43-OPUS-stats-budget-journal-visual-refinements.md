# 43 — OPUS — Stats, Budget and Journal visual refinement pass

Implement this focused refinement pass in the **Daily** app. Work in the existing checkout,
inspect the current code before editing, preserve unrelated local changes, and do not commit or
push unless Francois explicitly asks. `main` is served directly by GitHub Pages, so pushing it
is a production deployment.

Read `AGENTS.md` completely first, then the current Stats and Journal guidance in `CLAUDE.md`.
Re-grep the actual implementation rather than trusting approximate line numbers in this prompt.

This is not a broad redesign. It addresses five concrete visual problems found while reviewing
the recently rebuilt Stats, Budget and desktop Journal surfaces:

1. Two tiny Stats Overview trend lines add noise without enough context to be useful.
2. Stats → Finance has a large desktop void because unequal cards are coupled into shared grid
   rows.
3. The desktop Journal workspace's red/accent top line escapes the rounded top corners.
4. The Stats Overview Look-back summary reads as a plain segmented data rail rather than the
   prominent hero header Francois wants for this screen.
5. Budget's **Until next pay** forecast is fixed at the very top of the Week view and cannot be
   minimised like the other Budget cards.

Do not change calculations, stored data, sync paths, navigation, Finance chart semantics, or the
Journal record/editor model as part of this pass.

---

## Refinement 1 — Remove the two unhelpful Stats Overview sparklines

In `renderStatsOverview()` the **Training** and **Body** domain cards each contain a very small,
unlabelled sparkline:

- Training: trained days per week across the last eight completed weeks.
- Body: recent weigh-ins, optionally with a dashed target line.

Although the lines technically encode data, they have no values, axis, scale or interaction. In
practice they read as decorative red strokes and do not help Francois understand the result.
Remove both of these sparkline blocks from **Stats → Overview**, including their captions:

- `Trained days per week · last 8 completed weeks`
- `Last N check-ins · dashed line is the target`

Also remove the Training-only `perWeek` calculation if it becomes unused, and remove
`.ov-spark-cap` styling if no remaining element uses that class.

Preserve all useful content around them:

- Training's distinct trained days, date window, Sessions saved, Avg session, Prior 4 weeks,
  top-exercise evidence and **See the sets** action.
- Body's current weight, latest check-in age, 28-day change, target, target date, goal episode,
  pace/staleness messaging and route back to the source screen.

Do **not** remove or alter the shared `sparkline()` helper. It is used elsewhere by genuine
compact trend surfaces such as Home and Account Growth. This request applies only to the two
Overview-card call sites above.

The cards should close up naturally after removal. Do not replace the lines with another chart,
decorative divider or empty fixed-height region.

---

## Refinement 2 — Remove the Stats Finance desktop dead space

At the desktop breakpoint, `#sub-finance` currently uses a normal two-column CSS grid with this
row-major card order:

1. Latest completed week | Net worth
2. Account growth | Spending trend
3. Category breakdown spanning both columns

The Net Worth card is much taller than Latest completed week. Because both occupy the same grid
row, the tall right card sets the row height and forces **Account growth** far down the page,
leaving a large black void beneath Latest completed week. The same row-coupling can create the
reverse problem farther down the page.

Fix the desktop layout so the first four Finance cards form two independently stacking columns:

- Left column: **Latest completed week**, then **Account growth**.
- Right column: **Net worth**, then **Spending trend**.
- Keep the category breakdown after this main financial picture. It may remain full-width below
  both columns; the important requirement is that Account growth sits directly below Latest
  completed week rather than waiting for Net Worth's height.

Use explicit structural column wrappers or an equally deterministic solution. Do not fake the
fix with a large fixed height, absolute positioning, negative margins, or by stretching the
short card and moving the dead space inside it. Avoid CSS multi-column flow that makes the
reading order depend on content height.

Preserve the current phone/tablet narrative order exactly:

1. Latest completed week
2. Net worth
3. Account growth
4. Spending trend
5. Category breakdown

At the desktop breakpoint the two columns must have equal width, the existing gap, and
`min-width:0` protection so Chart.js canvases and long financial text cannot force horizontal
overflow. Empty-data versions of any card must not leave a phantom gap. Keep the existing Stats
desktop breakpoint unless inspection reveals a documented reason it has changed.

Do not change the Finance calculations, range controls, chart datasets, historical-plan rules,
account coverage/staleness wording, transaction precedence, evidence drill-downs or card order
on mobile.

---

## Refinement 3 — Contain the desktop Journal accent line

The new desktop Journal design intentionally gives the active editor workspace a narrow accent
line along its top edge. It is currently drawn by the `#jrn-editor.inline::before`
pseudo-element in `css/journal.css`.

The line runs from the outer left edge to the outer right edge while the workspace has large
rounded top corners and `overflow:visible`. It therefore paints straight through/outside the
corner arcs, appearing as a loose red horizontal rule across the black page rather than an edge
contained by the card.

Keep the design intent—a subtle 2px, accent-derived active-workspace marker—but contain it within
the rounded top edge. The preferred fix is to inset the pseudo-element horizontally by an amount
appropriate to the card radius, or another precise approach that respects the corner geometry.

Constraints:

- The line must not extend beyond either rounded shoulder at any desktop width.
- Do not square off or remove the editor's rounded top corners.
- Do not add a glow, full-strength gradient, thick border or fixed red colour. It must continue
  to follow the user's selected accent.
- Avoid applying `overflow:hidden` to the whole editor if that could clip menus, focus outlines,
  sticky controls or other editor content. Fix the line itself unless clipping is proven safe.
- The line remains a desktop-inline-editor treatment only. The mobile full-screen Journal editor
  must not gain it.
- Preserve the Journal split point, editor mounting logic, autosave, pin/copy/trash actions,
  footer controls and record data behavior.

Check this with both a warm/red accent and a neutral or cool accent so the geometry—not the
specific colour—is what makes it look correct.

---

## Refinement 4 — Give the Stats Overview header the hero-card treatment

The top of Stats → Overview currently renders two visually separate pieces:

- a loose `.ov-head` row with **LOOK-BACK** on the left and the completed-period date range on
  the right;
- a neutral `.ov-rail` card containing the four summary routes: Trained days, Weight, Calories
  logged and Last week spend.

Francois wants this entire orientation/summary area to read as the **Stats hero**, consistent
with Daily's established Tier-1 hero hierarchy—not as an ordinary matte card with dividers.

Convert the header and four metrics into one cohesive accent-gradient hero surface:

- Use the shared hero geometry and visual language already established by
  `.hero-workout-card`, `.budget-hero-card`, `.kitchen-hero-card` and `.card-hero`: runtime
  accent gradient, `--radius-hero`, controlled accent shadow, clipped decorative treatment and
  white/translucent-white text.
- `css/workout.css` already contains currently unused `.ov-hero`, `.ov-hero-grid`, `.ov-hs` and
  `.ov-hs-*` rules intended for this exact Stats surface. Inspect and reuse or refine those
  selectors instead of creating another nearly identical hero system. Remove obsolete
  `.ov-head`, `.ov-rail` and `.ov-cell*` rules only after confirming they have no remaining
  callers.
- Put **LOOK-BACK** and the completed-period date range inside the hero as its top header row.
  They must remain legible but secondary to the four values.
- Keep all four metric cells as real buttons with their existing destinations and focus-visible
  behavior. The hero is useful navigation, not a decorative banner.
- On ordinary phones, present the metrics as a balanced **2×2** grid. At desktop width, use one
  compact row of **four equal columns**. Preserve a suitable compact layout in short landscape
  phone mode.
- Use spacing, subtle translucent separators or restrained press states to distinguish the four
  routes. Do not place four matte cards inside the gradient, add heavy boxed borders, or create
  a card-inside-a-card effect.
- Preserve every current value, unit and comparison string, including stale-weight and over-plan
  states. Status text must remain readable on arbitrary runtime accents; use the existing
  hero-safe positive/negative treatment or another contrast-safe semantic treatment rather than
  assuming the accent is red.
- Keep the hero compact. It is an orientation summary, not a second full-height dashboard and
  not a copy of Home's session hero.
- The Stats tab strip above Overview remains unchanged. The Training, Body, Nutrition and
  Finance domain cards below the hero remain ordinary content cards.

Check both themes and several accent sources, including a dark/cool weather accent and a light
custom colour. White text must stay readable and the light-theme gradient must not wash into the
page background.

---

## Refinement 5 — Move and make “Until next pay” collapsible

The pay-cycle forecast currently renders into `#bud-forecast-card`, which sits outside
`.budget-desktop-grid` immediately below the Budget hero and above the due banner. Its generated
`.fc-card` has no `.bud-toggle` header and no `data-bud-key`, so Budget's existing keyed
collapse/restore system cannot minimise it.

Francois does not want this forecast at the very top of the Budget Week view. Move it directly
**below Variable expenses**. The intended order around it is:

1. Spending goal / Record spending as already arranged
2. Variable expenses
3. **Until next pay**
4. Stranded data when present
5. Weekly result and the remaining supporting tools as currently arranged

This placement applies to the phone's single-column Week flow and to the desktop layout. On
desktop it belongs in the same planning/spending column as Variable expenses, directly beneath
that card—not as a full-width banner above both columns.

Implementation requirements:

- Move the existing stable `#bud-forecast-card` wrapper into the Budget card stack after
  `#bud-variable-card`. Update both `mobile` and `desktop` entries in `BUD_LAYOUT`; do not rely on
  CSS `order`, duplicate the forecast, or create duplicate IDs.
- Preserve the current rule that the forecast renders only for the current week and only when a
  named income source makes a next pay date available. An empty forecast wrapper must consume no
  visible spacing.
- Make the generated `.fc-card` a normal collapsible Budget card using the established
  `.bud-toggle` / `.bud-chevron` / `.bud-collapsed` system. Give it a stable, unique
  `data-bud-key="forecast"` so its state is persisted by `daily_budget_collapse` like Income,
  Fixed, Variable and the other keyed Budget cards.
- When collapsed, keep a concise useful summary in the header—preferably the projected amount
  or scheduled-bills figure already calculated by `renderForecastCard()`—rather than hiding the
  card's meaning completely.
- `renderForecastCard()` is called by `budRecalc()` and currently replaces the card markup on
  recalculation. Do not let typing in a Budget field silently reopen a collapsed forecast.
  Preserve the existing node/class or explicitly restore the saved `forecast` collapse state
  after each re-render.
- Clicking the header/chevron expands and collapses the card; clicking or selecting content
  inside the expanded body must not accidentally toggle it.
- Keep all existing forecast arithmetic and wording intact: projected-after-bills meaning,
  scheduled bill rows, payday date, tight/over semantic tones, current-week gating and the rule
  that no pay day is invented when none is configured.
- Use Budget's existing collapse implementation. Do not introduce a fourth independent collapse
  mechanism or rewrite the other cards as part of this refinement.

The CSS comment that says the forecast is designed to sit at the top under the hero will become
false after this move; update it to describe the new placement.

---

## Scope and release discipline

- Expected files are `index.html`, `css/workout.css`, `css/journal.css`, `js/app.js`, and
  `service-worker.js`, but touch only those actually required after inspection.
- Preserve all unrelated uncommitted work, especially any Kitchen/Pantry changes already in the
  working tree.
- Do not alter Firebase, localStorage, migrations, backup/restore or sync code.
- Do not introduce a library or build step.
- Because cached assets will change, bump `CACHE_NAME` in `service-worker.js` exactly once after
  all refinements are complete, using the next version from the code at execution time. Update
  its adjacent version comment to describe this combined refinement pass.
- Do not commit, push or deploy unless Francois separately asks.

---

## Numbered verification checklist

1. Open Stats → Overview. LOOK-BACK, the completed-period range and all four summary metrics are
   contained in one cohesive accent-gradient hero; the old loose header plus neutral rail is gone.
2. On a phone the hero metrics form a balanced 2×2 grid. On desktop they form one row of four
   equal columns. No label, value or comparison clips at either width.
3. Tap each hero metric. Trained days opens Training, Weight opens Body, Calories logged opens
   Nutrition and Last week spend opens Finance; keyboard focus remains clearly visible.
4. Check the hero in dark and light themes with warm, cool, neutral and light custom accents.
   Text remains readable, the gradient/shadow follows the runtime accent and there is no nested
   matte-card appearance.
5. Open Stats → Overview with saved workout data. Training shows its totals and top-exercise
   evidence with no sparkline, no `Trained days per week` caption and no chart-sized blank gap.
6. Open Stats → Overview with at least two weight check-ins and an active target. Body shows the
   useful figures and goal/pace messaging with no sparkline, dashed target line, caption or blank
   placeholder.
7. Training and Body empty states still render correctly.
8. Other compact sparklines elsewhere in Daily still render; the shared `sparkline()` helper has
   not been deleted or globally hidden.
9. At desktop width, Stats → Finance shows Latest completed week directly above Account growth
   with the normal inter-card gap—no large black void between them.
10. Net Worth sits directly above Spending trend in the right column, independently of the left
   column's card heights.
11. The Finance columns are equal width, charts fit without horizontal overflow, and the category
   breakdown remains readable.
12. Repeat Finance with missing/empty Budget or Accounts history. Empty cards do not create
   phantom column gaps or break the layout.
13. At phone width, Finance remains in this exact order: Latest completed week, Net worth,
   Account growth, Spending trend, category breakdown.
14. Resize repeatedly across the desktop breakpoint. Cards move between the one-column and
    two-column structures without disappearing, duplicating, or leaving a Chart.js canvas at the
    wrong width.
15. At Journal's desktop split width, open an entry. The accent top line begins and ends inside
    the rounded shoulders and no loose rule extends over the page background.
16. Check the Journal line in dark and light themes and with at least one warm and one cool/
    neutral accent. It stays subtle, visible and geometrically contained.
17. Below the Journal split point, the mobile/full-screen editor has no new top accent line and
    its Back, pin, copy, trash, fields and footer still work.
18. In Budget → Week, Until next pay appears directly beneath Variable expenses on phone and in
    the same desktop column; it no longer occupies the full-width position beneath the hero.
19. The forecast header and chevron minimise and restore the card. Its collapsed header retains
    a useful projected/scheduled figure, and the state survives leaving Budget and returning.
20. Collapse the forecast, then edit Income, Fixed, Savings or Variable amounts. The forecast
    recalculates without silently expanding and shows the updated result when reopened.
21. Switch to a past week or test with no named income source. The forecast remains absent and
    leaves no empty gap. Return to the current configured week and it reappears in the correct
    position with its saved collapse state.
22. Other Budget cards retain their existing independent collapse states and mobile/desktop
    ordering; no duplicate card or duplicate element ID appears after repeated breakpoint changes.
23. Browser console stays clean through Stats navigation, Finance range changes, Journal entry
    switching and breakpoint resizing.
24. Run JavaScript syntax checks and `git diff --check`; confirm `CACHE_NAME` was bumped once and
    that no unrelated local change was overwritten.
