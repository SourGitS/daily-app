# PROMPT 31 — Budget: Separate Quick Expense + Balance the Desktop Columns

## CONTEXT

Daily is a vanilla HTML/CSS/JS PWA. Read `AGENTS.md` and the Budget/layout notes in
`CLAUDE.md` before editing. Inspect current code: the recent Budget overhaul added individual
transactions, subscriptions/upcoming charges, a revised hero, Finish week, payment accounts,
and redesigned Month/Year views. Preserve all of that behaviour.

Run this only after the landscape-mobile task has been completed and committed separately.
Do not mix landscape work into this commit. Preserve `.claude/*.json` local settings.

## PROBLEMS

### 1. “+ Add expense” is inside Variable expenses

The action currently renders at the top of `renderVariableCard()` as a dashed full-width button.
This makes it look like a configuration control belonging to the Variable category card. It is
actually the primary capture action for the whole spending system and can create a transaction
for any variable category and payment account.

Move it out of Variable expenses and give it a dedicated, compact **Record spending** card.

### 2. Desktop Budget is strongly weighted to the left

At desktop width the two columns are equal in width but not in workload:

- left: Income, Savings, Fixed, Upcoming, Spending goal, a long Variable card, Calculator;
- right: Weekly result, Previous weeks, Pay days/config.

The result is a tall, visually heavy left stack and a large empty black area under the right
column. Equal column widths do not make an unbalanced composition.

## REQUIRED DESIGN

### Record spending card

- Remove the dashed Add expense control from inside `renderVariableCard()`.
- Add one dedicated `.card` titled **Record spending**, using the shared card header/icon
  vocabulary where appropriate.
- Include a short line such as “Log a purchase and Daily will update the category totals below.”
- Include one clear primary **+ Add expense** button calling the existing `openTxnModal()`.
- Do not duplicate the transaction form inline and do not create a second save path.
- Keep the existing Home quick-capture button.
- Current week only: the button should be actionable only for the current editable week. When
  viewing a past week, either hide the card or show a concise read-only explanation; do not let
  it accidentally log against today while the user thinks they are editing the past.
- Use a real SVG/currentColor icon, not emoji card chrome.

### Placement

- **Mobile portrait:** place Record spending directly after the Spending goal and before
  Variable expenses. The flow should read goal → capture → category totals.
- **Desktop:** make Record spending the first card in the right column, immediately above
  Weekly result. This gives the primary action a stable, visible location and starts balancing
  the two columns.
- Do not duplicate the card in two DOM locations. Use a maintainable responsive layout or a
  single safe re-parenting/layout mechanism that responds correctly when crossing the 1024px
  breakpoint. Prefer CSS grid areas/direct grid children if the current wrapper can be
  restructured cleanly; avoid two copies with duplicate IDs and handlers.

### Rebalance the desktop stacks

Use this semantic division at `min-width:1024px`:

**Left — plan and weekly entry**

1. Income
2. Savings
3. Fixed expenses
4. Spending goal
5. Variable expenses
6. Stranded categories, only when present

**Right — action, outcome and supporting tools**

1. Record spending
2. Weekly result
3. Upcoming charges
4. Previous weeks
5. Calculator
6. Pay days & savings goal

The hero and due banner remain full-width above both columns.

On mobile, preserve the more useful linear order:

1. Hero / due banner
2. Income
3. Savings
4. Fixed expenses
5. Upcoming charges
6. Spending goal
7. Record spending
8. Variable expenses
9. Weekly result
10. Previous weeks
11. Calculator
12. Pay days & savings goal

If implementing this requires replacing the two hard-coded inner column wrappers with direct
grid children and named grid areas, do that carefully. Preserve every dynamic wrapper ID and
all collapse-state keys (`data-bud-key`). Do not reorder via `column-count`, CSS masonry, or
anything that makes visual order disagree with keyboard/DOM order.

### Width and alignment

- Keep the two desktop columns equal or nearly equal; the problem is content distribution, not
  the width ratio.
- Both columns begin at the same vertical position.
- Cards align to the same outer grid edges.
- No large empty region should appear on the right while the left continues for several more
  screen heights under ordinary populated data.
- Do not stretch controls or type merely to fill space.
- Keep the desktop max width already used by Budget.

## DO NOT CHANGE

- Transaction precedence over manual category totals
- Expense modal fields or persistence
- Subscription calculations and frozen historical rates
- The Week/Month/Year calculations or charts
- Hero calculations
- Finish week semantics
- Accounts behaviour
- Bottom navigation
- Landscape navigation work outside the Budget layout required here

## VERIFICATION

1. At 390×844, Record spending sits between Spending goal and Variable expenses.
2. Variable expenses no longer contains a top-level dashed Add expense control.
3. Tap Add expense, save a transaction, and confirm the correct category and total update.
4. Add expense still defaults recent category/merchant/account exactly as before.
5. Viewing a past week cannot accidentally create a transaction for the current date/week.
6. At 1024, 1280 and 1600px, Record spending leads the right column above Weekly result.
7. Desktop left column contains planning/entry cards; right contains action/result/supporting
   cards in the order specified above.
8. With populated Variable categories and eight previous weeks, the page no longer leaves a
   conspicuous empty right-side region while the left continues downward.
9. Upcoming charges and Calculator remain fully functional after moving.
10. Every Budget collapse state still attaches to the correct `data-bud-key` after reordering.
11. Week navigation, past-week editing, Finish week, notes and transaction expansion work.
12. Month and Year views are unchanged.
13. Check dark/light themes and phone landscape after the landscape feature has landed.
14. No horizontal overflow or clipped controls at any tested width.
15. No console errors; run `node --check js/app.js` and `git diff --check`.
16. Bump the service-worker cache name because cached HTML/CSS/JS changes.

Commit this as its own coherent commit. Do not push unless Francois explicitly asks.
