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
- **Log** — the workout hub: four sections behind one sub-tab strip (Today / Program /
  Exercises / History). Today lands on an overview and opens the set logger from it; Program
  holds the live split plus its saved snapshots; Exercises and History are the screens that
  used to be full-screen overlays. See the Weekly Review / Workout hub notes below and
  `CLAUDE.md` for the traps.
- **Stats** — history/training/body/nutrition/finance sub-tabs, charts, PRs.
- **Kitchen** — recipe book, shopping list, pantry tracker, cooking mode.
- **Budget** — weekly income/expense tracker, CSV export, charts.
- **Accounts** — net worth / debt payoff tracking.
- **Plans**, **Notes**, **Settings** — secondary screens (see `CLAUDE.md` for full detail per
  area if you need it; not reproduced here). Plans holds imported HTML plan DOCUMENTS only —
  saved workout programs live in Log › Program.

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

**There is no automated test suite, no linter config, and no CI pipeline in this repo.**
Verification is manual, against the live-reloaded static files, before every push to `main`
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
7. Francois is not a developer — he runs prompt files from `Prompts/` (numbered,
   `NN-MODEL-slug.md`) through the coding agent and verifies against a numbered checklist he
   can eyeball on his phone. If you're producing a prompt file yourself, match that format:
   codebase context → spec → numbered verification checklist.

No staging environment exists — a push to `main` is live immediately at
`sourgits.github.io/daily-app`.

## Workout hub (Log)

Log holds Today / Program / Exercises / History. Three things a future change must not undo:

- **No migration, and none is needed.** Programs and imported HTML plan documents share the
  existing `wt_plans` store and are separated at render time (`planIsProgram()` vs
  `type==='html'`). Nothing was rewritten, moved between stores or deleted. The retired Plans
  streak's `streak` field is still stored and simply never read — removing it would BE a
  migration. Each view's selection (`logProgSel`, `plansDocSel`) is in-memory so that merely
  browsing a program cannot write to a synced store.
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
`training` key and its visible row, and opens Log > Program.

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

## Current unfinished work

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

`.claude/settings.local.json` and untracked files under `Prompts/` are local working files and
are unrelated to the app implementation.

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
