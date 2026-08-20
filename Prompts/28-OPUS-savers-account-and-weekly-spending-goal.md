# PROMPT 28 — Savers Account Flag + Debt Payoff Card, and a Weekly Spending Goal Card

Written from a phone session (Claude Code on the web) rather than a prompt file — this
records what was built and how to check it, in the usual format.

## CODEBASE CONTEXT

**Accounts** (`js/app.js`, `daily_accounts` store, `renderAccountsPage()`) tracks assets and
debts and shows one figure: net worth (`accountsNetWorth()` = assets − debts). That answers
"what am I worth" but not "am I actually covered" — and it silently counts a savings account
being left alone to earn interest as if it were available to clear the Visa.

**Budget** week view has a "Money left over" figure (`weekLeftover`, the Weekly result card):
income minus savings, fixed and variable. That's whatever income happens to leave behind —
there was no self-imposed ceiling on variable spending to aim at during the week.

## TASK

### 1. Accounts — "Savers account" flag

An asset account can be flagged `saver:true`. It still counts in net worth (it IS money owned)
but is held out of the new payoff total below.

- Toggle row on every asset card ("Savers account — Excluded from the payoff total"),
  `accountToggleSaver(id,on)`.
- Same toggle in the add-account form when the type is Asset (mirrors the debt form's
  "Track statement due date" toggle). `_acctAddSaver`.
- A flagged account shows a blue `🔒 SAVERS` tag instead of the green `ASSET` tag.

### 2. Accounts — Debt payoff position card

New card between net worth and the trend chart (`#accounts-payoff`, `renderPayoffCard()`):

```
accountsPayoffPosition() = (assets − savers) − debts
```

- Negative → red, `"$X still needed to clear every debt"`.
- Positive → green, `"$X spare after clearing every debt"`.
- No debts at all → `"No debts — everything here is yours"`.
- Sub-lines: the arithmetic (`$1,200 spendable − $2,800 debts`) and which accounts are being
  held back and for how much.
- Renders nothing when there are no accounts.

Net worth itself is untouched — the exclusion applies only to this card.

### 3. Budget — Weekly spending goal card

New card between Fixed expenses and Variable expenses (`#bud-vargoal-card`,
`renderVarGoalCard()` / `updateVarGoalCard()`), because it's the ceiling the Variable card
directly below has to stay under.

- A goal input per week. The usual goal lives in `budDefaults.varGoal`; each week stores the
  number that actually applied to it (`var_goal` in the week data), so raising the goal for a
  big week never rewrites past weeks, and past weeks don't move when the usual goal changes.
- The first goal ever set is adopted as the usual one automatically. After that, a week whose
  goal differs from the usual one gets two buttons: **Use usual** and **Make this my usual**.
- Big figure = goal − total variable. Green under, amber from 85%, **red the moment it ticks
  over** (and the whole card border tints red).
- Footer: `$X spent` on the left; on the right, `$X/day for N more days` while under,
  `N days still to go` while over, and `✓ Stayed under` / `✗ Went over` on a past week.
- Live-updates from `budRecalc()` by element id — never a re-render, so typing in the goal
  input doesn't lose focus.

### 4. Fix carried in with it — budget collapse state

`saveBudgetCollapseState()`/`restoreBudgetCollapseState()` persisted collapsed/expanded by
**card index**, so any change in the number of cards mis-applied the whole saved state (the
due banner and the previous-weeks list already render `.card` elements conditionally, so this
could misfire before this change too). Now keyed by a `data-bud-key` attribute on each card;
a legacy saved array is ignored and replaced on the first toggle.

## VERIFICATION CHECKLIST

1. Budget tab → a **🎯 Spending goal** card sits between Fixed expenses and Variable expenses.
2. Type a goal (e.g. 250). Enter variable spending under it → big green figure "$X left of
   your $250 goal", green bar, and "$X/day for N more days" bottom-right.
3. Push variable spending past the goal → figure flips red with a minus, "over your $250 goal",
   red bar, and the card's border tints red.
4. Change the goal on this week → a line appears: "Usual: $250 · Use usual · Make this my
   usual". **Use usual** puts it back; **Make this my usual** sets the new default.
5. Close and reopen the app → the goal is still there for the week.
6. Swipe back to a past week → the goal input is greyed out and the footer reads
   "✓ Stayed under" or "✗ Went over".
7. Collapse the Spending goal card, reopen the app → it's still collapsed, and no other card
   collapsed itself.
8. Menu → Accounts → each asset account has a **Savers account** toggle.
9. Turn it on for the savings account → its tag turns into a blue 🔒 SAVERS.
10. A **Debt payoff position** card sits under Net worth: red "$X still needed to clear every
    debt" while short, green "$X spare after clearing every debt" once covered, and it names
    the savers account it's holding back.
11. Turn the savers toggle off → the payoff figure jumps by that account's balance. Net worth
    at the top does NOT change either way.
12. Add a new account with type Asset → the add form offers the Savers toggle; pick Debt and
    it offers "Track statement due date" as before.
