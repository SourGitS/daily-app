# FUNCTIONAL SPEC — Accounts tab
### What it does today. Not a critique, not a design brief — read as ground truth.

---

## WHAT THIS IS

Personal lifestyle app (workouts, budget, habits, kitchen). Vanilla HTML/CSS/JS, no framework,
phone-first PWA. This spec covers **Accounts** — net-worth tracking across every asset and
debt the user has. It's reached from the hamburger menu / desktop sidebar as a full-screen
overlay, not one of the four bottom-nav tabs.

Accounts is younger than the rest of the app: it replaced two separate single-purpose logs
(a savings balance log and a single credit-card balance log) with one generalised model that
supports any number of accounts of either type. That migration history still shapes a few
things described below.

---

## DATA MODEL

One array, `accounts`, persisted to `daily_accounts` and synced as a Firebase blob (same
mechanism as the budget category lists). Each account:

```
{
  id, name,
  type: 'asset' | 'debt',
  current: number,              // the balance right now
  history: [{date, balance}],   // one entry per date it was updated, oldest first
  saver: bool,                  // assets only — see below
  category: string|undefined,   // optional, see below
  limit: number|undefined,      // debts only, optional — see below
  tracksStatement: bool,        // debts only
  statementBalance: number,     // only meaningful if tracksStatement
  dueDate: string|undefined     // YYYY-MM-DD, only meaningful if tracksStatement
}
```

No fixed count and no assumed accounts — zero debts and five assets both work, and a brand
new user with no legacy data starts with an empty list (no starter rows are seeded).

**Computed, not stored:**
- **Net worth** = Σ(asset.current) − Σ(debt.current)
- **Payoff position** = (Σ assets *excluding* savers) − Σ debts. Answers "if I paid everything
  off today with money I'm actually willing to spend, where would I land?" — separate from net
  worth, which answers "what am I worth on paper."
- **Utilisation** (debts with a `limit` set) = current ÷ limit, as a percentage.

**Two optional fields with no migration path** — `category` and `limit` are absent on every
account that existed before they were added. Every reader treats "absent" as "not set" and
falls back to the pre-existing behaviour; nothing needed to be backfilled.

**Category is a closed picklist, not free text**, and the list differs by account type:

| Asset categories | Debt categories |
|---|---|
| Cash / everyday | Credit card |
| Savings | Loan |
| Investments | Owed to a person |
| Owed to me | Bill / arrears |

Categorising an account does not currently feed any other view — it renders as a sub-label on
the account's own row (in the list here, and on the Home card's expanded list) and nothing
else aggregates by it. There's no "total in Investments" or "total owed to me across three
people" rollup anywhere.

---

## SCREEN LAYOUT

Full-screen overlay on mobile (`.app-overlay`, slides in from the right, swipe-to-dismiss);
on desktop it behaves as a sidebar peer — clicking a different sidebar item closes it, and its
own back button is hidden there (redundant once that's true). Desktop caps the content column
at 1120px and stacks every section full-width — it is **not** a two-column split; net worth,
the payoff card, the trend chart and the account list all run the full column width, one under
the other.

Top to bottom:

1. **Net worth card** — the headline figure, green if positive / red if negative, with
   "$X assets · $Y debts" underneath. On desktop this spreads label / figure / detail
   horizontally instead of stacking centred.
2. **Debt payoff position card** — same visual treatment as #1 (deliberately, so the two read
   as one system). Shows the payoff position figure, a one-line headline ("spare after clearing
   every debt" / "still needed to clear every debt" / "no debts — everything here is yours"),
   the arithmetic ("$X spendable − $Y debts") when there is any debt, and a note naming which
   accounts are held back as savers (or, if none are flagged, a prompt to flip that toggle).
3. **Net worth trend chart** — a line chart (Assets / Debts / Net worth over time), built from
   every account's dated history. Needs at least 2 recorded balance updates across all
   accounts combined to render at all; below that it shows a one-line prompt instead.
   **This exact chart, same function, also renders inside Stats → Finance** — Accounts is
   where the underlying balances get edited, Stats → Finance is where the same chart is
   reviewed alongside other financial history.
4. **Account list**, one card per account, with an "Edit / Done" toggle above it (identical
   convention to the Budget tab's Income/Fixed/Variable section headers). Outside edit mode
   the account name renders as plain text and there's no delete button; edit mode turns the
   name into an editable input and reveals a delete (×) button per card. This was deliberately
   changed from an always-editable input, which showed a visible grey input-fill behind every
   account name at all times.
5. **"+ Add account"** — opens a small inline form: name, an Asset/Debt segmented toggle, and
   (depending on type) either a "Savers account" toggle or a "Track statement due date"
   toggle. Confirming creates the account with a zero balance and no history.

### Per-account card, in edit-mode order

- **Name** (edit mode only) / **type tag** ("Asset", "Debt", or "🔒 Savers" for a flagged
  savers account) / **delete** (edit mode only)
- **Current balance** — a number input + "Update" button. Updating logs a new dated history
  entry for *today* (overwriting today's entry if one already exists — one entry per calendar
  date, newest write wins) and updates `current`. Also shows how many updates are on record, or
  "No history yet", and a computed change indicator against the previous entry.
- **Category** — a `<select>`, options depend on asset/debt, "Not set" is a real, default
  option.
- **Credit limit** (debts only) — optional number input. Once set, shows a percentage-used
  figure and a progress bar; colour is semantic (green under 30%, amber to 80%, red above —
  not tied to the app's accent, which can be any runtime hue).
- **Savers account** (assets only) — a toggle. Copy explicitly states it's "excluded from the
  payoff total," not from net worth.
- A static explanatory line on every debt: this balance is a standalone running total, not
  counted in weekly budget spending — card purchases still get logged in Variable spending
  categories same as cash.
- **Track statement due date** (debts only) — a toggle. When on: statement balance input, a due
  date picker (with a computed "due in N days" / "Overdue" label), and a "Mark statement as
  paid" button that zeroes the statement balance and clears the due date **without** touching
  the running `current` balance — those are treated as two separate concerns (what you owe in
  total vs. what's due this cycle).

---

## WHERE ACCOUNTS DATA SURFACES ELSEWHERE

This is not a self-contained tab — its numbers are read from four other places:

1. **Home tab's Accounts card** — net worth as the primary figure (not total assets — see
   "settled" below), a Spendable / Savers / Debts split (three-way only when a savers account
   exists, otherwise Spendable+Debts), a collapsed account list with per-account category and
   utilisation shown as a sub-line, and any due-soon statement rendered as an amber alert row
   above that list.
2. **Budget tab's hero card** — shows "Debts" and "Net worth" as two of its headline stats,
   plus a "Manage Accounts →" link. The Budget tab's old inline credit-card editor is gone
   entirely — the "Cards & debts" row there is now just a link into Accounts, so there's one
   source of truth for debt figures rather than two.
3. **Stats → Finance** — the identical net-worth trend chart described above.
4. **The weekly "due this week" banner on the Budget tab** — separate from the Home alert.
   Scans every debt account with `tracksStatement` on and a `dueDate` falling inside the
   **currently viewed budget week** (Monday–Sunday) and shows an amber banner. A due date
   three weeks out is invisible until that week's Monday arrives — there's no earlier warning
   anywhere.
5. A savings-goal progress feature on the Budget/Stats side reads `accountsAssetsTotal()`
   directly as "current balance" toward a goal — meaning a savings goal is measured against
   *all* assets combined, not a specific account.

---

## THINGS I NOTICED (flags, not asks)

- **Emoji are still used as chrome inside the Accounts screen itself** — 💳 in the due-date
  alert, ✅/⚠️ in the payoff card's label — even though the equivalent Home card was
  deliberately swept clean of chrome emoji recently (replaced with a line-icon set). The two
  screens are now visually inconsistent with each other on this specific point.
- **Categorising an account doesn't roll up anywhere yet.** You can mark three accounts "Owed
  to a person," but there is no single figure anywhere showing "$X owed to people" as a group —
  each is just a label on its own card.
- **A stale CSS comment nearby describes a two-column desktop layout** ("net worth + trend on
  the left, account cards on the right") that is not what's implemented; the real layout is a
  single stacked column. Worth knowing so it isn't mistaken for an intended-but-broken
  two-column design.
- **No advance warning for a bill beyond its own week.** The only due-date surfacing anywhere
  is scoped to the currently-viewed budget week.

---

## SETTLED — DON'T RE-PROPOSE

These were deliberate decisions made recently, with reasons — re-litigating them costs a round
trip.

1. **Net worth, not total assets, is the primary figure on the Home card.** Total assets is
   the bigger, more flattering number but not the true one once debts are considered; leading
   with it was judged to say the wrong thing at a glance.
2. **Spendable / Savers / Debts, not Cash / Invested / Debt.** There is no "invested" account
   *type* — `invest` exists only as one option inside the asset category picklist, which is a
   separate, optional, non-aggregating field (see "things I noticed" above).
3. **The account name is read-only by default with an explicit Edit/Done toggle**, not a
   permanently-editable input. This was a deliberate fix for a real bug (a grey input-fill
   sitting behind every account name at all times); don't propose reverting to an always-live
   input.
4. **Desktop is one capped column, not a multi-column split.** Tried, and it's what's live —
   don't propose splitting net worth/trend from the account list into side-by-side columns
   without a specific reason.
5. **The app's accent colour is not fixed** — it can follow live weather, the training day, or
   a static user pick, and can be anywhere from neutral grey to a bright or deep hue at
   runtime. Any colour-coding proposal (like the utilisation bar's green/amber/red) needs to be
   semantic and independent of the accent, not paired with it.
6. **Dark mode is the default and what's actually used.** Any proposal needs to work in both
   themes, but should be designed dark-first.

---

## OUTPUT WANTED

Same shape as any other design pass on this app:

1. **Ranked redesign proposals** — most impactful first.
2. **A direct opinion on the emoji inconsistency** flagged above — worth fixing to match Home,
   or not worth the churn?
3. **A direct opinion on whether categories should roll up anywhere** — and if so, where: a
   new card, a section within Accounts, or nowhere (not worth the complexity)?
4. **Anything that's a function problem, not just a design one** — a flow that takes two taps
   and should take one, a missing state, a due-date warning gap, anything confusing regardless
   of how it looks.
5. **A "don't bother" list** for anything considered but not worth doing.

Be direct. If something is genuinely bad, say so plainly rather than softening it.
