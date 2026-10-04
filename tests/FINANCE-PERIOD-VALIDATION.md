# Finance periods and Home — local validation

2026-10-04. Local validation evidence for v370. The user authorised commit and push after
the outstanding real-account verification was disclosed; this record is not a live deployment check.

## Automated checks

`node --test tests/*.test.cjs`: **484 passed, 0 failed**.
Syntax checks passed for `app.js`, `account-storage.js` and `finance-periods.js`.
`git diff --check` passed.

Coverage includes weekly/fortnightly/custom dates, month-end and leap-year anchors,
DST boundaries, twice-monthly paydays, multiple actual income sources, unknown versus
explicit zero funding, overspending, reserves consumed by bill payments, rollover,
undated legacy history, calendar reports, exports, frozen reviews, banner acknowledgement
convergence, preservation of saved layouts, account namespaces and onboarding drafts.

## Isolated browser checks

The full-app fixture replaces Firebase and localStorage before application startup.
It cannot read or write the production Firebase database.

- Populated account A → empty account B → A: B had no A income, bills, workouts or weights;
  A's original records returned unchanged. Existing-cloud restore assertions passed.
- Fortnightly fixture, 2–15 October: $2,000 received + $100 existing money, less $125
  purchases, $500 paid bills and $200 savings allocation = $1,275 remaining.
  Home and Finance agreed; Plan and Stats showed the same dated payment totals.
- Paying a $500 reserved bill removed its reserve without reducing availability twice.
  Income corrections and an additional purchase refreshed the shared totals.
- Weekly Review and Home's review card use $625 recorded spending in that example,
  instead of the old $375 weekly accrual. Completed review snapshots remain unchanged.
- Light-mode onboarding displayed the Daily logo. The release announcement appeared
  for an eligible profile after onboarding. New desktop profiles led with the requested
  Review/Journal/Habits and Accounts/Nutrition/Weight columns.
- Inspected light and dark presentation. No document overflow at 390px, 1024px, 1440px
  and 1920px. The desktop hero measured about 370–371px at 1440/1920, versus the prior
  approximately 518px at 1440. At 1024 it deliberately uses two rows. Mobile retains
  the existing combined workout/weather presentation and now shows the selected budget dates.
- No application errors appeared in the checked browser console.

## Remaining release verification

A real Google/Firebase account restore and switch has **not** been performed for this
change. The synthetic fixture and unit tests do not verify live OAuth, deployed rules,
network timing on physical phones, or installed-PWA cache upgrade behavior. Firebase rules
and production records were not changed. The service-worker cache is prepared as `daily-v370`.
