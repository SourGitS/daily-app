# Daily — Project Reference

Personal lifestyle web app for Francois: workout tracking, kitchen/recipes, budget, and
habit/notes tracking. No build step, deployed via GitHub Pages from `main` at
sourgits.github.io/daily-app (repo renamed from workout-tracker on 2026-08-09; the old
URL now 404s — see manifest.json/service-worker.js history if PWA install issues resurface).

This file has been out of sync with the app before (an old written description said "4 tabs,
single HTML file" long after the app outgrew that). Trust what's actually in the repo over any
older summary — re-grep before assuming a fact from here is still true if it looks surprising.

## Stack

- Vanilla HTML/CSS/JS — no framework, no bundler, no npm build step.
- Entry point `index.html`. Styles split into **nine** files, loaded in this order (cascade
  order matters, don't reorder the `<link>` tags): `css/base.css`, `css/layout.css`,
  `css/workout.css`, `css/nutrition-modals.css`, `css/budget-home.css`,
  `css/kitchen-extras.css`, `css/journal.css`, `css/settings.css`, `css/review.css`. The
  first six were split from one `style.css` partway through the project (commit `52f32d0`);
  journal, settings and review were added later and load last *so they win ties* — that is the
  point of their position. New files are APPENDED, never inserted.
- Nearly all logic in one `js/app.js` (~25,400 lines), plus a second script `js/nutrition.js`
  (~340 lines: the food catalogue, the day log and the Nutrition tab), loaded BEFORE `app.js`
  at the bottom of `index.html`. Both are plain `<script defer>` in one global scope, so
  `app.js` can read `nutrition.js`'s top-level `let`s (`nutTab`) and `nutrition.js` guards its
  calls into `app.js` with `typeof`. Both line counts have been wrong in this file before —
  `wc -l` rather than trusting them, and note the "all logic in one file" claim was stale for
  a long while after nutrition.js was split out.
- PWA: `manifest.json` + `service-worker.js`, installable to iOS/Android home screen,
  `display: standalone`.
- Optional cross-device sync: Firebase Realtime Database + Google Auth. localStorage is the
  source of truth; Firebase mirrors it when signed in.
- Chart.js (cdnjs), Tabler Icons (jsdelivr), Google Fonts — Manrope (UI) + Space Grotesk
  (numerals/wordmark).

## Navigation (restructured many times over the project's life — this is current as of 2026-09-05)

- **`NAV_TREE` (`js/app.js`, beside `NAV_ORDER`) is the ONE source for the desktop sidebar and
  the mobile hamburger.** Six labelled groups — Today, Training, Money, Kitchen, Stats, More —
  holding 25 rows between them, reaching every real destination rather than only the twelve
  top-level ones. `renderNav()` builds the tree ONCE and mounts the same markup into `#ds-nav`
  (sidebar) and `#side-menu-list` (hamburger); the two differ in DENSITY only (16px rows and
  44px targets on the phone, 14px pill rows on the sidebar), never in content, order or which
  destinations exist. **Adding a destination means adding a row to `NAV_TREE` — never a literal
  button in `index.html` again.** This is the fix Settings already made with
  `SETTINGS_SECTIONS`: before it, twelve hand-written `.ds-item` buttons in `index.html`, a
  similar-but-different list in `buildSideMenu()` (from `MENU_NAV` + `MENU_SECTIONS` + four
  more literals) and a third in `renderQuickSettingsMenu()` each carried their own copy.
- A row is DATA, not code: `{id, label, view, sub}`. `navGo(view, sub)` is the single
  dispatcher — nothing calls `setView` plus a sub-tab setter by hand any more — and inside it
  the sub-tab call must come AFTER `setView`, because `setView('log')` resets `logTodayView`
  and `setView('stats')` calls `setStatsTab(statsSubTab, true)`.
- **`navCurrentRow()` → `setNavActive()` is the only place a selected row is written**, for
  both surfaces, and it computes the answer from the state the screens themselves read
  (`S.view`, `logSubTab`, `statsSubTab`, `budgetView`, `kitState.tab`, `nutTab`, plus the
  Accounts / AI-hub overlay display flags). There is deliberately NO parallel "currently
  selected nav row" variable — that is the thing that goes stale. This replaced seven scattered
  `.ds-item` `classList.toggle` sites that all keyed on `data-tab` alone. `setNavActive()` is
  called from `setView` and from every sub-tab setter (`setLogTab`, `setStatsTab`,
  `setBudgetView`, `kitSetTab`, `nutSetTab`), so the sidebar follows a sub-tab change made from
  inside a screen, and from the open/close of Accounts, Daily AI, the split editor, the Stats
  evidence overlay, an exercise detail and a mounted Settings section. Those last four are not
  nav destinations (`NAV_NO_ROW_OVERLAYS`) and light NO row — they are inset past the sidebar
  rather than covering it, so a stale highlight beside them would be visible.
- **The JS hook is `[data-nav-row]` / `[data-nav-group]`, not a class.** `renderQuickSettingsMenu`
  used to emit `.ds-item` buttons with no `data-tab`, which is the only reason the old toggles
  did not light them up.
- **Any number of groups can be open at once**, animating `max-height` + a chevron rotation at
  0.25s (matching the disclosure idiom the quick-settings dropdown used). Pressing a header
  toggles that group and nothing else; all-closed and all-open are both valid. It was
  one-at-a-time for a day (2026-09-04 → 09-05) and that was wrong — an accordion is a
  space-saving device, the sidebar has room, and all the restriction did was take away a
  choice. **The one automatic move is ADDITIVE**: navigating expands the group that owns the
  destination, so the lit row is never hidden inside a collapsed group. It never collapses
  anything, which is the whole difference. Do not reintroduce the close-the-others behaviour.
- **Expansion state is device-local, in `daily_nav_ui`** as `{open:[groupId, …]}`, written with
  a plain `localStorage.setItem` and **never** `lsSave(key, value, syncName)` — the
  three-argument form is the synced path and the sidebar is desktop-only, so a phone must not
  write a preference only the laptop reads. `daily_pantry_ui` is the precedent, and like it,
  `daily_nav_ui` is excluded from `exportAllData()`. **Whatever is expanded when you leave is
  expanded when you come back**, so every change persists — a header press and the additive
  open on navigation alike — not just deliberate toggles. **Nothing is written during
  `_bootPhase`**, so restoring a stored state cannot rewrite it, and a fresh device with no
  record simply opens the group owning wherever the app started. `navResolveOpen()` also reads
  the one-at-a-time era's `{open:"money"}` string shape without rewriting it; the next toggle
  saves the array form. Deleting the key resets to that first-run default.
- **`#ds-nav` scrolls independently of `.ds-profile`.** `#desktop-sidebar` is
  `height:100vh; position:sticky` with `.ds-profile{margin-top:auto}`; twelve flat rows just
  fitted, and the moment a group expanded past the viewport the profile would have been pushed
  off screen with nothing to scroll. `#ds-nav{flex:1;min-height:0;overflow-y:auto}` — the
  `min-height:0` is the load-bearing half, because a flex child will not shrink below its
  content height without it — with the scrollbar hidden the same way every other strip hides
  one.
- **Mobile bottom nav** (`#bottom-nav`, 5 fixed tabs): Home, Budget, Log, Nutrition, Kitchen.
  These five and only these five are the swipe deck — `NAV_ORDER` in `js/app.js` IS the deck,
  and a view named there must be a `.swipe-panel` inside `#swipe-deck` while one that isn't
  must be a direct `<section>` child of `#app-main`. **Stats is NOT in the deck** (this file
  said it was for a long time); it is an overlay section reached from the nav or the header
  chip. The deck, the bottom nav and `#header-stats-pill` are untouched by the nav registry.
- **Two placements in `NAV_TREE` are deliberate, so they do not get "corrected".** *Weekly
  review* sits under **Money** even though it opens `stats.review`: it is a money review in
  practice — its first and largest section is Money — and the group says what the user is
  doing, not which screen hosts it. *Exercise Library* and *workout History* are gone as
  top-level rows and are **Training › Exercises / History**, which is where they have actually
  gone since the Log hub was built; `openExerciseLibrary()` / `openWorkoutHistory()` stay
  exported for their other callers, but the nav rows dispatch through `navGo` directly.
  *Settings* pushes its own screen and stops there — that screen is already registry-driven and
  searchable, and mirroring its ten destinations here would rebuild the duplication this
  registry removes. A second nesting level anywhere in this component is out of scope.
- **Retired, do not bring back:** `MENU_NAV`, `MENU_SECTIONS`, `menuSectionLabel()`,
  `menuNav()`, `buildSideMenu()`, `renderQuickSettingsMenu()`, `setQuickSettingsOpen()`,
  `toggleQuickSettings()`, `restoreQuickSettings()`, the `daily_qs_open` key, `.ds-item`,
  `.ds-section`, `.ds-settings-row`, `.ds-caret-btn`, `#quick-settings-menu`,
  `.side-menu-item`, `.smi-label`, `.smi-chev`, `.side-menu-divider` and
  `.side-menu-group-label`. The desktop quick-settings caret is deliberately removed: its three
  shortcuts are one tap deeper on a searchable Settings landing page, and keeping it meant the
  sidebar had one row that expanded differently from every other row. `js/app.js` carries a
  comment saying exactly what would restore it.
- **`#desktop-sidebar` is declared ONCE now**, in `css/budget-home.css`, with the values that
  used to win (260px, `0.5px` border). It was previously declared there at 160px with 12px rows
  and a `border-left` rail AND again in `css/kitchen-extras.css` at 260px with 14px pill rows —
  the second won on load order, so half of what the first file said never rendered. The `.nv-*`
  component itself lives in `css/kitchen-extras.css` beside `#side-menu`, because both surfaces
  share it and that file loads late enough to win ties.

## What's in each area

- **Home** — dashboard of widget cards, each independently show/hideable via
  Settings → Home Layout. Today's session hero, weekly budget snapshot, calorie card,
  savings/CC balance, notes bubble, habits.
  - The weather card has **19 derived presentation scenes** and no scene state of its own:
    `clear-*` and `partly-*` each use dawn/noon/day/dusk/night; cloudy, fog, rain and snow each
    use day/night; storm is one deliberately dark scene. Fog must keep distinct pale-day and
    cool-dark-night treatments. Clear/partly night may show stars; cloudy night must not.
  - Partly, cloudy, rain and storm all use the same layered cloud-bank grammar: a broad
    asymmetric body with a flat underside, unequal merged lobes, an upper highlight and a
    darker base. Scene modifiers change its scale, tone, coverage and depth planes; wind still
    drives the shared slow CSS drift. Do not replace it with blurred ovals or separate drawings.
  - Rain is one fixed **fine single-layer** field of 1px, short, uneven drops beginning below
    the bank. Explicit WMO-derived `data-rain` modifiers change the visible count, opacity,
    length and pace for drizzle/rain/showers/storm; `data-snow` similarly refines the two snow
    scenes without adding scene IDs. These attributes are render state only, never persisted.
  - Weather labels and decorative condition/location marks come from controlled mappings and
    the existing Tabler line-icon resource—no weather emoji. The card retains Daily's exact
    Manrope UI / Space Grotesk numeric typography and its existing information geometry.
- **Log** (was "Train") — **the workout hub**, four sections behind one sub-tab strip
  (`setLogTab()`, `LOG_TABS`): **Today**, **Program**, **Exercises**, **History**.
  - **Today** lands on an OVERVIEW (`renderLogOverview()`), not the set logger: today's
    workout hero, then question-shaped cards — weight movement (`renderLogWeightCard()`),
    consistency (`renderLogConsistencyCard()`), improvement (`renderLogImprovementCard()`) —
    and the recent sessions. `logOpenSession()`
    swaps in the logger; `logBackToOverview()` and re-tapping the active Today tab come back.
    `setView('log')` resets `logTodayView` to `'overview'` whenever you arrive from another
    view — that reset lives in setView because it is the only place that can tell a genuine
    tab entry from an in-tab re-render.
  - **Program** holds the live split (with `openSplitEditor()` as a full-screen push, since it
    is a collection editor with its own top-bar Save) AND the saved program snapshots that
    used to be the Plans tab: switch, save-current-as, rename, delete, JSON import/export.
  - Every card in the hub is a `.lg-card` on the shared MATTE content-card surface with a
    `cardHeader(icon, label, rightHtml)` header — those four Log › Today cards were the app's
    only iconless card headers until 2026-09-05, and the only content cards reading the
    `--card` control token. `.lg-card-hd` / `.lg-card-lbl` / `.lg-card-act` are retired.
  - **Exercises** and **History** are the SAME markup that used to be the
    `#view-exercise-library` and `#view-workout-history` overlays, re-homed into Log sections.
    Same element ids, so `renderExerciseLibList()` / `renderHistory()` are untouched. Those
    two overlay wrappers are gone; do not re-add them.
  - Logging itself is unchanged: sets (weight/reps, warmup toggle, ± sign for negative-load
    exercises), swap an exercise from the library mid-session, drag-to-reorder, done-check with
    auto-collapse, per-day session notes, rest timer (sticky bar + fullscreen, timestamp-based
    so it keeps correct time if the phone locks or the app backgrounds), session timer,
    optional effort rating, optional hours-worked tracking.
- **Stats** — Overview + Review / Training / Body / Nutrition / Finance sub-tabs. Per-exercise
  history view, swap-aware personal records, progress charts, 8-week consistency grid,
  body-weight log/chart, budget charts. **Review holds two different things**: the opt-in
  **Weekly Review** the user drives (see below), and beneath it the automatic
  `statsReviewInsights()` cards — a short ranked set of conclusions that cleared an evidence
  threshold. They are separate features that share a tab.
- **Weekly Review** (Stats → Review, `css/review.css`, `wkr*`/`WKR_*` in `js/app.js`) — an
  opt-in review of ONE finished week against a saved weekly plan, ending in a next-week plan.
  Four sections: Money, Work and commission, General life, Reflection and next week. New users
  see a setup screen; the suggested template is visible but is only written when they press the
  button that saves it. See "Known history" for the three rules it is built on.
- **Kitchen** — Recipe Book (9 preloaded + custom), pantry-aware Shopping List, multiple named
  Pantry inventories, cooking mode with per-step timers, favourites/recently cooked.
  Firebase-synced.
- **Budget** — weekly tracker. Income sources, savings target, and fixed/variable categories are
  all user-configurable now — see "Known history" below, these used to be hardcoded to
  Francois's specific numbers and were deliberately made dynamic. Credit-card balance tracking,
  comprehensive 8-section CSV export, collapsible sections, monthly/yearly charts. A weekly
  **spending goal** card sits between Fixed and Variable (a self-imposed cap on variable
  spending, distinct from "money left over"): the goal input is behind the card's Edit button
  (`budEditMode.vargoal`, same convention as the other budget cards), the usual goal is
  `budDefaults.varGoal`, and each week stores the goal that applied to it as `var_goal` so past
  weeks aren't rewritten later. A **Day by day** card under Variable expenses breaks the same
  week down by date instead of by category, expanding each day into its purchases — see the
  reconciliation rule below before touching it.
- **Accounts** — net-worth tracking across accounts; added after Budget, migrated from the old
  savings/CC logs. An asset can be flagged `saver:true` ("Savers account"): it still counts in
  net worth but is excluded from the **debt payoff position** (`(assets − savers) − debts`),
  which answers "am I covered" rather than "what am I worth".
  **The screen states net worth ONCE, and where it does is deliberate (2026-09-05).** The hero
  panel used to lead with a Net worth cell and the `.nw-chart-card` directly beneath it repeated
  the same figure, same label, same source, ~340px lower — the exact thing the "Home cards must
  not restate a number another card already shows" rule forbids. Net worth now leads the CHART
  card, where the line under it is the thing it describes, carrying the assets/debts sub-line
  (`.nw-chart-mix`) and the In the black / Under water chip (`.nw-chart-verdict`) the hero cell
  used to hold. `renderAccountsHero()` is one `hp-lg` cell: the debt payoff position, with its
  headline, chip, spendable-minus-debts math line, debt-kind line and savers note.
  **The chart card's figures come from the CHART's own last data point** (`assetsData`,
  `debtsData`, `netData`), never from `accountsNetWorth()` / `accountsAssetsTotal()`. Those are
  live; the chart ends at the last date every account has a recorded balance for. They can
  legitimately differ, and the card has to state the one its own line ends on.
  `renderNetWorthChartInto()` has TWO mounts — `accounts-chart` and `bs-balance-wrap`
  (Stats → Finance) — and both show the sub-line and the chip. Only the Stats mount gets the
  "Open account records →" link; that gate stays on `wrapId`.
- **Plans** — **imported plan DOCUMENTS only** (the `type:'html'` entries: import any HTML
  file, view it in a sandboxed iframe). Saved workout programs moved to Log › Program, and the
  streak that used to head this screen is gone from the UI. The nav label stays "Plans".
- **Notes** — date-tracked notes, fullscreen view, optional home-screen bubble.
- **Settings** — a searchable control centre, not a menu of unrelated forms. Landing page:
  profile/sync card → search field → four LABELLED groups (Personal, Planning, App experience,
  Data and support) whose rows carry a live one-line summary ("Sydney", "5 active",
  "Maintain · 2775 kcal"). Ten destinations: Account & sync, Health & goals, Training setup,
  Budget setup, Habits, Appearance, Weather, Home Layout, Data & backup, Run setup again.
  Behind them: dark/light theme (warm gray dark palette, deliberately not pure black),
  personal info + Mifflin-St Jeor TDEE calculator (Bulk/Maintain/Cut), dynamic per-muscle-group
  day colours, full data backup export/import, Home Layout widget toggles. See the Settings
  entry under "Known history" before changing anything here.

## Design tokens (`css/base.css`)

```
--radius-card: 22px    --radius-hero: 24px    --radius-pill: 14px    --radius: 16px
--radius-bar: 0        (magnitude bars and progress meters — see the bar note below)
--font-ui: 'Manrope'   --font-num: 'Space Grotesk'
--accent: #5C5C5C neutral slate (--accent-rgb for rgba() use)   --accent-text
--positive / --success: #52B788   --danger: #E74C3C   --purple: #6366f1
--bg / --card / --card-border / --card-top / --text / --text-2 / --text-3 / --muted / --border
--surface-card / --surface-card-border / --surface-card-top      (content containers)
--surface-raised / --surface-raised-border / --surface-raised-top (active workspaces)
```

Light values live in `:root` as defaults; `[data-theme="dark"]` overrides colour tokens only
(dark `--bg: #080808` — never a pure-black card surface).

**There is a deliberate surface hierarchy, and `--card` is NOT the card token.** Read this
before styling any new surface:

| layer | token / treatment | examples |
|---|---|---|
| page canvas | `--bg`, completely flat | every screen background |
| control | `--card` (dark: a FLAT `rgba(255,255,255,.055)`) | inputs, calculator keys, segmented "on" states, filter chips, search fields, dropdown sheets |
| content card | `--surface-card` (dark: solid `#1b1b1d`) + `--surface-card-border` + `--surface-card-top` | `.card`, `.ex-card`, `.session-card`, `.week-section`, `.stg-card`, `.kit-card`, `.jrn-entry` |
| active workspace | `--surface-raised` (dark: `#222225`) + a narrow accent edge | the desktop Journal editor |
| hero | its own accent/scene gradient | `.hero-workout-card`, `#budget-hero-card`, `.kitchen-hero-card`, `.home-weather-card` |

`--card` used to be a `linear-gradient(180deg, …)` in dark mode, which meant every surface
reading it stretched the same white wash over whatever height it happened to be: invisible on a
38px input, an obvious grey ramp down a 600px card. It is one flat tone now, so a card's height
stopped being a visual property.

**Do not "simplify" this by pushing the card treatment into `--card`.** ~120 rules read that
token and most of them are controls; a global swap puts a miniature card behind every button.
The matte surface is applied through an explicitly NAMED selector list — the big one is in
`css/budget-home.css` (search "The matte content-card surface"), with restatements in
`kitchen-extras.css`, `settings.css` and `journal.css` for the classes those files own, because
they load later and would otherwise win. Never widen it to `[class*="card"]`: several classes
use "card" as a historical name while behaving like a button, a row or a preview
(`.acct-type-btn.on`, `.hl-prev-plain`, `.ob-pv-card`).

**`.lg-card` (the Log hub's cards) is in that list now.** It read `var(--card)` with a 1px
`var(--border)` outline until 2026-09-05, so the four Log › Today cards rendered as translucent
wash panels with a hard edge while every other card in the app sat on a solid `#1b1b1d` with a
`0.5px --card-border` and an inset top highlight. Its own border is `0.5px solid
var(--card-border)` to match `.card`. Anything that looks like a content card and reads
`--card` is probably making the same mistake — check the named list before styling a new one.

Rows inside a card, and repeated list items, stay FLAT — dividers and spacing, not nested
cards. Navigation lists (Settings groups, the Journal rail) are one surface with flat rows,
never a stack of floating rectangles.

The app no longer ships the old orange `#FF6B35` — that is `RETIRED_ACCENT` in `js/app.js`,
migrated away from once. `--accent` is whatever the user's Appearance settings resolve to:
one of four presets, a free colour picker, a per-training-day colour, or a weather scene
(`currentAccentHex()` is the single source of truth). Treat it as an arbitrary runtime hex.

**`--accent` vs `--accent-text` — pick the right one.** Every accent value the app can hold
is tuned to CARRY white text (checked ≥4.5:1 with `#fff` on top). That makes it the wrong
colour to use AS text on the app background — against dark `--bg` the night weather scenes
measure 1.7:1. Rule of thumb:

- fills, borders, progress bars, and any surface that white text sits on → `--accent`
- accent-coloured **text or icons** on `--bg` / `--card` → `--accent-text`

`--accent-text` is derived at runtime by `accentTextHex()` (hue and saturation kept, lightness
moved until it clears 5.0:1 against the current theme's background) and written by
`applyAccent()`. It is theme-dependent, so `applyTheme()` re-runs it — anything that changes
the accent or the theme must go through those, not set `--accent` directly.

## Known history worth knowing before touching these areas

- **Kitchen pantry inventory is the shopping source of truth.** `kitchen_pantry` is one
  timestamped Firebase blob with `schemaVersion:2`, a stable `activePantryId`, explicit pantry
  order and separate item maps for every named location. Legacy single-item maps migrate into
  `pantry_home` without a raw timestamp; a fresh account seeds that Home pantry, while a newly
  created empty pantry stays empty. `kitShopComputePlan()` classifies combined recipe
  ingredients against the active inventory: In-stock matches go to the collapsed “Already in
  …” section, Low/Out matches merge once into Pantry needs, and untracked ingredients remain
  ordinary buy rows. Matching is exact-first, then a small explicit canonical alias map; never
  add substring matching (`onion` must not consume `spring onion`). The former
  `PANTRY_STAPLES` filter is retired. `kitchen_shopping_checked` is also versioned and
  namespaced by pantry ID so checked recipe rows do not leak between locations. Pantry filters,
  category collapse and stocked-section disclosure remain device-local in `daily_pantry_ui`.

- **Budget's palette is semantic about DIRECTION, and yellow is reserved for warnings.**
  Two superseded designs are worth knowing so neither is re-proposed. First it was six
  unrelated hues (emerald income, orange variable, grey fixed, blue saved, a second emerald for
  the rate, a red spending) used at equal strength — all the colour the interface had was spent
  saying which CATEGORY a number belonged to. That was replaced by a neutral-first mapping
  (grey income, one muted terracotta `BUD_WARM` for all spending), which fixed the rainbow but
  spent no colour on the one distinction that actually matters and read washed out. **Neither
  is the current design; do not restore either, and do not drift back toward sage, olive,
  mustard, terracotta or rust for a data series.**
  Current mapping, in `budPalette()` / `BUD_MONEY` (js/app.js):
  - **income / earned → a rich green** (`#22C55E` dark, `#15803D` light)
  - **expenses / spending / variable → a saturated red** (`#EF4444` dark, `#DC2626` light)
  - **committed / fixed → the SAME red held back** — `budExpenseRgba(.40/.32)` fill plus a
    solid `fixedEdge` outline, because the two halves of "out" add up to one total and must
    read as one family split in two, not as two different kinds of thing
  - **saved / savings rate → the live accent**
  - **a reference series that is neither in nor out** (the account-balance line) → `neutral`,
    a colourless tone, so it cannot be read as a direction
  - **amber → warning states only.** It is not a graph indicator.
  **Income and expenses must never follow the accent.** The accent is per-device and can be a
  weather scene; the same money would then be a different colour on two devices.
  `BUD_CHART_COLORS` survives as a `Proxy` over `budPalette()` so ~25 call sites keep working
  and every chart picks up an accent or theme change on its next redraw. Accent-following chart
  marks use `budAccentHex()`, which returns **`accentTextHex(currentAccentHex())`, not the raw
  accent** — the "fills get `--accent`" rule assumes white text will sit on the fill, and a
  chart bar is read against the card, so a night-weather accent would draw an invisible series.
  Colour is never the only cue: `budChartLegend()` takes `{dash:true}` (dashed line),
  `{line:true}` (solid line) and `{ring:hex}` (outlined swatch, for the held-back committed
  fill), the savings-rate line is dashed with `rectRot` markers, and expenses are BARS while
  income is a LINE on the Stats money-flow chart. Ordinary currency totals stay `var(--text)`.
  The same mapping is used by the Stats → Finance direction charts and its fixed/variable
  breakdown. `BUD_CATEGORY_COLORS` / `budCategoryColor()` assign a stable, ID-derived
  categorical colour (red/rose/plum-led, never income green or warning amber) for anything
  that genuinely needs per-category identity. **Budget → Month's composition view is no
  longer a caller** — it is a ranked bar list whose colour carries no information at all; see
  its entry below before reaching for a categorical palette there again.
  **Chart.js gotcha, learned here:** `scales.y.stacked:true` stacks LINE datasets too, not just
  bars — the money-flow chart drew a $1,023 income week at $1,856 until each line was given its
  own single-member `stack` group.
- **The hero SURFACE is `.hero-surface`, and it FOLLOWS THE ACCENT.** (`css/budget-home.css`)
  It owns the treatment ONLY — the gradient, the white text, the clipped decorative circle, the
  top glare — held apart from any one component's geometry, and deliberately not folded into
  `.card` (see the press-lift note below). `.hero-wide` rescales the circle for a full-width
  surface, which is every caller today. Its stops are `--accent-hero` / `--accent-hero-2` with
  the old graphite hexes surviving only as the `var()` FALLBACK, i.e. the pre-JS paint. Until
  2026-09-05 those hexes were literals, which is why Accounts, Budget → Month and Budget → Year
  were the only three screens in the app still ignoring the user's colour. Because the stops are
  custom properties the surface restyles itself the instant `applyAccent()` writes them — do not
  add a re-render to `applyAccent()`, `applyTheme()` or `applyDayColour()` for it.
- **`.hero-panel` — SEVERAL figures on ONE surface — is the only thing that wears it.** Built by
  `budHeroPanel(items,{cols,colsSm})`: a single `.hero-surface.hero-wide` holding a `.hp-grid`
  of `.hp-cell`s split by hairlines. Per-cell flags: `lg` promotes the figure to hero size,
  `lead` spans the cell across the whole panel at the narrow breakpoint. Three call sites:
  **Budget → Month** (three cells, 3-up, the rate leading full-width above a 2-up row on a
  phone), **Budget → Year** (six cells, 3-up, 2-up on a phone) and **Accounts**
  (`renderAccountsHero()` — ONE `hp-lg` cell, the debt payoff position; see the Accounts entry).
  **`.hm-card` / `.hero-metric-grid` / `budHeroMetric()` are GONE** (2026-09-05). That component
  gave every figure its own card and coloured it by direction, and it lost its last caller when
  Budget → Month became a panel. Its six colour variants (`hm-income`/`hm-good`,
  `hm-expense`/`hm-short`, `hm-accent`, `hm-neutral`) went with it. **The `.hm-*` PARTS did
  not** — `.hm-label`, `.hm-label .card-hd-ico`, `.hm-val`, `.hm-unit`, `.hm-sub` and `.hm-chip`
  are what `.hp-cell` builds its markup from, so deleting the whole `hm-` block breaks all three
  panels.
  **The panel has NO per-cell colour variant, and adding one back is the thing it was built to
  remove.** All three call sites used to be direction-coloured `.hm-card`s: Year opened with six
  saturated slabs in four colours, Accounts with two stacked full-width cards that flipped
  the whole surface green or red with their sign, and Month with an accent slab, a green one
  and a red one in a row — so each screen read as several unrelated announcements rather than
  one summary. On a panel the FIGURES are what differ, not the backgrounds, and any verdict
  rides in a `.tstat` chip inside the cell, which is the house rule everywhere else. The surface
  following the accent is NOT a hole in that rule: one accent tint across the whole panel still
  says one thing, where a per-cell variant says several. `lead` is likewise a LAYOUT flag — it
  exists so an odd cell count (Month's three at two columns) does not leave a half-empty second
  row, and it needs no special case in the divider system.
  Panel mechanics worth not rediscovering: the dividers are a `border-top` + `border-left` on
  every cell with `.hp-grid` pulled 1px up and left so the surface's `overflow:hidden` clips the
  outermost pair away. That holds for ANY column count — verified at 1, 3 and 6 — so a
  breakpoint changes only the column variable and there is no `:nth-child` arithmetic to break
  silently when a figure is added. Column counts arrive as `--hp-cols` / `--hp-cols-sm` set
  inline **on the panel** and read from the stylesheet, so the media queries still win — an
  inline `grid-template-columns` on `.hp-grid` would outrank them.
  **The `--accent-hero` migration is FINISHED.** Every hero surface in the app reads the tokens:
  `.hero-surface` itself, plus `.lg-hero`, `.ov-hero`, `.fin-hero`, `.budget-hero-card`,
  `#budget-hero-card` (the real Budget weekly hero, whose gradient is an inline style in
  `index.html` and now names the tokens), `.hero-workout-card`, `.kitchen-hero-card`,
  `.nut-hero`, `.hl-prev-hero`, the onboarding preview heroes `.ob-pv-hero` / `.ob-tm-hero`, and
  the shared `.card-hero,.budget-hero-card,.hero-workout-card,.kitchen-hero-card` rule in
  `kitchen-extras.css` that overrides several of them. **The three `[data-theme="light"]` floors
  are gone** (`.ov-hero`, `.fin-hero`, `.hl-prev-hero`) — they existed only to lift the retired
  `rgba(var(--accent-rgb), .9 → .4)` ramp's pale end off `--bg`, and a solid contrast-checked
  stop makes them dead weight. `.log-day-hero-card` is the one exception: its gradient is set
  inline per training day in `js/app.js` (~line 3493) by the dynamic day-colour system, and if
  it is ever changed it must go through `applyAccent()` / `heroStopsFor()`, never a fixed CSS
  gradient.
  **The accent hero stops are CSS custom properties, not inline hexes.** `--accent-hero` /
  `--accent-hero-2` (defaults in `css/base.css`) are written by `applyAccent()` from
  `heroStopsFor()`, which keeps hue and saturation and walks the lightness down until white
  clears 4.2:1 — so a pale custom accent from the colour picker yields a deep surface rather
  than an unreadable one, and an achromatic accent keeps its zero saturation instead of being
  invented into a colour. Measured across the presets plus `#FFE082`, `#FFFFFF`, `#101010` and
  both night weather scenes, the worst case is 4.27:1 against white. They are theme-INdependent
  (a hero fill carries white in both themes), unlike `--accent-text`. The stops stay SOLID: an
  `rgba()` ramp blends into `--bg` and its pale end cannot carry a 9px white label in light
  mode. **This inverts an older rule that was in this file:** the heroes restyle themselves the
  moment `applyAccent()` writes the token, so `applyDayColour()` no longer force-re-renders the
  Month/Year view or the Finance picture hero. Do not re-add that.
  **`.hero-panel` is not in the press-lift list in `budget-home.css` or the `cursor:pointer`
  list in `base.css`, and must not be added.** These surfaces open nothing; the old `.sum-card`
  inherited both and reared up under a finger that had nowhere to go.
  **The `.tstat` re-tint on a hero repeats the state classes, and that is load-bearing.**
  `.hero-panel .hp-cell .tstat` written three-deep TIES `[data-theme="dark"] .tstat.warn`
  (both 0,3,0) and loses on load order, because `kitchen-extras.css` comes last — so every chip
  on a hero kept its amber/green/red CARD background and only had its text colour rescued by the
  four-deep per-state rules. The first rule now lists `.tstat`, `.tstat.pos`, `.tstat.warn` and
  `.tstat.neg` explicitly so the background and border win too. Invisible while the surface was
  graphite; an amber chip on a blue hero is not.
  **`.summary-grid` / `.sum-card` are GONE**, as are `BUD_HERO_SCENES` and `budHeroStops()` —
  the scene table and its inline gradients died with the custom properties above.
- **Budget → Week's "Day by day" card reconciles with the Variable card BY CONSTRUCTION, and
  that is the whole point of it.** `budDaySpend(wk)` / `renderDaysCard(wk)` (js/app.js, beside
  the `txn*` helpers) answer "which days" off the same records the Variable card reads for
  "which categories". They can only agree for money that HAS a day, so the function returns
  three parts and the card shows all three: `dated` (real transactions, on their day), `carry`
  (converted weekly totals) and `undated` (categories still on a typed weekly figure).
  `dated + carry + undated === weekVarTotal(d,wk)`, and it stays that way because
  `budDaySpend()` builds **the same category-id set `weekVarTotal()` builds** — the stored
  `var_*` keys plus `loadVarCats()` plus every id appearing in the week's transactions — rather
  than iterating `loadVarCats()` alone. Verified against a week whose stored keys included two
  ids (`var_fuel`, `var_fun`) that no longer exist as categories: iterating the live list only
  would have silently dropped them and made the day list disagree with the card above it.
  Two things deliberately do NOT get a day, and both are printed under the list rather than
  dropped:
  - a category still on its typed weekly total — one figure standing for seven days, so
    putting it on any one of them would invent a purchase that never happened;
  - a **carry record**, which IS a transaction but is a converted weekly total dated to its
    week's MONDAY (see `budResolveConflict`'s `convert` branch). Counting it as a day would
    draw a Monday spike that never happened, so `txnIsCarryRecord()` filters it out of the day
    rows and into its own line.
  A day list whose total quietly disagrees with the card above it reads as a bug, which is why
  the remainder is stated in words instead of being rounded away.
  Mechanics: rows are FLAT with hairline dividers (never a stack of little cards); only a day
  with purchases is a `<button>`, the rest are `<div>`s, so nothing carries a press affordance
  that leads nowhere; the expanded purchases reuse the existing `.txn-item` markup rather than
  inventing a second row vocabulary. The bar fill is set inline from **`budExpenseHex()`**, the
  same source every spending chart reads — a second red hardcoded in CSS would be free to drift
  from `BUD_MONEY`. Like the charts, it takes a theme change on the next render. The amount
  itself stays `var(--text)`: the bar is a redundant encoding of a figure that is already
  printed, so the row still reads with no colour at all.
  **`BUD_WEEK_DAYS` is Monday-first short names and is NOT `BUD_DAY_NAMES`**, which already
  existed further down as Sunday-first FULL names for the pay-day selectors. Both are top-level
  `const`s, so reusing the name is a hard parse error that takes the whole app down — the same
  class of fault as `.set-row`, `.empty` and the `wr-`/`wkr-` collision, now seen in JS as well
  as CSS. The card's own empty state uses `.is-empty`, never `.empty`, for the same reason.
- **Budget → Month's variable-spending breakdown is a RANKED BAR LIST, not a donut, and the
  donut should not come back.** `monthSpendBreakdown()` still resolves each recorded week
  through `statsWeekParts()` and `varCatAmount()` (transaction precedence intact);
  `renderMonthSpendBreakdown()` now draws a single composition strip plus sorted rows —
  label / bar / amount / share — with no Chart.js at all. Why it changed, so it is not undone:
  a donut asks the reader to compare ANGLES, the hardest visual judgement there is, and a real
  month's tail was five categories within four percentage points of each other. No palette
  fixes that; the shape was wrong for the data. Sorted bars make it a length comparison.
  **The row grid's label and amount columns are FIXED widths, and that is not cosmetic.** They
  were `minmax(84px,auto)` / `minmax(74px,auto)`, and every row is its OWN grid — so every
  category whose label fitted inside 84px shared that width while one longer name ("Money
  Transfer") grew its column and started its bar ~23px right of the rest, which is what made the
  list look unaligned. They are `164px … 88px` now (`116/84` at ≤680px, `98/78` at ≤390px), with
  all the slack going to the bar. 164 is measured, not guessed: it clears "Uncategorised /
  archived" at 159px, the app's OWN label for legacy detail it cannot attribute and the longest
  string this list can produce. `.month-spend-name` already truncates with an ellipsis, so a
  longer label cannot move a bar — which is the property to preserve if the number is ever
  changed.
  Three things follow, and each removed a whole class of problem:
  - **Colour now carries NO information.** The rows are sorted, so rank is already stated by
    position; the fill is one red shaded by rank (`budRankShade(i,n)`, derived from
    `budExpenseHex()` so there is still a single source for the spending red) and the card
    reads correctly in greyscale. This is why the old palette problem is GONE rather than
    solved — do not reintroduce a categorical palette here. `BUD_CATEGORY_COLORS` /
    `budCategoryColor()` still exist for anything that genuinely needs per-category identity,
    but this view is no longer a caller. The ramp direction flips per theme: brightest = biggest
    on the dark card, deepest = biggest on white.
  - **The SVG leader lines are gone**, with `monthSpendDrawConnectors()`, the
    `.month-spend-connectors` element and `monthSpendHighlight()`. They tied each arc to its
    list row, which the swatch already did, and any slice whose mid-angle pointed left was
    routed around the entire donut to a rail above or below it — that was the boxy outline that
    appeared to be a stray border. If a mark ever needs tying to a row again, put the two next
    to each other instead of drawing a line between them.
  - **`monthCategoryChart` no longer exists.** The old rule here ("must be destroyed before
    every Month rerender") is obsolete along with it; there is no canvas on this screen.
  **A stale claim removed from this file:** it used to say "more than six slices become
  top-five + Other in the canvas only". That was never in the code — every category went
  straight to the donut, which is part of why eight near-identical slices were on screen. The
  ranked list shows all categories and needs no such rule.
  Missing legacy category detail is still shown as `Uncategorised / archived`, never silently
  dropped or assigned today's label, and it keeps a colourless slate fill rather than a rank
  shade because it is not a category anyone chose. Category rows still register scoped evidence
  through the existing Stats evidence overlay; their source-week return target is Budget →
  Month, while Stats evidence still returns to Stats → Finance.
- **Stats → Finance has ONE range for its budget-derived cards.** `bsFinRange`
  (`12w` | `year` | `all`, default `year`) drives the Financial picture hero, the Money flow
  chart and the category breakdown together; `bsFinRangeKeys()` returns completed weeks only
  and `bsFinSummary()` is the single reduction all three read, so figures sitting beside each
  other cannot describe different spans. Spending comes from `statsWeekParts()` everywhere, so
  fixed + variable always reconciles to the headline expenses figure, and **saved is never
  folded into expenses**. Net worth and Account growth keep their OWN range controls on
  purpose: their timeline is account records, dated independently of when a budget week was
  saved. `statsWeekIncomeKnown()` exists because `weekIncome()` returns 0 both for "recorded
  nothing" and "recorded zero" — the chart plots `null` for the former so it draws a gap, while
  the TOTALS still sum `weekIncome()` (which is the canonical figure either way).
  The desktop columns are budget-derived left, account-derived right — that pairing is also
  what makes the two columns come out within ~15px of each other, so neither ends in a strip of
  dead background. They stack independently; a short card is never stretched to match a tall
  neighbour.
- **Judgements go in `.tstat` chips, not in the colour of the number.** Sage / ochre / coral,
  each carrying a tint, a hairline border, a monochrome stroke icon AND a word, built by
  `tstat(kind,label,icon,small)` with icons from `TSTAT_ICONS` (css/kitchen-extras.css). The
  rule is: the money stays neutral, the chip beside it carries the verdict — "Goal met",
  "$15 over", "Close to goal". Use one only where a real comparison exists; a chip on every
  value is the same as a chip on none. This replaced recolouring `calc-saved` blue/red, the
  `🟢/🟡/🔴` status pill, and the `+X%` red in Yearly's "Rising fastest".
- **Budget card chrome uses `CARD_ICONS`, not emoji.** `budCardHead(type,label,isCur,icon)`
  takes the icon as a SEPARATE argument now — it used to be baked into the label string
  ("📌 Fixed expenses"), which put uncontrollable hues in the chrome and, worse, meant those
  emoji lived in the same strings as the user's stored category names. The stored names
  (`💵 Income` defaults, `⚖️ Fine repayment`, recipe emoji, note titles) are CONTENT and are
  still left alone — `catDisplayName()` exists precisely to strip a legacy emoji prefix for
  display without touching what is saved.
- **Journal desktop is a two-pane workspace, and its split point is 1240px — not 1024.**
  `JRN_SPLIT_MIN` (js/app.js) and the `@media` in `css/journal.css` **must agree**: the constant
  decides whether the editor mounts inline or as a full-screen overlay, the media query decides
  whether the pane it would mount into exists. 1240 is chosen, not inherited: at 1024 the 260px
  sidebar plus 32px section padding leave ~700px, and a 400px list would hand the editor ~225px.
  Below 1240 the phone's list-first flow is used instead — same conclusion Settings reached at
  1180. The grid is `clamp(380px,30%,420px) minmax(0,1fr)` and is gated on
  `#journal-root:has(.jrn-rail)` so a CSS/JS disagreement degrades to the mobile layout rather
  than dealing single-column markup into two columns.
  The left pane is a NAVIGATION list (`.jrn-nav` › `.jrn-sec` › `.jrn-row`): flat rows, inset
  hairline dividers, one selected state (accent tint + a rail in **`--accent-text`**, because
  the default accent is a neutral grey that vanishes as a 3px bar on `#080808`). Today is a row
  there, not the phone's tinted composer card, and today's entries are filtered OUT of the month
  groups below so they are not listed twice.
  `renderJournal()` calls `jrnEnsureDesktopSelection()` BEFORE building the markup — the pane is
  never blank, it opens on today's entry or a ready-to-write surface for today. That is safe
  only because `jrnLoadEditor()` (split out of `jrnOpenEditor()` so it can run inside a render
  without re-entering it) does not persist anything: **merely opening Journal must never leave a
  blank entry behind.** `jrnEdPatch()` promotes a pending record into storage on a MEANINGFUL
  edit only (mood, tag, pin, title, body — see `JRN_MEANINGFUL_KEYS`), never on a date change.
- **`jrnRefreshLists()` defers only for TEXT fields.** On desktop the editor is MOVED into the
  detail column on every render, which blurs whatever inside it had focus — unforgivable
  mid-sentence, fine for a mood pill. It used to defer for any focus inside the editor, and
  nothing ever flushed `jrnListsDirty`, so the list kept showing "Start writing" after a mood
  had already created the entry. `jrnEdHoldsText()` decides, and a `focusout` listener settles
  the deferral when the field is left.
- **`.empty` is a live bare class in `workout.css`** (`text-align:center;padding:48px 20px`, for
  the Kitchen empty states) and it will match any element you give an `empty` MODIFIER. It was
  hitting `.jrn-comp-line.empty` and inflating the phone's Journal composer to a 167px box with
  one centred line floating in it; the modifier is `.is-empty` now. Same class of fault as the
  retired `.set-row` collision below — do not use a generic word as a modifier.

- **Settings is registry-driven — never hardcode a settings row, title or label again.**
  `SETTINGS_SECTIONS` / `SETTINGS_GROUPS` / `SETTINGS_SEARCH` in `js/app.js` are the single
  source for every label, icon, tint, `open()` target, row summary and search subtitle.
  Before this, the SAME ten things lived in four hand-maintained lists (literal rows in
  `index.html`, `SETTINGS_TITLES`, `MENU_SECTIONS`, `renderQuickSettingsMenu()`) — which is
  how "Export" survived being renamed everywhere else. The landing page is rendered by
  `renderSettingsList()` into `#stg-list-root`; the hamburger and desktop quick-settings read
  labels via `menuSectionLabel()`.
  **Section KEYS are persisted** (deep links, hamburger, quick settings) so they never change;
  only labels do. That is why "Data & backup" is still keyed `export`, and why the Journal tab
  is still keyed `notes`.
  Search indexes individual SETTINGS, not the ten destination names — `weight`, `colour`,
  `backup`, `location` all resolve. `stgNorm()` folds color→colour both ways. A result with an
  `a:` anchor opens the section AND scrolls to that card, flashing it (`stgRevealCard`, which
  uses a timer not rAF — rAF does not fire in a hidden tab). Adding a card to a settings
  screen means giving it an `id` and a `SETTINGS_SEARCH` row, or it is unfindable.
- **Settings has its own card vocabulary in `css/settings.css` — use it, don't invent another.**
  `.stg-card` › `.stg-card-head` (`.stg-card-icon` + `.stg-card-title` + `.stg-card-desc`) ›
  `.stg-row` (label left / control right) or `.stg-field` (label above control) › `.stg-help` ›
  `.stg-actions` + `.stg-btn[.primary|.quiet|.danger]` + `.stg-save-state`. Build heads with
  `stgCardHead(icon,title,desc,rightHtml)` and icons from `SETTINGS_ICONS` via `stgIcon()`.
  This is the FORM counterpart to the dashboard's `.card-*` vocabulary in `kitchen-extras.css`
  — that one is built around one primary figure per card, which is wrong for a form.
  `.stg-card-head-act` is for a SHORT pill only; a long status goes in a `.stg-row` beneath.
  Destructive actions go in a `.stg-card.stg-danger-zone`, never as the third button in a list.
  Save behaviour is now a rule, not a per-screen decision: single toggles/selectors save on
  change (and their card's `.stg-card-desc` says so), multi-field forms get an explicit
  `.stg-btn.primary` plus `stgSaved(id)`, and collection editors (Training, Budget) keep their
  overlay's own top-bar Save.
- **`.settings-card` and its family are GONE** (`.settings-card`, `-title`, `-row`,
  `-row-label`, `-chevron`, `-save-btn`, `settings-saved-flash`, the whole `.wx-*` set bar
  `.wx-details`/`.wx-coords`, and `#habits-edit-sheet`'s leftover bottom-sheet background).
  `.settings-field` / `.settings-2col` survive in `nutrition-modals.css` **despite the name**
  — onboarding and the Kitchen recipe form use them, so don't delete them as dead.
- **Form cards must not lift on press.** `.settings-card` was in the press-lift list in
  `budget-home.css`, so tapping an input made the whole form card rear up. The lift means
  "this opens something": it now covers `.card`/`.ex-card`/`.stat-card`/`.sum-card`/
  `.session-card`/`.week-section` plus `.stg-group` (the settings NAV groups), and never
  `.stg-card`.
- **`.set-row` was a live class collision, now retired.** `budget-home.css` defined `.set-row`
  for the Settings list AND `workout.css` defined it for the workout SET row — same
  specificity, and budget-home loads later, so the settings `display:flex` was silently
  overriding the Log screen's `display:grid` app-wide. The settings copy is now
  `.stg-nav-row`, and the Log rows render on their intended
  `28px 20px 1fr 10px 1fr 32px 22px` grid. Do not reintroduce a bare `.set-row` rule outside
  `workout.css`.

- **Log's hub state must be declared ABOVE `init()`, and that is load-bearing.**
  `LOG_TABS`, `LOG_TAB_BTNS`, `logSubTab`, `logTodayView`, `logProgSel` and `plansDocSel` are
  declared next to `NAV_ORDER` (~line 2058), nowhere near the hub's render functions. Reason:
  `init()` restores a `#hash` view by calling `setView()`, and `setView` touches
  `logTodayView`. Function declarations hoist; `let`/`const` do not — so declaring them beside
  their renderers threw `Cannot access 'logTodayView' before initialization` and aborted boot
  for anyone reloading on a hash. It failed silently in casual testing because the restore only
  fires when the URL actually carries one. Do not move them back down.

- **The Log sub-tab strip must not use `scrollIntoView()`.** `#view-log` is a `.swipe-panel`
  inside the transformed `#swipe-deck`. `scrollIntoView()` walks every scrollable ancestor and
  would shove the deck sideways, exposing bare background — the same bug Stats hit. `setLogTab`
  nudges the strip's own `scrollLeft` by a measured rect offset instead, exactly as
  `setStatsTab` does. Verified: cycling every sub-tab leaves the deck transform and
  `#app-main.scrollLeft` untouched.

- **`.log-cols` is a GRANDCHILD of `#view-log` now**, because Log › Today wraps the overview
  and the session (`#log-sub-today` › `#log-session` › `.log-cols`). The landscape layout in
  `workout.css` makes `#view-log` a flex column and gives `.log-cols` `flex:1`, so both
  wrappers carry explicit `display:flex;flex-direction:column;flex:1;min-height:0` pass-through
  rules. Without them the columns collapse to content height and the pinned rest timer scrolls
  away — the one thing that layout exists to prevent.

- **Programs and plan documents share ONE store, split at render time.** `wt_plans` still holds
  both; Log › Program filters with `planIsProgram()` and Plans filters on `type==='html'`.
  There is deliberately **no migration** — verified that opening every screen and every entry
  point leaves `wt_plans`, `wt_split` and `wt_sessions` byte-identical. The retired streak's
  `streak` field is still stored and simply never read; deleting it would be a migration.
  Selection in each view (`logProgSel`, `plansDocSel`) is IN-MEMORY on purpose: picking a
  program to look at must not write to a synced store.

- **Weekly Review is `wkr-`, NOT `wr-`, and that is not a typo.** `.wr-row`, `.wr-row-l`,
  `.wr-row-v`, `.wr-row-none`, `.wr-row-u` and `.wr-chip*` already belong to Home's **Week in
  review** card (`buildWeekSummaryCard()`, styled in `kitchen-extras.css`). `css/review.css`
  loads after that, so the feature's first draft — namespaced `wr-` for "weekly review" —
  silently restyled that card's rows. Third instance of the same fault after `.set-row` and
  `.empty`. The whole feature (CSS classes AND the ~100 JS identifiers) is `wkr`/`WKR_` so one
  grep finds all of it. `renderWeekReviewCard()` is unrelated DEAD code, left in place — Home
  renders `buildWeekSummaryCard()`, which is where the review nudge actually lives.

- **Weekly Review never recomputes money, and a completed review is frozen.** Three rules:
  1. It reads through the canonical Finance readers only — `statsWeekParts()`, `weekIncome()`/
     `weekIncomeKeys()`, `varCatAmount()`, `weekSavedAmt()`, `weekLeftover()` — and writes to
     none of them. The group split is a PARTITION of `statsWeekParts()`: `fixedBills` **is**
     the fixed half (it owns no category list; "all canonical fixed expenses" is its
     definition), the three named variable groups own explicit variable category IDs, and
     `other` is whatever variable category is left. That is why the section reconciles with
     Budget and Stats → Finance by construction, whatever the user maps where — do not give
     `fixedBills` its own category list, and do not let a category land in two groups.
  2. Completing writes `planSnapshot` (the plan as it stood) and `actualSnapshot` (the whole
     DISPLAY model, not just totals — `money`, `cardTxns`, `upcoming`), so a completed review
     redraws itself exactly as completed. `wkrEffectivePlan()` and `wkrDisplayActuals()` are the
     only two functions that decide frozen-vs-live; every section goes through them, or the
     Money figures and the facts quoted beside the reflection questions could describe
     different versions of the week. Changing the plan later cannot touch a completed review;
     when Budget moves underneath one, `wkrActualsDrifted()` shows a banner offering the
     explicit `wkrRefreshActuals()` — which re-takes the ACTUALS ONLY and deliberately leaves
     `planSnapshot` alone. Nothing is ever rewritten silently.
  3. It is opt-in and writes nothing at boot. `daily_review_plan` and `daily_reviews` stay
     absent until the user presses a button in setup — the suggested template (Francois's real
     numbers) is rendered as visible, editable text and is NOT a default. Never seed it from
     onboarding or a migration; that is the `_bootPhase` trap in AGENTS.md.
  `wkrCurrentWeek()` PINS its choice into `wkrUI.week`, because the fallback is "the newest
  finished week still awaiting a review" — without the pin, completing a review changed what
  the function answered and the screen jumped off the week just completed.
- **Settings' desktop landing is master–detail, and the split point is 1180px — not 1024.**
  `.stg-workspace` is `340px minmax(0,1fr)` with a 22px gap inside a 1240px `.settings-main`;
  the profile card spans both panes above it. Below 1180 (and on mobile) the workspace is a
  plain block: one column at a 760px measure, and each item pushes the same full-screen
  `#view-settings-detail` overlay it always did. 1180 is chosen, not inherited from the app's
  1024px desktop line, because the 260px sidebar leaves the pane narrower than the phone
  measure these forms were drawn at — a cramped pane is worse than a clean full-screen push.
  **The same number lives in `STG_SPLIT_MIN` (js/app.js) and an `@media` in `css/settings.css`;
  they must agree**, because `stgSplit()` picks the mount target and the CSS decides whether
  the pane is visible at all. `openSettingsSection()` moves the SAME section element into
  `#stg-detail-body` (split) or `#settings-detail-content` (overlay) — one code path, two
  targets — and a `resize` listener re-mounts it when the window crosses the boundary,
  or the section is stranded in a `display:none` container.
  The left pane is ONE surface (`#stg-list-root:not(.is-search)` carries the card; the four
  `.stg-group`s inside it drop their own background/border and are separated by dividers), so
  every row is the same width. The selected row gets an accent tint plus a `::before` bar and
  loses its chevron; mobile keeps the chevron. `.is-search` is toggled by `renderSettingsList()`
  to drop that surface while results are showing, or the results card is framed inside a card.
  The pane is never blank: `renderSettingsOverview()` fills it from `SETTINGS_OVERVIEW_KEYS`
  using the same registry summaries the nav rows show. It bails out early when a section is
  mounted — the sections are MOVED, not rebuilt, so an `innerHTML` wipe would not come back.
  **Do not go back to the two-column group grid.** It was tried and is worse than the single
  column it replaced: the groups hold 2/3/3/2 rows, so no two cards lined up, the same row was
  a different width depending on its column, and the bottom half of the page sat empty. Equal
  forced heights just move that space inside Personal and Data and support; four columns
  cramps the rows; masonry keeps the uneven heights; and a row stretched past ~1000px puts its
  label and chevron absurdly far apart. Training setup, Budget setup and Run setup again stay
  full-screen overlays even in split mode — they are collection editors with their own top-bar
  Save, and they are not in `SETTINGS_SECTION_KEYS`.

- **iOS cold-launch layout glitch**: `100dvh` mis-computes at cold launch on iOS standalone
  PWAs (black gap / shifted content until a rotation). Fixed by giving `#app` a
  `position:fixed; inset:0` shell instead of `100dvh`. Don't reintroduce `dvh` sizing on the
  app shell.
- **Status bar**: `apple-mobile-web-app-status-bar-style` is deliberately `"black"` (opaque),
  not `"black-translucent"` — translucent forces white status-bar icons in every theme
  (unreadable in light mode) and previously caused the safe-area value to race on cold launch.
  `theme-color` is kept in sync with the live `--bg` at runtime via `applyTheme()` in
  `js/app.js`. If a screen's top spacing looks off, check whether it's still adding
  `env(safe-area-inset-top)` padding that the opaque bar has already reserved —
  `#app-header` in `css/layout.css` is the reference implementation that got this right;
  several other sticky sub-headers hadn't been brought in line as of 2026-07-21.
- **`#app-main>section` does NOT reach the four paged tabs.** Home, Log, Stats and Budget are
  `.swipe-panel` elements inside `#swipe-deck`. On desktop `#swipe-deck` is `display:contents`,
  which flattens them for *layout* but not for *selector matching* — they are still not direct
  children of `#app-main`. That selector only ever styles the overlay views (Kitchen, Settings,
  Plans, Notes). Anything meant to apply to every screen needs both selectors; this is how the
  two halves silently drifted apart before (see the desktop width cap in `budget-home.css`).
- **Home's desktop layout is TWO fixed columns — `1fr 1fr`, with `align-items:stretch`.** This
  is the long-standing design and what Home is supposed to look like; treat it as the baseline,
  not as one option among several. `#view-home .home-grid-cols` is
  `display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;align-items:stretch`, and
  `.home-card-wide{grid-column:1/-1}` lets any individual card span the full width — that is a
  saved per-card user preference (`homeLayout().wide`, Settings → Home Layout), not a hardcoded
  list of ids.
  **Do not make the column count derive from viewport width.** `repeat(auto-fit,minmax(…,1fr))`
  was tried and is wrong twice over: it produces a third column on a wide external monitor
  (cluttered), and the app is normally used on a 13–16" laptop where that width never exists
  anyway. Two columns at every desktop width.
  **`align-items:stretch` is load-bearing — it is what removes the gap BETWEEN rows.** Both
  cards in a row share the taller one's height, so the next row starts flush instead of after a
  strip of background under the shorter card. The cost is that the shorter card of a pair
  carries the height difference as internal space; that is the accepted trade, and it stays
  small precisely BECAUSE there are only two columns (with three or four, one tall card dwarfs
  its row partners and the internal space becomes the bigger problem).
  Four different attempts to remove that internal space by forcing a uniform card height have
  all been reverted, each worse than what it replaced: a fixed `min-height` floor; a
  `grid-auto-rows` row-quantisation scheme at 210px then 250px (any card whose content landed
  just past a row boundary was rounded up a whole row — up to ~220px of dead space inside a
  single card); a `minmax` multi-column grid with `align-items:start` (fixed the internal space
  but reintroduced the between-rows gap, which is the more visible problem); and a fine-grained
  masonry via `grid-auto-flow:dense` with per-card measured spans (reduced the gap without
  eliminating it, and introduced a real overlap bug — the weather card's live reading arrives
  asynchronously AFTER its span was measured, so the card outgrew its reserved grid area and
  bled into the card below, since `align-items:start` does not clip a card to its box).
  Single column was also tried once, in error, and rejected immediately — it was never asked
  for. If the internal space in a short card ever needs addressing, the fix is to that card's
  own content, not to the grid.
  `HOME_CAPPABLE` in `applyHomeCardCaps()` (`js/app.js`) separately caps the genuinely UNBOUNDED
  list cards (habits/notes/recent) at a flat 280px `max-height` with a "Show all" toggle, so one
  very long list can't blow out its whole row. That is unrelated to the column/height history
  above and was never in question.
- **One width cap for every view**, `max-width:2200px` on `#app-main>section,#app-main
  .swipe-panel` (see the note above about those being disjoint selector halves). Do not add a
  per-view override — a 1180/1760 split existed briefly and letterboxed every tab except Home.
- **`HOME_DEFAULT_WIDE` is a seed, not a setting.** `homeLayout()` applies it only while the
  stored layout has no `wide` array, and `saveHomeOrder()` writes the whole object back — so
  the first drag freezes the current seed into storage permanently. Changing the constant
  reaches new and untouched installs only; existing users need a one-time migration guarded on
  the exact old value (`migrateDefaultWideOnce`, modelled on `migrateRetiredAccentOnce`).
- **Sub-10px type is deliberate, not a bug.** Every `font-size` below 10px in the codebase is
  inside a miniature mock-up — the Settings → Home Layout preview thumbnails (`.hl-*`) or the
  onboarding mini screens (`.ob-mini-*`). They are scaled-down replicas of real cards. Don't
  "fix" them to a legibility floor; check what they belong to first.
- **Roughly half the app's typography is inline in JS**, not in the stylesheets — `js/app.js`
  and `index.html` carry ~420 `font-size` declarations between them against ~420 in all six CSS
  files. A CSS-only type-scale sweep would therefore make the app *less* consistent, not more.
- **`BUD_CARDS` is the single source for the Budget week's card order, in BOTH layout modes**
  (`js/app.js`, beside `budApplyLayout`). One ordered list of `{id, col}`: `col` picks the
  desktop column, and MOBILE is simply that order top to bottom. `BUD_LAYOUT` is derived from
  it and keeps its name so existing readers work. Adding a Budget card means adding ONE line.
  It used to be two hand-maintained lists, which is how `bud-setup-card` ended up named in the
  mobile plan and in NEITHER desktop column — `budApplyLayout()` only `appendChild()`s the ids
  it is given and appending MOVES a node, so every other card was appended past the setup card
  and it was stranded first in the left column, above Income. Invisible in normal use, because
  `renderBudgetSetupCard()` returns `''` once the week has any income.
  Current order (2026-09-05): **mobile** is action-first — Setup, Record spending, Weekly
  result, Until next pay, Income, Savings, Fixed, Upcoming, Spending goal, Variable, Day by day,
  Previous weeks, Calculator, Stranded data. **Desktop** is plan-left / action-right: left is
  Setup → Income → Savings → Fixed → Upcoming → Spending goal → Variable → Day by day (the long
  Variable card lives here and is what makes the page tall), right is Record spending → Weekly
  result → Until next pay → Previous weeks → Calculator → Stranded data. Two things this
  restored: the two verdict cards are adjacent again, and the spending goal sits directly above
  the card it caps. **Source order in `index.html` is NOT render order** — read `BUD_CARDS`.
  `budApplyLayout()`'s no-op guard is load-bearing: it compares the column's current children
  against the wanted list and returns early when they match, because re-appending a node that is
  already in place still detaches and re-inserts it, which drops focus out of a budget input
  mid-typing. Keep that check.
- **Budget card collapse state is keyed by `data-bud-key`**, not by card index (it was
  index-based, which mis-applied the saved state whenever the card count changed — the due
  banner and previous-weeks list render `.card`s conditionally). Any new card in
  `#budget-week-view` that should remember its collapsed state needs that attribute.
- **Three separate collapse/expand systems exist side by side**: generic `.card.collapsed` +
  `.card-collapse-header/body`, `.ex-card.collapsed` (a fully separate ruleset in
  `workout.css`), and `.bud-collapsed`/`.bud-toggle` (budget-only, different naming
  entirely). Know which one a given screen uses — they don't share logic, and merging them
  is a bigger job than it looks.
- **`js/app.js` builds some class names via string concatenation** (e.g. the Kitchen
  recipe-tile card: `` `kit-card kit-c-${category}${sel}` ``). Grep for both the literal class
  name and for concatenation patterns before renaming or removing any CSS class — a plain
  find-replace can miss these.
- **Card and button CSS grew one class per feature area**, not from a shared base — expect
  near-duplicate patterns (e.g. multiple independent "hero card" implementations with slightly
  different padding/gradient values) rather than one canonical definition per component type.
- **There is ONE segmented control, `.seg-tabs`** (`css/workout.css`), and the five it replaced
  must not come back: `.stats-tab-row`/`.stats-tab-btn`, `.log-tab-row`/`.log-tab-btn`,
  `.nut-tabs`/`.nut-tab`, `.kit-subnav`/`.kit-subnav-btn` and Budget's inline-styled
  `.sub-toggle`. No two of them agreed on radius, padding, gap, type or the selected treatment.
  Anatomy: `.seg-tabs` (the track) + `.seg-fill` (buttons fill it — Log, Nutrition, Kitchen,
  Budget) or `.seg-scroll` (buttons scroll — Stats' six do not fit a phone), and the selected
  button carries **`.on`**, the same class `.stats-seg` and `.wkr-tabs` already used. Selection
  is FILL plus WEIGHT, never an accent tint: the default accent is a neutral grey that is
  indistinguishable from the track at low alpha. In JS, `segSetOn(btn, on)` writes the class and
  `aria-selected` together, and `segScrollToTab(row, btn)` is the ONE scroll-into-view helper.
  Three things about it are load-bearing:
  - **Never `scrollIntoView()`.** It walks every scrollable ancestor, and `#view-log` is a
    `.swipe-panel` inside the transformed `#swipe-deck` — it used to shove the deck sideways and
    expose bare background. `segScrollToTab` nudges the strip's own `scrollLeft` by a measured
    RECT offset (rect, not `offsetLeft`: `.seg-tabs` is `position:static`, so `offsetLeft` is
    measured from `#app` and is wildly wrong).
  - **The track is opaque by construction**, because it is `position:sticky` at every width and
    `var(--border)` is an `rgba()` in both themes. The tint is composited over `--bg`
    (`linear-gradient(var(--border),var(--border)),var(--bg)`), which renders identically to
    the old translucent fill but cannot be seen through. That is the ghosting bug the Budget
    toggle hit, now impossible rather than patched.
  - **The bleed is ONE box-shadow, not a `::before`.** `.seg-scroll` sets `overflow-x`, which
    would clip a pseudo-element; a box-shadow affects neither layout nor scrollable overflow so
    it cannot produce a scrollbar. Grown by `--seg-bleed` on every side then offset UP by it, it
    covers both side gutters and the band above the track while stopping at the track's bottom
    edge, leaving the margin below clear. `--seg-bleed` is the SCROLL CONTAINER's own padding
    (16px phone, 14px landscape, **0 on desktop** — there `#app-main` is the scroller and has no
    padding, and the track is capped at 760px well inside the content width, where painting a
    `--bg` curtain across the rest would hide cards as they scroll up).
  - **Desktop: `max-width:760px; margin-left:0`.** The Stats strip used to be `margin:0 auto`,
    so it floated at the middle of a 2200px canvas while the week selector, the section pills
    and both card columns began at the left content edge — the only element on the page off that
    line. 760 is not new; it is the cap Log and Stats already chose.
  Budget's landscape-phone layout is the one screen with extra rules: the toggle keeps its exact
  `--bud-switch-h` height (`.bud-compact-nav` sticks below it and offsets against that number)
  and a `::before` backdrop, because two sticky strips stacking with a 6px gap between them is
  a case the shared bleed does not cover.
- **The uppercase micro-label scale is THREE steps, each with a different job.** Nine
  near-identical eyebrow treatments existed at 9 / 9.5 / 10 / 10.5 / 11px, weights 600–800,
  tracking .04–.12em, across three colour tokens — two of them in the same card on Stats ›
  Review ("SPENDING" at 11/700/.06em beside "TOTAL SPENT" at 12/800/.04em).
  | step | value | job |
  |---|---|---|
  | section / card eyebrow | `11px / 700 / .06em / var(--text-2)` | the label above a card or a group of cards |
  | sub-label | `10px / 700 / .06em / var(--muted)` | a label INSIDE a card: a totals row, a split cell, a field |
  | hero eyebrow | `10px / 800 / .1em / rgba(255,255,255,.72)` | white-on-accent, on a hero surface only |
  Canonical for step 1 is `.card-label` / `.sec-label` (`css/kitchen-extras.css`), unchanged.
  Aliased to step 1: `.stats-kicker`, `.stats-sec-label`, `.wkr-sec-divider` (keeps its `::after`
  hairline), `.nut-section-label`, `.jrn-month`, `.jrn-ed-kind`, `.jrn-loops-ttl`. To step 2:
  `.wkr-total-l`, `.card-split-l`, `.mt-lbl`, `.jrn-ed-lbl`, `.wkr-opp-n`. To step 3:
  `.lg-hero-lead`, `.nut-kcal-label`, `.budget-hero-week-label`, `.budget-hero-income-label`,
  `.budget-hero-stat-label`, `.kitchen-hero-card .card-label`, and `.log-strip-label` (which
  takes the size/weight/tracking but keeps `var(--text-2)`, because it sits on a tinted strip on
  `--bg`, not on a white-text hero). `.jrn-month` also keeps its own per-theme colour overrides
  further down `journal.css`; only its type is shared.
  **Do not sweep beyond that list.** Every `font-size` below 10px inside `.hl-*` (Settings →
  Home Layout thumbnails) and `.ob-mini-*` / `.ob-pv-*` (onboarding mini screens) is a
  deliberate scaled-down replica, and the dense recipe/pantry labels (`.kit-pchip-def`,
  `.kit-step-who`, `.kit-po-def`, `.kitpantry-*`) are a different component at a different
  density. Roughly half the app's type is declared inline in `js/app.js` and `index.html`
  (~420 declarations against ~420 in all CSS), so a blind CSS-only sweep makes the app LESS
  consistent, not more — the eyebrow is one of the few cases that is almost entirely in CSS,
  which is exactly why it is the one that got done.
- **One secondary-action treatment on a card header: `.card-hd-act`** (12px/700,
  `--accent-text`). `.lg-card-act` (12px/800) is retired — the Log hub's headers are
  `cardHeader()` now. `.stats-inline-link` SHARES the `.card-hd-act` rule and keeps only its
  underline, which is what makes it read as a link when it sits in body flow instead of on a
  header row. `.rev-act` stays separate on purpose: it is a real button in a row of buttons, a
  different component.
- **There IS now a shared card vocabulary — use it for new cards** (`css/kitchen-extras.css`,
  which loads last so it wins ties). Anatomy, top to bottom: `.card-hd` (with `.card-hd-l`,
  `.card-hd-ico`, `.card-hd-act`) → `.card-fig` + `.card-fig-u` (ONE primary number per card)
  → `.card-shape` → `.card-cap`. Plus `.card-bar`/`.card-bar-fill`/`.card-bar-pace` for
  progress with a pace marker, and `.card-split` for the two-or-three-up-with-divider pattern.
  In JS, build headers with `cardHeader(icon, label, rightHtml)` and icons from `CARD_ICONS`
  via `cardIcon(name)` — do not hand-roll another inline `11px/uppercase` header.
  `sparkline(vals, {target, height})` renders an inline-SVG trend line (no Chart.js needed for
  in-card shapes) — but note it has **no callers** as of 2026-09-05: Home's weight card was the
  last, and it now shows the three most recent readings via `statsSplit()` instead (see below).
  `.card-shape`, its intended slot, is still used by five other cards.
- **Every magnitude bar and progress meter is SQUARE, from one token.** `--radius-bar: 0`
  (`css/base.css`). Every track+fill pair in the app reads it: `.month-spend-strip` /
  `-track` / `-fill`, `.card-bar` / `.card-bar-fill`, `.hero-progress-track` / `-fill`,
  `.wkr-pv-track` / `-fill`, `.kit-cook-progress-bar` / `-fill`, `.status-bar-wrap` / `-fill`,
  `.bud-day-bar` / `-fill`, `.budget-hero-bar-wrap` / `-fill`, `.vg-bar-wrap` / `-fill`,
  `.ldh-bar` / `-fill`, `#pbar-wrap` / `#pbar`, and `.hl-bar` (the Home-Layout preview's
  miniature of `.card-bar`). They were at 5 / 4 / 3 / 2px, which on an 8px bar is a full pill,
  and squaring one would have made it the odd one out — so the value moved into a token and
  every bar reads it. **Two deliberate exclusions:** `.card-bar-pace` keeps its own 1px (it is a
  2px marker, not a bar), and `.nut-progress` was left rounded on instruction — it is the one
  remaining rounded progress bar in the app, and it is inconsistent. Pills on CONTROLS
  (`.nw-chart-series` chips, `.tstat`, `.muscle-pill`) and shaped chart COLUMNS
  (`.bills-col-bar`, `.cw-bar`) are not bars and keep their radii.
- **Emoji do not belong in card CHROME** — they ignore `currentColor`, so they can't follow the
  theme or the accent, and they render differently per OS. Use `CARD_ICONS`. Emoji the *user*
  typed (note titles, recipe names, `sub.emoji`) are content and must be left alone — and note
  `catDisplayName()` exists specifically to strip a legacy emoji prefix off stored category
  names, so never bulk find-and-replace emoji.
- **Accent means "press this".** Only the session hero (`.hero-workout-card`) carries the
  full-strength accent gradient. Cards that need to signal good/bad use SEMANTIC colour
  (`--positive` / amber / `--danger`), because the accent can be any hue at runtime and a
  colour pairing that works for one accent won't for another. The weather card is the one
  scene-gradient exception.
- **Home's weight card shows the LAST THREE READINGS, not a sparkline.** `buildWeightGoalCard()`
  ends in `statsSplit()` — the shared `.card-split` vocabulary, oldest to newest, so the eye runs
  left to right into today. Deliberately NOT `.lg-weight-recent` / `.lg-weight-reading`: those
  belong to the Log hub's own vocabulary in `css/workout.css`, and Home uses the shared
  components. **Never padded to three**: two readings render two cells, one renders one, none
  hits the existing "Log your weight to start tracking" empty state. A row of em dashes reads as
  broken rather than as "not enough history". Nothing was lost with the sparkline — its target
  line is already stated in words in `.card-cap` ("6.6 kg to go") and its trend is already
  judged by the On pace / Behind pace pill in the header; both stay.
- **Home cards must not restate a number another card already shows.** The Week in Review card
  was three-quarters duplicate (its Workouts cell recomputed the streak card's figure exactly),
  which is what made Home feel busy without being informative. It now shows week-over-week
  DELTAS instead — a delta is not a duplicate. Before adding a figure to a card, check whether
  another widget already shows it.
- **Every Home card needs a real empty state**, and delta/trend UI must not treat missing data
  as zero (the review chips read "no last week" rather than inventing an improvement; the
  calorie strip hides itself under three logged days rather than drawing a chart of gaps).
- **Specific hero-card gotchas** confirmed while consolidating these (2026-07-21, see
  `Prompts/08-*`): `.card.hero-card` (Home) is a NEUTRAL card, not an accent one — its
  background is `var(--card)`, so don't assume every "hero" class wants white text.
  `.log-day-hero-card`'s gradient/shadow are set INLINE per-training-day in `js/app.js`
  (~line 1979), not in CSS — a fixed CSS gradient there would fight the dynamic day-colour
  system. The Budget tab's actual weekly hero card (the one Francois sees every week) is
  `#budget-hero-card` — an ID with inline styles in `index.html` — NOT the `.budget-hero-card`
  class; that class is only used by the onboarding mini-hero / Settings → Appearance theme
  preview. A CSS-only consolidation can't reach the real one without touching markup.

## Workflow

- Francois is not a developer. He runs prompts from the `Prompts/` folder
  (`NN-MODEL-slug.md`, numbered sequentially, tagged with the model it's meant for) through
  Claude Code himself. That folder is both the changelog of every past session and the format
  to match for new prompts: codebase context → spec (with exact code where possible) →
  a numbered verification checklist he can eyeball on his phone.
- Single git repo, deployed via GitHub Pages from `main`.
