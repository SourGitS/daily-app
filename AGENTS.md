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
- Entry point `index.html`. Styles split into six files, loaded in this order (cascade order
  matters, don't reorder the `<link>` tags): `css/base.css`, `css/layout.css`, `css/workout.css`,
  `css/nutrition-modals.css`, `css/budget-home.css`, `css/kitchen-extras.css`. Split from one
  `style.css` partway through the project (commit `52f32d0`).
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
- **Settings** — dark/light theme (warm gray dark palette, deliberately not pure black), personal
  info + Mifflin-St Jeor TDEE calculator (Bulk/Maintain/Cut), daily calorie log with midnight
  reset, dynamic per-muscle-group day colours, full data backup export/import, Home Layout
  widget toggles.

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
  Codex himself. That folder is both the changelog of every past session and the format
  to match for new prompts: codebase context → spec (with exact code where possible) →
  a numbered verification checklist he can eyeball on his phone.
- Single git repo, deployed via GitHub Pages from `main`.
