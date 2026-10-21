# Prompt 48 — Give Stats → Review a desktop section rail and flow-first layout

## Objective

Refine **Stats → Review only** so its variable-height cards no longer produce irregular grid gaps or stretched, padded cards on desktop.

Implement the approved desktop pattern:

- the existing Daily sidebar remains unchanged;
- Weekly Review gains a narrow local rail containing the week, review status and Money / Work / Life / Reflection navigation;
- the active review section renders as one uninterrupted vertical content flow beside that rail;
- related values and fields may still use compact layouts inside a card;
- the automatic “What Daily noticed” insights below Weekly Review become a single vertical list;
- narrower desktop, tablet and mobile layouts retain the existing horizontal review controls and one-column flow.

This is a Review-page layout correction, not an app-wide redesign. Record the new app-wide design rule in documentation, but do not change any other screen in this task.

## Success criteria

The task is complete when:

1. At sufficiently wide desktop sizes, Weekly Review has a clear local navigation rail and a readable main content column.
2. Review cards of different heights stack naturally without holes between rows and without being stretched to match a neighbour.
3. The rail does not make the content column narrower than a comfortable form/card measure.
4. At widths where the rail would squash the content, the page automatically uses the existing horizontal week/status/section arrangement instead.
5. “What Daily noticed” is visually separate from Weekly Review and its odd number of insight cards creates no empty half-row.
6. All Weekly Review behaviour, data, calculations, storage, sync and completion/freeze rules are unchanged.
7. No other Daily screen receives a layout or behaviour change.

## Repository context and required reading

Daily is a vanilla HTML/CSS/JavaScript PWA with no build step. Before editing:

1. Read `AGENTS.md` in full, especially the data-preservation, Weekly Review, coding-convention, testing and service-worker rules.
2. Read the relevant desktop-layout, shared-card, Stats, Settings master–detail and Weekly Review sections of `CLAUDE.md`.
3. Inspect `git status` and preserve all unrelated work, including untracked prompt files.
4. Inspect the current implementation by symbol and selector rather than trusting line numbers. Relevant areas include:
   - `renderStatsReview()`
   - `wkrWeeklyReviewHtml()` and `wkrSetupFormHtml()`
   - `wkrMoneySectionHtml()`, `wkrWorkSectionHtml()`, `wkrLifeSectionHtml()` and `wkrReflectionSectionHtml()`
   - `wkrSetWeek()`, `wkrSetSection()` and the existing `wkrUI` state
   - `.wkr-wrap`, `.wkr-weekbar`, `.wkr-tabs`, `.wkr-body`, `.wkr-span` and the desktop rules in `css/review.css`
   - `.rev-list`, `.rev-card` and the Stats desktop rules in `css/workout.css`
   - the shared desktop canvas and sidebar rules in `css/budget-home.css`
5. Confirm the actual service-worker cache name before editing. It is currently expected to be `daily-v302`. Because cached JavaScript and CSS will change, increment the current numeric suffix exactly once and update the adjacent version comment. If it is still `daily-v302`, the result must be `daily-v303`.

Do not reorder the stylesheet links in `index.html`. Do not add a framework, package, dependency or build step. Do not commit, push or deploy.

## Locked design decision

The approved Review desktop structure is:

```text
Daily sidebar | Review rail | Active section content
              |             | one vertical card flow
```

The Review rail is a **local navigation aid for this structured workflow**. It is not a second app sidebar and must not be applied to Home, Budget, Accounts, Log, Kitchen, Journal, Settings, Daily AI or any other Stats tab.

The app-wide design rule to document is:

> Use row grids for comparable cards with predictable dimensions. Variable-height cards use a single vertical flow or deliberately constructed independent columns. Compact grids inside cards remain valid when they express one coherent relationship.

This rule is design guidance. In this prompt, only Stats → Review is changed.

## 1. Build one responsive Weekly Review workspace

Restructure the enabled, active Weekly Review output into one semantic workspace with:

- a local rail/aside;
- a main review-content column;
- one shared set of controls and fields.

Do not create separate desktop and mobile copies of the week selector, section buttons, fields or actions. The same DOM must reflow through CSS so controls keep one source of truth, unique IDs remain unique and assistive technology does not encounter duplicates.

Suggested semantic anatomy—the exact class names may follow the existing `wkr-` vocabulary:

```text
.wkr-workspace
  aside.wkr-rail
    week label + existing week selector
    existing status
    existing Money / Work / Life / Reflection buttons
  .wkr-main
    current-section heading and short description
    pending/stale/live notices when applicable
    .wkr-body
    existing review actions
    frozen/completion/privacy notes
```

The setup chooser, plan editor and switched-off state do not need an empty navigation rail. Keep those states as centred, single-column flows at an appropriate readable measure.

## 2. Desktop rail behaviour

Enable the local rail only when the viewport leaves a genuinely comfortable content column after the 260px Daily sidebar and page padding.

- Use a dedicated wide-desktop breakpoint around the existing Settings master–detail threshold—**1180px is the preferred starting point**, because the app already delays Settings’ split until then.
- If inspection shows that 1180px leaves Review materially cramped, move the Review rail threshold upward rather than compressing either rail or fields below a usable measure.
- Between the app’s 1024px desktop breakpoint and the Review rail breakpoint, keep a single centred content column with the current horizontal section controls.
- Mobile and landscape-phone behaviour must remain intact.

At the rail breakpoint:

- centre the complete Review workspace within the existing app canvas;
- use a restrained rail around 180–210px wide;
- use a gap around 18–24px;
- cap the main review column at approximately 800–920px;
- allow the main column to shrink only to a comfortable width;
- do not stretch the rail and content across the full 2200px outer canvas;
- keep the local rail aligned with the top of the active review section;
- the rail may be sticky within the existing page scroller, but it must not overlap the Stats segmented control, clip at the viewport bottom or introduce an internal scrollbar.

The empty space outside this centred workspace is intentional page margin. Do not fill it with unrelated cards.

## 3. Rail content and visual hierarchy

The local rail should contain:

1. A quiet uppercase label such as “Week to review”.
2. The existing week selector.
3. The existing review status: Not started, Draft or Completed.
4. Vertical section buttons in their existing conditional set:
   - Money — “Plan and actuals”
   - Work — “Progress and pipeline”
   - Life — “Health and commitments”
   - Reflection — “Decisions for next week”

If Work or Life is disabled in the plan, continue to omit that section exactly as the current logic does.

Use the existing section order. A restrained 1–4 step number may be shown, matching the approved sample, but it must not suggest that sections are locked or cannot be revisited.

Visual treatment:

- the rail background remains transparent and belongs to the page, not inside one oversized card;
- the week selector and status use existing Daily surfaces and tokens;
- unselected section buttons remain quiet and transparent;
- the selected section uses the existing neutral card surface, stronger text and a restrained accent marker or accent number;
- preserve Daily’s Manrope UI typography, Space Grotesk numeric typography, micro-label scale, radius tokens and existing colour variables;
- do not add another font, icon library, colour system, glass treatment or large decorative rail background;
- the rail must remain visually subordinate to the active section content.

Use native buttons and the existing handlers. Preserve current keyboard operation and visible focus treatment. Keep the existing `aria-pressed` semantics or replace them with an equally correct single-selection pattern; do not leave conflicting selected-state attributes.

## 4. Give the main column an explicit section heading

At the top of `.wkr-main`, show:

- the existing Weekly Review context as a small eyebrow;
- the active section name as the main local heading;
- one short section description matching the rail copy.

This heading must update whenever `wkrSetSection()` changes the section. Derive it from the same controlled section definition used to render the rail; do not create a second drifting list of section names elsewhere.

The section heading is navigation context, not a new data summary. Do not add new calculations, scores or invented advice.

## 5. Replace the Weekly Review card grid with a natural flow

At all desktop sizes, `.wkr-body` must no longer arrange independent cards in shared two-column rows.

- Render active-section cards in source order as one vertical stream.
- Each card keeps its natural height.
- Do not stretch cards to equal height.
- Remove the need for `grid-column` spanning on `.wkr-span`; retaining the class as a harmless semantic marker is acceptable if removing it would create unnecessary churn.
- Use one consistent vertical gap between cards.
- Pending, stale and still-running notices appear in the same flow before the section’s ordinary cards.
- Actions and frozen/privacy notes remain after the active section.

Do not use masonry, CSS columns, `grid-auto-flow:dense`, JavaScript position calculations or card-height measurements. Review has a meaningful reading and keyboard order; visual packing must never reorder it.

Compact layout **inside** a card remains valid. Preserve structures such as:

- planned/actual/value rows;
- two related form fields in `.wkr-2col` when they fit;
- aligned label/value lists;
- progress figures and bars;
- paired pieces of information that already form one semantic unit.

At narrow widths, those internal layouts must continue to stack or wrap safely.

Do not combine or rewrite existing cards merely to imitate the sample. The approved decision is the rail plus vertical flow; existing card content and calculations should remain recognisable unless a minimal wrapper adjustment is required for the new layout.

## 6. Preserve setup and switched-off states

Weekly Review has important states before the active workflow exists:

- first-time setup chooser;
- template or blank plan editor;
- saved plan switched off;
- no reviewable week;
- no money data.

Requirements:

- Do not show an empty or fake section rail during the setup chooser, plan editor or switched-off state.
- Keep these states centred and readable rather than stretching them across the outer desktop canvas.
- The setup form must follow the same flow-first rule for variable-height cards; do not retain a two-column page grid that recreates the original gap problem.
- Existing two-column field groups inside a setup card may remain.
- Preserve the rule that merely opening setup or Review writes nothing.
- Preserve the current template/blank/save/cancel/turn-on/turn-off behaviour exactly.

## 7. Make “What Daily noticed” a separate vertical insight section

`renderStatsReview()` currently appends the automatic insight cards below Weekly Review. They are a separate feature and must continue to be described as one.

Change only their layout on the Review tab:

- retain the “What Daily noticed” divider and existing insight content;
- render the insight cards as a single vertical list at desktop sizes;
- let each insight card keep its natural height;
- remove the empty half-row produced when there are three insights;
- preserve ranking order and the current maximum of three insights;
- preserve every existing insight action, evidence statement, threshold and calm/empty state;
- do not turn the insights into another rail section;
- do not move them into Weekly Review or imply that completing the review affects them.

When the active rail is present, align the insights with the main Review content column rather than the rail. Use a robust wrapper/layout relationship rather than a brittle fixed left margin. When Review is in setup/off/empty form without the rail, centre the insight list at the same readable measure as that state.

Do not change `.stats-review-grid` or other Stats insight layouts outside Stats → Review unless inspection proves the selector is exclusive to this exact page. Prefer a new scoped wrapper/class where needed.

## 8. Preserve every Weekly Review data invariant

This task must not change Weekly Review’s data or lifecycle.

Do not alter:

- `daily_review_plan` or Firebase `reviewPlan`;
- `daily_reviews` or Firebase `weeklyReviews`;
- timestamp, merge or keyed-collection behaviour;
- `wkrAttachSync()`, `wkrMergeReviews()` or restore handling;
- record creation on first meaningful edit;
- the rule that opening Review creates no blank record;
- plan snapshots or actual snapshots;
- completed-review freezing;
- the explicit-only `wkrRefreshActuals()` flow;
- any Budget, account, transaction, workout, nutrition or Journal source data;
- `wkrAskDailyAI()` or the rule that it sends nothing automatically;
- week selection pinning in `wkrCurrentWeek()`;
- any calculation, label verdict or review completion behaviour.

Add no localStorage key, Firebase path, sync registration, migration or default write.

## 9. Keep the change Review-specific

Do not use this prompt as permission to redesign:

- Home’s reorderable widget layout;
- Stats Overview, Training, Body, Nutrition or Finance;
- Budget’s desktop columns;
- Accounts;
- Settings or Journal master–detail;
- Log’s desktop split;
- Kitchen catalogues or lists;
- Daily AI’s builder/output split;
- global card anatomy or global page width.

The existing 2200px outer canvas may remain. Review should establish its own centred inner workspace within that canvas, as other purpose-specific screens already do.

Do not add a Grid/Compact preference or any other user-facing layout toggle. The layout is selected responsively from content needs.

## 10. Documentation and cache

Update `CLAUDE.md` with:

- the Review-specific desktop rail structure and its breakpoint;
- the fact that mobile and narrower desktop retain one DOM and the horizontal controls;
- the fact that Weekly Review body cards and automatic Review insights use vertical flow;
- the distinction between the Weekly Review workflow and “What Daily noticed”;
- the app-wide design rule about predictable grids versus variable-height flows;
- an explicit warning that the rule is guidance, not permission for an automatic app-wide refactor;
- confirmation that this presentation change adds no persisted state and touches none of Weekly Review’s sync/freeze invariants.

Correct any stale Review CSS comments that still describe the desktop body as two columns.

Because cached JavaScript and CSS change, increment `CACHE_NAME` in `service-worker.js` exactly once and update the matching version comment, following `AGENTS.md`.

## Verification checklist

Serve the repository locally and verify all of the following before reporting completion:

1. The app boots without JavaScript errors, CSS parsing errors or missing local assets.
2. Stats → Review opens to the same logical state and selected week as before.
3. At a wide desktop viewport such as 1440px, enabled Weekly Review displays the local rail beside a comfortable main content column.
4. At a wider viewport such as 1920px, the workspace remains centred and readable instead of stretching across the full canvas.
5. At the chosen rail breakpoint, neither the rail nor the main column is cramped, clipped or overlapping.
6. Immediately below the rail breakpoint, Review cleanly returns to one column with the existing horizontal section controls.
7. At the app’s 1024px desktop boundary, no narrow rail is forced beside a phone-width content pane.
8. At a phone viewport around 390px, the existing week bar and horizontal section buttons remain usable and no horizontal page overflow appears.
9. Check a short-height landscape-phone viewport so the section controls, fields and actions remain reachable.
10. The desktop rail contains the week selector, status and only the sections enabled by the saved plan.
11. Money, Work, Life and Reflection switch correctly from the rail without changing the selected week or losing draft field values.
12. The selected rail item is visually unmistakable in light and dark themes without becoming louder than the page content.
13. Keyboard navigation reaches the week selector and each section button in a logical order, with visible focus.
14. The active section heading and description always match the selected rail button.
15. No duplicate selector, section control, form field ID or action exists in desktop/mobile DOM.
16. Money cards stack in their existing order with natural heights and no row holes.
17. Work cards stack in their existing order, including variable opportunity counts, forecast and sales focus.
18. Life cards stack in their existing order even when textarea content produces substantially different heights.
19. Reflection cards stack in their existing order through priorities and Next week’s plan.
20. Pending-week, stale-figures and still-running notices appear above the ordinary section cards and span the main flow naturally.
21. No card is stretched to match another card’s height.
22. Existing compact internal grids, planned/actual rows, fields, value alignment and progress bars remain legible.
23. Long labels, large currency values, multi-line help text and filled textareas do not overflow either column.
24. The first-time setup chooser remains centred and shows no empty rail.
25. The template and blank setup forms remain centred, use a natural card flow and retain all save/cancel behaviour.
26. The switched-off state and no-reviewable-week/no-money states remain correct and show no fake navigation rail.
27. “What Daily noticed” remains below and separate from Weekly Review.
28. One, two and three automatic insights form a vertical list with no empty half-row and preserve their ranked order.
29. Insight buttons still open their original destinations and no insight generation logic has changed.
30. Completed reviews remain frozen against their original plan and figures.
31. Editing the plan does not rewrite a completed review.
32. Budget changes beneath a completed review still require the explicit refresh action.
33. Opening Review or switching sections creates no blank review record and writes no new data.
34. Draft edits still save through the existing paths and survive a re-render.
35. Completing, reopening and switching weeks behave exactly as before.
36. Ask Daily AI still only prepares the existing handoff and sends nothing automatically.
37. No localStorage key, Firebase path, sync registration, migration, timestamp rule or source calculation changed.
38. Home, the other Stats tabs, Budget, Accounts, Settings, Journal, Log, Kitchen and Daily AI are visually unchanged.
39. `CLAUDE.md` records the final layout accurately and contains no stale claim that Weekly Review’s desktop body is a two-column card grid.
40. `service-worker.js` has exactly one cache-version increment from the value found at task start and its adjacent comment matches.
41. No temporary viewport switcher, debug content, test fixtures, console logging or unused experimental CSS remains.
42. Perform a final fresh reload and confirm the browser console is clean.

## Completion report

At the end, report:

1. Every file changed.
2. The final Review rail breakpoint and measured rail/gap/content widths at 1180px, 1440px and 1920px.
3. How the same controls reflow between rail and horizontal layouts without duplication.
4. How Weekly Review cards and “What Daily noticed” insights now flow.
5. How setup, off and empty states behave.
6. The service-worker cache change.
7. Which verification items were completed and anything that still requires physical-device checking.
8. Explicit confirmation that no data, calculations, storage, sync, Firebase or non-Review screen changed.

