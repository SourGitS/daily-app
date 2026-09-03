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
- **Log** — workout logging: sets/reps, rest timer, session timer, exercise swap, exercise
  library, effort rating.
- **Stats** — history/training/body/nutrition/finance sub-tabs, charts, PRs.
- **Kitchen** — recipe book, shopping list, pantry tracker, cooking mode.
- **Budget** — weekly income/expense tracker, CSV export, charts.
- **Accounts** — net worth / debt payoff tracking.
- **Plans**, **Notes**, **Settings** — secondary screens (see `CLAUDE.md` for full detail per
  area if you need it; not reproduced here).

## Tech stack, hosting, structure

- Vanilla HTML/CSS/JS. **No build step, no bundler, no package.json, no npm scripts.**
- Entry point `index.html`, loads NINE CSS files in a fixed cascade order (do not reorder the
  `<link>` tags; new ones are appended, never inserted) and one `js/app.js` (~24,500 lines,
  all app logic). Both of these counts have gone stale in this file before — `wc -l` and
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

The Prompt 42 pantry work described here previously is committed and shipped.

Uncommitted on `main` as of 2026-09-03: the Weekly Review feature (new `css/review.css`, the
`wkr*` block in `js/app.js`, the `review` AI scope, `CACHE_NAME` at `daily-v286`). Verified
locally against a seeded multi-week budget — reconciliation against Stats → Finance, plan
snapshotting, the per-week sync merge, backup round trip, phone/desktop and light/dark.
**Not yet verified against a real signed-in account with existing cloud data**, which the
sync rules above require before a push, because it adds two synced stores.

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
