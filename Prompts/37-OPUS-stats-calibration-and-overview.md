# PROMPT 37 — Calibrate Stats: restore useful data and add Overview

## CODEBASE CONTEXT

Daily is a phone-first, dark-first personal lifestyle PWA. It is vanilla HTML/CSS/JS: no
framework, build step or package scripts. `index.html` loads the CSS files in its existing
order, application logic is in `js/app.js`, and GitHub Pages serves `main`.

Read `AGENTS.md` completely first. Then inspect the current Stats implementation and its most
recent commit, including every Stats renderer/helper, Stats markup, relevant CSS, `CLAUDE.md`,
the Log and Accounts functional specs, Budget helpers, and implementation comments. Trust the
code over this prompt where they conflict.

Prompt 30 changed Stats from a pile of charts into an insight system. Keep the valid data
integrity work and source-record paths from that change. This prompt is a calibration pass:
Stats has become more specialised and suggestive, but less useful at a glance. It is too
wordy, too card-heavy, and in places hides the raw context that made the old screens practical.

Do not edit Home, app-wide navigation, Firebase, service-worker architecture, or the sync model
beyond what this task directly requires. Do not add a framework, dependencies, or build step.

## PRODUCT DECISION — BOTH OVERVIEW AND REVIEW BELONG IN STATS

Stats must have these six sections, in this order:

1. **Overview** — fast, data-rich orientation across the system.
2. **Review** — a small evidence-led interpretation layer.
3. **Training**
4. **Body**
5. **Nutrition**
6. **Finance**

Raw Workout History remains in Log. It must not return as a Stats tab.

### Overview versus Review

These are deliberately different, not two labels for the same cards.

- **Overview** answers: “What does my system look like right now, and what has changed
  recently?” It is compact, information-dense and scannable. It may show carefully defined
  current values, recent deltas, coverage and small trends.
- **Review** answers: “What deserves my attention, what is the evidence, and where can I check
  it?” It contains only a short ranked set of conclusions with a period, comparison, confidence
  or coverage, and a drill-down.

Overview is not a copy of Home. Home is an everyday action dashboard. Stats Overview is a
look-back dashboard: it must use explicit windows, deltas and coverage rather than today-only
widgets, input controls or Home’s current-week remainder.

Review must not duplicate Overview’s data blocks. If nothing meets a useful evidence threshold,
say so plainly and show fewer cards instead of manufacturing concern.

## NON-NEGOTIABLE DATA RULES

- Literal performed exercise history is authoritative. Never silently relabel historical
  exercise records through today’s swap or library settings.
- Budget transactions override manual `var_<categoryId>` amounts whenever matching transactions
  exist. Continue using `varCatAmount(...)` and the canonical Budget totals.
- Historical Budget category labels, fixed rates and targets must remain frozen when snapshot
  data exists. Do not reinterpret history through today’s configuration.
- A trained day is a distinct calendar date with one or more saved sessions; session count is
  separate workload context.
- Warm-ups are excluded from PRs, best-weight and comparable-work calculations.
- Do not combine loaded, assisted/negative, timed, bodyweight or mixed-unit exercise records
  into a fake volume total.
- Weight pace remains goal-aware and episode-aware. Withhold rate/forecast claims when readings
  are sparse, noisy or stale.
- Missing calories, historical macros, balances, metadata and journal context are unknown, not
  zero. Historical macros remain unavailable until actually stored per day.
- Preserve all source drill-down and return paths introduced by the Stats insight work.
- Do not create causal claims, health diagnoses, fake correlations, streak judgement or
  gamification.
- Respect all `AGENTS.md` sync/cache invariants. If a cached asset changes, bump the cache name.

## TASK

### 1. Review the current implementation before changing it

Perform a short, code-grounded calibration audit of the shipped Stats UI. Identify, separately:

1. data that was lost, hidden, weakened or made harder to scan;
2. unnecessary explanatory copy, duplicated caveats and repeated card anatomy;
3. charts or comparisons that are still useful versus charts that now add clutter;
4. styling that feels foreign to Daily, too generic, too dense, too sparse or too repetitive;
5. any data integrity issue exposed by the current implementation; and
6. which existing source drill-downs and honesty states must remain untouched.

Use that audit to make a decisive correction. Do not merely add another tab on top of the current
one. Keep the strength of Review while making Stats faster, calmer and more informative.

### 2. Add Stats Overview

Make **Overview** the default Stats section. It should provide a compact, data-rich cross-domain
readout built from trustworthy existing data. Use a deliberate hierarchy rather than a wall of
equal cards.

On phone, lead with a compact system summary and then a small number of grouped sections. On
desktop, use width for a clear primary/secondary composition or restrained two-column layout,
not a masonry dashboard or six simultaneous large charts.

Overview should normally include only useful, available items such as:

- **Training:** recent completed-period trained days, saved sessions separately, and one clear
  literal-exercise signal when comparable data exists.
- **Body:** latest measured weight, recent measured change and current goal-episode status only
  when a goal exists. Show freshness.
- **Nutrition:** completed-period logged-day average and `N of M` coverage. Never show a
  fabricated macro summary.
- **Finance:** latest completed-week spend against that week’s saved plan, plus net-worth change
  only with comparable balance coverage.

Use compact trend marks, deltas or small charts only when they improve scanning. Every number
needs a clear period/definition nearby. Do not turn the Overview into a configuration screen,
Home duplicate or second Finance dashboard.

Each Overview domain block should have one non-destructive route to its detailed Stats section;
source-record drill-downs remain there or on Review.

### 3. Keep Review, but make it much tighter

Review remains the reflective, evidence-led screen. It should contain only the highest-value
insights—not a card for every data source.

- Rank a small number of items by decision value.
- Keep a conclusion, date range/baseline, key completeness caveat and drill-down.
- Move raw current figures, repeated trend summaries and routine coverage displays to Overview
  or their domain tabs.
- Collapse boilerplate. Do not repeat “missing is unknown” in every card when a single precise
  note in the relevant section conveys it better.
- If there are no strong insights, use a calm “nothing needs attention from the available data”
  state rather than filling space with weak conclusions.

Review must feel like a useful weekly reflection, not an audit report.

### 4. Rebalance every domain screen

#### Training

Keep literal exercise history, the calendar, per-exercise comparison, muscle classification
provenance and source detail. Restore quick-scanning raw context where it was lost: the selected
exercise’s recent records, appropriate best/top values, relevant session/set coverage and clear
measurement type. A user should be able to understand the page before reading paragraphs.

Do not bring back a universal “volume” number. Keep comparable work tightly scoped and make
unsupported types visibly separate rather than visually second-class.

#### Body

Lead with the weight trend and goal-episode context in a compact, readable form. Preserve source
check-ins, freshness, goal-aware direction and honest rate eligibility. Avoid spending most of
the first screen on prose. Make useful raw context—latest value, change over an explicit window,
target and target date—easy to scan without claiming a precise ETA.

#### Nutrition

Make calorie coverage and actual logged values easier to scan. Keep the calendar period,
logged-day denominator, live-today distinction and unavailable historical-macro state, but
remove repetition. Avoid implying that a current calorie goal was historical fact.

#### Finance

Keep the canonical transaction-backed totals, saved historical labels/targets, account coverage
warnings and source drill-downs. Improve the first-screen information hierarchy: net worth,
latest completed-week result, account drivers and category breakdown must read as a coherent
financial picture rather than four unrelated charts/cards.

Historical category labels must remain readable on phone. Do not truncate an important historic
identity into ambiguity without an accessible full label and an easy source path.

### 5. Correct the visual language

Use the existing shared card vocabulary, design tokens and the layout patterns documented in
`CLAUDE.md`. This is a refinement, not a visual redesign.

- Reduce redundant card borders, oversized headers, duplicated section labels and decorative
  chrome.
- Let important numbers, short labels and chart marks do more of the work than paragraphs.
- Use meaningful spacing and grouping to distinguish summary, evidence and action.
- Do not use the arbitrary runtime accent as a success/failure signal. Preserve semantic
  success/warning/danger colours plus explicit text or icons.
- Ensure a custom accent works in dark and light themes.
- Keep tap targets, focus-visible states, accessible text equivalents and controlled Chart.js
  tick rotation.
- Do not restore unnecessary entrance animation or recreate existing charts merely because the
  user revisits a Stats tab. Resize cached charts in place where needed.

### 6. Interconnection rules

Maintain this navigation model:

- Overview domain block → detailed Stats section.
- Review insight → evidence overlay / exact source records.
- Finance category/week/account contribution → exact transactions, saved Budget week or account
  balance records, with return to the same analysis state.
- Exercise/muscle result → literal session/set evidence, with swap breadcrumbs only as context.
- Weight point/goal pace → exact check-ins and goal episode.
- Nutrition period → dated logged/missing coverage.

Do not add edit/delete controls to Stats. Editing remains in Log, Health, Budget and Accounts.

## DELIVERY REQUIREMENTS

1. Implement the calibrated Stats experience, including Overview and retained Review.
2. Summarise the pre-change calibration findings and the deliberate keep/remove/move decisions.
3. List every data rule and source path preserved.
4. State any metric you intentionally removed or downgraded as practically weak.
5. Do not commit, push or deploy unless Francois explicitly asks after reviewing the result.

## VERIFICATION CHECKLIST

1. Stats has Overview, Review, Training, Body, Nutrition and Finance in that order. History is
   only in Log.
2. Overview is data-rich, fast to scan and distinct from both Home and Review.
3. Review contains fewer, higher-value, evidence-led interpretations and does not repeat
   Overview wholesale.
4. Every displayed trend or comparison has an honest range, baseline and completeness state.
5. Transaction-backed Finance category totals agree with canonical Budget totals; a transaction
   overrides the manual category amount.
6. Renamed/deleted historical categories retain their saved identity where available.
7. Warm-ups cannot become a PR; bodyweight, assisted, timed and mixed-unit movements are not
   rolled into fake volume.
8. Distinct trained days and saved-session counts remain separate.
9. Exercise-library edits cannot silently rewrite saved muscle history; legacy fallback is
   labelled.
10. Cut, maintain and bulk wording is goal-aware. Sparse/noisy/stale body data withholds precise
    forecasts.
11. Nutrition shows calendar coverage, never treats missing days as zero, and does not invent
    historic macros.
12. Finance preserves account coverage/staleness cues and historical saved-plan context.
13. Overview and Review drill to the correct domain/evidence and return without losing useful
    context.
14. Phone portrait, phone landscape and desktop have no horizontal overflow. Desktop uses width
    intentionally without becoming a wall of charts.
15. Dark/light themes and a non-default custom accent remain readable; semantic status is not
    communicated through accent alone.
16. Chart labels are readable, cached charts do not reanimate on ordinary revisits, and source
    overlays resize correctly across the desktop breakpoint.
17. Browser console is clean; `node --check js/app.js`, `node --check service-worker.js` and
    `git diff --check` pass.
18. Cache name is bumped if cached assets changed.
