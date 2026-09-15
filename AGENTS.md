# Daily — Agent Handoff

Technical reference for a coding agent (Codex/ChatGPT or otherwise) picking up this repo.
Factual as of 2026-09-01. This doc replaces an earlier copy that duplicated `CLAUDE.md`
almost verbatim — if you find `CLAUDE.md` still present, treat it as the longer-form design
history/rationale doc and this file as the safety-critical operating reference. Where they
disagree, re-grep the code; both files have gone stale before.

## What the app is

"Daily" — Francois Peters's personal lifestyle web app. Single user in practice (one Google
account signs in), no multi-tenant concerns beyond what the Firebase rules already enforce.
Four main areas plus supporting screens:

- **Home** — dashboard of independently show/hideable widget cards (session hero, budget
  snapshot, calorie ring, net worth, notes, habits, etc.)
- **Log** — the workout hub: four sections behind one sub-tab strip (Today / Splits /
  Exercises / History). **Today is a training BRIEFING** — a state-aware hero, Today's plan (or
  Up next), Last 7 days and Recent sessions — and it opens the set logger from there.
  `logTodayBrief()` is the ONE canonical training-state reader behind it, shared with Home's
  session hero. Splits is the current split and a compact collection to preview and choose from;
  Exercises and History
  are the screens that used to be a separate tab and two full-screen overlays. Body weight is
  NOT in Log — it lives in Stats › Body, Home's weight card and the post-save prompt. See the
  Workout hub notes below and `CLAUDE.md` for the traps.
- **Stats** — overview/review/training/body/nutrition/finance sub-tabs, charts, PRs.
- **Food** — one destination for what is eaten, cooked, bought and held: Today (a recipe-first
  overview whose chooser is the screen's accent hero since v347, with the existing food log as a
  secondary screen),
  Recipes, Shopping, Pantry, plus Food library and Nutrition Review as supporting screens.
  This is the former **Kitchen** and **Nutrition** tabs merged (v321) — see the Food hub
  section below before touching navigation, and note that `nut*`/`kit*` functions, DOM ids and
  storage keys all kept their names.
- **Finance** (internal view id `budget`) — five views: **Overview** (the landing screen: what
  is available this week, what needs attention, what is due over the next fortnight, the
  accounts position and the month so far), Week, **Plan**, Bills and **Accounts**. Plan keeps
  This month's recorded facts together with a Year-ahead schedule of dated recurring bills and
  the existing Year-so-far actuals; it must never present income, balances or everyday spending
  as a forecast.
  `BUD_VIEWS` in `js/app.js` is the single source for which views exist — id, tab button,
  panel, nav row and renderer. Weekly income/expense tracking, CSV export, charts.
  The DESTINATION is named Finance; the budgeting CONCEPT is still called the budget. The view
  id, the `bud*` prefixes, the DOM ids, the storage keys and the `#budget` route are unchanged.
- **Accounts** — net worth / debt payoff tracking. A FINANCE VIEW since v329, not an overlay.
  Since v347 it uses the same desktop canvas the other Finance views use (see below).
- **Plans**, **Notes**, **Settings** — secondary screens (see `CLAUDE.md` for full detail per
  area if you need it; not reproduced here). Plans holds imported HTML plan DOCUMENTS only —
  saved workout splits live in Log › Splits.

## Sidebar navigation

- `NAV_QUICK` and `NAV_TREE` remain the shared source for desktop and the mobile hamburger.
  Quick access keeps Home, Finance, Log, Food, Stats and Settings. Groups are Today, Log,
  Finance, Food, Stats and More; the renamed Log/Finance groups retain IDs `training`/`money`
  so existing `daily_nav_ui` expansion preferences survive. Only a header press toggles a
  group. Navigation and boot neither expand groups nor persist new defaults.
- Finance children follow **Overview · Week · Plan · Bills · Accounts**. The single
  **Weekly review** row (`wkr`, `stats/review`) now belongs to Stats after Overview. Today keeps
  Today's session and Food log; Log keeps Splits (`program`), Exercises and History. Food
  library, Nutrition Review, Journal/Notes, Plans and Daily AI remain reachable. Routing,
  aliases and selected states still come from the existing readers and dispatch helpers.
- Desktop styling starts at 1024px and keeps the 260px width and brand size. Quick access has
  a subtle selected fill; an indented selected child has text emphasis and a small dot, without
  another filled pill. `#ds-nav` contains opaque non-shrinking quick access and a separate
  `.nv-groups` scroller with `min-height:0`; the account footer remains outside that scroller,
  with wrapping names. At heights of 460px or less, one whole-sidebar scroller replaces the
  inner scroller so no destination is stranded. Mobile styling stays separate. The footer's
  existing **Synced** / **Local only** text and all account/sync behavior remain unchanged.

## Weather refresh and Home card (v340)

- **One coordinator, one device cache.** `weatherRefresh()` owns sample-city, saved-coordinate,
  retry and explicit current-location requests. `WEATHER_FRESH_MS` remains one hour for both
  refresh eligibility and weather-driven appearance. `daily_weather_cache` stays device-local,
  excluded from backup/sync; no new store, migration or Home-layout preference was added.
- **Lifecycle checks do not rely on background timers.** `weatherEnsureFresh()` checks on
  initial use, Home entry, visible resume/pageshow and reconnection. `weatherStartLifecycle()`
  installs listeners once; its one-minute timer runs only while visible and stops on hide or
  pagehide. Fresh successful data avoids a request; otherwise each location has a five-minute
  cooldown after an automatic attempt. Forced retry and reconnecting after offline bypass that
  cooldown. With no cache, lifecycle recovery uses `S.view==='home'` plus the actual weather
  card element, not an out-of-scope layout list; explicit Home requests and weather-driven
  appearance also remain eligible. Initial failures can recover on online/resume. Repeated
  rendering must never multiply listeners or timers.
- **Requests cannot roll the card backwards.** The coordinator deduplicates a matching request;
  explicit location changes/clearing invalidate earlier generations and abort where supported.
  Fetch/location timeouts end loading, and late successes or failures are ignored. Routine
  refresh reuses saved coordinates; only an explicit location action invokes geolocation.
  An accepted geolocation result updates the in-memory `_weatherPerm` on grant or refusal, so
  Settings cannot keep saying Allowed after that request was denied. There is no manual city
  selector in the existing app; do not infer one or add a second source.
- **Failed refreshes keep the last successful reading and `fetchedAt`.** The card shows its
  update age, a discreet stale/failure/offline notice and an accessible retry. Successful data
  patches the existing weather DOM rather than rebuilding Home, preserving nearby controls and
  scroll. `observedAt` is the provider's model-valid instant, not a measured observation or the
  time of download; stale model data remains distinguishable from a newly successful fetch.
- **Forecasts are optional cache fields.** Open-Meteo returns epoch timestamps with
  `timeformat=unixtime`, timezone/offset and two days of hourly data to cover midnight. Missing
  values remain null. `weatherForecastHours()` selects up to six upcoming hours;
  `weatherForecastTime()` uses the forecast timezone (including DST), then an explicit offset,
  never the device timezone as a guess. `weatherForecastSummary()` distinguishes precipitation
  probability from forecast amounts and names rain/snow only when the WMO code supports it.
  Clear copy requires several contiguous clear hours; missing evidence means no sentence.
- **Phone composition grows naturally.** The slightly taller card reuses the existing
  condition scenes, illustration and Dashboard neighbourhood, followed by evidence copy and
  a compact inner hourly scroller. Location/details, current temperature, condition, high/low
  and freshness stay legible. It has no clipping fixed height and respects reduced motion.
  Desktop geometry and saved compact/wide placements remain intact. Settings > Weather is the
  existing details destination; there is no duplicate weather overlay.

## Onboarding, Food's hero and the Accounts canvas (v347)

- **Onboarding: the story was refreshed, the machinery was not.** `OB_CATALOGUE`, the branching
  `obSteps()`, `obCaptureCurrent()` staging, `finishOnboarding()`'s seeding guards, the
  welcome-screen restore, `isEmbeddedBrowser()` guidance, the 12s blocked-popup watchdog and the
  `_cloudWorkoutReady` / `_cloudReadFailed` gate on Finish are unchanged. **`OB_VERSION` stays at
  2** — do not bump it to re-show this.
- **Visible language is the app's current language; stored ids are frozen.** `OB_FOCUS` shows
  Log & workouts, Finance & accounts, Body & nutrition, **Food** and Habits & journal while still
  storing `training` / `budget` / `health` / **`kitchen`** / `habits`, so a replayed profile and
  the Budget setup card keep working. This is a rename, not a migration. "Kitchen" is not shown.
- **No invented data anywhere.** The welcome preview names destinations instead of printing
  figures (it used to show a fabricated "$378 left this week" and "$12.4k net worth"). Food
  collects nothing: no seeded recipe, no shopping selection, no pantry item, no logged meal, no
  calorie target. The finish's Food line states availability, not configuration, and
  `obFocusPicked()` — explicit tick required, unlike `obFocusOn()` — gates it. Stats is named as
  where progress is reviewed and has no setup form.
- **Weather is a part of Appearance, not a step.** Revealed by the Weather accent mode;
  `weatherRefresh({force:true,useCurrentLocation:true})` is still called only from the button, so
  geolocation always follows a press. No new store, provider, location source, city picker, sync
  path or history; cancellation, stale-result protection, error copy and `_weatherPerm` updates
  are untouched. Declining leaves a working app and points at Settings > Weather.
- **Only real step changes animate.** `renderObStep(dir)` slides only when `obGo()` passes a
  direction (250ms, slight opacity, no autoplay/bounce/parallax/swipe); every in-place re-render
  passes nothing. `obSlideSettle()` prevents queued or overlapping transitions. A retained
  outgoing page is stripped of all ids, `aria-hidden`, `inert` and untabbable, and is removed at
  the end — the settled DOM has exactly one interactive step. `prefers-reduced-motion: reduce`
  retains and animates nothing. `.ob-stage` clips horizontal travel only; no fixed height, no
  vertical clipping, no horizontal page overflow.
- **Food > Today's chooser is the screen's accent hero.** `.fo-chooser` dropped `.fo-card` and
  uses `--accent-hero` / `--accent-hero-2` in the scoped `fo-*` block. Every id, handler,
  `foodOverviewState` field, filter rule and the DOM-preserving refresh are unchanged; the one JS
  change is the class name. Fields and unselected chips are darkened, not whitened (white text
  measures 5.86-6.30:1 across accents); the selected chip is solid white inked in `--accent-hero`.
  The rest of the screen stays matte. `.kitchen-hero-card` is untouched.
- **Accounts takes the whole Finance canvas on desktop.** `#view-budget .accounts-wrap` is
  `max-width:none` from 1024px, so it ends on the same content edge as Overview, Week and Bills;
  the app-wide 2200px section cap is unchanged and the 760px `.bud-topnav` cap is deliberately
  left alone. `#accounts-list` becomes two columns at 1500px and three at 2000px, the add form is
  capped at 460px there, and the hero's text keeps a 720px measure — so the added width carries
  the chart and the cards rather than one very wide form row. `daily_accounts`, account ids and
  shapes, sync, history and every total are byte-identical; opening Accounts still writes nothing.

## Tech stack, hosting, structure

- Vanilla HTML/CSS/JS. **No build step, no bundler, no package.json, no npm scripts.**
- Entry point `index.html`, loads NINE CSS files in a fixed cascade order (do not reorder the
  `<link>` tags; new ones are appended, never inserted) and TWO scripts: `js/nutrition.js`
  (~340 lines — the food catalogue, the day log and the Nutrition tab) then `js/app.js`
  (~27,600 lines, everything else). Both are plain `<script defer>` in one global scope. The
  "all app logic in one file" claim in this doc was stale for a long time after nutrition.js
  was split out, and both line counts have gone stale before — `wc -l` and
  `grep rel="stylesheet" index.html` rather than trusting them.
- PWA: `manifest.json` + `service-worker.js` (cache-first fetch handler).
- External deps loaded from CDN, no local copies: Chart.js (cdnjs), Tabler Icons (jsdelivr),
  Google Fonts (Manrope + Space Grotesk), Firebase compat SDK.
- Repo: `github.com/SourGitS/daily-app` (renamed from `workout-tracker` 2026-08-09).
- **Hosting/deploy: GitHub Pages serving `main` directly.** There is no CI, no staging
  environment, no PR review gate found in this repo — pushing to `main` **is** the deploy.
  Live at `sourgits.github.io/daily-app`.
- **Run locally**: no dev server config exists. Serve the folder statically (e.g.
  `npx serve .` or `python -m http.server`) and open `index.html` — anything that serves
  static files over HTTP works; `file://` will break the service worker and Firebase auth
  popup origin checks.

## Firebase

Config lives in plaintext at the top of `js/app.js` (lines ~4–13) — this is normal for a
Firebase **web** client key (it's not a secret; access control is enforced by the database
rules below, not by hiding this value). Project: `workout-tracker-5dd55`.

- **Auth**: Google Sign-In only, via `firebase.auth.GoogleAuthProvider()` and
  `signInWithPopup` (not redirect) — see `handleAuth()` at `js/app.js:31`.
- **Database**: Firebase Realtime Database (not Firestore). Root ref pattern is
  `users/<uid>/<path>`.
- **Storage**: no Firebase Storage usage found — recipe/profile images etc. are not
  file-uploaded anywhere in this codebase.
- **Security rules** (`database.rules.json`, deployed via `firebase.json` /
  `firebase deploy --only database` — Firebase CLI, not part of the GitHub Pages deploy):
  ```json
  {
    "rules": {
      ".read": false,
      ".write": false,
      "users": {
        "$uid": {
          ".read": "auth != null && auth.uid === $uid",
          ".write": "auth != null && auth.uid === $uid"
        }
      }
    }
  }
  ```
  Each user can only read/write their own `users/<uid>` subtree. If you change these rules,
  they must be deployed separately with the Firebase CLI — editing the JSON file alone does
  nothing to the live database.
- **Data model**: `localStorage` is the source of truth on-device; Firebase mirrors it only
  when signed in. Two sync mechanisms coexist:
  - **Keyed collections** (sessions, weights, savings log) — synced item-by-item under their
    own Firebase path, keyed by id/date.
  - **Blob stores** (most simple settings: budget data, profile, personal info, habits,
    budget defaults, exercise library, training split, kitchen data, etc.) — synced as a
    `{v: <JSON string>, t: <ms timestamp>}` envelope under `users/<uid>/<path>`, compared by
    timestamp. Registered dynamically in `SYNC_BLOB_REG` (`js/app.js:149`) as each store's
    listener attaches — **do not hardcode a second list of sync paths anywhere**; a store
    that isn't in `SYNC_BLOB_REG` will sync fine day-to-day but silently be skipped by a full
    restore (`restorePushToCloud()`, `js/app.js:5163`).
  - Newer-timestamp-wins is the general conflict rule. Budget week data instead **merges**
    per-week (`mergeBudgetWeeks()`, `js/app.js:92`) since weeks are never deleted, so a union
    is safe and a stale device can't wipe a different week than the one it touched.
  - **Weekly Review** adds two stores, and they use the two different mechanisms deliberately:
    - `daily_review_plan` → `reviewPlan` is one config blob on the ordinary timestamped
      listener (`syncBlobListen`), so it self-registers in `SYNC_BLOB_REG`.
    - `daily_reviews` → `weeklyReviews` is a **keyed collection** (one child node per Monday
      week key), attached by `wkrAttachSync()` and merged per record by `wkrMergeReviews()` —
      union, newer `updatedAt` wins, ties keep the cloud, same rule as `mergeBudgetWeeks`.
      Writes go to `ref.child(week).set(...)`, never to the whole node, so a device that has
      only ever reviewed one week cannot replace the others. Because it is keyed rather than a
      blob it is NOT in `SYNC_BLOB_REG`, so it needs its own explicit line in
      `restorePushToCloud()` — it has one, next to the Journal's, for exactly the reason the
      Journal's exists (without it a restore never reaches the cloud and the reload that
      follows silently replaces the restored data with the older cloud copy).
    Neither store is written during boot: the review plan stays absent until the user finishes
    setup, and a review record is created only on a meaningful edit — opening the screen must
    never leave a blank review behind.

## Known bugs / risk areas

### Google sign-in inside embedded/in-app browsers
Google refuses to render its OAuth popup inside in-app WebViews (ChatGPT, Instagram,
Messenger, Facebook, Line, Twitter/X, WhatsApp, Snapchat, LinkedIn — and any iOS in-app
WebView, which reports Safari's engine but omits "Safari" from the UA string). The popup opens
blank and never resolves. This is Google's behavior, not an app bug, but it used to strand
users on a spinner forever because `handleAuth()` ended in an empty `.catch()` that swallowed
every rejection.

**Status: mitigated, not eliminated.** `isEmbeddedBrowser()` (`js/app.js:55`) detects the
known UA patterns up front and `authErrorMessage()` (`js/app.js:43`) turns Firebase auth error
codes into an actionable message ("open Daily in Safari or Chrome"), with a 12s watchdog for
the case where a blocked popup hangs without ever rejecting. This is UA-sniffing against a
fixed list — a new embedded browser (or a UA string that changes upstream) will not be
detected and will silently fail again until someone adds it to the regex in
`isEmbeddedBrowser()`. If a sign-in failure report comes in, check `navigator.userAgent` from
the affected device first.

### Cloud data appearing reset/missing after sign-in (fixed, but read the mechanism before touching sync)
Multiple related incidents, most recently commit `9f151a2` (2026-08-25, "URGENT: stop a fresh
device overwriting cloud data on sign-in"). Root cause: `lsSave`/`lsSaveTS` stamp every write
with `Date.now()`, and the app performs writes **during boot** — default seeding
(`splitCfg()`) and several one-time migrations all save as they run. On a fresh device with no
data, those boot writes stamped local *defaults* with the current time; signing in then ran
the timestamped sync listeners, which resolve by age, so the fresh device's seconds-old
defaults beat the real cloud data that was actually days old — silently replacing a user's
training split and budget categories with blank defaults.

Fix: a `_bootPhase` flag (`js/app.js:209`) makes writes during init keep whatever timestamp
the store already had (0 if never edited on this device) instead of stamping `Date.now()`, so
boot-time defaults can never outrank a genuine edit synced from elsewhere. `_bootPhase` clears
once init finishes, on both the success and failure path, so an init error can't strand a
device permanently unable to win a sync conflict.

**This is the load-bearing invariant for the whole sync system**: anything that writes during
app init/boot MUST go through `lsSave`/`lsSaveTS` (or otherwise respect `_bootPhase`/
`stampFor()`), never write with a raw `Date.now()` stamp directly. This exact class of bug
(untimestamped or wrongly-timestamped writes silently overwriting newer cloud data) has
recurred at least three times in this repo's history (`a86d2c2`, `7fb9395`, `9f151a2`) — treat
any change touching boot-time writes, migrations, or default-seeding as sync-sensitive by
default, even if the change looks unrelated to sync.

A related fix, commit `8a53cd8` ("Restore: make importing a backup authoritative over the
cloud"): restoring a backup writes old `_ts` values from the backup file, which used to lose
the restore on the very next sync (cloud looked newer than the just-restored data). Restored
keys are now re-stamped to "now" so the restore wins.

## Auth-related changes already made (most recent first)

All committed to `main`, all in `js/app.js` unless noted:

| Commit | Summary |
|---|---|
| `9f151a2` | Stop boot-time default writes from outranking real cloud data on sign-in (`_bootPhase`). |
| `4d143fb` | `handleAuth()` no longer swallows errors; added `authErrorMessage()`, embedded-browser detection, 12s watchdog. |
| `04059c6` | Added a "sign in" option on the onboarding welcome screen (previously sign-in was buried at step 6 of 7). Dismisses onboarding on successful restore rather than calling `finishOnboarding()`, which would otherwise overwrite the restored data with onboarding answers. |
| `8a53cd8` | Backup restore re-stamps timestamps to "now" so a restored file wins the next sync instead of being overwritten by cloud. |
| `9b6a3ee` | Backup restore also accepts pasted text, not just a file upload; shares the same restore path (and therefore the same timestamp fix) as the file picker. |

No changes to the Firebase project config, OAuth client, or `database.rules.json` are in this
list — auth work so far has all been client-side error handling and sync-timing fixes.

## Data-preservation rules — do not violate without explicit approval from Francois

- **Never write a boot-time/migration/default value with a fresh `Date.now()` stamp.** Use
  `lsSave`/`lsSaveTS` and respect `_bootPhase`. This is the exact bug class in `9f151a2`,
  `7fb9395`, and `a86d2c2` — three separate incidents.
- **Never add a new sync-relevant `localStorage` key without registering it** the same way
  existing blob stores are (through `syncBlobListenTS`/`SYNC_BLOB_REG`, or the keyed-collection
  pattern for arrays). An unregistered store will not be reachable by `restorePushToCloud()`
  and will silently be dropped from every future backup/restore.
- **Never replace a synced store wholesale** unless the operation is explicitly a restore
  (i.e. the user has said "this file is the truth"). Ordinary syncs must merge/compare by
  timestamp, not overwrite. Budget week data specifically must stay merged per-week, not
  blob-replaced — see `mergeBudgetWeeks()`.
- **Never silently drop or downgrade the Firebase security rules** (`database.rules.json`) to
  something more permissive to work around a bug — the `.read`/`.write` scoping to
  `auth.uid === $uid` is the only thing stopping one signed-in user from reading another's
  data.
- **Never bump the service worker cache name without a real content change**, and always bump
  it (`CACHE_NAME` in `service-worker.js`) when shipping any change to a cached asset — the
  fetch handler is cache-first, so a same-name deploy reaches nobody who already has the app
  installed to a home screen.
- **Treat any change to boot sequencing, migrations, onboarding-finish, or restore/backup code
  as sync-sensitive by default** — verify against a fresh (no local data) profile signing into
  an account that already has cloud data, not just against a single already-synced device.

## Coding conventions

- No semicolon-free style, no ES modules — everything is global-scope functions/consts in one
  script, loaded via a plain `<script defer>` tag.
- Functions and localStorage keys use short prefixes by feature area: `kit*`/`daily_kitchen*`
  (Kitchen), `bud*`/`daily_budget*` (Budget), `wt_*` (workout/legacy keys), `acct*`/
  `daily_accounts` (Accounts), `ob*`/`.ob-*` (onboarding). Follow the existing prefix for the
  area you're touching rather than inventing a new one.
- Comments are sparse and reserved for **why**, not what — matches the existing style; don't
  add explanatory comments for self-evident code, but do explain non-obvious constraints (sync
  timing, iOS quirks, a past bug this code prevents).
- Shared card UI vocabulary exists in `css/kitchen-extras.css` (loads last, wins cascade ties)
  — `cardHeader()`, `CARD_ICONS`/`cardIcon()`, `.card-hd`/`.card-fig`/`.card-shape`/`.card-cap`,
  `.card-bar`, `.card-split`, `sparkline()`. Use it for any new card rather than hand-rolling
  another header/figure pattern — see `CLAUDE.md` for the full anatomy if adding one.
- `js/app.js` sometimes builds CSS class names via string concatenation (e.g. `` `kit-card
  kit-c-${category}${sel}` ``) — grep for concatenation patterns, not just literal class names,
  before renaming/removing a CSS class.
- Full design-token list, navigation structure, and per-area layout history/gotchas (Home's
  2-column desktop grid, status-bar safe-area handling, the three separate collapse/expand
  systems, etc.) are documented in `CLAUDE.md`, not repeated here — read it before doing
  layout or CSS work outside a small, obviously-scoped fix.

## Recipe import and the ingredient-unit bug

- Recipes are imported by **paste only** — there is no file upload or backend endpoint. An
  assistant (Claude, ChatGPT, etc.) is given the schema via `kitBuildExportText()`
  (`js/app.js:12472`) or independently produces matching JSON, the user pastes it into
  Kitchen → Recipe Book → Import, and `kitParseImport()` (`js/app.js:12397`) validates it
  strictly — a bad paste is rejected with a specific error, never half-applied.
- Import schema: `{recipes:[{name, emoji, category, servings, description, cookTime,
  ingredients:[{name, amount, unit}], steps, tags, calories, protein, carbs, fat}]}`. `category`
  must be one of `breakfast|lunch|dinner|dessert` (defaults to `dinner` if invalid). `unit`
  must be one of `KIT_UNITS` (`g, kg, ml, L, cup, tbsp, tsp, piece, oz, lb`) **or `""` for a
  countable ingredient** (e.g. "4 salmon fillets") — `""` is a valid, deliberate value, not a
  missing one.
- **Ingredient-unit bug (fixed in `19d1623`, 2026-08-25)**: the recipe editor's unit `<select>`
  only ever offered the options in `KIT_UNITS`. Two failure modes:
  1. A countable ingredient (`unit:""`) has no matching `<option value="">`, so nothing in the
     dropdown is actually selected and the browser silently defaults to the first option
     (`g`) — opening and saving the recipe **without touching the unit field at all** silently
     rewrote it to grams.
  2. `KIT_UNITS` was missing `kg` and `L` entirely, even though two of the preloaded recipes
     use them — same failure, wider blast radius.

  Fix, in `kitFormAddIng()` (`js/app.js:12616`): the ingredient's own current unit is always
  injected into the `<select>` as an option, even if `KIT_UNITS` has never heard of it, so
  nothing already saved can be swapped out just by opening the editor. `kg` and `L` were also
  added to `KIT_UNITS` itself. **If you touch `kitFormAddIng`, `KIT_UNITS`, or the recipe
  editor's save path again, re-verify this specific case**: open an existing recipe with a
  countable ingredient (or a `kg`/`L` ingredient), save without changing any unit dropdown,
  and confirm the stored unit is unchanged.

## Multiple pantries and pantry-aware shopping

- `kitchen_pantry` / Firebase path `kitPantry` remains one timestamped synced blob. Its current
  shape is versioned (`schemaVersion: 2`) and contains `activePantryId`, pantry `order`, and a
  `pantries` object. Pantry IDs are stable and independent of editable names; every pantry owns
  its own explicit item map. Never make missing catalogue entries appear implicitly — a new
  pantry created with “Start empty” must remain genuinely empty.
- `kitPantryLoad()` normalises current data and losslessly migrates the legacy single item map
  into the stable `pantry_home` location named Home. Built-in and custom item metadata/statuses
  are made explicit. Boot seeding and migration go through `lsSave` while respecting
  `_bootPhase`; do not restore the old raw `localStorage.setItem('kitchen_pantry', ...)` write.
  The same normalisation runs when legacy data arrives later through the Firebase listener.
- `kitShopComputePlan()` is the single classification path for Shopping, Home and AI context.
  It combines recipe quantities first, then matches against the active pantry. In-stock matches
  are informational “Already in [name]” rows and do not count as shopping. Low/Out matches are
  one Pantry-needs row carrying any recipe quantity requirements. Untracked ingredients and
  manual rows remain things to buy; manual rows are never suppressed by a pantry match.
- Ingredient matching is exact-first and conservative. `kitPantryCanonicalName()` removes only
  known display parentheticals and applies the explicit `KITPANTRY_ALIASES` map. Do not replace
  this with substring/fuzzy matching: onion vs spring onion and ground coriander vs coriander
  leaves are deliberate non-matches.
- `kitchen_shopping_checked` is a versioned map partitioned by pantry ID. Existing flat checked
  keys migrate into Home. Generated/manual checked rows must always be read and written through
  the pantry-aware helpers so state cannot leak when switching locations; deleting a pantry
  removes only its checked namespace.
- `daily_pantry_ui` remains device-local and excluded from sync/backup. It stores presentation
  preferences only, including filters, collapsed categories and the stocked-section disclosure.

## Testing / release checklist

**Isolated Node tests live in `tests/`; there is no linter config or CI pipeline.**
Run `node --test tests/*.test.cjs` plus local browser verification before every push to `main`
(which is the deploy).

Before pushing to `main`:
1. Serve the folder locally (see Run locally, above) and open it in a browser — check the
   console for JS errors on load.
2. Exercise the specific feature you changed end-to-end, including its empty/edge states.
3. **If you touched anything sync-related** (boot writes, migrations, onboarding finish,
   backup/restore, any `lsSave`/`lsSaveTS`/`SYNC_BLOB_REG` call site): test against a signed-in
   account with real cloud data, from a "fresh" profile (clear localStorage or use a private
   window) — not just from an already-synced device. This is the scenario every past sync
   incident was missed by testing only the common case.
4. **If you touched anything in `js/app.js`, `index.html`, or the CSS files**: bump
   `CACHE_NAME` in `service-worker.js` to a new value and update the version comment above it.
   A same-name deploy will not reach anyone with the PWA already installed.
5. Check both light and dark theme if the change touches colour/CSS.
6. Check mobile viewport (this is primarily a phone PWA) in addition to desktop if the change
   touches layout.
7. Francois is not a developer. When an implementation brief is useful, deliver it plainly in
   the conversation with clear scope and an eyeballable verification checklist. Do not save or
   number a prompt file unless he explicitly asks for a reusable repository artifact.

No staging environment exists — a push to `main` is live immediately at
`sourgits.github.io/daily-app`.

## Workout hub (Log)

Log holds Today / Splits / Exercises / History. **Today is a briefing, and
`logTodayBrief()` decides what it says** (v330). Read this before touching either:

- **One canonical reader, four states.** `suggestDay()` answers "which rotation day is NEXT"
  and advances the moment a session is saved; `S.dayIdx` answers "which day is loaded in the
  logger" and `saveSession()` does not move it; a session dated today is a third fact again.
  Combining them by hand is how the overview came to say "Session saved", print the name of the
  next rotation and open a third thing. `logTodayBrief()` resolves, in precedence order:
  **in progress** (a MEANINGFUL draft → the draft's actual `S.dayIdx`, outranking a session
  saved earlier the same day), **saved today** (the record's own `sessionType`, figures and
  `completed` flag, with the next rotation named on a separate line — a partial save is *Saved
  today*, never *Completed today*), **ready** (`suggestDay()`, and the action opens exactly that
  day), **no usable exercises** (offer split setup, never an empty logger).
- **A meaningful draft** is a running timer, a completed check, an entered weight or rep value,
  a session-only exercise or a typed note. Merely opening the logger — which initialises one
  blank working row per exercise — is not one. **And it only outranks a session already saved
  TODAY when it has moved since that save**: `saveSession()` clears `wt_setdata` but leaves the
  entered sets on screen so a partial workout can be carried on, so the sets that produced the
  record are not a newer workout. `logDraftTouchedSinceSave()` first checks for a non-empty
  trimmed `S.sessionNote`, a new `S.sessionStart` or non-empty `S.sessionAdds` — all explicitly
  cleared by `saveSession()` — then reads today's `wt_setdata` for set/check changes. A note
  alone need not recreate that marker. The reader never writes; note keystrokes stay unchanged.
- **A retained partial workout has a guarded route back (v333).** The saved hero keeps
  **View in history →** primary. **Continue saved workout →** appears only for today's latest
  record with `completed:false` when `logCanContinueSaved()` finds the same day index/type,
  a complete current logger row map (no missing or orphan rows), and meaningful sets matching
  the saved exercise names, order and numeric weight/reps/set types. It uses the save path's
  normalisation only to establish continuation eligibility; it does not replace the draft
  tie-break. A matching rotation index or blank rows alone prove nothing. Completed records,
  missing retained data and ordinary reloads without a matching draft get no action.
  `logContinueSavedWorkout()` revalidates before opening the existing logger: no day init,
  clearing, timer start or storage write. Merely opening and returning stays **Saved today**;
  a meaningful edit then becomes **In progress** through the existing reader. No draft is
  reconstructed from history or persisted by this action. Saving again keeps the existing
  append semantics: it creates another record and leaves the earlier save intact.
- **A historical planned total is NEVER reconstructed.** A session records its performed
  exercises, working sets, duration, effort and `completed` flag; it does not snapshot how many
  exercises were planned at the time. Deriving that from the current program at the record's
  `dayNum` meant editing the program silently rewrote an old partial workout's progress. A
  partial save therefore shows only recorded facts — no "X of Y", no percentage, no bar — and
  only a `completed` record shows a full progress state, from its own exercise count. Do not
  reintroduce `plannedCount`, and do not backfill one onto old records or into
  `saveSession()` to support a presentation.
- **The reader is PURE.** It writes nothing, seeds nothing, migrates nothing and never sorts
  `S.sessions` in place; `logRecentSessions()` sorts a clone. Browsing the overview performs
  zero localStorage writes, and a test asserts it.
- **Home reads the same helper.** `renderHome()` must not recompute training state — that
  second calculation is what let Home and Log describe the same session differently. Home opens
  Log › Today's OVERVIEW and must never bypass it or begin a workout.
- **`logOpenPlannedDay()`, not `selectDay()`.** `selectDay` resets the rest timer, dismisses
  the post-save prompt and writes over the loaded day — it means "discard this workout". The
  new helper initialises the advertised day ONLY when there is nothing meaningful to lose, so
  Continue can never erase a draft.
- **Progression targets come from `poShouldIncrease()` and nothing else**, in kilograms only
  where `exerciseMetricInfo().kind === 'load'`. The step is the shared `PO_STEP_KG`. The
  "Last:" line uses `lastWorkingSetsFor()` + `exerciseUnit()` + `fmtLoggedSet()` — the logger's
  own readers — so timed, bodyweight, assisted and legacy movements read honestly.
- **Weight and the "3 / 7 days" consistency score are gone from Log.** Weight is Stats › Body's
  subject; seven training days was never a goal anyone set. Last 7 days states sessions, days
  trained and logged time, and invents no score, target, warning or advice.
- **Log Overview vs Stats › Training:** the overview is a briefing about now — what to train,
  what to prepare for, this week's facts, the last few sessions. Longer-term analysis, charts
  and per-exercise progression belong to Stats › Training and must not migrate here.

### Split picker (v336)

- **Visible Splits, internal `program`.** The Log tab, navigation links, overview setup action
  and Settings destination say Splits. `LOG_TABS.program`, existing DOM IDs,
  `#log/program`, `logGoto('program')` and compatibility helpers stay unchanged.
- **One compact picker and one preview.** `renderLogProgram()` leads with Current split and
  Edit split, then Your splits with Create split and Import. The current live split remains
  usable without a saved copy. `logSplitRotation()` reads the schedule in order, including
  repeated days. `logProgSelect()` opens `#view-split-preview`; it never applies or saves.
  Closing preserves the collection's scroll position and in-memory selection. Preview, menu,
  pending decision and return-focus state live above `init()` and are never persisted.
- **In use means an actual configuration match.** `logActiveProgram()` filters through the
  existing `planAppliedState()` comparison first, then chooses one match by `lastAppliedAt`,
  `activePlanId` as a tie-break, and original order. Neither selection nor the stored ID can
  make a mismatching split active. Identical copies get one collection marker; their previews
  may both say Currently in use because either has the same configuration. The comparison
  remains `planCfgFingerprint()` (day/exercise names and order plus schedule); it does not
  compare planned-set counts or other metadata. Do not add a second comparison or active store.
- **Applying owns the workout decision.** `plansApply()` uses `logConfirmSplitChange()` before
  changing a different split. Protection is `logDraftIsMeaningful()` plus the existing
  saved-today/post-save tie-break, so retained saved sets alone do not demand discard, while
  a new note, timer, session-only exercise or set marker does. Keep current workout cancels
  without changing any draft field. Discard workout and switch invokes the pending apply;
  the saved target is re-read and validated before any reset. `logResetWorkoutForSplit()` uses
  `initDay()` with the clamped current index, clears `wt_setdata` and resets the rest timer and
  post-save UI. It does not save a blank draft or touch workout history, swaps or customisations.
  Editing the live split uses the same guard when saving a changed configuration.
- **Create is an isolated editor draft.** `openNewSplitEditor()` uses the existing editor in
  new mode. Cancelling leaves the live split, saved splits and staged custom exercises alone.
  Save uses `plansSaveNewSplit()` to add a named saved split; it does not activate it. Save as a
  new split reuses the current-split workflow. Update saved copy is an explicit menu action.
- **Existing stores, explicit management.** Rename, duplicate, update, delete and import use
  `savePlans()`; application uses `saveSplit()`. Duplicate deep-clones nested data and obtains
  a new collision-free ID. Deleting a saved copy preserves the live split and history. JSON
  import adds to the collection without applying; an ID collision creates a new copy instead
  of replacing an existing record. Older workout formats remain viewable and manageable but
  cannot be applied to the logger. HTML documents remain in Plans. No key, migration, sync
  registration, timestamp safeguard or backup/restore contract changes for this presentation.

Three more things a future change must not undo:

- **No migration, and none is needed.** Saved splits and imported HTML plan documents share the
  existing `wt_plans` store and are separated at render time (`planIsWorkoutSaved()` vs
  `type==='html'`). Nothing was rewritten, moved between stores or deleted. The retired Plans
  streak's `streak` field is still stored and simply never read — removing it would BE a
  migration. Each view's selection (`logProgSel`, `plansDocSel`) is in-memory so that merely
  browsing a split cannot write to a synced store.
- **Hub state is declared above `init()`** (beside `NAV_ORDER`). `init()` calls `setView()` to
  restore a `#hash` view, and `setView` reads `logTodayView`; `let`/`const` do not hoist, so a
  late declaration aborts boot with a TDZ error for anyone reloading on a hash.
- **`setLogTab()` must not call `scrollIntoView()`.** Log is a `.swipe-panel` in the transformed
  `#swipe-deck`; it nudges the strip's own `scrollLeft` by a measured rect offset, like
  `setStatsTab()`.

Exercise Library and Workout history no longer have overlay wrappers. `openExerciseLibrary()`
and `openWorkoutHistory()` navigate to their Log section, so every existing caller — the
sidebar, the hamburger, Home's recent-sessions card, Stats evidence, the Journal day context —
keeps working against one copy of the markup. `Settings > Training setup` keeps its persisted
`training` key and its visible row, and opens Log > Splits.

## The Food hub, and Stats back in the deck (v321)

Kitchen and Nutrition became ONE top-level destination, **Food**, and the slot that freed went
back to Stats. The phone's bottom nav is **Home · Budget · Log · Food · Stats**, with Log still
in the centre. Presentation and routing only — nothing about the data moved.

- **`NAV_ORDER = ['home','budget','log','food','stats']` IS the deck**, and
  `#view-*{order:n}` in `css/layout.css` must agree with it position for position. A
  disagreement gives you a tab you can tap but not swipe to. `tests/food-nav.test.cjs` asserts
  both, and that the bottom-nav buttons match in order.
- **Stats is a `.swipe-panel` inside `#swipe-deck` again**, not an `#app-main > section`. One
  copy of the markup; every section (Overview, Review, Training, Body, Nutrition, Finance)
  behaves as before and `statsSubTab` still remembers the last one. Its **evidence overlay
  stays OUTSIDE the deck** — `position:fixed` resolves against the nearest transformed
  ancestor and the deck has one, so an overlay moved inside it would be positioned against a
  500%-wide box (verified: the evidence screen measures top 0 / left 0 / full viewport width).
  `#view-stats` was also removed from the landscape overlay-padding list in
  `kitchen-extras.css`, since deck panels take their padding from `.swipe-panel`.
- **Food state is IN MEMORY and must stay that way.** `foodState.tab` names the primary
  section, `foodState.todayView` names `overview` or `log`, and `foodOverviewState` holds recipe
  filters and a comparison recipe ID. A fresh session opens Today's overview; within a session,
  leaving and returning through the Food button remembers the last
  primary section. Persisting it would be a boot-time write, which is the `_bootPhase` trap
  above. It is declared beside `NAV_ORDER`, well above `init()`, for the same TDZ reason the
  Log hub's state is: `init()` restores a `#hash` through `setView()`, `setView()` reads
  `foodState`, and `const` does not hoist. `js/nutrition.js` still loads FIRST and must never
  read it at load time — its calls are all inside functions.
- **One central legacy mapping, not two screens kept alive.** `NAV_VIEW_ALIAS`
  (`nutrition`/`kitchen` → `food`) and `FOOD_LEGACY_ROUTES` feed `navResolve(view, sub)`, and
  `setView()` applies the alias as its FIRST statement — before the history push — so
  resolving an old destination writes one canonical Food entry, never an intermediate one for a
  screen that no longer exists. Verified by direct-link reload: `#nutrition` → Food › Today
  › food log (`#food/log`), `#kitchen` → Food › Recipes (`#food/recipes`), `#kitchen/pantry` → Pantry,
  `#nutrition/foods` → Today + Food library, `#nutrition/recipes` → Recipes + Nutrition Review.
- **Today is an overview with one secondary logger (v334).** `#food` opens the overview;
  `#food/log` opens the existing `nutRender()` / `#nutrition-main` logger. `foodOpenLog()` and
  `foodOpenOverview()` switch the two mounts through `foodSetTodayView()` without storage writes.
  `openFoodToday()`, `nutOpen()`, Home's calorie actions, the sidebar Food log row and legacy
  Nutrition links intentionally open the logger, including entry highlighting. Back and Forward
  restore the active Today screen. Selecting the primary Today tab opens its overview.
- **Food library and Nutrition Review are peer overlays**, using the same `.app-overlay` +
  `.detail-topbar` shell as the Stats evidence screen, registered in `APP_PEER_OVERLAYS`. They
  are NOT in `NAV_NO_ROW_OVERLAYS`: each lights its own sidebar row (`nut-foods` /
  `nut-review`) while the pinned **Food** item stays lit. Local shortcuts return to their origin:
  Nutrition Review opened from Today returns to the overview, and Food library opened from the
  logger returns to the logger. Sidebar and legacy routes use canonical parents (Today / Recipes).
- **`updateKitFab()` now means Food › Recipes only** — never Today, Shopping, Pantry, a
  supporting screen, an open sheet/form/import/cook overlay, or another view.
- **Renamed, and only what the structure required**: `kitSetTab()` and `kitRender()` survive as
  thin delegates (`foodSetTab` / `foodRefreshActive`), `nutSetTab()` survives as the
  old-sub-tab shim, `nutRender()` still renders the day log into the unchanged
  `#nutrition-main`, and `nutRenderFoods()` / `nutRenderRecipes()` just target their own panes.
  `nutTab` is retired (nothing read it once the strip merged). Every `nut*`/`kit*` storage key,
  Firebase path and DOM id is untouched.
- **Sync dispatch, not sync contract.** Listeners now ask `foodShowing(section)` instead of
  `S.view==='kitchen'/'nutrition'`, and also refresh an open supporting screen. No listener,
  merge rule, registration or timestamp behaviour changed. `foodRenderToday()` dispatches to
  the overview or logger; incoming nutrition refreshes must use `foodRefreshToday()`, never
  render the logger over the overview. Recipe, target, pantry and shopping refreshes follow the
  same active-screen dispatch. The overview keeps its search and filter DOM nodes alive during
  refresh, and retains comparison selection by recipe ID until that recipe disappears.

### Food overview readers and preservation (v334)

- **The overview remains useful without logging.** Mobile order is chooser, recipe options,
  calorie goal, shopping, food-log summary. Desktop uses independent main and supporting
  columns. Filters are optional user choices, default to all categories and never change the
  Recipes section's own search/filter state. There is no saved meal plan or new nutrition engine.
- **Recipes use canonical values.** `foodOverviewRecipe()` reads `kitResolve()` for the default
  protein option and per-serving nutrition; `nutRecipeState()` is the existing provenance reader
  (`kitNutritionState()` does not exist). Never divide calories by recipe servings again or use
  unaccepted `nutritionCalculation.perServing` suggestions. Missing values stay unknown; partial
  review and manual/calculated distinctions stay visible. The advertised option is passed to
  `kitOpenDetail(id, optionId)` and `kitStartCooking(id, optionId)`. Invalid options are not offered
  for cooking. `foodOverviewMinutes()` accepts reliable duration forms only; a protein-step time
  is labelled separately and does not establish a whole-recipe cooking time for a ceiling.
- **Comparison is not intake.** `nutTarget()` supplies the existing daily target. Comparing a
  recipe states one serving's kcal and percentage of that target; it never changes servings,
  writes a food entry, derives a remaining allowance or invents a target. `nutDaySummary()`
  supplies the compact food-log summary. Its `complete` status means recorded entries have
  known calories, not that the day's intake was fully logged. No on/off-track or exact remaining
  intake claims belong here.
- **Shopping uses the same classification and count as Shopping.** `kitShopComputePlan()` and
  `kitShopCountLeft(plan)` supply the active pantry, things-to-buy count and first three rows.
  Pantry needs count; checked normal rows and informational stocked rows do not. In-stock status
  proves neither enough quantity for a recipe nor that the user can cook it now. Shopping recipe
  selections are not today's meal plan. Browsing changes no pantry/check namespace.
- **Recipe/cook overlays return to Today.** Today detail always uses the existing overlay,
  including desktop and landscape (`.kit-detail-from-today`); Recipes retains its split pane.
  Closing detail or exiting cooking reveals the original screen with filters/comparison intact.
  Starting from Today ignores stale scaling in a hidden recipe detail; a deliberate visible
  detail's serving choice still applies. Viewing and cooking never automatically log food.
- **No new storage, migration or schema.** Overview browsing, filtering, comparison, opening
  the logger and returning write nothing. Preserve recipe IDs, protein options, ingredient units
  including `""`, `kg` and `L`, manual values and explicit calculation acceptance, historical food
  snapshots, active pantry/check namespaces, all sync keys/paths and boot/restore behavior.

## Weekly Review (Stats → Review)

Opt-in review of one finished week against a saved weekly plan. `wkr*`/`WKR_*` in
`js/app.js`, `.wkr-*` in `css/review.css`. Full design rationale is in `CLAUDE.md`; the
safety-critical parts:

- **It never writes to existing data.** Money is read through the canonical Finance readers
  (`statsWeekParts`, `weekIncome`/`weekIncomeKeys`, `varCatAmount`, `weekSavedAmt`,
  `weekLeftover`) and nothing here recomputes a figure one of those already answers.
  Completing a review writes the review record only — the budget week's saved/finished state,
  its transactions, accounts and the training Plans screen are untouched.
- **A completed review is frozen** against the plan (`planSnapshot`) and the figures
  (`actualSnapshot`) as they stood. Editing the plan later cannot rewrite it. When Budget
  moves underneath a completed review, a banner offers the explicit
  `wkrRefreshActuals()` — which re-takes the actuals only and leaves `planSnapshot` alone.
  Never make that automatic.
- **The prefix is `wkr`, not `wr`** — `.wr-row*`/`.wr-chip*` belong to Home's Week in review
  card and `css/review.css` loads after the file that styles it. See `CLAUDE.md`.
- **Daily AI handoff sends nothing.** `wkrAskDailyAI()` seeds `aiHubState` (a `review` scope,
  the week as a custom range, a review-specific request) and opens the existing Ask AI screen;
  the user still has to press Copy there. No API, no key, no automatic transmission.
- **The presentation was rebuilt in v322 and the numbered local rail is gone.** One compact
  header (title / week `<select>` / review-status chip / horizontal section row) at every width,
  a landing that leads with the selected week's figures beside a COMPACT dated next-week
  summary, insights with a prominent figure and a methodology disclosure, and everything
  left-aligned on the Stats canvas at `--wkr-measure` (880px) except the landing
  (`--wkr-canvas`, 1240px). Retired: `.wkr-rail*`, `.wkr-tab-n`, `.wkr-tab-d`, `.wkr-tab-c`,
  `.wkr-mainhd*`, `rev-railed`, `--wkr-rail-w`, `--wkr-gap` and `WKR_SECTIONS[].desc`.
  Design rationale and the traps are in `CLAUDE.md`; the ones that bite here:
  `wkrSetSection()` must keep flushing pending edits and must never call `scrollIntoView()`
  (`#view-stats` is a `.swipe-panel` in the transformed deck — use `segScrollToTab`), and its
  DOM lookup is guarded on `document.querySelector` being a FUNCTION because the Review
  regression suite runs these helpers against a stub document. `tests/review-presentation.test.cjs`
  guards the retired rail, the `.rev-list` cascade and the visible/disclosed split.

## Current unfinished work

### Continue a retained partial workout — v333 (local, uncommitted)

The saved Log › Today hero now keeps **View in history →** primary and offers the secondary
**Continue saved workout →** only when `logCanContinueSaved()` verifies today's explicit
partial record against meaningful retained sets in a complete matching logger row map.
The guarded opener only displays that logger. Draft state, note input, save semantics,
session schema and persistence are unchanged; no historical draft is reconstructed.

Thirteen behavioral regressions bring `node --test tests/*.test.cjs` to **159/159**.
Eligibility, a non-mutating opener and saved-to-edited transitions are covered; syntax and
diff checks pass. `CACHE_NAME` is `daily-v333`.

**Local browser verification with production controls:** entered and saved a partial
workout, returned to **Saved today**, pressed **Continue saved workout**, and confirmed every
retained draft field was unchanged. Returning without edits stayed **Saved today**. Reopened
through the secondary action, typed only a note, and returned to **In progress**;
**Continue workout** preserved the note. A set edit also became **In progress**. Saving again
appended a second record with 60 kg × 7 while the earlier 60 kg × 8 record stayed intact.
Opening and browsing recorded **zero storage writes**. This production route resolves the
v332 verification limitation below; no temporary navigation control was used.

The secondary action was also absent after **Finish workout** saved a completed record,
after switching the logger to a different day with blank rows, and after reloading a saved
partial without a retained draft. The pure eligibility regressions separately cover blank
rows on the same rotation index. At **320px, 375px and 1440px in both themes**, the secondary
button stayed within the hero, measured 46px high, and had no clipped text or horizontal
overflow. Zero console errors across the local fixtures. Test instrumentation only counted
storage calls and compared draft snapshots; all workout navigation used production controls.

### Log post-save note tie-break — v332 (local, uncommitted)

`logDraftTouchedSinceSave()` now recognises a non-empty trimmed `S.sessionNote`, a new
`S.sessionStart` or non-empty `S.sessionAdds` before checking today's `wt_setdata`. These
fields are explicitly cleared by `saveSession()`, so their presence means the logger moved
since the save. Retained saved sets alone still resolve to **Saved today**; the existing
marker still covers set edits and completion toggles. No saved-record comparison, storage
write on note keystrokes, logger/save/schema/sync change or migration was added.

Six regressions bring `node --test tests/*.test.cjs` to **146/146**. The new note, timer and
session-add cases fail against the original helper and pass with the correction. Syntax and
diff checks pass. `CACHE_NAME` is `daily-v332`.

**Local browser verification:** used an invented split in an unsigned-in local origin.
Entered 60 kg × 8 in the real set inputs and saved a partial workout; the overview read
**Saved today**. Reopened the retained logger, typed only a new note, and returned through
**Workout overview**: **In progress**, with `wt_setdata` still absent, timer stopped and no
session-only additions. **Continue workout** retained the note in the textarea. Repeating
the original save without a post-save edit again read **Saved today**. Instrumented
`localStorage.setItem`/`removeItem`/`clear` recorded **zero writes and zero changed keys**
through overview navigation, reopening, note entry and Continue. Zero console errors.

**Historical verification limitation, resolved by v333 above:** the v332 saved overview
offered only **View in history**, with no route back to the retained logger. A temporary control
in the test server called the existing `logOpenSession()` solely to reopen it. Save, note
entry, return to overview and Continue used the real app controls. This test-only control
and storage instrumentation were not added to the repository.

### Log › Today: honest saved-session facts and Home's empty state — v331 (local, NOT pushed)

Three corrections to v330's overview, all in the state presentation. **No session schema,
storage key, migration, Firebase path or sync helper changed** — `saveSession()`'s record is
field-for-field identical and nothing was backfilled onto existing sessions.

- **`plannedCount` is removed.** It derived a saved session's denominator from the CURRENT
  program at the record's `dayNum`, which is not historical evidence — editing or replacing the
  program changed an old partial workout's displayed progress. A partial save now states only
  what the record holds (duration, exercises saved, working sets, effort): no "1 of 5", no
  percentage, no progress bar. A record whose canonical `completed` is true still shows a full
  progress state, from its OWN exercise count.
- **Home's empty state agrees with Log.** `state:'empty'` fell through to the `UP NEXT`
  eyebrow; it now reads `NO EXERCISES YET` / "No exercises configured" / *Set up program*, with
  the progress row, percentage and track omitted. Home's action still opens Log › Today's
  overview, and the overview's own action opens Log › Program. `.hero-flat` closes the bottom
  margin `.hero-meta` would otherwise leave dangling.
- **A draft no longer outranks the record it produced.** `saveSession()` clears `wt_setdata`
  but deliberately leaves the entered sets in `S.setData` so a partial workout can be carried
  on — so those sets kept reading as a meaningful draft and the overview said *In progress* the
  instant Save was pressed. `logDraftTouchedSinceSave()` breaks the tie by reading `wt_setdata`
  back (every set edit rewrites it); the reader stays pure. **This was found by the end-to-end
  save run**, which the v330 report listed as not performed — the in-memory fixtures could not
  see it.

**Verified locally in the in-app browser on `localhost:8765` against a synthetic fixture**
(invented split, exercise library and sessions — no real account signed into, read or written,
and no production Firebase data or deployed rule touched), including the END-TO-END save that
was missing before: opened the Ready workout through the overview's hero, typed weights and
reps into two of five exercises through the real `.set-kg` / `.set-reps` inputs, pressed the
existing **Save partial workout** button, and confirmed the written record
(`Push`, 2 exercises, `completed:false`, no `plannedCount`, `wt_setdata` cleared). Log and Home
then both read **"SAVED TODAY · Push · 2 exercises saved · 2 working sets"** with no fraction,
no percentage and no bar (`hero-progress-row` and `hero-progress-track` absent, `hero-flat`
applied). The Push day was then edited from 5 exercises to 7 through `saveSplit()` and the
saved summary was **byte-identical** on both surfaces. A fully completed workout (both
exercises ticked, `completed:true`) still reads **"COMPLETED TODAY"** with Home at 2 of 2 /
100%. An empty training day reads **NO EXERCISES YET / "No exercises configured" / Set up
program** on Home and Log, Home's action lands on the overview and the overview's lands on
Program. Read-only navigation recorded **zero localStorage writes and zero changed keys**; the
save and the program edit used their own existing write paths. 320 / 375 / 932-landscape /
1440 in both themes: `.hero-meta`'s bottom gap measures 0px with the progress omitted, the
action stays inside the card, nothing clipped, no page overflow. Zero console errors.
`node --check js/app.js` passes, `git diff --check` is clean, and
`node --test tests/*.test.cjs` → **140/140**, with eight new checks (no `plannedCount` on the
brief or in the code, no X-of-Y or percentage in the saved branch, a program edit not moving a
saved summary, completed still completing, Home's empty eyebrow and omitted progress, Home/Log
wording parity across all four states, the schema/store/sync audit, and the
draft-versus-just-saved tie-break in four configurations).
`CACHE_NAME` is `daily-v331`.

**NOT verified:** no real signed-in account, production Firebase data or deployed rule was
touched — the sync suites are isolated, so none of this is a cloud test, and the signed-in
fresh-profile check has still not been run (this change registers no store and performs no
migration). No physical device: phone and landscape layouts were checked at the equivalent
CSS-pixel viewport, so safe-area insets are inferred from the existing CSS. The post-save
weight and effort prompts appear after a save and were not separately exercised in this run.
**Nothing has been committed or pushed.**

### Log › Today rebuilt as the training overview — v330 (local, NOT pushed)

Presentation plus one new canonical READER. **No localStorage key, Firebase path, sync
registration, migration, boot write or save/restore path was added or changed** — audited, and
every logger, session and sync helper was byte-compared against the previous commit.

- **`logTodayBrief()` is the canonical training-state reader**, with `logDraftIsMeaningful()`,
  `logSavedToday()`, `logLastOfType()` and `logSessionSetCount()` beside it. Pure: no write, no
  seed, no migration, no in-place sort of `S.sessions`. The four states, their precedence and
  the meaningful-draft definition are in the Workout hub section above.
- **Home's session hero reads it too.** `renderHome()`'s own `type(S.dayIdx)` + `S.checked.size`
  calculation is gone; it now shares state, day name, exercise count, progress and the
  saved/active distinction with Log. Home still opens the overview and starts nothing.
- **`logOpenPlannedDay(idx)`** prepares the advertised day without `selectDay()`'s discard
  semantics — it initialises only when no meaningful draft exists and the logger is not already
  on that day.
- **The overview is hero → Today's plan → Last 7 days → Recent sessions**, one mobile stack and
  two independent desktop columns (`.lg-cols`, plus a two-column grid in the landscape block,
  where `#log-overview` now also scrolls inside its column — `#view-log` is `overflow:hidden`
  there, so a tall overview was previously cut off).
- **Removed, with an audit confirming no other caller:** `renderLogWeightCard()`,
  `logTodayWeight()`, `renderLogImprovementCard()`, `logImprovementSuggestions()`,
  `renderLogConsistencyCard()` (replaced by `logWeekCardHtml()`), `#log-weight-input`, every
  `.lg-weight-*` rule and `.lg-consistency-score`. `addWeightEntry()`, `loadWeights()`, the
  weight sync, Stats › Body and the post-save weight prompt are untouched.
- **One shared constant added:** `PO_STEP_KG` (2.5), which `showPOModal()` now reads as well —
  same value, one source.
- **The session cloud listener refreshes Log › Today and Home** when either is the visible
  surface. Registration, Firebase path, record merging and timestamp behaviour are unchanged.

**Verified locally in the in-app browser on `localhost:8765` against a synthetic fixture**
(invented split, exercise library, sessions and weights — no real account was signed into, read
or written, and no production Firebase data or deployed rule was touched), with
`localStorage.setItem`/`removeItem` intercepted and a before/after key diff around the
read-only runs: **Ready** (advertises `suggestDay()`'s day while the logger sits on another,
and `Open workout` loads exactly the advertised one), **in progress with entered sets and no
timer**, **in progress with a running timer** ("1 of 5 exercises done · 22m elapsed"), **a
meaningful draft outranking a session saved today**, **saved partial** ("SAVED TODAY · Pull ·
40m · 1 exercise · 1 working set" with "Up next: Legs · 3 exercises" on its own line),
**completed today** ("COMPLETED TODAY"), **multiple sessions today** (latest record, "2 sessions
saved today — this is the latest", `S.sessions` order unchanged), **no sessions**, **no
exercises** (Set up program → reaches Log › Program), **blank initialised rows not counting as a
draft**, and the plan rows for a loaded exercise with a rising-rep streak ("Last: 60kg × 9 ·
reps up 3 sessions running" + "Try 62.5 kg"), a bodyweight one ("Last: 16 reps"), a timed hold
("Last: 45s"), an assisted one ("Last: -10kg × 8") and one with no history. Home matched Log's
state and session name in every state. Continuing a draft preserved every set value, check,
timer, note, session-only exercise and swap (diffed field by field). **Zero localStorage writes
and zero changed keys** while browsing. Widths 320 / 375 / 390 / 414 / 720 (≈200% zoom of 1440)
/ 932-landscape / 1024 / 1440 in both themes: no page overflow, no clipped element, and the two
desktop columns keeping independent heights (170/185 beside 196/233 at 1440). Zero console
errors throughout.
`node --check js/app.js` passes, `git diff --check` is clean, and
`node --test tests/*.test.cjs` → **132/132**, including a new `tests/log-overview.test.cjs`
(23 checks covering the state model, draft detection, saved wording, the next-rotation split,
purity, recent-session sorting, unit-aware plan rows, target gating, the removed cards, the
Home/Log contract, the two-column composition and the logger invariants).
`CACHE_NAME` is `daily-v330`.

**NOT verified:** no real signed-in account was used, read, written or cleared, and no
production Firebase data or deployed rules were touched — the sync suites pass but they are
isolated, so nothing here is a cloud test. The signed-in fresh-profile check has NOT been run;
this change registers no store and performs no migration, so it does not carry the risk that
scenario exists to catch, but the claim stands as untested either way. No physical device —
phone, landscape and 200%-zoom layouts were checked at the equivalent CSS-pixel viewport in a
desktop browser, so safe-area insets and the standalone status bar are inferred from the
existing CSS rather than observed. A real end-to-end save (logging sets and pressing Save) was
NOT performed against the fixture; the saved-today states were exercised by writing session
records directly, so `saveSession()` itself is covered by its unchanged code and the existing
suites rather than by a fresh manual run. **Nothing has been committed or pushed.**

### The Finance hub: the destination is renamed and Accounts joins it — v329 (local, NOT pushed)

Structural navigation. **No storage key, Firebase path, sync registration, migration, boot
write or calculation was added or changed** — audited, and the accounts store, its readers and
its writer were byte-compared against the previous commit.

- **Budget → Finance, user-facing only.** The bottom-nav button, the sidebar's pinned
  destination (`NAV_QUICK_LABELS.budget`), the tablist `aria-label`, Home's *Open Finance →*
  action, the Home Layout editor's per-card `tab` field and the copy that tells a reader where
  to go now say Finance. The internal view id stays `budget`, and with it every `bud*` prefix,
  every DOM id, every storage key, every Firebase path and the `#budget` route — an existing
  `#budget` link still works and there is deliberately no `#finance` hash. The budgeting
  CONCEPT keeps its own name: weekly budget, over budget, budget goal, **Budget setup**, budget
  categories, budget CSV, budget reminder, the AI Budget data scope.
- **Accounts is the sixth registered Finance view.** `BUD_VIEWS` gained
  `{id:'accounts', btn:'bv-accounts-btn', panel:'budget-accounts-view', row:'accounts',
  render:'renderAccountsPage'}` in the order Overview · Week · Month · Bills · Accounts ·
  Yearly, and it is now the single source for a view's renderer as well — `setBudgetView()`
  dispatches through `budRenderView()` instead of an if/else chain. `render` is a NAME rather
  than a reference because `tests/budget-overview.test.cjs` evaluates this array in a bare VM.
- **The overlay is gone.** `#view-accounts`, its `.detail-topbar`, its `data-back="closeAccounts"`
  button, `closeAccounts()`, `_acctReturnFocus`, the `.bud-nav-act` launcher and its CSS, the
  `#view-accounts` entry in `AI_PEER_OVERLAYS`, `setView()`'s explicit close, the
  `navCurrentRow`/`navCurrentQuick` overlay branches, `navGo`'s `viewId==='accounts'` special
  case and every `#view-accounts` CSS rule (the desktop back-button hide, the landscape overlay
  padding, the landscape canvas cap) are all removed. The markup moved unchanged, so there is
  still exactly ONE `#accounts-hero` / `#accounts-chart` / `#accounts-list-head` /
  `#accounts-list` / `#accounts-addform` and one renderer.
- **`openAccounts()` is the compatibility navigation helper.** It assigns `budgetView='accounts'`
  FIRST, then `setView('budget')` from another destination (so the history entry exists and Back
  returns) or `setBudgetView('accounts')` from inside Finance (so no intermediate panel is
  painted and no history entry is pushed for a tab switch). It still takes and ignores the
  launcher argument its callers pass. No caller had to change.
- **`NAV_TREE`'s Money › Accounts row is `{view:'budget', sub:'accounts'}`**, so the ordinary
  registry answers it. Finance stays lit in the bottom nav and the sidebar while Accounts is
  open, the Accounts row is selected, and the selection is remembered for the session.
- **Account data refreshes reach both surfaces.** The sync listener asks
  `S.view==='budget' && budgetView==='accounts'` instead of probing an overlay's display, and
  `saveAccounts()` rebuilds the Overview's account card when Finance is the live view — a string
  build that writes nothing.
- **Accessibility.** Six `role="tab"` buttons each carrying `aria-controls`, six
  `role="tabpanel"` panels each carrying `aria-labelledby`, exactly one `aria-selected="true"` in
  the strip, and hidden panels behind `.hidden` (`display:none`) so none is exposed as selected.

**Verified locally in the in-app browser on `localhost:8765` against a synthetic fixture**
(invented income sources, categories, transactions, accounts and balances — no real account was
signed into, read or written, and no production Firebase data or deployed rule was touched),
with `localStorage.setItem`/`removeItem` intercepted and a before/after key diff around every
read-only run: Finance opens on Overview; all six tabs show their own panel and hide the other
five; the Accounts tab is revealed and `aria-selected="true"` at 320–1440; Overview → *Open
accounts*, Week → History & tools → Accounts, Home's net-worth *Manage →*, Stats › Finance's
*Open account records →*, the Stats EVIDENCE screen's link and the sidebar row all reach the
same panel with `navCurrentRow()==='accounts'` and the Finance destination still lit; browser
Back from Home → Accounts returns to Home; leaving Finance for Log and returning lands back on
Accounts. **Zero localStorage writes and zero changed keys** across all of it. Account add
(asset and tracked debt), rename, balance update (history grew, hero and Overview both moved),
statement balance, Mark statement as paid and delete-with-confirm all still work through the
unchanged `saveAccounts()` + `renderAccountsPage()` path. Five account states checked — none,
assets only, debts only, debt fully covered, and accounts with no history (the chart's own empty
state) — in the panel and in the Overview card. Widths 320 / 375 / 390 / 414 / 720 (≈200% zoom
of 1440) / 932-landscape / 1024 / 1440 in both themes: no page overflow, no overlay top bar or
Back button left in the panel, and no clipped control except a **pre-existing** one at 320px
(the account card's balance-row label column squeezes below its text; the card's content box is
256px there, exactly what the overlay produced, so it is unchanged by this work and does not
occur at 375+). Zero console errors throughout.
`node --check js/app.js` passes, `git diff --check` is clean, and
`node --test tests/*.test.cjs` → **109/109**, with `tests/budget-overview.test.cjs` rewritten
around the new contract (Accounts in `BUD_VIEWS` exactly once, one tab and one panel, the
overlay/launcher/`closeAccounts` all gone from markup, source and every stylesheet,
`openAccounts()` free of overlay manipulation, the nav tree routing through the subview, the
store and sync registration unchanged, rendering write-free, and the tablist's six tabs and six
panels). `CACHE_NAME` is `daily-v329`.

**NOT verified:** no real signed-in account was used, read, written or cleared, and no
production Firebase data or deployed rules were touched — the sync suites pass but they are
isolated, so nothing here is a cloud test. The signed-in fresh-profile check has NOT been run;
this change registers no store and performs no migration, so it does not carry the risk that
scenario exists to catch, but the claim stands as untested either way. No physical device —
phone, landscape and 200%-zoom layouts were checked at the equivalent CSS-pixel viewport in a
desktop browser, so safe-area insets and the standalone status bar are inferred from the
existing CSS rather than observed; in particular the overlay's old
`padding-bottom: env(safe-area-inset-bottom)` is now the deck panel's, which was not observed on
hardware. **Nothing has been committed or pushed.**

### Budget: "This month" opens this month — v328 (local, NOT pushed)

One correction to the Overview below, nothing else. Budget › Overview's **This month** card
always describes the CURRENT calendar month (`getMonthDate(0)`), but its *Open month →* action
was the plain `setBudgetView('month')`, which preserves `currentMonthOffset` — so after paging
Month back to June, the card showing September's figures opened June.

- **New helper `openBudgetCurrentMonth()`** (beside `openBillsCalendar()`): sets
  `currentMonthOffset=0`, then `setBudgetView('month')`. Two lines, in memory exactly like
  `currentWeekIdx`. It deliberately does NOT call `setView()` — it is only ever pressed from
  inside Budget, unlike `openBudgetWeek()` / `openBudgetOverview()` / `openBillsCalendar()`.
- **Exactly one caller**, the `budOvMonthHtml()` header action. **Every other Month entry point
  is untouched and still remembers the browsed month**: the `bv-month-btn` tab and the History
  & tools link in `index.html`, `navGo()`'s `setBudgetView(t.sub)` for Money › Month,
  `returnFromSourceView()`'s `setBudgetView(dest.tab||'month')`, and `setView('budget')`'s
  `setBudgetView(budgetView)`. Those name the Month WORKSPACE, not a month, and a control that
  silently rewound your position would be the worse bug.
- **No storage, migration, Firebase path, sync registration or calculation changed** — the diff
  is a two-line function, one onclick, comments, the tests and the cache name. The Overview is
  still read-only.

**Verified locally in the in-app browser on `localhost:8765` against a synthetic fixture** (no
real account signed into, read or written): Month paged back three months, back to Overview —
the card still describes September and still prints September's figures — then *Open month →*
lands on September with `currentMonthOffset` at 0. The Month tab, History & tools → Month and
Money › Month all still return to the browsed month after the same detour. Repeated at 375px
and 1440px. Zero console errors, and a `setItem`/`removeItem` interceptor plus a before/after
key diff recorded **zero localStorage writes** across the whole sequence.
`node --test tests/*.test.cjs` → **102/102**, with two new checks: the helper run against a
stubbed `setBudgetView` proving the reset lands before the switch (and that it is idempotent
and touches no storage), and an assertion that the other five entry points were not converted
to it. `node --check js/app.js` passes and `git diff --check` is clean. `CACHE_NAME` is
`daily-v328`. **Nothing has been committed or pushed.**

### Budget: the Overview — v327 (local, NOT pushed)

Budget gains a fifth view, **Overview**, as its first tab and the screen a fresh session lands
on: Overview · Week · Month · Bills · Yearly, with the Accounts button unchanged beside the
strip and still outside the `role="tablist"`. It is a current-position and decision screen —
available to spend this week, Needs attention, Coming up (the pay-cycle projection plus a
preview of the existing 14-day bill window), an Accounts snapshot and a This-month summary —
and it leads into Week, Bills, Month and Accounts to act. Stats › Finance is untouched and is
still where completed weeks and longer ranges are ANALYSED. Design rationale is in
`CLAUDE.md`; the safety-critical parts are here.

- **No new store, path, registration, migration or boot write.** The diff contains no
  `localStorage` / `lsSave` / `lsSaveTS` / `SYNC_BLOB_REG` / `firebase` / `schemaVersion` /
  `_bootPhase` / `Date.now()` / `updatedAt` line at all (audited), and a before/after
  localStorage diff across opening the Overview and cycling all five views plus Home and Stats
  recorded **zero writes** — no `setItem`, no `removeItem`. The one write the screen can cause
  is Add expense, through the existing `openTxnModal()` / `txnCommitSave()` path.
- **Every canonical helper is unchanged.** 96 finance, schedule, account, transaction and sync
  helpers were byte-compared against the previous commit — `weekIncome`, `weekFixedTotal`,
  `weekVarTotal`, `weekSavedAmt`, `weekLeftover`, `statsWeekParts`, `varCatAmount`,
  `billOccurrences`, `catOccurrencesBetween`, `payCycleForecast`, `budTimelineWindow`,
  `billRowHtml`, the account totals, `budWriteFields`/`budSaveDraft`, `lsSave`/`lsSaveTS`,
  the `syncBlob*` family and the rest — all identical once comments are stripped.
- **Nine functions changed, all deliberately**: `setBudgetView` (registry-driven, five views,
  `segScrollToTab`), `setView` (Budget now applies the remembered view), `navCurrentRow`
  (reads the row off `BUD_VIEWS`), `renderBudgetTab` (renders the Overview from its tail when
  it is the active view), `budRecalc` (goes through `budAvailable()` and `budPaceText()` —
  same arithmetic, same output), `renderOutlookCard` (uses the extracted `budForecastPart()`),
  `buildFinanceCheckinCard` (uses `budWeekMoney()`, and its Open Budget action now opens the
  Overview), `openBudgetSetup` (switches to Week first, since it is reachable from a view that
  does not show the cards it unlocks) and `monthSpendBreakdown` (an optional
  `{register:false}` that skips evidence registration for a summary caller). Fourteen functions
  were added; none were removed.
- **"Available to spend" now has one definition**, `budAvailable(income, committed, spent,
  saved)`, returning NULL — not zero — when no income has been entered. `budWeekMoney(d, key)`
  supplies its components from the canonical readers. Home's Finance check-in had its own copy
  of that subtraction (and read `sav_amount` directly rather than through `weekSavedAmt()`);
  it goes through the shared reader now. Verified in the browser: the Week hero and the
  Overview print identical Available / Spent / Committed / Saved and an identical pace line
  from the same week, and the Overview follows a typed savings figure the moment it is entered.
- **The tab strip became `.seg-scroll`.** `.seg-fill`'s buttons never shrink, so five labels
  plus the Accounts button spill over each other on a phone; Stats' six tabs already scroll for
  this reason. `#view-budget .bud-topnav > .seg-tabs` is `flex:1 1 0; min-width:180px` — basis
  0 because a wrapping flex row breaks lines on the hypothetical size, and with `auto` the
  Accounts button wrapped onto a second row at 375px where both fit. One row measured at 320 /
  375 / 390 / 414 / 932-landscape / 720 / 1024 / 1440.

**Verified locally in the in-app browser on `localhost:8765` against a synthetic fixture**
(invented income sources, categories, transactions, accounts and balances — no real account was
signed into, read or written, and no production Firebase data or deployed rule was touched):
the Overview renders and is the landing view on a cold load and on a `#budget` reload; the
Week hero and the Overview agree to the dollar; Add expense saves through the existing modal
and refreshes the Overview in place without leaving the view; Accounts opens from the Overview
and closes back to it with launcher focus restored and the nav row correct; Home's Finance
check-in opens the Overview while `openBudgetWeek()`, `openBillsCalendar()` and Stats'
source-week link still open their own views; the selected week index, the month offset and a
typed draft all survive a trip through every view; zero console errors across a full cycle of
five views plus Accounts, Home and Stats. Seventeen states checked by swapping the fixture: no
setup at all, income with no spending, spending with no income, on track, overspent, a tight
before-pay position, a negative before-pay forecast, no configured payday, no bills in the next
14 days, undated recurring charges, a bill due today, no accounts, assets only, debts only,
debt fully covered, an overdue statement, an upcoming statement, no recorded month history and
a legacy aggregate-only month (which correctly refuses to name a biggest category). Widths
320 / 375 / 390 / 414 / 720 (≈200% zoom of 1440) / 932-landscape / 1024 / 1440 in both themes:
no page overflow, no clipped element, the top row one line at every one of them, and the two
desktop columns keeping independent heights (590×169 / 590×581 beside 491×216 / 491×217 at
1440). `node --test tests/*.test.cjs` → **100/100**, including a new
`tests/budget-overview.test.cjs` (18 checks: the registry against the markup in both
directions, the default view, the Accounts-is-not-a-tab rule, the nav mapping, the entry
points, the canonical arithmetic and its null rule against fixtures, the pace rule, the shared
projection, the read-only source, `BUD_CARDS` staying the Week layout, the evidence-free month
read, the three-item attention cap and the truncated-preview/complete-total split).
`CACHE_NAME` was `daily-v327` at this release; it is `daily-v328` after the correction above.

**NOT verified:** no real signed-in account was used, read, written or cleared, and no
production Firebase data or deployed rules were touched — the sync suites pass but they are
isolated, so nothing here is a cloud test. The signed-in fresh-profile check has not been run:
this change registers no store and writes nothing, so it does not carry the risk that scenario
exists to catch, but the claim stands as untested either way. No physical device — phone,
landscape and 200%-zoom layouts were checked at the equivalent CSS-pixel viewport in a desktop
browser, so safe-area insets and the standalone status bar are inferred from the existing CSS
rather than observed. **Nothing has been committed or pushed.**

### Budget: Outlook projection wording — v326 (local follow-up)

The projection unit now reads “estimated left before your next pay” or “estimated shortfall
before your next pay.” This is shorter and does not imply the upcoming pay is included in the
figure. The coloured `.fc-card` left-rail declarations were removed: the rail had never won
the card border cascade, and the figure remains the one visible green/amber/red state signal.
Presentation only; no calculation, storage, sync or Firebase path changed. `CACHE_NAME` is
`daily-v326`. `node --test tests/*.test.cjs` remains 82/82.

### Budget: Outlook projection polish — v325 (released; see git log)

Presentation only, on the Outlook card's *Until next pay* half. No store, sync
registration, Firebase path, migration, boot write or finance calculation added or
changed; the 47-helper byte-compare against v324 is clean, and `payCycleForecast` is
untouched.

- The three supporting facts were stacked grey sentences at one size and weight, under a
  figure with nothing structural beneath it. They are **cells** now, via a new `fcSplit()`
  over the app's own `.card-split` vocabulary: **Payday** / date / countdown and **Bills
  before then** / total / count. The half now has the same shape as the timeline's
  labelled header row beneath it, which is what it was failing to match.
- Copy: the unit says what the number means (“projected to still be available on payday” /
  “projected shortfall by payday”) instead of naming the operation; “dated in the list
  below” is gone, since it pointed at a list already on screen; the no-income state's
  middot run-on became a caption under the cells.
- **One real bug fixed:** the no-projection state had `tone=''`, so with no income entered
  the figure — which is then the BILLS DUE — was painted `--positive`. It is `is-plain`
  now, the same as the no-payday branch, on the same reasoning: nothing has been judged.
- `.fc-line`, `.fc-line-2` and `.fc-ok` lost their only caller and are gone.

Verified in the in-app browser against a synthetic fixture, all four states: healthy
(green), tight (amber), shortfall (red) and no-income (neutral). 375px light and 1200px
dark, no clipping and no overflow, cells even at 140px each on a phone.
`node --test tests/*.test.cjs` — 82/82. `CACHE_NAME` is `daily-v325`.

The coloured left rail was still only a reported dead declaration at this release; v326
removed it deliberately and retained the figure as the state signal.

### Budget: Fixed expenses card corrections — v324 (released; see git log)

Two follow-ups to v323, both on the Fixed expenses card. No store, sync registration, Firebase
path, migration, boot write or finance calculation added or changed; the 47-helper byte-compare
against the v323 commit is clean.

- **`#sum-fix` prints cents** (`fmtMoneyExact`), because it heads the itemised rows. A $201
  header above a $201.08 recurring subtotal read as a discrepancy when it was only rounding —
  the same fault `#calc-variable` was already fixed for. `#plan-fix-sum` deliberately stays
  `toFixed(0)`: it sits in a whole-dollar column whose subtraction is printed under it.
- **The recurring breakdown remembers whether it is open**, in the existing device-local
  `daily_budget_ui` blob as `recurOpen`. This also fixed a quieter bug: the old inline toggle
  wrote `style.display` over a hardcoded `display:none`, so it shut on every re-render (week
  change, Edit, typing an amount), not just on reload. **`daily_budget_ui` is now written
  read-modify-write** (`budUiLoad()` / `budUiSave(patch)`) — `budSetSpendView()` used to
  stringify a fresh single-key object, which would have erased `recurOpen` on the next
  breakdown switch. Still plain `setItem`, never the three-argument `lsSave`, still excluded
  from `exportAllData()`. The disclosure head became a real control: `role="button"`,
  `tabindex="0"`, `aria-expanded`, Enter/Space, and a `:focus-visible` ring (needed, because
  the app suppresses the UA outline globally).

Verified in the in-app browser against a synthetic fixture: the open state survives a full
reload and a week round trip; changing the spending breakdown keeps the list open and toggling
the list keeps the breakdown — the clobbering case; Enter toggles from the keyboard; a fresh
device gets closed/category defaults and reading a preference writes nothing (it runs during a
render). `node --test tests/*.test.cjs` — **82/82**, with three new checks covering the
read-modify-write, the defaults, and a corrupt blob. `CACHE_NAME` is `daily-v324`.

**Worth knowing:** the stale-CSS confusion hit during this work was the service worker doing
exactly what it is designed to do — a cached `budget-home.css` from before the edit. If a CSS
change appears not to apply locally, clear the caches and unregister the worker before
suspecting the rule.

### Budget: Fixed expenses, Accounts access, 14-day outlook — v323 (released; see git log)

Presentation, navigation and one read-only schedule window. **No localStorage key, Firebase
path, sync registration, timestamp, category rewrite, boot write, migration, security rule or
finance calculation was added or changed.** Audited two ways: the diff contains no
`localStorage` / `lsSave` / `lsSaveTS` / `SYNC_BLOB_REG` / `firebase` / `schemaVersion` /
`_bootPhase` line at all, and every canonical finance, schedule and sync helper was
byte-compared against `HEAD` — 47 of them, all identical once comments are stripped
(`payCycleForecast`'s only diff is a comment naming the renamed caller). Design rationale in
`CLAUDE.md`.

Three changes:

1. **Fixed expenses is its own card again**, directly below Spending in the phone stack and in
   the desktop left column — one line added to `BUD_CARDS`, which stays the single source for
   both layouts. `renderPlanFixSection()` became `renderFixedCardBody()`: same rows, same
   `fix-<id>` input ids, same recurring disclosure with its `/wk` units, same Edit/Done through
   the unchanged `data-action="bud-edit-toggle"` contract. `#sum-fix` moved to the new card's
   header and is **always** visible there (`.bud-head-sum.is-always`) rather than only while
   collapsed — that visibility is the whole point of the move. Week plan keeps a quiet,
   non-editable echo on a distinct id, `#plan-fix-sum`, written from the same `totalFixed` in
   the same `budRecalc` pass, so income − fixed − savings still reads there. The card's collapse
   key is `fix`, which is what the pre-v320 Fixed card used, so an existing collapsed preference
   is honoured and everyone else gets it open.
2. **An Accounts button beside the four view tabs.** `#budget-view-tabs` is now wrapped in
   `.bud-topnav`, which takes over the sticky + bleed treatment; the button sits OUTSIDE the
   `role="tablist"` because Accounts is an overlay, not a fifth `budgetView`. It calls the
   existing `openAccounts()`; `setBudgetView('accounts')` is never invoked and no fifth tab is
   faked. `openAccounts(from)` now records the launcher (defaulting to `document.activeElement`,
   so every existing entry point is covered) and `closeAccounts()` returns focus to it when it
   is still on screen. The row wraps to a second line below ~340px rather than letting the
   never-shrinking `.seg-fill` buttons spill over the button beside them.
3. **Outlook holds two labelled parts.** *Until next pay* is the unchanged
   `payCycleForecast(available, week)` projection. *Next 14 days* is a complete schedule from
   `billOccurrences(today, today+13)` — inclusive at both ends, calendar arithmetic
   (`new Date(y, m, d+n)`), drawn with the Bills calendar's own `billRowHtml`, so the two
   surfaces cannot disagree. It is never truncated, never stopped at payday, has no 30-day
   fallback and no nested scroll box, and carries its own total, labelled to say when card
   statements are in it. **The fortnight total is never subtracted from anything**: the weekly
   hero holds one week of accrual, and the card says so in words. On a past week the projection
   is suppressed and the timeline is labelled as counted from today.
   `budUpcomingRowHtml()` and the `upcomingCharges(30)` fallback branch lost their last caller
   and are gone, with `.up-title` / `.up-account` / `.up-warn` / `.fc-bill*` / `.fc-more` /
   `.fc-card .up-list`. `upcomingCharges()` itself stays — the AI context export still calls it.
   `billRowHtml()` gained a `trial` badge on its meta line (not its title, which is a
   nowrap/ellipsis block); the Bills calendar shows it too, which is correct.

**Verified locally in the in-app browser on `localhost:8765` against a synthetic fixture**
(invented categories, accounts and balances — no real account was signed into, read or written):
Fixed expenses shows its heading and weekly total collapsed and expanded; a fixed edit moves
`#sum-fix`, `#plan-fix-sum`, `#plan-avail`/`#sum-plan` and the hero's Committed/Available
together and by the exact arithmetic, and leaves the spending goal, By category and By day
untouched; Edit/Done, add, rename, delete, the recurring disclosure, the empty state and the
explicit past-week unlock all work; focus survives `budRecalc()` + `budApplyLayout()` mid-typing;
values, savings and notes survive a Home→Log→Stats→Month→Week round trip and reach the store.
Accounts opens from beside the tabs on all four sub-views and closes back to the same sub-view,
week index, tab selection, nav highlight and launcher focus, with a typed draft intact; the
sidebar row and the History & tools link still reach it. The timeline's seven rows and their
exact sum are **identical to the Bills calendar's rows for the same dates**, including a
statement and two bills sharing 19 Sept (biggest first); a weekly bill appears twice; day 13 is
in and day 14 is out with payday tomorrow. Empty states checked: only-undated (empty list, hint
retained), archived/cancelled only, nothing in range, no fixed costs, no named income source (no
projection, timeline still shown), and income not yet entered. Logos: working (18px, `alt=""`),
failed load falling back to the initial, missing site, a legacy emoji prefix stripped, a
50-character account name ellipsised without crowding the amount, and the statement's account
icon — all identical in both themes. Widths 320 (≈120% zoom of a phone) / 375 / 390 / 414 /
932-landscape / 1024 / 1440 / 1920 in both themes: no page overflow, no clipped label, cards
keep independent heights, and in landscape the pinned row and the compact week nav stack without
overlapping. Zero console errors throughout. Home's Finance check-in and the Bills calendar are
unchanged apart from that trial badge.

`node --test tests/*.test.cjs` → **79/79**, including a new `tests/budget-outlook.test.cjs`
(13 checks: window edges, repeated weekly occurrences, month-end clamping, month/year
boundaries, an Australia/Sydney daylight-saving boundary in both directions with the saved
anchor proven read-only, archived/cancelled/non-recurring/undated exclusion, statement
inclusion and ordering, forecast-vs-timeline independence, and the `BUD_CARDS` position).
`CACHE_NAME` was `daily-v323`.

**NOT verified:** no real signed-in account or production Firebase data was used, and no
deployed rule was touched — the sync suites pass but they are isolated, so nothing here is a
cloud test. No physical device: phone and zoom layouts were checked at the equivalent CSS-pixel
viewport in a desktop browser, so safe-area insets and the standalone status bar are inferred
from the existing CSS rather than observed. Logo images come from DuckDuckGo's icon service, so
which specific sites resolve depends on that service, not on this code.

**One pre-existing inconsistency this change makes more visible, and deliberately did not
touch:** the Recurring disclosure lists `activeCats(loadFixCats()).filter(catIsRecurring)`,
which includes a paused or cancelled charge, while `#sum-fix` comes from `weekFixedTotal()`,
which does not. So the recurring subtotal plus the weekly rows can exceed the header figure by
exactly the paused charges. That was equally true inside Week plan before v323 — the rows and
the totals are unchanged — but the card is more prominent now. Fixing it means deciding whether
a paused subscription should stop being listed at all, which is a product call, not a bug fix.

### Weekly Review presentation — v322 (released; commit `4344d83`)

Presentation and copy. No canonical money reader, review record, optional page answer, saved
allocation, draft rule, stale-draft guard, completed snapshot, reopen rule, current-week
restriction, storage key, Firebase path, sync registration or migration was touched — audited,
and verified by a before/after localStorage diff across every section, every selectable week
and every disclosure, twice: zero writes. Full rationale in `CLAUDE.md`.

**Verified locally in an isolated browser profile on `localhost` against a synthetic fixture:**
the rail is gone and Review left-aligns with the Stats tab strip (header, landing and insights
all start at the same x); the week `<select>` shows the full label without clipping at 320–1920;
the landing's two summaries sit side by side from 1024 and stack on a phone; insight cards fill
their column at every width (the shrink bug measured 802/620/584px in an 875px list before, 880
/880/880 after, and 367×3 equal in landscape); the review-status chip and the plan chip are
separate statements; not-started, draft, completed, reopened, in-progress-week, no-insight,
switched-off, never-set-up and eight-optional-pages states all render; draft save/cancel and the
stale-draft guard (warning, Save disabled, Reload offered) still work; pending page answers flush
before a section change; a disclosure stays open across a re-render. Widths 320/390/414/720
(≈200% zoom of 1440)/844-landscape/1024/1440/1920 in both themes, no overflow anywhere.
`node --test tests/*.test.cjs` → 66/66, including a new `tests/review-presentation.test.cjs`.
`CACHE_NAME` is `daily-v322`.

**NOT verified:** no real signed-in account was used, read, written or cleared; no production
Firebase data or deployed rules were touched. No physical device — phone and 200%-zoom layouts
were checked at the equivalent CSS-pixel viewport in a desktop browser, so safe-area insets and
the standalone status bar are inferred from the existing CSS rather than observed. At 200% zoom
on a desktop the viewport matches the landscape-phone media query, so insights show two-up
there; that is pre-existing behaviour for all of Stats, not new.

### Food hub + Stats in the deck — v321 (released; see git log)

Navigation and presentation. No localStorage key, Firebase path, sync registration, timestamp,
calculation, migration or security rule was added or changed — audited, and verified by a
before/after localStorage diff across every reorganised screen (see below). Design rationale
and the traps are in the Food hub section above and in `CLAUDE.md`.

**Verified locally, in an isolated browser profile on `localhost` against a synthetic fixture:**
five bottom-nav destinations by tap AND by swipe in the same order; Food opens on Today on a
fresh session and remembers its section within one; all four sections and both supporting
screens render and return; the four logging paths (catalogue / custom My Food / recipe /
manual-Unknown); pantry-scoped shopping checks with a second empty pantry staying empty; an
unchanged recipe save preserving `""`, `kg` and `L` units; every Stats section, its charts on
first entry, return visit and rotation, and the evidence overlay's viewport positioning;
Back/Forward across ten steps with no blank, duplicate or mismatched screen; eleven direct-link
reloads including every legacy route, with no console errors; sidebar and hamburger agreement
with a single Stats quick item; empty-data and populated renders; 320/375/932-landscape/1440 in
both themes with no overflow. `node --test tests/*.test.cjs` → 59/59, including a new
`tests/food-nav.test.cjs` (10 routing checks).

**NOT verified, and it should not be described otherwise:** no real signed-in account was used,
read, written or cleared, and no production Firebase data or deployed rules were touched. The
fresh-profile-signing-into-populated-cloud check has not been run for this change — it is a
navigation change that registers no store, so it does not carry the sync risk that scenario
exists to catch, but the claim stands as untested either way. There is no real iOS/Android
device check: the phone layouts were verified in a desktop browser at phone viewport sizes, so
safe-area insets and the standalone-PWA status bar are inferred from the existing CSS rather
than observed. `CACHE_NAME` is `daily-v321`. **Nothing has been pushed.**

**One thing the prompt asked for that does not exist to preserve:** Food › Today has no DATE
SELECTOR, and never had one — `nutRender()` reads `getLocalDate()` and `nutLogSelected()` /
`nutSaveManual()` / `nutLogRecipeSnapshot()` all stamp `date: getLocalDate()`. Every new entry
is dated today; past days are read-only through Stats › Nutrition and the "copy yesterday's
meal" action. That behaviour is unchanged by this work (verified: four new entries all dated
today, the previous day's entry untouched). Adding back-dated logging would be a feature
change to the save path, not a navigation change, so it was deliberately not attempted.

### Weekly reset — v317

- Personal public starter template removed. Fresh setup has Money and Next Week as core;
  optional/custom pages are configured in the private baseline editor. The landing leads
  with the dated next-week allocation and What Daily noticed.
- Additive fields: `daily_review_plan.pages`; each `daily_reviews` record's `pageAnswers`
  and `nextWeek`. Same stores, paths, registration and schemaVersion. See CLAUDE.md for field
  shapes, snapshot protection, old-client limits and responsive boundaries.
- Next-week drafts save explicitly and detect changed local/cloud revisions. Following-week
  comparisons use the accepted allocation; completed snapshots stay frozen. No Budget,
  Accounts, workout, Journal or nutrition mutation occurs.
- Review uploads use per-week timestamp transactions, cloud winning ties. Boot/cloud-apply
  uploads are suppressed; local saves preserve newer same-week records and unrelated weeks.
- Verification uses synthetic local browser data and mocked Firebase. No production account
  or deployed Firebase rules were inspected. Source rules require auth.uid to match the
  user subtree; source inspection does not verify which rules are currently deployed.

### Home desktop Dashboard + the rebuilt Home Layout editor — 2026-09-07 (RELEASED as `daily-v310`, `7192075`)

Presentation plus one additive change to an existing synced store. Live on `main`.

- **Home gains a second DESKTOP composition.** `composition:'dashboard'` renders two
  independent vertical stacks (`dashboard.main` / `dashboard.summary`) instead of the row
  grid, so a tall card stops stretching the card beside it. Grid is unchanged, is still the
  default, and is what a profile carrying neither field means — **there is no migration and
  nothing is switched on at boot**. Full design rationale, the resolver rules and the CSS
  decisions are in `CLAUDE.md`; the safety-critical parts are here.
- **The synced store `daily_home_layout` gains two fields on its DESKTOP profile only:**
  `composition` (`'grid'|'dashboard'`) and `dashboard` (`{main:[ids],summary:[ids]}`). No new
  localStorage key, no new Firebase path, no new sync registration, no `schemaVersion` change,
  no boot migration. `homeLayoutProfileNormalise()` is the one place they are defaulted, and
  it defaults to Grid.
- **Boot is still stamp-safe.** Reading the store canonicalises it (adding the two fields) and
  writes back through `lsSave`, which respects `_bootPhase` — verified against a pre-v310
  layout with a fixed `updatedAt`: both per-profile `updatedAt` values and
  `daily_home_layout_ts` came back unchanged and Home rendered Grid. Never restore a raw
  `Date.now()` here.
- **Settings > Home Layout now edits DRAFTS.** `saveHomeLayout()` is still the only write path
  and still stamps one profile; nothing else in the editor writes. Cancel, preview, switching
  the profile tab, resizing, opening Home or Settings, and an incoming cloud snapshot all write
  nothing. Applying the desktop profile cannot stamp the iPhone one or the reverse — the
  per-profile `updatedAt` that `homeLayoutsMerge()` compares depends on that.
- **A cloud update arriving under an open draft is surfaced, never resolved silently.**
  `hlStale()` compares the saved profile's `updatedAt` against the value the draft was forked
  from; Apply refuses while it differs and the user picks *Keep my changes* or *Use the updated
  layout*.
- **Old-client limit, documented rather than assumed.** A device still on a pre-v310 build
  strips both new fields when it normalises the store. It will not write the stripped copy back
  on its own, but editing the Home layout there uploads a desktop profile without them, and the
  updated device then reads Grid (Grid order and widths intact, column arrays lost). Refresh
  the old device; there is no client-side fix.
- **Backup/restore round-trips.** `exportAllData()` copies the key verbatim and the restore
  path's re-stamp block goes through `homeLayoutsNormalise()`, which preserves both fields —
  checked end to end on an isolated fixture.
- **Testing, and what was NOT tested.** `node --test tests/sync-safety.test.cjs
  tests/sync-extra.test.cjs` — 32/32 pass, unchanged. A 50-check behavioural suite
  (`temp-analysis/layout-tests.js`, a working file, not a repo asset) passes against an
  isolated localhost fixture in a disposable headless-Chrome profile: partition order, apply /
  cancel / revert, per-profile isolation, hide-show position, unknown and duplicate ids,
  normalise round trips, merge, stale-draft detection, and the copy directions. Home was
  pixel-diffed against the same commit's Grid build at 375, 414 and 932-landscape — identical
  apart from the weather card's time-driven moon, which also differs between two runs of the
  same build. **No real signed-in account was used, read, written or cleared, and no
  production data was touched**; the fixture is the user's own already-taken export, seeded
  into a throwaway browser profile on `localhost` and never signed in. The signed-in
  fresh-profile check has therefore NOT been run for this change either — same limitation as
  v308, and it should not be described as verified against real cloud data.
- `CACHE_NAME` is `daily-v310`.

**Follow-up, `daily-v312`: Home's card family.** Presentation only — the diff touches no
storage, sync, timestamp, calculation or review-record path (audited). Every Home card now uses
`cardHeader()`; the session hero is recomposed as a grid (241px → 187px at 1440, phone hero
pixel-identical) with its action labelled from the live set state; Week in review names the
week its figures cover and the older week still awaiting a review; Nutrition reads its state
from `nutDaySummary` so an unlogged day says so instead of showing its untouched target as a
green remaining figure, and shows snacks. Full design notes in `CLAUDE.md`. Two things a future
change should not undo:

- **`#view-home .home-grid-cols > .home-card > .hero-workout-card{display:grid}`** — the legacy
  Grid's stretch rule sets `display:flex` on every card's inner element and would otherwise
  flatten the hero back into one column.
- **The phone's nutrition composition is restored deliberately** (`display:contents` + `order`).
  A first attempt let the desktop grouping reach the phone and grew that card by 121px. Portrait
  Home is now 19px taller in total, landscape 28px, and the hero is unchanged.

Verified in an isolated headless profile against an existing export: 1024/1440/1920/2560,
375/390/414, landscape 932, 200% zoom, both themes, both compositions, and the empty, partial,
complete, legacy, over-target and missing-goal nutrition states. 32/32 sync tests unchanged. No
real device and no signed-in account were used.

**Follow-up, same day, `daily-v311`: the Dashboard weather card's height.** Sized to its own
content the card is a 5:1 letterbox — in the Grid it never showed, because a row partner
happened to stretch it. It now takes `min-height:clamp(150px, 42cqw, 230px)` in a Dashboard
column, from a container declared on its own wrapper. Two things learned here and worth not
rediscovering:

- **`aspect-ratio` with a min/max-height transfers those limits back into min/max-WIDTH.** The
  first attempt (`aspect-ratio:12/5;min-height:150px;max-height:210px`) made the card 360px
  wide inside a 280px column at 1024 and only 504px inside a 631px one at 1920. Container
  units ask the wrapper how wide it is and leave the width alone.
- **Rain and snow travel a fixed pixel distance** tuned when this card was ~100px tall, so a
  taller one left a dry band under them. `--wfx-fall-n` / `--wfx-snow-n` scale the travel AND
  the animation duration together, so the precipitation reaches the bottom edge at the same
  falling speed. They are unitless because CSS cannot divide a length by a length to recover
  the number a duration needs, and they **default to 1** — the Grid, the phone and landscape
  are byte-identical, verified by a same-minute pixel diff at 375, 414, 932-landscape and
  desktop Grid 1024 / 1440 / 1920 (0 differing pixels at every one).

### Local sync hardening — 2026-09-07 (RELEASED as daily-v308, isolated tests only)

- `syncBlobPush` and `lsSaveTS` suppress uploads during `_bootPhase` and cloud-apply callbacks.
  `syncBlobCommit` compares timestamps in a Firebase transaction, so a stale initial read
  cannot authorize a later overwrite. Never turn timestamp 0 into `Date.now()` on upload.
  Equal content still adopts the cloud timestamp; read-time normalisation keeps that age.
- Sessions and weights use `wtAttachRecords` / `wtPersistRecords` / `wtPushRecords` and
  transactions on individual children. Do not reintroduce whole-collection `.set()` for
  ordinary saves or sign-in. Actual edited records receive `updatedAt`; explicit deletions
  retain `deletedAt` markers in the EXISTING `wt_sessions` / `wt_weight` arrays and cloud
  paths. `load()` / `loadWeights()` expose only live records. Backups retain the markers.
  There is no new synced store or boot migration. Explicit restore remains authoritative
  and re-stamps record timestamps as well as blob timestamps.
- A legacy weight source is removed only after the canonical upload resolves successfully.
- `_cloudWorkoutReady` gates onboarding completion after sign-in. Auth success or a six-second
  timer is not evidence that the user's cloud data is empty.
- Second pass, same day: the paths pass 1 had left out. The savings log and budget weeks were
  still whole-node writes (`pushSavings`, `syncBudgetDataToFirebase`, the budgetData listener) —
  now per child through `wtPushRecords` / `budPushWeeks`. `budgetConfig` converges through
  `budPushConfig` by its own `updatedAt`, and `saveBudgetConfig` no longer stamps `Date.now()`
  during boot or a cloud apply. Every `if(!snap.exists()) set(...)` seed goes through
  `fbSeedIfEmpty`, which re-checks emptiness inside the transaction. `syncApply()` wraps every
  cloud-apply block so a render triggered by an incoming snapshot cannot echo it back as a
  fresh edit. `syncTrack()`/`syncDetachAll()` release EVERY listener on an account change —
  the old per-callback `let` refs meant sign-out detached nothing but sessions and weights.
  The nutrition log's convergence is a transaction rather than a set of an earlier merge.
- `_cloudReadFailed` distinguishes "still loading" from "the read failed". A failure asks the
  user before finishing setup rather than blocking forever; it is still never read as proof
  that the account is empty. `_cloudApplied` makes the gate wait for the workout listeners to
  have applied a snapshot, not just for a parallel `once()` to resolve.
- Tests: `node --test tests/sync-safety.test.cjs tests/sync-extra.test.cjs` (32 checks; the
  shared VM fixture is `tests/harness.cjs`). To run the isolated complete-app browser fixture,
  first `node tests/build-sync-browser.cjs`, serve the repo, then open `/tests/sync-browser.html`.
  It replaces Firebase and localStorage with synthetic in-memory stores and never contacts the
  real database. The generated HTML is not a production asset.
- Local browser and isolated fresh-profile checks pass. The real signed-in fresh-profile check
  was offered as the release gate and **deliberately waived by the user**, who accepted the
  remaining risks; it was never run, and no production account was read, modified or cleared.
  Do not describe this work as verified against real data. See `tests/SYNC-SAFETY-REVIEW.md`
  for what was and was not tested — in particular that an un-updated older device can still
  issue whole-store writes until it is refreshed.
- Cache version prepared as `daily-v308`, now covering the logo integration as well: the
  wordmark is a CSS mask inked with `--accent-text` (`css/brand.css`, appended last) and the
  runtime brand assets live in `assets/brand/`; `assets/brand/refined/` is source only and is
  never precached.

The Prompt 42 pantry work described here previously is committed and shipped.

Nothing is uncommitted as of 2026-09-05 beyond documentation. Recently shipped, newest
first: five targeted presentation fixes — the hero surface follows the accent (so Accounts and
Budget > Month/Year stop being the only graphite screens) and the dead `.hm-card` /
`budHeroMetric()` component is deleted; Accounts states net worth once, on the chart card, with
the hero panel reduced to one cell for the debt payoff position; Budget > Month's spending rows
get fixed label/amount columns so every bar starts at one x, and every magnitude bar squares off
behind a new `--radius-bar` token; the Budget week's card order is rebuilt from ONE `BUD_CARDS`
list both layout modes derive from; and Home's weight card shows the last three readings via
`statsSplit()` instead of a sparkline. None of it touches data, storage, calculation or
Firebase. Before that: one navigation registry (`NAV_TREE` drives the desktop sidebar AND the mobile hamburger
as six accordion groups; `MENU_NAV`/`MENU_SECTIONS`/`buildSideMenu()` and the quick-settings
popover are gone) together with a visual-consistency pass (one `.seg-tabs` segmented control
replacing five, a three-step uppercase micro-label scale, Log's cards on the matte
content-card surface with `cardHeader()` headers, the `--accent-hero` migration finished
across every hero, and Nutrition on the radius tokens with a real empty state). Its only new
persisted value is the device-local, backup-excluded `daily_nav_ui`; it performs no migration
and touches no synced store. Before that: Budget › Month's ranked spending breakdown (the donut is gone), Budget › Week's Day by
day card, the hero-card consolidation (one `.hero-panel` for
Budget › Month, Year and Accounts),
Budget/Accounts hierarchy wording, Log Today weight cards, the Log training hub
(`83f9969` then `54073ce`), the Weekly Review, and the Kitchen favourite change.
`CACHE_NAME` is at `daily-v300`.

The workout hub adds **no** synced store and performs **no** migration, so it does not carry
the fresh-profile sync risk the Weekly Review does. The Weekly Review's two stores
(`daily_review_plan`, `daily_reviews`) still want a check against a real signed-in account
with existing cloud data if that has not happened yet.

`.claude/settings.local.json` is a local working file unrelated to the app implementation.

## Uncertain / not verified — flagging rather than guessing

- No Google Cloud Console / OAuth consent screen configuration (authorized domains, consent
  screen publishing status, test-user list) is visible from this repo — if a sign-in failure
  is domain- or consent-screen-related rather than embedded-browser-related, that needs
  checking in the Firebase/Google Cloud console directly, not in this codebase.
- No record in this repo of whether `firebase deploy` (for `database.rules.json`) has ever
  been run for the current rules content, or who has the Firebase CLI credentials to do so —
  confirm the rules file matches what's actually live before assuming a rules change here is
  the same as a rules change deployed.
- No explicit multi-user/multi-account handling was found beyond the single Google account
  Francois uses — if a second user ever signs in, behavior is untested.
