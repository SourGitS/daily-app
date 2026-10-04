# Finance: budgeting by period

## Correction to implementation scope — 2026-10-04

The user rejected the replacement Finance layout after v370. Restore the existing gradient
heroes, status, Overview summaries, Budget cards and their controls. Adapt their dates and
readers to the chosen period. Preserve exact weekly allocations without requiring a new setup.
Replace the inline update banner with a simple swipeable launch pop-up, dismissed once per
profile. The user authorised committing and pushing the completed corrections on 2026-10-04.

Status: implemented for v370; release authorised on 2026-10-04. Real-account verification remains outstanding.
Updated: 2026-10-04.

## Purpose

Daily currently accepts fortnightly income schedules but still calculates its main budget
from a single Monday-to-Sunday week. A payment recorded in one week does not establish a
budget for the following unpaid week. The current until-next-pay projection also starts
from that weekly allocation. Adding cadence selectors alone does not resolve this mismatch.

People should record income and expenses once, with dates, and review their budget over the
period they choose. Expected income, budget allocations and recorded account balances must
remain distinguishable.

## Navigation and presentation

- Rename the visible Finance **Week** tab and matching sidebar row to **Budget**.
  Finance becomes **Overview · Budget · Plan · Bills · Accounts**.
- Budget describes the work done on the screen for every frequency. Put the actual period
  below the title, such as **Fortnightly budget · 2–15 October**, with previous/current/next
  period controls. Avoid "Payment cycle": the budget can span several income sources and
  need not follow every payment.
- Keep existing internal ids, routes and saved navigation choices compatible. Use BUD_VIEWS
  as the single navigation source; audit deep links, help text, AI export and setup copy.
- Overview and Home share the current budget's remainder and date range through one reader.
  Suggested label: **Remaining spending budget**, with days left and next scheduled pay.
- Budget contains allocations, received income, spending, bill reserves and savings
  allocation. Main actions: Record income, Add expense and Adjust budget.
- Bills supplies payment schedules; Accounts supplies recorded balances; Plan holds plans
  alongside explicitly labelled recorded facts; Stats reviews actual activity over selected
  ranges. Weekly Review can show a week's spending without treating an unpaid week inside
  a funded fortnight as missing budget setup.

## Periods and entry rules

- Choose the budget frequency and anchor explicitly. Suggest the main income schedule during
  setup; do not assume the next payment from any source resets the entire budget.
- Initial choices: weekly, fortnightly, monthly and a custom dated period. Include a
  distinct twice-monthly income schedule; every 14 days and twice a calendar month differ.
- Income records amount actually received, source and date. Expected pay remains optional
  planning information and never creates a deposit.
- Expenses record amount, category and date. The same dated record contributes to the
  selected budget and weekly/monthly reports without a second entry or duplicate storage.
- Bills retain their own frequency, due date and actual billed amount. Show "$167.80 monthly"
  prominently; a period equivalent is secondary planning information.
- Bill reserves and payments need a defined relationship. A payment using an existing reserve
  cannot reduce spendable money twice. A scheduled occurrence is not evidence of payment.
- Savings allocation does not assert a transfer or deposit into a Saver account.
- Define rollover explicitly: carry into the next budget, allocate elsewhere or leave
  unallocated. Preserve the distinction between recorded income and carried allocations.
- Missing income dates, balances or payment evidence remain unknown. Do not label the
  budget remainder a bank balance or present an incomplete estimate as safe to spend.

## Special graphic announcement banner — required release scope

Francois explicitly requested a special graphic banner to alert every user when this ships.

- Present a one-time, prominent in-app announcement on the first suitable Home or Finance
  visit after the release. Reach existing users and new users after onboarding; wait for
  account restore and onboarding to settle before showing it.
- Use a dedicated graphic showing a calendar span between two paydays, styled with Daily's
  brand and theme colours. Keep it legible on phones and desktop, in light and dark mode,
  without requiring animation. Artwork must not contain invented personal finance figures.
- Proposed headline: **Your budget, your rhythm**.
- Proposed copy: **Budget weekly, fortnightly or monthly. Record your income and spending
  once, and see what remains for your chosen period. Week is now called Budget.**
- Main action: **Choose my budget period**. Secondary action: **Later**, plus an accessible
  dismiss control. Opening or dismissing the banner must not change an existing budget.
- Persist a versioned acknowledgement in the existing synced profile, so an acknowledged
  announcement does not keep returning across devices. Keep it separate from unrelated
  release-note acknowledgements. Register any persistence changes through existing sync.
- Do not rely solely on checkWhatsNew(): finishOnboarding currently marks new users caught
  up with WHATS_NEW_VERSION and could otherwise skip this announcement for them.
- Keep the explanation reachable from Budget setup/help after dismissal. No email, push
  notification or external messaging is included in this request.

## Data safety and delivery sequence

1. Verify account separation, including account A signing out and account B signing in on
   the same browser. Another user's local data must not appear or upload to the new account.
2. Define period boundaries, allocations, rollover and bill-reserve settlement. Audit the
   existing dated ledger and budget readers before selecting storage changes.
3. Implement the period calculation and entry model with regression checks. Preserve old
   weekly records and frozen historical figures. Never invent payment dates from weekly
   totals; undated legacy aggregates must remain labelled and must not be silently split.
4. Update Budget, Overview, Home, Plan, Stats and onboarding together. Deliver the special
   announcement banner in the same release as the new behaviour and tab name.
5. Verify weekly, fortnightly, monthly, twice-monthly, multiple-source and irregular-income
   journeys; period changes; month-end/DST boundaries; unpaid weeks; partial setup; reserve
   payments; rollover; and legacy history. Check fresh installs, existing accounts on a
   fresh profile, cross-device restore and banner acknowledgement convergence.
6. Validate light/dark, portrait/landscape and desktop presentation, keyboard/screen-reader
   controls and reduced motion. Bump the service-worker cache when production assets change.

## Acceptance examples

- One fortnightly pay entry funds the chosen 14-day budget. The second calendar week does
  not suddenly lose its remaining allocation or ask the user to re-enter the same pay.
- A weekly side-income payment adds to the existing fortnightly budget without resetting it.
- A purchase is entered once and appears in the correct budget period and reporting ranges.
- Home and Finance state the same remainder for the same dates.
- Monthly bill amounts and period equivalents are labelled distinctly and do not double count.
- Existing history retains its recorded amounts. New-period setup does not rewrite it.
- Every user is eligible for the graphic announcement, and acknowledgement survives reload
  and sync without changing finance records.

Broader app refinement follows the same principle: record an event once, connect relevant
screens, and let each area use the timeframe suited to it. Food, workouts and habits are a
subsequent usability pass, not an automatic expansion of this Finance implementation.
