# Finance periods and Home — local validation

## v372 — 2026-10-04

**495 tests passed.** Four new chart regressions verify late-start accounts, undated current
balances, complete comparable histories and genuine zero-balance points. Opening the chart
does not modify records. Missing history is excluded with explicit coverage labels, never
backfilled from current balances; existing dates remain visible.

Synthetic browser checks at 1440px and 390px confirmed transparent weather forecast/controls,
the period-switch animation, and compact budget content (about 200px desktop / 238px phone).
Accounts rendered the formerly blocked three-date history, with working All/Assets/Debts
controls and no application console errors. These are fixtures, not a live account audit or
physical-iPhone test. User authorised commit and push.

## v371 correction — release authorised, 2026-10-04

Follow-up polish: **491 tests pass**. Verified the shared weather drawer at 1440px and
390px: Hide/Show retains the card height; Today/Week triggers the upward slide; background
repaints keep the current choice. Added a check that desktop disclosure is independent of
phone and that data refresh does not restart the slide. Reduced-motion CSS removes both
animation and transitions. Home has one Customise Home button and it opens the full editor.
Spending caution colours are scoped orange; no calculations or stored preferences changed.
These checks use a desktop browser at phone dimensions, not a physical iPhone.

Final release pass: the desktop weather panel spans the header/body with the date inside;
1440px and 1024px layouts remain within the viewport. The three quality-of-life update pages
were checked at 390px, including their icons, Next/Back and final dismissal. No application
console errors were observed. The final automated suite remains **491 passed, 0 failed**.

The user rejected the v370 presentation overhaul and authorised release of the completed
correction on 2026-10-04. Home/Finance gradients and status are restored, as are the original Budget card
shells, controls and Overview summaries. The inline banner is replaced by a swipeable launch dialog.

- Automated suite: **490 passed, 0 failed**. Added checks cover exact weekly allocations,
  explicit period precedence, untouched-plan writes, reserve release in Outlook, period goal
  warnings excluding paid bills, and cancellation of stale balance animations after restore.
- Isolated desktop weekly fixture: $1,200 income − $210 purchases − $250 frozen bills − $160
  savings = $580, consistently shown by Budget and Home after initial animations settle.
  Editing income updates both surfaces. Existing weekly income/hour controls remain available.
- Fortnightly fixture: $1,275 remaining initially; changing savings from $200 to $300 yields
  $1,175. Goal editing from $1,000 to $800 leaves $675 against $125 purchases. The day breakdown
  contains all 14 dates. Category controls, Outlook and close-out remain in the original cards.
- Update dialog checked in light/dark mobile presentation: centred, three pages, actual swipe,
  Next/Back and dismissal; it stays dismissed through ordinary navigation and edits.
- Desktop Home and Finance visually checked at 1440px; mobile dialog and period controls at
  390px. No application console errors on the checked fixture screens.
- Cache prepared as `daily-v371`. Production Firebase records and rules were not changed.
  Real account restore/switch and installed-PWA upgrade verification remain outstanding.

## Original v370 validation record

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
