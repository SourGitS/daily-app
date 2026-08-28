# PROMPT 31 — Finish and Verify the Stats Insight-System Implementation

## HANDOFF PURPOSE

Continue an in-progress implementation of `Prompts/30-OPUS-stats-insight-system.md`.
Do not restart the design or discard the current work. Audit it carefully, finish the next
coherent shippable phase, and verify it against real populated states before reporting.

Read `AGENTS.md` completely first, then read all of
`Prompts/30-OPUS-stats-insight-system.md`. Also inspect `CLAUDE.md`, the Log and Accounts
functional specs, the current diff, every changed Stats/Budget/Accounts/Log helper, and the
relevant CSS. Trust current code over prose, but treat the uncommitted implementation as
unverified work that must earn your confidence.

## WORKTREE STATE — PRESERVE IT

- Worktree is intentionally detached at latest fetched `origin/main`, commit `d8275bb`.
- Do **not** reset, clean, stash, checkout another revision, or overwrite unrelated work.
- Do **not** fetch/rebase again unless there is a concrete reason; the handoff already updated
  from `origin/main` without losing the prompt.
- Current uncommitted app changes:
  - `css/budget-home.css`
  - `css/workout.css`
  - `index.html`
  - `js/app.js`
- Current untracked prompt files:
  - `Prompts/30-OPUS-stats-insight-system.md`
  - this handoff prompt
- Do not commit, push, deploy, or change Firebase rules. Francois must review the report first.

Before editing, run `git status --short`, `git diff --check`, `node --check js/app.js`, and
review the full diff. Preserve every intentional change unless code evidence shows it is wrong.

## WHAT HAS BEEN IMPLEMENTED SO FAR

### Stats information architecture

- Stats now has five tabs: Review, Training, Body, Nutrition and Finance.
- The old Stats History tab/pane was removed.
- Workout History is now a full-screen source-record overlay reached from Log, with the
  existing session details, notes and deletion controls retained there.
- Old `history` sub-tab calls alias to Training for compatibility; the Home recent-workouts
  card now opens Log → Workout History instead of silently landing in Training.
- Review was rebuilt as a small set of evidence-led cross-domain cards rather than Home/widget
  duplication. Weak domains are omitted rather than padded with fake insight.
- Habits are no longer appended to Training.
- Desktop Stats uses deliberate two-column layouts; phone keeps the horizontal tab strip and
  active-tab strip-only scrolling.

### Training correctness

- Warm-ups are excluded from PRs, top-set points, muscle set counts and comparable work.
- Trained-day counts use distinct calendar dates; saved session count remains a separate
  workload fact.
- Universal total training volume was replaced by per-literal-exercise comparable work.
  Timed, bodyweight-only, assisted/negative and warm-up work are not fabricated into a single
  kg-volume total.
- New saved session exercises snapshot muscle classification and measurement unit forward-only.
  Legacy sessions are labelled as falling back to current/inferred metadata.
- Literal performed names and swap breadcrumbs remain authoritative.
- A late correctness pass added `exerciseMetricInfo()`, `setMetricValue()`, revised `getPR()` and
  `getPoints()`, and aligned exercise detail/Home PR history around these rules:
  - timed movements compare seconds;
  - loaded/assisted movements compare signed external load, where closer to zero is progress
    for negative assistance;
  - bodyweight-only counted movements compare repetitions instead of drawing a 0 kg line;
  - histories with different saved measurement units are not combined.
- History/detail set formatting now uses a shared `fmtLoggedSet()` helper.

### Finance correctness

- Export category actuals now route through `varCatAmount(d, weekKey, categoryId)`.
- New current-week writes receive forward-only `statsSnapshot` context containing category
  identity/labels and the target that applied to that week. Historical weeks are not migrated
  or rewritten through current settings.
- Stats category breakdown uses transaction precedence, preserves deleted/raw/frozen category
  IDs, and explicitly labels legacy aggregate/unknown category context.
- Finance trend target lines use saved per-week targets only. Missing historical plans remain
  missing; current defaults are not substituted. The current week is labelled in progress.
- Misleading best/worst/records/goal-management cards were removed from the rendered Finance
  screen. Finance now focuses on net worth, account drivers, spend trend and spend destination.
- Account contribution rows and the shared net-worth card link back to Accounts. Existing
  recorded-balance and stale-account cues remain in the shared renderer.
- A late correctness pass added `statsWeekSpending()` and expanded canonical
  `weekSpending()` / `weekFixedTotal()` / `weekVarTotal()` so deleted-category IDs and
  transaction-backed amounts do not disappear merely because today’s category list changed.
  This is intentionally broader than Stats and needs careful regression testing.

### Body and Nutrition correctness

- Weight logging/deletion and goal editing were moved out of Stats Body and remain in Health;
  Stats links back to the source.
- Changing a target/date starts a forward-only goal episode with `startedAt` and `startWeight`;
  previous weigh-ins remain untouched. Existing legacy goals are labelled as lacking a trusted
  episode start until deliberately saved again.
- Goal rate is withheld until at least six goal-period readings span 21 days and the latest
  check-in is recent. No precise ETA is shown.
- Goal direction/status is cut/maintain/bulk aware. Maintenance uses a symmetric range rather
  than treating weight gain as success and weight loss as failure. Pace is evaluated at the
  latest measurement date, not falsely at today when the reading is stale.
- Nutrition uses calendar days with null gaps, reports logging coverage, marks today as in
  progress, treats the current calorie goal as reference-only, and explicitly states that
  historical macros are unavailable.

### Visual/accessibility work

- New Stats cards use the shared card vocabulary and CSS variables.
- Conclusions, periods and data-quality notes precede charts.
- Runtime accent is used for neutral series; semantic status includes text labels rather than
  relying only on colour.
- Chart tick rotation was constrained where touched.
- New CSS covers Review cards, conclusion/evidence rows, source links, chart boxes, Workout
  History, landscape and desktop layouts.

## VERIFICATION ALREADY DONE — AND ITS LIMITS

Before the final late metric/Finance edits, the app was served locally and inspected in the
in-app browser at:

- phone portrait `390 × 844`, dark and light;
- phone landscape `844 × 390`, dark and light;
- desktop `1440 × 900`, dark and light;
- a custom runtime accent `#7b3fd2`.

At that point there was no horizontal overflow, the five tabs and empty states rendered, the
Workout History overlay opened, and the browser console had no warnings/errors. The local
server was then stopped and the temporary viewport reset.

Those checks used a mostly empty isolated browser profile. They do **not** prove the populated
calculation paths. Also, the late changes to `exerciseMetricInfo()`, `statsWeekSpending()`,
canonical week totals, goal maintenance semantics and completed-day Nutrition coverage were
made after that visual pass. Re-run all syntax, console and browser verification from scratch.

`node --check js/app.js` and `git diff --check` passed immediately before this handoff.

## PRIORITY 1 — AUDIT THE LATE CORRECTNESS CHANGES

Do this before any further redesign.

### Exercise metric audit

Trace and test `exerciseMetricInfo()`, `setMetricValue()`, `getPR()`, `getPoints()`,
`renderChart()`, `renderPRBoard()`, `renderExerciseDetail()`, `computePRHistory()` and
`renderVolumeTrend()` with populated fixtures for:

1. a warm-up heavier than every working set;
2. ordinary positive loaded work;
3. assisted negative loads progressing toward zero;
4. bodyweight counted work with zero external load;
5. timed work, including an optional non-zero load;
6. a literal exercise whose saved unit changes between sessions;
7. two sessions on one date;
8. a current Exercise Library muscle edit after an older snapshotted session.

Confirm units, labels, record dates, chart tooltips and source detail all agree. Do not silently
reinterpret new saved history through current library settings. Legacy fallback must remain
explicit. If the chosen signed-load rule is not supported by the actual Log semantics, fix it
with the narrowest honest model rather than restoring a universal kg claim.

### Finance source audit

Trace `weekSpending()`, `weekFixedTotal()`, `weekVarTotal()`, `statsWeekCatDefs()`,
`statsWeekSpending()`, `renderBSCatBreakdown()`, `renderBSTrend()`, `renderStatsOverview()`,
Budget month/trend consumers, Home week review and CSV export.

Test at minimum:

1. manual `var_<id>` with no transactions;
2. the same category with one or more transactions, which must fully override the manual value;
3. a deleted/archived variable category with transactions;
4. a deleted fixed category retained through explicit value or `fixRates`;
5. a newly written week with saved category labels and target;
6. a legacy snapshot-only week with no category metadata;
7. changing today’s categories/defaults/targets after a completed week;
8. a partial current week beside completed weeks.

Finance category totals, total spend and export must reconcile. Do not use `d.snapshot` merely
because it exists if transaction-backed/per-field actuals are available, but retain an honest
aggregate fallback for genuinely snapshot-only legacy data. Ensure the broader canonical helper
changes do not regress Budget, Home or export.

### Goal and Nutrition audit

Test cut, maintain and bulk episodes, changed goal date/target, a goal saved before any later
check-in, stale readings, fewer than six readings, fewer than 21 days, and a passed target date.
Confirm no exact forecast date is invented and maintenance is symmetric.

Test Nutrition with missing calendar dates, only today logged, sparse completed days and a
current goal that changed after historical calorie totals. Missing dates must remain null, today
must be labelled in progress, and historical macros must remain unavailable.

## PRIORITY 2 — FINISH THE FIRST SHIPPABLE PHASE

The current phase should be considered complete only when correctness, five-tab IA, source-side
actions and honest empty/legacy states are solid. Fix defects found in the audit, but do not
inflate Stats with more charts.

Review the original Prompt 30 checklist closely. In particular:

- ensure every rendered Review card has a real period, evidence-quality statement and working
  domain drill-down;
- keep current schedule targets from being applied retrospectively where historical plan
  schedules were not stored;
- ensure partial current weeks are never called best/worst/comparable records;
- make source-screen actions work from Home, Log and Stats without trapping an overlay;
- retain Account stale/carried-forward wording and exact recorded-balance semantics;
- confirm no removed Finance/History placeholder still consumes grid space;
- check all old `setStatsTab('history')` callers and stale Stats IDs;
- inspect all new inline markup for escaping and nested-interactive-element problems.

## KNOWN REMAINING PRODUCT WORK — DO NOT PRETEND IT IS DONE

The full interconnection model from Prompt 30 is not complete. Existing links reach domain
sources, but chart points and category rows do not yet always open the exact filtered source
records or preserve the precise analysis range on return. Specifically assess and either finish
or report these as the next phase:

- Finance week/category → exact governing transactions or exact manual weekly field;
- net-worth point/account contribution → the balance updates establishing that point;
- muscle/exercise evidence → exact literal session/set filtering;
- weight chart point/pace → exact check-in/goal episode;
- Nutrition period → logged and missing dates;
- stable return-to-analysis context for those drill-downs;
- optional future Daily + AI aggregate handoff without journal text by default.

Chart lifecycle optimisation is also unfinished: ordinary same-tab revisits can still destroy
and recreate charts. Correctness comes first, but do not claim Prompt 30 accessibility/animation
item complete until this is addressed or explicitly deferred.

Do not add historical macro snapshots merely to make the Nutrition page busier. The current
explicit unavailable state is acceptable for this phase.

## RELEASE AND CACHE DISCIPLINE

`service-worker.js` is still unchanged at `daily-v238`. After all HTML/CSS/JS edits and only
after verification is complete, bump `CACHE_NAME` and its nearby version comment to the next
unused version. Do not otherwise redesign the service worker.

Do not commit, push or deploy.

## FINAL VERIFICATION

Re-run the complete checklist from Prompt 30, using populated data rather than only empty
states. At minimum:

1. `node --check js/app.js` and `git diff --check`.
2. Serve the repo over HTTP and check console on load and through every Stats tab/drill-down.
3. Phone portrait, phone landscape and desktop ≥1024px, each in dark and light themes.
4. At least one arbitrary custom accent plus semantic good/warn/error states.
5. No horizontal overflow; active tab remains discoverable without shifting the page deck.
6. Populated charts have readable axes/tooltips, honest ranges and textual summaries.
7. Existing Log swaps/history/save, Budget transaction entry/week navigation/export,
   Accounts balance updates and Home entry points still work.
8. Fresh legacy records remain readable and are not silently rewritten.
9. Confirm the new service-worker cache version only after all cached-asset edits are final.

## REPORT BACK TO FRANCOIS

Lead with whether this is a coherent shippable phase. Then report:

- correctness fixes confirmed;
- defects found and changed during this continuation;
- exact viewport/theme/data scenarios tested;
- what remains from the interconnection/lifecycle phase;
- all modified/untracked files;
- confirmation that nothing was committed, pushed or deployed.

Be direct. If any populated metric cannot be verified, say so and do not call the phase done.
