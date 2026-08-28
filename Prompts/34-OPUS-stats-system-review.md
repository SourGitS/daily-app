# OPUS REVIEW — Make Stats an insight system, not a pile of charts

You are reviewing the **Stats** area of a real personal lifestyle PWA called **Daily**. This is
a review and redesign task only: **do not edit or implement the app in this run**. Inspect the
repository and run it locally if useful, then return a direct, ranked product/design/function
review suitable for turning into a later implementation prompt.

Read `AGENTS.md` completely first. Then inspect the current Stats markup, all Stats renderers and
data helpers in `js/app.js`, every relevant CSS rule, `CLAUDE.md`, the functional specs for Log,
Accounts and Budget-related prompt history, and any implementation comments that explain why a
layout or calculation exists. Trust code over stale prose.

## Product context

Daily combines workouts, body weight, calories, habits, budget/transactions/subscriptions,
accounts/net worth, kitchen, plans, notes and Daily + AI. It is a vanilla HTML/CSS/JS PWA,
localStorage-first with Firebase mirroring, hosted directly from `main` on GitHub Pages.

Stats should help Francois understand what is changing, why it might be changing, and where to
act. It should not merely repeat the current number from Home, Log, Budget or Accounts in a
different card.

Phone is primary, but Stats is also likely to be explored on desktop. Dark mode is the real
default and the accent colour changes at runtime. Do not design around one fixed colour.

## What Stats does today

Verify the details in code. The current destination has six horizontally-scrollable sub-tabs:

- **Overview** — four tappable current-state cells for workouts, weight, calories and budget,
  plus the full current week review.
- **History** — reverse-chronological saved workout sessions, expandable sets and session notes,
  with deletion.
- **Training** — workout streaks, total volume by week/month, 8-week consistency, recent
  consistency summaries, muscle-group set balance, a per-exercise top-weight chart, PR stats and
  board, swap breadcrumbs, per-exercise detail, and habit completion appended at the bottom.
- **Body** — weight entry, current/lowest/highest, weight chart, target/date, progress and an
  estimated completion date.
- **Nutrition** — today's calories, seven-day average, days tracked and up to 30 recorded calorie
  totals against a current calorie goal.
- **Finance** — net-worth history, account growth, spending trend, savings progress, best/worst
  weeks, category breakdown, consistency, records and savings goals.

Many underlying views are intentionally shared with their source areas—for example, the same net
worth renderer is used in Accounts and Stats. Preserve useful single-source calculations rather
than creating competing versions.

## Main question

Does Stats currently function as a coherent insight system, or is it six feature-specific pages
collected behind a tab strip? Give a direct answer and recommend the strongest information
architecture for Daily.

Consider, but do not limit yourself to:

- keeping the six-domain structure;
- consolidating into Overview plus focused domain pages;
- organising by time period (week/month/year) rather than data source;
- organising around questions/trends/records;
- separating historical records from actionable insights;
- introducing a consistent comparison/range model without forcing every metric into the same
  unsuitable date window.

Pick a direction. Do not present five equally weighted alternatives.

## What the review must evaluate

### 1. Whether every metric is honest and useful

Trace calculations back to the same canonical helpers used by the source feature. Specifically
audit these known risk areas rather than assuming the chart labels are correct:

- Finance category totals must respect transaction precedence (`varCatAmount` and related Budget
  accessors) now that statement transactions can replace manual category cells. Identify any
  renderer that still reads raw `var_<id>` values and can contradict the Budget tab.
- Historical Finance views must not reinterpret old weeks through today's fixed-category defaults,
  deleted categories or current spending target unless the chart explicitly says it is using the
  current plan. Prefer the week-specific snapshots/values where they exist.
- Overview currently colours weight loss as positive and gain as negative. Judge direction against
  the actual cut/maintain/bulk goal—or keep it neutral—rather than assuming loss is always good.
- Training's total volume sums `weight × reps` across all exercises. Evaluate how misleading that
  becomes across bodyweight, assisted/negative-load, timed and very different movements.
- Consistency sometimes counts sessions and elsewhere counts distinct trained days. Check whether
  multiple sessions on one day create disagreement.
- Muscle balance relies on current exercise-library classifications/guesses for historical
  sessions. Determine whether later library edits silently rewrite the apparent past.
- Weight-goal ETA uses a very small recent sample. Evaluate empty, noisy, maintain and direction-
  reversal cases rather than presenting false precision.
- Nutrition stores calorie totals, not a full historical macro record. Do not propose macro trends
  unless the source data is actually persisted or you explicitly identify the required model
  change.
- Best/worst/records language must use comparable complete periods and avoid praising high income
  or low spending when data is partial.

Find additional inconsistencies. Distinguish a real calculation/data-integrity problem from a
mere label or visual problem.

### 2. Whether Stats answers useful questions

For each domain, state the questions the current screen answers and the questions Francois would
reasonably expect it to answer but cannot. Examples include:

- Am I training more consistently, and am I progressing—not just lifting more total tonnage?
- Which exercises or muscle groups are improving or stalling?
- Is weight moving at an appropriate rate for the current goal?
- How consistent is calorie logging, and what can validly be inferred from it?
- Where is overspending coming from, which changes are recurring, and how does that compare with
  the plan that applied at the time?
- Is net worth improving because savings rose, debt fell, or an account was merely updated?
- What actually changed versus last week/month, and is the comparison based on complete data?

Rank missing insights by decision value, not by how impressive the chart would look.

### 3. Information hierarchy and navigation

Review the six-button horizontal strip, labelling, empty states, long vertical pages and back paths
into Log, Budget, Accounts and Settings. Directly address:

- whether workout History belongs as a Stats sub-tab, inside Training, or as a broader Daily
  timeline;
- why habit completion currently lives at the bottom of Training and where it should live;
- whether Overview is a useful analytical summary or mostly a duplicate of Home/week review;
- whether Finance is too long and duplicates Budget/Accounts without enough new interpretation;
- what belongs in Stats versus what should remain an edit/action in its source screen;
- whether a global date-range control is appropriate, and where per-card/domain ranges remain
  necessary;
- phone navigation and discoverability;
- a desktop layout that uses width intelligently without becoming a wall of tiny charts.

### 4. Visual and interaction design

Review charts, stat tiles, legends, labels, tap targets, colours, chart density and drill-downs.
Propose a hierarchy that makes the conclusion readable before the chart mechanics. Every chart
should have a clear question, comparison baseline, time range and honest no/partial-data state.

Account for:

- dark-first design and light-theme verification;
- arbitrary runtime accent colour;
- semantic positive/negative/neutral colours that depend on the user's goal;
- narrow iPhone portrait, real mobile landscape and desktop;
- Chart.js resizing and rotation behaviour already guarded in the app;
- accessibility beyond colour alone;
- not over-animating values on every re-render.

### 5. Interconnectedness

Stats should be a read/understand layer over Daily, not a competing source of truth. Recommend
specific, stable connections:

- drill from a point/week/category/exercise to the exact underlying records;
- return from a source record to the relevant analytical view;
- use workout session notes and the future diary/journal as qualitative context without claiming
  causation;
- show data-quality/completeness indicators when a conclusion depends on incomplete logging;
- prepare useful date-scoped context for Daily + AI without exporting sensitive diary text by
  default.

Explain which cross-domain correlations are honest enough to show. Avoid fake insights from tiny
samples, automatic causal claims, health diagnoses and gamified judgement.

## Constraints and settled decisions

- Vanilla HTML/CSS/JS, no framework/build-system rewrite.
- localStorage and existing Firebase architecture remain.
- Phone-first, desktop-real, dark-first, both themes.
- Runtime accent is arbitrary; it is not a semantic good/bad colour.
- The user-built training split and literal performed-exercise history remain authoritative.
- Budget transactions override manual category amounts; do not undo this.
- Historical records must never be rewritten simply because today's settings/categories/goals
  changed.
- Shared source renderers/helpers are a strength when their purpose is the same.
- Do not re-propose app-wide navigation, Home-grid, service-worker or Firebase changes without a
  direct need.
- Do not implement anything in this review.

## Required output

Format the response in this order:

1. **Direct verdict** — what Stats is today and what it should become.
2. **Ranked correctness/function findings** — calculations, data semantics and misleading states
   before aesthetics.
3. **Recommended information architecture** — phone and desktop, with a compact map/wireframe if
   useful.
4. **Sub-area review** — Overview, History, Training, Body, Nutrition and Finance: keep/change/move/
   remove, and why.
5. **Ranked redesign proposals** — user value, behaviour, data requirements, complexity/risk and
   dependencies for each.
6. **Canonical-metric/source map** — which feature owns each number and which helper/data should
   drive it, including any current bypasses that must be fixed.
7. **Interconnection and drill-down plan** — exact useful links between Stats and source records.
8. **Phased implementation plan** — smallest coherent release first; no code.
9. **Don't bother list** — charts, correlations or features that are not worth building.
10. **Open decisions for Francois** — only genuine product choices, with your recommended default.

Be direct. If a metric is mathematically valid but practically meaningless, say so. If a screen
duplicates another screen without adding interpretation, say so. The goal is fewer, more trusted
insights—not a larger analytics dashboard.
