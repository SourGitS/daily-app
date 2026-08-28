# PROMPT 30 — Turn Stats into a Trusted Insight System

## CODEBASE CONTEXT

Daily is a phone-first, dark-first personal lifestyle PWA. It is vanilla HTML/CSS/JS: no
framework, build step or package scripts. `index.html` loads the existing six stylesheets in
their current order; application logic is in `js/app.js`; GitHub Pages serves `main`.

Stats currently has six sub-tabs: Overview, History, Training, Body, Nutrition and Finance.
It has useful data and some shared renderers, but it is a collection of feature pages rather
than a reliable decision system. This task makes Stats answer: what changed, is it meaningful,
how complete is the evidence, and where can I inspect the source?

Read `AGENTS.md` completely first. Then inspect the actual Stats markup and every Stats
renderer/helper, the relevant CSS, `CLAUDE.md`, `Prompts/FUNCTIONAL-SPEC-log.md`,
`Prompts/FUNCTIONAL-SPEC-accounts.md`, and Budget helpers. Trust the code over this prompt if
they conflict.

Do not redesign Home, app-wide navigation, Firebase, the service worker architecture, or the
localStorage/Firebase sync model beyond changes directly necessary for these requirements.

## NON-NEGOTIABLE DATA RULES

- Literal performed exercise history is authoritative. Do not silently merge renamed or swapped
  exercises, and never rewrite old sessions from the current exercise library.
- Budget transactions override manual `var_<categoryId>` amounts whenever one or more matching
  transactions exist in that week/category. The canonical reader is `varCatAmount(...)`.
- Historical budget records must not be recalculated through today’s category list, defaults,
  targets or rates. Preserve historical meaning forward-only; never invent historical metadata.
- Any new synced localStorage store must use the existing `lsSave`/`lsSaveTS` and
  `SYNC_BLOB_REG` registration pattern. Never stamp boot-time defaults with `Date.now()`.
- Do not treat missing calories, macros, balances, exercise metadata or journal information as
  zeros. Show coverage or “unknown” instead.
- No causal claims, medical conclusions, fake correlations, or gamified judgement.

## PRODUCT DECISIONS

Implement these defaults rather than presenting alternatives:

1. A trained day is one calendar date with at least one saved session. Session count remains a
   separate workload figure and is never divided by scheduled training days.
2. A changed weight goal starts a new goal episode for future data. Existing entries remain
   visible; do not pretend the first-ever weigh-in began a later goal.
3. A weight forecast appears only with at least six readings spanning 21 or more days and a
   recent reading. It is a rate/range, not a precise promised date.
4. Finance comparisons and “best/worst” labels apply only to completed, comparable weeks.
5. Calories are analysed over calendar ranges and show logging coverage. Historical macros are
   unavailable until daily macro snapshots exist.
6. Save forward-only snapshots when a new session/week is written; mark older records clearly
   where historical metadata is unavailable rather than guessing from current settings.

## TASK

### 1. Correct existing metrics before changing presentation

#### Finance

- Fix every Stats Finance category total to use `varCatAmount(d, weekKey, categoryId)`, including
  `renderBSCatBreakdown()`. Audit other consumers, including export helpers, and remove raw
  `var_<id>` reads where they purport to report an effective historical actual.
- Preserve budget category identity, label and kind for newly written weeks so deleted/renamed
  categories do not vanish or get relabelled in later analysis. Keep legacy weeks readable;
  present unavailable history honestly instead of fabricating a snapshot.
- Keep fixed-rate historical protection. Do not weaken `fixRates` semantics.
- Replace Finance trend reference lines based on current `configFixedTotal()` /
  `configVariableTotal()` with a week-specific frozen target where it exists. Legacy periods
  without comparable targets must say so; do not draw a false goal line.
- Do not compare partial current weeks with completed weeks as records. Define completion from
  week dates and mark an in-progress week separately.

#### Training

- Exclude warm-up sets from every PR, top-set, exercise-chart and workload metric. Align
  `getPR()` and `getPoints()` with `computePRHistory()`.
- Remove the current universal “Training volume” claim. `weight × reps` is meaningful only for
  comparable loaded working sets; it excludes bodyweight/assisted/negative movements and gives
  timed movements incompatible units. Replace it with a clearly scoped comparable-work view,
  or explicitly separate unsupported movement types. Never invent bodyweight equivalents.
- Use distinct trained days for adherence; show sessions separately.
- Store muscle classification with new saved session exercises. For old sessions, label current
  library classification or unknown/inferred classification; do not make a historic chart look
  definitive after library edits.
- Keep literal-name exercise history and visible swap breadcrumbs. The Stats picker must be as
  clear about active/current swaps as exercise detail.

#### Body and Nutrition

- Make all direction/status language goal-aware: losing is not automatically good, nor is
  gaining automatically bad. Remove the hard-coded “bulk progress” language.
- Use the current goal episode’s baseline and target date for pace. Show stale measurement and
  insufficient-data states. No precise ETA from four noisy entries.
- Nutrition’s average must be a calendar-period measure, with “N of M days logged” beside it.
  It may not call the last seven logged observations a seven-day average.
- Calories are the only existing historical nutrition series. Do not render historic macro
  trends until per-day macro totals are actually persisted; introduce forward-only daily macro
  snapshots only if needed for this task, with an explicit legacy-unavailable state.

### 2. Make Stats five purposeful sections

Replace the six-way information architecture with:

1. **Review** — cross-domain, evidence-led landing screen.
2. **Training**
3. **Body**
4. **Nutrition**
5. **Finance**

Move raw **History** into Log as Workout History. It is record browsing, including notes, set
detail and deletion, not analysis. Preserve the existing literal session detail. Do not leave
destructive delete controls inside Stats.

Move check-in and configuration actions to their sources:

- Weight logging/deleting and goal editing belong in Health / the appropriate check-in flow.
- Budget goal creation/deletion belongs in Budget.
- Account balance updates belong in Accounts.

Stats may link to those sources, but should not become another form screen.

Keep the horizontal tab strip on phone. It must remain discoverable, scroll the active tab into
view without moving the page/deck horizontally, and not rely on hover. On desktop, use a
deliberate two-column insight/supporting-evidence layout where appropriate; do not create a
wall of charts or a masonry dashboard.

### 3. Build Review around conclusions, not snapshots

Review is the default Stats tab. It should contain a small ranked set of decision-relevant
insights, not a second Home dashboard or a duplicated Week in Review.

Each insight must state:

- the conclusion;
- exact period and comparison baseline;
- coverage/completeness (for example, 5 of 7 calorie days logged);
- the data definition where ambiguity matters; and
- one tappable drill-down.

Prioritise insights such as adherence versus plan, weight pace versus goal, calorie-log
coverage/goal trend, budget variance versus the target that applied at the time, and stale or
meaningful net-worth movement. Show fewer insights when evidence is weak. Do not repeat Home’s
current calorie count, current weight, current budget remainder, or its week-review figures.

### 4. Rebuild the domain screens around useful questions

#### Training

Answer: am I adhering to the plan; which literal exercises are moving; what work is comparable;
and what is the evidence coverage? Keep the 8-week calendar and per-exercise detail, but put a
plain-language conclusion and comparison window ahead of each chart. Keep habit analysis out
of Training; surface it only in Review or a future Routines area.

#### Body

Answer: is my measured trend moving toward this goal episode at a credible pace? Show data
freshness, target direction, target date, rate/range where eligible, and source readings.
All-time low/high are secondary facts, not primary insight.

#### Nutrition

Answer: across actual calendar days, how consistently did I log and how did logged calories sit
against the goal active for that period? Make missing days visible. State clearly that historical
macros are not available when they are not stored.

#### Finance

Answer: what changed in net worth, which accounts drove it, where did spend go, and was the
week on its own plan? Retain the shared Accounts net-worth renderer, including stale-balance
warnings. Ensure category, spending and target views resolve historical source data correctly.
Remove “records” that are merely lowest/highest partial or incomparable values.

### 5. Add a real interconnection model

Every insight and chart element needs a source-record path and a return path:

- Finance category/week → the exact transactions when they govern the total, otherwise the
  specific Budget weekly field.
- Finance target/variance → the relevant saved Budget week and its frozen plan context.
- Net-worth point/account contribution → account balance updates that establish it, visibly
  marking carried-forward or stale balances.
- Exercise/muscle result → literal saved session and sets; retain swap/rename breadcrumbs.
- Weight point/goal pace → source check-ins and goal episode.
- Nutrition period → the logged dates and missing-date coverage.

Preserve range/filter state on return where practical. A future Daily + AI handoff may offer
date-scoped aggregates, coverage and optional workout effort/session-note summaries, but must
not include journal text by default or claim causality.

### 6. Visual, interaction and accessibility requirements

- Phone is primary; test portrait, landscape and desktop ≥1024px.
- Dark mode is default and the runtime accent may be any hue. Accent is not good/bad meaning;
  use semantic success/amber/danger colours plus text/icons/patterns so colour is not the sole
  signal.
- Put a conclusion and plain-language range before a Chart.js canvas. Show targets/baselines and
  incomplete states honestly.
- Charts need accessible textual summaries or equivalent rows, meaningful labels/tooltips, and
  controlled tick rotation. Do not reanimate/destroy/recreate charts unnecessarily on simple
  tab revisits.
- Use the shared card vocabulary (`cardHeader`, `CARD_ICONS`, `.card-hd`, `.card-fig`,
  `.card-shape`, `.card-cap`) for new card UI. Do not use emoji as new card chrome.
- Do not hardcode accent assumptions; use `--accent` for fills and `--accent-text` for text on
  cards/backgrounds as documented in `CLAUDE.md`.

### 7. Release discipline

This task touches cached HTML/CSS/JS. Bump `CACHE_NAME` and its version comment in
`service-worker.js`. Do not push, deploy or alter Firebase rules unless explicitly asked.

## VERIFICATION CHECKLIST

1. Stats has Review, Training, Body, Nutrition and Finance; raw Workout History is reachable
   from Log and no longer a Stats peer tab.
2. Review contains prioritised, date-scoped insights rather than a copy of Home’s snapshots.
3. Every Review insight has a stated range, completeness state and working drill-down.
4. Adding a transaction to a week/category changes the Finance category breakdown to the
   transaction total, not the old manual `var_<id>` amount; it agrees with Finance total spend.
5. Rename/delete a current category after historical data exists: old analysis retains the
   saved identity where available and never silently relabels it with today’s settings.
6. Change a current budget plan: completed historical weeks do not gain a misleading current
   target line. In-progress and non-comparable weeks are visibly labelled.
7. A warm-up heavier than all working sets never becomes a Stats PR, best weight or chart point.
8. Bodyweight, assisted/negative and timed movements are not rolled into a falsely labelled
   total kg-volume figure.
9. Two sessions on one date count as one trained day for adherence, while workload can still
   show two sessions.
10. Change an exercise’s current muscle group: new sessions retain their saved classification;
    legacy data is identified as current/inferred rather than silently rewritten as history.
11. Cut, maintain and bulk goals use correct direction language. Changing a goal begins a new
    goal episode without changing previous weigh-ins.
12. Sparse/noisy/stale weight data produces an honest unavailable state, not a precise ETA.
13. Nutrition displays calendar coverage such as “5 of 7 days logged”; missing days are never
    treated as zero calories and historical macros are not invented.
14. Finance Account Growth and net-worth chart retain explicit recorded-balance/staleness cues.
15. Tapping a finance point/category, exercise result, weight point or nutrition insight reaches
    the exact source records and can return to the same analysis context.
16. Phone portrait, phone landscape and desktop layouts have no horizontal overflow; desktop
    uses width purposefully without becoming a simultaneous-chart wall.
17. Dark and light themes remain readable with each accent mode/preset; good/bad states are not
    communicated by accent alone.
18. Charts have readable axes/labels/tooltips and do not needlessly reanimate on an ordinary
    tab revisit.
19. Existing Log swaps, literal exercise histories, Budget transaction entry, Accounts balance
    updates and Home widgets continue to work.
20. Console is clean through Stats navigation and drill-downs, and `service-worker.js` has a
    new cache name for the release.
