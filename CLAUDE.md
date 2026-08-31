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
- Entry point `index.html`. Styles split into **eight** files, loaded in this order (cascade
  order matters, don't reorder the `<link>` tags): `css/base.css`, `css/layout.css`,
  `css/workout.css`, `css/nutrition-modals.css`, `css/budget-home.css`,
  `css/kitchen-extras.css`, `css/journal.css`, `css/settings.css`. The first six were split
  from one `style.css` partway through the project (commit `52f32d0`); journal and settings
  were added later and load last *so they win ties* — that is the point of their position.
- All logic in one `js/app.js` (~10,000 lines).
- PWA: `manifest.json` + `service-worker.js`, installable to iOS/Android home screen,
  `display: standalone`.
- Optional cross-device sync: Firebase Realtime Database + Google Auth. localStorage is the
  source of truth; Firebase mirrors it when signed in.
- Chart.js (cdnjs), Tabler Icons (jsdelivr), Google Fonts — Manrope (UI) + Space Grotesk
  (numerals/wordmark).

## Navigation (restructured many times over the project's life — this is current as of 2026-07-21)

- **Mobile bottom nav** (`#bottom-nav`, 4 fixed tabs): Home, Budget, Log, Stats.
- **Mobile hamburger menu** (`#side-menu`, list populated dynamically in JS): Kitchen, Accounts,
  Plans, Notes, Exercise Library, Settings.
- **Desktop** (`#desktop-sidebar`, ≥1024px): all of the above as one persistent left sidebar,
  plus an inline quick-settings popover instead of a separate Settings screen.

## What's in each area

- **Home** — dashboard of widget cards, each independently show/hideable via
  Settings → Home Layout. Today's session hero, weekly budget snapshot, calorie card,
  savings/CC balance, notes bubble, habits.
- **Log** (was "Train") — workout logging. Training split type is user-editable, not hardcoded
  to a fixed split. Log sets (weight/reps, warmup toggle, ± sign for negative-load exercises),
  swap an exercise from the library mid-session, exercise library management (custom
  exercises/groups, assisted/negative toggle per exercise), drag-to-reorder, done-check with
  auto-collapse, per-day session notes, rest timer (sticky bar + fullscreen, timestamp-based so
  it keeps correct time if the phone locks or the app backgrounds), session timer, optional
  effort rating (Easy/Moderate/Hard/Brutal), optional hours-worked tracking.
- **Stats** — Overview + History / Training / Body / Nutrition / Finance sub-tabs. Per-exercise
  history view, swap-aware personal records, progress charts, 8-week consistency grid,
  body-weight log/chart, budget charts.
- **Kitchen** — Recipe Book (9 preloaded + custom), Shopping List (from recipes + pantry
  staples), Spice & Pantry Tracker, cooking mode with per-step timers, favourites/recently
  cooked. Firebase-synced.
- **Budget** — weekly tracker. Income sources, savings target, and fixed/variable categories are
  all user-configurable now — see "Known history" below, these used to be hardcoded to
  Francois's specific numbers and were deliberately made dynamic. Credit-card balance tracking,
  comprehensive 8-section CSV export, collapsible sections, monthly/yearly charts. A weekly
  **spending goal** card sits between Fixed and Variable (a self-imposed cap on variable
  spending, distinct from "money left over"): the goal input is behind the card's Edit button
  (`budEditMode.vargoal`, same convention as the other budget cards), the usual goal is
  `budDefaults.varGoal`, and each week stores the goal that applied to it as `var_goal` so past
  weeks aren't rewritten later.
- **Accounts** — net-worth tracking across accounts; added after Budget, migrated from the old
  savings/CC logs. An asset can be flagged `saver:true` ("Savers account"): it still counts in
  net worth but is excluded from the **debt payoff position** card
  (`(assets − savers) − debts`), which answers "am I covered" rather than "what am I worth".
- **Plans** — import/export, streak tracking, plus an "HTML plan" type (import any HTML file,
  view it in a sandboxed iframe).
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
--font-ui: 'Manrope'   --font-num: 'Space Grotesk'
--accent: #5C5C5C neutral slate (--accent-rgb for rgba() use)   --accent-text
--positive / --success: #52B788   --danger: #E74C3C   --purple: #6366f1
--bg / --card / --card-border / --card-top / --text / --text-2 / --text-3 / --muted / --border
```

Light values live in `:root` as defaults; `[data-theme="dark"]` overrides colour tokens only
(dark `--bg: #080808`, `--card` becomes a translucent white gradient "glass" look — never a
pure-black card surface).

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
- **There IS now a shared card vocabulary — use it for new cards** (`css/kitchen-extras.css`,
  which loads last so it wins ties). Anatomy, top to bottom: `.card-hd` (with `.card-hd-l`,
  `.card-hd-ico`, `.card-hd-act`) → `.card-fig` + `.card-fig-u` (ONE primary number per card)
  → `.card-shape` → `.card-cap`. Plus `.card-bar`/`.card-bar-fill`/`.card-bar-pace` for
  progress with a pace marker, and `.card-split` for the two-or-three-up-with-divider pattern.
  In JS, build headers with `cardHeader(icon, label, rightHtml)` and icons from `CARD_ICONS`
  via `cardIcon(name)` — do not hand-roll another inline `11px/uppercase` header.
  `sparkline(vals, {target, height})` renders an inline-SVG trend line (no Chart.js needed for
  in-card shapes).
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
