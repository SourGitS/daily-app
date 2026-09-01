# 44 — OPUS — Enrich Stats Finance, add Budget summary heroes and restore strong chart colours

## Codebase context

Implement this refinement in the existing Daily app checkout. Read `AGENTS.md` first, then inspect the current implementation rather than relying on old line numbers or assumptions. Read the relevant Budget, Stats Finance, chart-palette and card-layout sections of `CLAUDE.md`, but treat the product decisions in this prompt as the newer direction where they conflict.

Daily is a vanilla HTML/CSS/JavaScript PWA with no build step. Preserve all unrelated work already in the checkout. Do not change data structures, migrations, Firebase sync, backup/restore behaviour or historical budget semantics for this visual and analysis upgrade.

Do not commit or push any changes. A push to `main` deploys the live app.

This prompt intentionally overturns the existing neutral-first chart palette. The muted yellow/terracotta used for spending and the grey treatment used for income are not the desired result.

## Product outcome

The Finance tab inside Stats currently feels underpowered. Turn it into a useful financial analysis view that answers, at a glance:

- How much was earned?
- How much was spent?
- How much was saved?
- What remained after expenses and savings?
- How much spending was committed/fixed versus variable?
- How are income and expenses changing over time?
- Which categories account for the spending?
- How has net worth and each account changed?

At the same time:

1. Add a separate **Spent in [year]** summary card beside **Earned in [year]** in the yearly Budget view.
2. Replace the dull grey/yellow chart language with a rich green for incoming money and a clearer, more saturated red for outgoing money.
3. Reserve yellow/amber for genuine warnings, not ordinary graph series or category indicators.
4. Give the headline metric cards in Budget's Month and Year views genuine hero-card treatment so these screens feel more interesting, intentional and eye-catching.

## Financial definitions and source-of-truth rules

Use the app's existing canonical budget calculations and saved historical snapshots. Do not create a second calculation path.

- **Earned / income**: the canonical weekly income total, currently exposed through `weekIncome(...)` or the current equivalent.
- **Expenses / spent / out**: committed/fixed spending plus variable spending, using the same canonical values as the Budget month-by-month **Out** figure. Existing helpers include `weekFixedTotal(...)`, `weekVarTotal(...)`, `statsWeekParts(...)` and `statsWeekSpending(...)`; inspect the current code and reuse the appropriate path.
- **Saved**: the canonical saved amount, currently exposed through `weekSavedAmt(...)` or the current equivalent.
- **Net after expenses and savings**: `income - expenses - saved`.
- **Committed/fixed spending** and **variable spending** must remain separately available wherever a breakdown is shown.
- Savings are not expenses. Never include saved amounts in **Spent**, **Expenses** or **Out**.

Stats must continue to use completed saved weeks only. Respect the current precedence rules for recorded transactions versus manual category values, frozen historical plan snapshots and any legacy-data ambiguity indicators. Missing historical data is unknown, not zero. Do not reconstruct old weeks from today's defaults. Clearly state the active date range and available coverage so totals are not presented without context.

## 1. Give Stats → Finance a proper analysis layer

### Shared finance-analysis range

Add one clear range control near the start of the Finance analysis content:

- **12W**
- **This year** — default
- **All**

This shared range drives the new budget-derived financial summary, the income/expense trend and the category breakdown. It must use completed weeks only and display the actual coverage, for example the number of weeks and the first/last completed dates included.

Do not force unrelated cards into this shared range:

- **Latest completed week** remains a single-week card.
- **Net worth** and **Account growth** may retain their own existing range controls because their account-record timelines are independent of saved budget weeks.

Avoid duplicate range controls on cards governed by the shared selector. Keep the Finance page easy to scan rather than adding controls everywhere.

### Financial picture summary

Add a prominent **Financial picture** card or hero-style summary for the selected range. It should lead with four primary values:

1. **Earned**
2. **Expenses**
3. **Saved**
4. **Net after expenses & savings**

Also show a restrained secondary breakdown:

- Committed/fixed spending
- Variable spending
- Average expenses per completed week
- Savings rate

Show the selected period and data coverage in the card. Values must reconcile exactly with the source completed weeks and with the Budget views. If no trustworthy weeks exist for the selected range, show a clear empty state instead of implying a zero-dollar period.

The hero should be information-dense but calm: strong hierarchy, aligned currency figures and no oversized decorative graph that does not explain anything. On mobile, stack the metrics cleanly without horizontal scrolling or tiny type.

### Income and expense trend

Upgrade the current spending-only trend into an **Income and expenses** or **Money flow** chart for the shared range.

- Plot canonical weekly income in rich green.
- Plot canonical total expenses in saturated red.
- Keep the saved-plan comparison only if it remains genuinely useful; if retained, use the live app accent with a clearly labelled dashed line so it cannot be confused with income or expenses.
- Retain the current ability to open/drill into a source week where that interaction already exists.
- Tooltips must show the week, income, total expenses and, where useful, the fixed/variable split.
- Do not silently plot missing or untrustworthy values as zero.

Choose the clearest responsive chart form after inspecting the current Chart.js implementation. Grouped bars or two clearly separated lines are acceptable, but income and expenses must remain unmistakable without relying on colour alone. Labels, legend wording, line styles and/or markers should carry the distinction too.

### Expense/category analysis

Keep and improve the existing category breakdown:

- Make it respond to the shared Finance range.
- Preserve canonical historical category labels and the current drill-down behaviour.
- Reconcile the category values with total expenses for the same trustworthy source weeks.
- Distinguish committed/fixed and variable spending explicitly.
- Use the outgoing-money red family for both types, differentiated through tint, opacity, outline, grouping and explicit labels—not a yellow series.
- Preserve any current warning that explains partial or ambiguous legacy coverage.

### Existing Finance cards

Retain the useful existing cards and their core behaviour:

- Latest completed week
- Net worth
- Account growth
- Category breakdown

Reflow the final desktop and mobile layouts around the richer content so there are no large artificial blank areas. Keep independently sized columns/cards where the current implementation supports them. Do not make unrelated cards stretch to the height of the tallest neighbour.

Stats is the analysis layer, not another editing screen. Links back to the relevant Budget week or account records are welcome, but do not duplicate Budget editing controls inside Stats.

## 2. Add “Spent in [year]” to the yearly Budget view

In Budget's yearly view, add a dedicated summary card immediately after **Earned in [year]**:

- Label: **Spent in [year]**
- Value: the sum of committed/fixed plus variable expenses for that year
- Exclude saved amounts
- Use the same data source and definition as the sum of **Out** in the month-by-month table

The Earned and Spent cards must sit beside each other as a natural pair on desktop. The current two-column yearly summary grid should produce a balanced six-card layout after this addition:

1. Earned in [year]
2. Spent in [year]
3. Saved in [year]
4. Average savings rate
5. Best month
6. Recurring, per year

On narrow screens, allow the existing responsive pattern to stack them cleanly. Changing to an older year must recompute **Spent in [year]** from that year's saved weeks. Do not project future months or use today's defaults to fill missing historical weeks.

## 3. Give the Month and Year summary cards hero treatment

The headline summary cards shown directly beneath the period navigator in Budget's Month and Year views currently read as plain, flat metric tiles. Promote these cards into a cohesive family of **hero metric cards**. Hero cards are underused in the current app; these summaries are important enough to carry more visual personality and create an eye-catching entry into each period view.

This applies to all of the following cards:

### Month view

- Savings rate
- Income
- Expenses

### Year view

- Earned in [year]
- Spent in [year] — the new card required above
- Saved in [year]
- Average savings rate
- Best month
- Recurring, per year

Treat each metric as its own hero card, not as six small matte cards placed inside one large hero container. The set should feel related, but each card should have enough visual identity to make the page more engaging.

### Hero visual language

- Reuse Daily's established hero geometry and vocabulary where appropriate: `--radius-hero`, a deliberate gradient or colour scene, controlled shadow, clipped overflow and a restrained decorative shape/highlight.
- Do not simply add a brighter border to the existing flat tiles. They should visibly read as hero surfaces.
- Make the primary number the focal point using the numeric font, confident scale and generous spacing. The label, status and supporting detail remain clearly secondary.
- Preserve the current clean layout and fast scanning. Decorative shapes must stay behind the content, never cross text and never resemble an unexplained data line or graph.
- Avoid nested matte cards, heavy outlines, glassy clutter or a different one-off illustration in every tile. Build one reusable Budget hero-metric treatment with controlled semantic variants.
- Cards that are not interactive must not acquire hover, pointer or pressed styling that falsely suggests they can be clicked.
- Preserve all existing calculations, labels, warning chips and period navigation. This is a visual hierarchy upgrade, not a change to the underlying meaning.

### Semantic hero variants

Use the revised financial palette to give the cards meaningful identity rather than painting every hero with the same runtime accent:

- **Income / Earned:** rich green hero treatment.
- **Expenses / Spent:** clear saturated red hero treatment.
- **Saved:** live-accent hero treatment.
- **Savings rate / Average savings rate:** live-accent hero treatment, with the existing status chip carrying the semantic result. Amber is appropriate for a genuine **Below 20%** warning; a successful state should use the app's existing positive treatment.
- **Best month:** live-accent hero treatment with the month as the primary value and saved amount as supporting evidence.
- **Recurring, per year:** an accent-led or complementary hero treatment that remains clearly distinct from income and expenses without inventing another data-series colour.

Use gradients with enough depth to feel rich, not washed out or muddy. White or translucent-white foreground text is appropriate on sufficiently dark/saturated hero surfaces; otherwise use a contrast-safe foreground treatment derived from the theme. Do not assume every runtime accent is dark enough for white text—test light custom accents and provide a robust fallback.

### Responsive composition

- Keep the Month view as a balanced three-card hero row on desktop. Stack or reflow it cleanly on phone without horizontal scrolling.
- Keep the Year view as a balanced two-column composition on desktop, with the paired **Earned** and **Spent** heroes first. The six cards should produce three complete rows.
- On phone, follow the app's established responsive rhythm. One column is acceptable where needed; do not shrink hero values or labels until they become cramped.
- Keep card heights visually aligned within a row while allowing warning/supporting content to fit without clipping.
- Leave the Month/Year navigator above the cards as the period control. Do not turn the navigator itself into another competing hero unless the existing design requires a small visual adjustment for cohesion.

Implement this as a shared, maintainable hero-metric pattern rather than duplicating a full block of CSS for Month and Year. Inspect the cascade and existing hero implementations first; reuse established tokens, but do not accidentally restyle unrelated cards elsewhere in Daily.

## 4. Restore a stronger, semantic money palette

Replace the current grey-income and muted yellow/terracotta-spending treatment across Budget charts and Stats Finance charts.

### Required semantic mapping

- **Income / earned / incoming money:** rich, confident green.
- **Expenses / spending / outgoing money:** clear, saturated red.
- **Committed/fixed expenses:** a quieter treatment in the same red family.
- **Variable expenses:** the stronger red treatment.
- **Saved amounts and savings-rate targets:** the user's selected live accent colour; use dash, marker or opacity differences where two accent-based series coexist.
- **Net worth:** the live accent colour unless the chart is explicitly showing positive/negative change; do not force the whole net-worth series into the income/spending colours.
- **Warnings:** yellow/amber only when the state is genuinely cautionary, such as a tight forecast or warning status.

Suggested starting points, to be adjusted for contrast and theme:

- Dark-theme income green: approximately `#22C55E`
- Light-theme income green: approximately `#15803D`
- Dark-theme expense red: approximately `#EF4444`
- Light-theme expense red: approximately `#DC2626`

The precise final values can be tuned after visual testing, but do not drift back toward sage, olive, mustard, yellow, amber, terracotta or rust. The green should feel rich and alive. The red should look unmistakably red, not washed out or brown.

### Implementation requirements

- Centralise the semantic palette rather than scattering new colour literals throughout chart renderers.
- Replace or retire `BUD_WARM`, `BUD_WARM_DARK`, `budWarmRgba(...)` and equivalent yellow/terracotta series helpers wherever they are no longer semantically correct.
- Update every relevant Budget and Stats Finance Chart.js call site, including chart strokes, fills, bars, points, legends, inline swatches and tooltips.
- Check week, month and year Budget charts as well as Stats Finance trends and category bars.
- Ordinary currency text can remain neutral for readability. If summary cards need a series cue, use a restrained edge, icon or small label treatment rather than filling the entire card red or green.
- Maintain non-colour differentiation through labels, line dashes, markers, grouping, borders or patterns so the charts remain understandable for colour-blind users.
- Check colour contrast in both dark and light themes and with more than one user-selected accent colour. Income and expenses must not change when the user's accent changes.
- Update the relevant palette rationale in `CLAUDE.md` so it no longer documents the superseded neutral-first/yellow-spending decision as the desired design.

## Scope and safety

Expected files may include:

- `js/app.js`
- the existing Budget and Stats CSS files, after inspecting the cascade
- `index.html` only if a static container genuinely needs to be added
- `CLAUDE.md` for the revised palette/design rationale
- `service-worker.js` for the required cache bump after real app assets change

Do not introduce a new library, build step or data store. Do not change Firebase, localStorage schemas, sync registrations, migrations, restore logic or budget week contents. This work should be derived from existing saved data and existing canonical helpers.

Because implementation will change cached JavaScript/CSS/HTML, bump `CACHE_NAME` in `service-worker.js` exactly once after all implementation edits are complete and update its version comment. Do not bump it repeatedly while iterating.

Do not commit or push.

## Numbered verification checklist

1. Open Stats → Finance with multiple completed budget weeks. Confirm the shared range control appears and defaults to **This year**.
2. Confirm the selected range displays its real coverage: completed-week count and first/last included dates.
3. Confirm **Financial picture → Earned** exactly equals the sum of canonical income for the included completed weeks.
4. Confirm **Expenses** exactly equals committed/fixed plus variable spending for those weeks and excludes saved amounts.
5. Confirm **Saved** exactly equals the canonical saved total for those weeks.
6. Confirm **Net after expenses & savings** equals income minus expenses minus saved.
7. Confirm committed/fixed, variable, average weekly expenses and savings rate reconcile with the four primary figures.
8. Switch among **12W**, **This year** and **All**. Confirm the financial summary, money-flow chart and category breakdown update together without duplicate card-level range controls.
9. Confirm Latest completed week remains a single-week card and is not incorrectly changed by the shared range.
10. Confirm Net worth and Account growth retain their independent account-record ranges and existing interactions.
11. Confirm the income/expense chart plots income in rich green and expenses in saturated red, with clear labels or non-colour distinctions.
12. Inspect chart tooltips and any week drill-down links. Confirm displayed values and target weeks are correct.
13. Confirm missing or unavailable historical data is not plotted or totalled as zero.
14. Confirm legacy/ambiguous budget coverage still shows the existing explanatory warning rather than presenting false precision.
15. Confirm the category breakdown uses the shared range, retains historical labels and reconciles to trustworthy total expenses.
16. Confirm committed/fixed and variable categories are distinguishable without using yellow as a normal data series.
17. Confirm the richer Stats Finance layout has no artificial large blank areas on desktop and no horizontal overflow on mobile.
18. Open Budget → Month. Confirm Savings rate, Income and Expenses are three distinct hero metric cards rather than flat matte tiles.
19. Confirm the Month heroes form a balanced three-card row on desktop and reflow without clipping or horizontal scrolling on phone.
20. Confirm Income uses the rich green hero variant, Expenses uses the saturated red variant and Savings rate uses the live accent with a semantic status chip.
21. Open Budget → Year for the current year. Confirm all six summary metrics use the shared hero-card treatment and form three balanced two-card rows on desktop.
22. Confirm **Earned in [year]** and **Spent in [year]** are separate hero cards beside each other as the first pair.
23. Confirm the Year heroes preserve every value, label and supporting status while making the primary figure the strongest element.
24. Confirm decorative hero shapes remain behind content, do not resemble unexplained chart lines and no non-interactive card falsely appears clickable.
25. Test the Month and Year heroes with dark, light and custom runtime accents. Confirm foreground text and warning/status chips remain readable.
26. Confirm **Spent in [year]** equals the sum of the month-by-month **Out** column for the same year.
27. Confirm saved amounts are excluded from yearly Spent.
28. Navigate to an older year and confirm Earned, Spent and the other summary cards recompute only from that year's saved weeks.
29. Confirm future or missing months are not projected from today's defaults.
30. Inspect all Budget week, month and year charts plus Stats Finance charts. Confirm income is rich green, expenses are clear red and no ordinary data series remains yellow/terracotta.
31. Confirm amber/yellow remains available only for real warning states and is not used merely as a generic graph indicator.
32. Switch between dark and light themes. Confirm the green and red remain vivid, readable and accessible against their backgrounds.
33. Test several user accent colours. Confirm the saved/rate and net-worth accents follow the selected accent where intended, while income stays green and expenses stay red.
34. Confirm legends, labels, dashes, markers or outlines make the series understandable without colour alone.
35. Test representative empty, one-week, partial-year and many-week datasets. Confirm the cards and charts remain truthful and visually stable.
36. Confirm no localStorage/Firebase schema, sync timestamp, migration, restore or historical-budget data was changed by this work.
37. Check the browser console for errors, run a JavaScript syntax check, inspect the final diff for unrelated edits and confirm `CACHE_NAME` was bumped exactly once for the completed asset changes.
38. Verify the final result on both phone and desktop widths in dark and light themes.
39. Leave all work uncommitted and unpushed for Francois to review.
