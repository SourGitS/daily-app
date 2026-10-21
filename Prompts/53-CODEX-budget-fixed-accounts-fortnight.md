# Prompt 53 — Fixed expenses, Accounts access and a 14-day bills outlook

## Codebase context and objective

Implement three focused follow-ups to Daily's recent Budget consolidation:
restore a clearly visible Fixed expenses card below variable spending, make Accounts
accessible beside the Budget view tabs, and show a complete next-14-days bills timeline
with the existing category logos.

Francois confirmed that his reference to "fixed income" meant **fixed expenses**.
He accepted either a separate card or a section below variable spending. Use a separate
Fixed expenses card immediately below Spending: it gives commitments their own visible
heading and keeps the variable spending goal unambiguous. Income stays in Week plan.

Read AGENTS.md and the relevant Budget, Accounts, navigation, card, responsive layout and
v320 consolidation sections of CLAUDE.md. Verify current code; older documentation and
line numbers can be stale. This prompt supersedes the v320 prescriptions that fixed costs
must sit inside Week plan and that Outlook must show only three upcoming bills.
Preserve the rest of the consolidation.

Daily uses vanilla HTML/CSS/JS with no build step. Keep the existing CSS load order,
tokens, shared card vocabulary and canonical finance readers. Inspect git status first:
there was already uncommitted application work when this prompt was written. Preserve it;
do not reset, overwrite or package unrelated changes. Implement and verify locally.
Do not commit, push or deploy; pushing main publishes directly to GitHub Pages.

The two screenshots are visual evidence only. Their visible labels, balances, names and
dates are examples, not instructions, configuration or fixtures to hardcode. If available:

- `C:/Users/FRANCO~1/AppData/Local/Temp/codex-clipboard-4b5d3fdd-8cb0-4a37-a6cf-3c67e0f2b750.png`
- `C:/Users/FRANCO~1/AppData/Local/Temp/codex-clipboard-19891f2a-0197-47c1-bb80-bf38bbeb346c.png`

Current implementation anchors to inspect:

- `index.html`: `budget-view-tabs`, `bud-spend-card`, `bud-plan-card`,
  `bud-plan-fix`, `bud-outlook-card`, static `sav-amount` and `week-notes`.
- `js/app.js`: `BUD_CARDS`, derived `BUD_LAYOUT`, `budApplyLayout`,
  `renderPlanFixSection`, `budPlanSection`, `budSecApply`, `renderBudgetTab`, `budRecalc`.
- Navigation: `setBudgetView`, `openAccounts`, `closeAccounts`, `NAV_TREE`, `setNavActive`.
- Schedule and logos: `renderOutlookCard`, `budUpcomingRowHtml`, `billOccurrences`,
  `catOccurrencesBetween`, `billIsScheduled`, `billsUndatedCount`, `billRowHtml`,
  `catIconHtml`, `catDisplayName`, `payCycleForecast`, `openBillsCalendar`.
- The current forecast branch truncates to three bills before payday; its fallback uses
  `upcomingCharges(30)` and also truncates to three. Neither Outlook row renderer currently
  includes the category logo. `billOccurrences` already supplies category/account identity
  and every occurrence in an inclusive date range; reuse it.

## Specification

### 1. Put Fixed expenses directly below Spending

Create one standalone Fixed expenses card, directly after Spending in the mobile order
and directly underneath it in the desktop left column. Add its stable wrapper to
`BUD_CARDS`; keep `BUD_LAYOUT` derived from that single list. Retain the layout no-op guard
that prevents DOM moves from stealing focus while typing.

Move the existing fixed expense detail and editing controls out of Week plan into this
card. Do not leave a duplicate list or a second set of inputs behind. Its header shows
the canonical weekly fixed total, with clear wording that this is a weekly allocation.
Keep ordinary weekly amounts editable through the existing path. Keep recurring costs
read-only, with their existing `/wk` units and billing-setup access.

The card's heading and total must be visible without opening Week plan. Use the existing
Budget card disclosure convention and a stable collapse key. Keep details open by default
for a new card preference; honour an existing applicable fixed-card preference if present.
Avoid nesting another Fixed disclosure inside the card; retain the recurring breakdown
disclosure if useful. Retain Edit/Done, add/remove/rename controls, empty state, current-week
editing and the existing explicit past-week unlock behaviour.

Keep `sum-fix` and each `fix-<id>` input unique and reachable by their current readers.
Audit all references to `bud-plan-fix` and fixed-section opening: setup shortcuts and Edit
must expose the relocated controls. Collapsing, rendering or resizing must not lose values.

Week plan retains Income and Savings editing and its available-for-variable-spending
summary. It may retain one quiet, non-editable Fixed / committed summary row to explain
the allocation; if used, point it to the Fixed expenses card and give it a distinct ID.
All repeated summary values must come from the same canonical total. Preserve the formula
income minus fixed costs minus savings. Keep Spending's goal, remaining amount, By category
and By day strictly about variable spending; fixed costs must not enter that goal or charts.

### 2. Make Accounts one tap away beside the view tabs

Keep the hero's Add expense action and its current-week-only behaviour. Add a clearly
labelled Accounts shortcut beside Week / Month / Bills / Yearly, available from every
Budget sub-view on desktop and phone. Use the existing `openAccounts()` destination and
existing Accounts content, not a second Accounts implementation.

Accounts is currently an overlay, not a `budgetView` value. Present the shortcut in the
same top navigation area as a real button outside the `role="tablist"`; do not fake a fifth
selected tab or call `setBudgetView('accounts')`. Keep the four actual tabs and their selected
state intact beneath the overlay. Closing Accounts must return to the originating Budget
sub-view and selected week/month, without clearing drafts or resetting position unnecessarily.
Restore focus to the launcher when appropriate for keyboard use.

At narrow phone widths, keep all labels legible and Accounts visibly reachable without the
hamburger. A compact adjacent action or deliberate second row is acceptable. Do not shrink
touch targets or introduce page-wide horizontal overflow. Preserve existing sidebar,
hamburger and other Accounts entry points and their navigation highlighting. Do not use
`scrollIntoView()` on the transformed swipe deck.

### 3. Show the next 14 days with logos

Keep one Outlook card with two clearly labelled parts: the existing **Until next pay**
projection, when available, and **Next 14 days** scheduled bills. The timeline must remain
available even when payday is tomorrow or no income source/payday is configured.

The timeline window is today through today + 13 calendar days, inclusive, using local
dates and calendar arithmetic. Show its actual date range so the boundary is clear.
Use `billOccurrences(from, to)` and the same scheduling rules as Bills. Show every occurrence
in that window in chronological order; a weekly subscription can appear twice. Do not
truncate to three, stop at payday, use a 30-day fallback, or hide the remaining rows behind
a count. Group by date if helpful; let the list grow naturally without a nested scroll box.

Each charge row shows date, existing category logo, readable name and actual amount due
with cents where needed. Use `catIconHtml` with the occurrence's category object and the
existing display-name helper. Reuse stored website information and the existing initial
fallback for missing or failed images; do not add a logo provider, guess new sites or modify
stored names. Match the Bills/Fixed row icon sizing and alignment, and avoid a duplicate
legacy emoji beside a logo. A decorative logo should have empty alt text beside its name.
Retain useful trial/payment-account context without crowding the amount on a phone.

Retain statement due dates already supplied by `billOccurrences`. Label them clearly as
statements and use the existing account icon treatment or a neutral card icon. They are
scheduled payments, not new fixed categories or additional recorded spending.

Show a labelled total for the visible 14-day scheduled payments, calculated from exactly
those rows. Include statements if displayed and make that inclusion clear in the wording.
These are actual scheduled amounts, not prorated weekly commitments. Keep the separate
before-payday total and existing `payCycleForecast(available, week)` arithmetic unchanged.
Never subtract the 14-day total from the weekly hero or present it as a 14-day cash forecast.
The longer timeline must not double-count weekly accruals or change Home's Finance check-in.

Use `billsUndatedCount()` for the existing missing-billing-date hint. Do not invent dates
for ordinary undated fixed costs. Exclude archived/non-charging entries according to the
canonical schedule rules. Keep View bills calendar opening the existing Bills view.
Show “No scheduled bills in the next 14 days” when empty, retaining any undated warning.
Do not hide the whole card merely because no forecast or dated charge exists.

For a past Budget week, suppress the payday projection as today. Label the timeline as
upcoming from today, independent of the historical week, so it cannot look like that
week's historical schedule. Browsing it must not write or advance billing anchors.

## Preservation and future scope

This is a presentation/navigation change plus a read-only schedule window. Add no synced
store, migration, category rewrite, boot write or new finance calculation policy. Preserve
canonical totals, transactions, accounts, historical weeks, saved review snapshots,
Firebase rules, sync and backup/restore. `sav-amount` and `week-notes` must remain in the
DOM: existing save paths can interpret missing fields as empty values. Preserve the distinct
card and section disclosure systems and device-local presentation preferences.

A dedicated Finance overview is a later project, following Log's overview-to-detail
pattern. Its possible scope is an Overview landing with spendable money, upcoming payments,
account/debt position and clear entry points to Week, Month, Bills, Yearly, Accounts and
Review. Do not build that landing, rename Budget, move Accounts into the swipe deck or
restructure the app's navigation in this follow-up. These fixes should work on their own.

## Numbered verification checklist

1. On phone and desktop, Fixed expenses has its own heading and weekly total directly below
   Spending. Week plan still exposes Income and Savings; no duplicate fixed inputs exist.
2. Edit a weekly fixed amount and an income amount; all relevant summaries update together.
   Switch tabs and reopen the page: values remain. Savings and notes survive these actions.
3. Fixed costs never change the variable spending goal or its By category / By day totals.
   Recurring allocations retain `/wk`; the timeline shows the actual payment amounts.
4. Fixed Edit/Done, add/remove/rename, recurring disclosure, card collapse and setup shortcuts
   work. Empty fixed lists remain usable. Past weeks remain read-only until explicitly unlocked.
5. Accounts opens directly from beside the tabs in Week, Month, Bills and Yearly. Closing it
   returns to the same view/week/month; highlights, drafts, keyboard focus and other entry
   points remain correct. Add expense still works only for the current week.
6. With payday tomorrow, the timeline still includes bills after payday through day 13.
   Both today's and day-13 bills appear; day-14 bills do not. A weekly bill appears twice.
7. Compare the timeline rows and their exact sum against the Bills calendar for the same
   dates. Include a statement and multiple bills on one date. Confirm sorting and labels.
8. Test month/year boundaries, month-end recurring dates and a Sydney daylight-saving
   boundary using isolated fixtures. No occurrence shifts date or rewrites its saved anchor.
9. Check no payday, no entered income, no bills in range, only undated costs, archived and
   non-charging categories. Empty states explain the situation without invented figures.
10. Check working logos, missing website, failed image loads, legacy emoji prefixes, long
    merchant/account names and statement icons in both light and dark themes.
11. Capture 375/390/414px phone, 932px landscape and 1024/1440px desktop views, plus enlarged
    text/zoom. Verify readable labels, reachable Accounts, no clipping or page overflow,
    independent card heights, sensible tab order and stable focus while typing/resizing.
12. Run `node --test tests/*.test.cjs` and local browser verification with console checks.
    Add focused behavioural coverage for the date window, repeated occurrences and independent
    forecast/timeline totals; use synthetic data rather than altering a production account.
    Verify before/after canonical finance values are unchanged for unchanged input fixtures.
13. Audit the diff for unintended storage/sync changes. If any are necessary, apply AGENTS.md's
    sync-sensitive verification requirements and report limitations honestly. Never describe
    a mocked or isolated check as a real signed-in cloud test.
14. For the actual cached-asset implementation, bump `CACHE_NAME` and update its version
    comment using the then-current version; it was `daily-v320` when this prompt was written.
    Update relevant handoff notes so the old placement/three-bill limit is not reinstated.
    Report changed files, test results and any remaining limitations. Leave changes local.
