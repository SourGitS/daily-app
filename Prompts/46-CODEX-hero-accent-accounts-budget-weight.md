# Prompt 46 — Five targeted fixes: hero accent, Accounts merge, spending rows, Budget order, Home weight

## Objective

Five independent, self-contained changes Francois asked for after reviewing the app on desktop.
They do not depend on each other and can be implemented in any order, but they ship together.

1. **The hero panel ignores the accent.** Accounts, Budget → Month and Budget → Year all render a
   hardcoded graphite surface while the rest of the app is the user's accent colour.
2. **The Accounts page says "$139 net worth" twice** in two stacked cards. Merge them into one.
3. **The "Where your variable spending went" rows do not line up**, and the bars should be square.
4. **The Budget week tab's card order has drifted** as cards were added. Reorder it.
5. **Home's weight card draws a sparkline.** Replace it with the last three readings.

Every one of these is presentation. **No data shape, no calculation, no storage key and no
Firebase path changes anywhere in this prompt.**

## Repository context and required reading

You are working in **Daily**, Francois Peters's personal lifestyle PWA.

Before changing anything:

1. Read `AGENTS.md` completely. Its sync, migration, data-preservation and service-worker rules
   are mandatory.
2. Read the design-token, surface-hierarchy, budget-palette, hero-surface, Accounts and Home-grid
   sections of `CLAUDE.md`.
3. Re-grep `index.html`, all nine CSS files, `js/app.js` and `js/nutrition.js`. **Both
   documentation files have been stale before; current code wins.** `CLAUDE.md` is already known
   to be wrong about Budget → Month using `.hm-card` (see Fix 1), about `js/app.js` being one
   file (there is also `js/nutrition.js`, loaded at `index.html:1232`), about its line count
   (25,395 as of this writing) and about the navigation (Prompt 45 has landed in the code but
   not in the docs — see below). Correct all of it as part of this work.
4. Inspect `git status` and preserve every unrelated edit or untracked file. Never reset or
   discard the user's work.

> **Line numbers in this prompt are accurate as of writing, against a working tree that was
> being actively edited.** They are navigation aids, not addresses. **Locate every change by
> symbol or selector name** — `renderAccountsHero`, `.hero-surface`, `BUD_LAYOUT` — and if a line
> number does not match, trust the name and say so in the completion report.

Constraints:

- Vanilla HTML/CSS/JS. No build step, bundler, modules or package manager.
- **Do not reorder the CSS `<link>` tags in `index.html`.** Cascade order is load-bearing.
- GitHub Pages serves `main` directly. **Do not commit, push or deploy.**
- Bump `CACHE_NAME` in `service-worker.js` from `daily-v298` to `daily-v299` **exactly once**,
  with a matching version comment describing this release. (Prompt 45 already took it to v298;
  confirm the current value before bumping rather than assuming this line is still right.)

## Relationship to Prompt 45

**Prompt 45 has already been applied to the code.** `.seg-tabs` exists in `css/workout.css`,
`NAV_TREE` exists in `js/app.js`, `.lg-card-lbl` / `.lg-card-act` are retired, and `CACHE_NAME`
is at `daily-v298`. Every anchor this prompt depends on was re-verified against that tree and is
unchanged: `.hero-surface` still carries the graphite literals, `budHeroMetric()` is still dead,
`.month-spend-row` still has its per-row grid, `BUD_LAYOUT` is unchanged, `renderAccountsHero()`
is byte-identical, and `buildWeightGoalCard()` still draws the sparkline.

**Prompt 45 did not update `CLAUDE.md`.** As of writing it still describes the old navigation, has
no mention of `.seg-tabs` or `NAV_TREE`, and still claims `js/app.js` is ~24,500 lines and the
only logic file. Verify this before assuming — if it is still true when you start, finish that
documentation debt alongside this prompt's own doc updates, and say in the completion report
which of the two prompts' changes you documented.

Do not implement or re-implement any part of prompt 45 here. If you find a piece of it that was
specified but not built, **report it — do not build it.**

---

# FIX 1 — The hero surface follows the accent

## What is happening

`css/budget-home.css:527`:

```css
.hero-surface{--hm-from:#4A4A52;--hm-mid:#33333A;--hm-to:#232329; …}
```

Those three graphite stops are literals. `applyAccent()` (`js/app.js:1382`) writes
`--accent-hero` and `--accent-hero-2` from `heroStopsFor()` — contrast-checked accent stops that
keep hue and saturation and walk lightness down until white clears 4.2:1 — and **`.hero-surface`
never reads them.** All three screens Francois named render through `budHeroPanel()`:

- Accounts — `js/app.js:19161`
- Budget → Month — `js/app.js:12910`
- Budget → Year — `js/app.js:13110`

## The change

```css
.hero-surface{--hm-from:var(--accent-hero,#4A4A52);
              --hm-mid:var(--accent-hero,#4A4A52);
              --hm-to:var(--accent-hero-2,#26262C); …}
```

Keep the fallbacks in the `var()` — they are the pre-JS paint, exactly as `.hm-accent` did it,
and they mean the panel looks the way it does today if `applyAccent()` has not run yet.

**This does not violate the rule the panel was built around.** That rule is *no per-cell colour
variant* — six cells in four saturated colours read as six unrelated announcements rather than one
summary. One accent-tinted surface holding six hairline-divided cells is still one surface. Do
**not** reintroduce `.hm-income` / `.hm-expense` styling onto `.hp-cell`, and do not add a
per-cell colour argument to `budHeroPanel()`.

Everything else about the surface stays: the decorative `::before` circle at
`rgba(255,255,255,.10)`, the `::after` top glare, the white text, the `text-shadow`, the
`.hp-cell` hairlines at `rgba(255,255,255,.15)`, and the four-deep `.hero-panel .hp-cell .tstat*`
re-tint rules (which exist because `kitchen-extras.css` loads last and would otherwise outrank a
three-deep rule).

The heroes restyle themselves the moment `applyAccent()` writes the tokens, so **do not add any
re-render call** to `applyAccent()`, `applyTheme()` or `applyDayColour()`. `CLAUDE.md` records
that the forced re-render was deliberately removed once the stops became custom properties.

## Fix 1b — delete the dead `.hm-card` component

`budHeroMetric()` (`js/app.js:10743`) has **exactly one occurrence in the file: its own
definition.** Nothing calls it. So `.hm-card`, `.hero-metric-grid` and all six colour variants are
unreachable — including `.hm-accent`, which was the only rule in the Budget area that ever read
`--accent-hero`. `CLAUDE.md` still describes Budget → Month as three direction-coloured
`.hm-card`s; it has been a `budHeroPanel()` since.

Delete:

- `budHeroMetric()` and its comment block, `js/app.js:10730–10762`
- `.hero-metric-grid` (`css/budget-home.css:521`)
- `.hm-card` (`:537`)
- `.hm-income,.hm-good`, `.hm-expense,.hm-short`, `.hm-accent`, `.hm-neutral` (`:541–544`)
- the four `.hero-metric-grid .hm-card .tstat…` rules (`:554–558`)
- the `.hero-metric-grid` / `.hm-card` / `.hm-val` lines inside the `@media (max-width:560px)` and
  `@media (min-width:1024px)` blocks at `:559–569` (delete the blocks if nothing else is in them)

> **TRAP — do not delete these.** `.hm-label`, `.hm-label .card-hd-ico`, `.hm-val`, `.hm-unit`,
> `.hm-sub` and `.hm-chip` are **still used by `budHeroPanel()`** — `.hp-cell` builds its markup
> from them. Deleting the whole `hm-*` block breaks all three hero panels. Only `.hm-card`,
> `.hero-metric-grid` and the six colour variants go.

Before deleting, grep for `hm-card`, `hero-metric-grid`, `budHeroMetric`, `hm-income`,
`hm-expense`, `hm-good`, `hm-short`, `hm-accent` and `hm-neutral` across `index.html`, all nine
CSS files, `js/app.js` and `js/nutrition.js`. **`js/app.js` builds some class names by string
concatenation** (e.g. `` `kit-card kit-c-${category}${sel}` ``), so search for concatenation
patterns too, not only the literal string. Report what you found.

---

# FIX 2 — Merge the two Accounts cards (Option A)

## What is happening

`#accounts-hero` (`renderAccountsHero()`, `js/app.js:19133`) renders a two-cell `hp-lg` panel:
**Net worth** and **Debt payoff position**. Directly beneath it, `#accounts-chart`
(`renderNetWorthChartInto()`, `js/app.js:15978`) renders a `.nw-chart-card` whose head is
**"NET WORTH" + the same `fmtMoney(curNet)` figure**. The same number, from the same source, with
the same label, twice within ~340px. `CLAUDE.md`'s own rule: a card must not restate a number
another card already shows.

## The change

**The net-worth cell moves into the chart card; the hero becomes one cell — Debt payoff position.**

### 2a. The chart card absorbs net worth

`.nw-chart-card`'s head already carries the kicker, the figure and the change line
(`−$1,512 · −91.6%`). Add the two things the hero cell was contributing:

- the assets/debts sub-line — `fmtMoney(assets)+' assets · '+fmtMoney(debts)+' debts'`
- the verdict chip — `tstat('pos','In the black','check',true)` / `tstat('neg','Under water','down',true)`

Both read from figures the chart already computes (`assetsData`, `debtsData`, `netData`), so
**compute them from the chart's own last data point — do not call `accountsNetWorth()` /
`accountsAssetsTotal()` / `accountsDebtsTotal()` from inside the chart renderer.** The chart's
`curNet` is the last common-coverage date; the hero's `nw` is live. They can legitimately differ,
and the card must state the one its own chart ends on, or the figure will disagree with the line
directly beneath it.

Markup, keeping the existing head structure:

```js
'<div class="nw-chart-head">'+
  '<div><div class="nw-chart-kicker">'+acctIcon('trend',13)+'Net worth</div>'+
    '<div class="nw-chart-value">'+fmtMoney(curNet)+'</div>'+
    '<div class="nw-chart-change" style="color:'+changeCol+'">'+changeText+'</div>'+
    '<div class="nw-chart-mix">'+fmtMoney(curAssets)+' assets · '+fmtMoney(curDebts)+' debts</div>'+
    '<div class="nw-chart-verdict">'+nwChip+'</div></div>'+
  '<div class="nw-chart-ranges">…</div>'+
'</div>'
```

Two new CSS rules only (`css/budget-home.css`, beside the other `.nw-chart-*`):

```css
.nw-chart-mix{font-size:11.5px;font-weight:600;color:var(--muted);margin-top:7px}
.nw-chart-verdict{margin-top:9px}
```

`.tstat` renders correctly on `.card` already — this is a card, not a hero — so it needs **no**
re-tint rule.

> **`renderNetWorthChartInto()` has TWO mounts:** `accounts-chart` (the Accounts page) and
> `bs-balance-wrap` (Stats → Finance, via `renderBSBalance()`). Show the new sub-line and chip in
> **both** — it is the same figure and the same truth, and Stats → Finance benefits identically.
> Do not gate them on `wrapId`. The existing `wrapId==='bs-balance-wrap'` gate on the "Open
> account records →" link stays exactly as it is.

Also handle the **early-return branch** at `js/app.js:15987` (fewer than two common dates). It
renders its own minimal card and must keep working unchanged — do not add the chip there, since
there is no net-worth figure to judge.

### 2b. The hero becomes one cell

`renderAccountsHero()` drops its first item and switches to a single column:

```js
el.innerHTML=budHeroPanel([
  {icon:'target', label:'Debt payoff position', lg:true, val:fmtMoney(Math.abs(pos)),
   sub:headline, chip:payoffChip, extra:mathLine+kindLine+saverLine},
],{cols:1,colsSm:1});
```

Everything that made the payoff cell worth a full-width surface stays: `headline`, `payoffChip`,
`mathLine`, `kindLine` and `saverLine`. `.hp-grid`'s divider trick (`border-top` + `border-left`
on every cell, grid pulled 1px up and left, clipped by the surface's `overflow:hidden`) holds for
any column count including one — **verify this visually rather than assuming**, and if a stray
hairline shows on a single-cell panel, fix it in `.hp-grid` in a way that still holds for 2, 3 and
6 columns. No `:nth-child` arithmetic.

The `!accounts.length` early return (`el.innerHTML=''`) stays.

### What must not change

- `accountsNetWorth()`, `accountsPayoffPosition()`, `accountsSaverTotal()`, `acctIsSaver()` and
  `accountsDebtsByKind()` are untouched. The **debt payoff position** is still
  `(assets − savers) − debts`, and a `saver:true` asset is still excluded from it while remaining
  in net worth.
- The `#accounts-hero` → `#accounts-chart` → `#accounts-list-head` → `#accounts-list` →
  `#accounts-addform` order in `index.html:1086–1090` stays.
- `.hero-surface .acct-payoff-math`, `.acct-payoff-kinds` and `.acct-payoff-note`
  (`css/budget-home.css:1473–1474`) still apply — the payoff cell is still on a hero surface.

---

# FIX 3 — Spending rows align, and the bars go square

## 3a. The alignment fault

`css/budget-home.css:678`:

```css
.month-spend-row{display:grid;
  grid-template-columns:minmax(84px,auto) minmax(40px,1fr) minmax(74px,auto) 46px; …}
```

**Every row is its own grid**, so `minmax(84px,auto)` sizes column 1 to *that row's own* label.
Every label except "Money Transfer" fits inside 84px, so they share that width; "Money Transfer"
does not, so its column grows and its bar starts ~23px further right. Column 3
(`minmax(74px,auto)`, the amount) has the same fault — invisible only because the amounts are
right-aligned against a fixed 46px column, so the slack is absorbed by the `1fr` track.

Make columns 1 and 3 **fixed** and let the bar take all the slack. Three breakpoints, all three
must change:

```css
/* base (:678) */
grid-template-columns:120px minmax(40px,1fr) 88px 46px;
/* :698  (the middle breakpoint) */
grid-template-columns:104px minmax(28px,1fr) 84px 42px;
/* :704  (the narrow breakpoint) */
grid-template-columns:88px  minmax(20px,1fr) 78px 38px;
```

`.month-spend-name` already carries `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`,
so a longer label truncates instead of shoving the row. Check the longest real category name in
Francois's data before settling the 120px — if a common label truncates at 120, raise it; the
requirement is that the number is **fixed**, not that it is exactly 120.

## 3b. Square bars — one token, applied everywhere

`.month-spend-track` / `.month-spend-fill` are `border-radius:4px` on an 8px-tall bar, which is a
full pill. **Do not square only this card.** Every bar in the app is currently rounded, and
squaring one makes it the odd one out:

| Rule | File | Current |
|---|---|---|
| `.month-spend-strip` | `budget-home.css:674` | 5px |
| `.month-spend-track` / `-fill` | `budget-home.css:684–685` | 4px |
| `.card-bar` / `.card-bar-fill` | `kitchen-extras.css:471–472` | 5px |
| `.hero-progress-fill` | `kitchen-extras.css:542` | 5px |
| `.wkr-pv-track` / `.wkr-pv-fill` | `review.css:58–59` | 3px |
| `.kit-cook-progress-fill` | `kitchen-extras.css:1129` | 2px |

Add one token to `css/base.css` beside the other radii:

```css
--radius-bar:0;   /* magnitude bars and progress meters — square, one value, one place */
```

and point every rule in the table at `var(--radius-bar)`. `.card-bar-pace` keeps its own 1px
radius — it is a 2px marker, not a bar.

Leave alone: `.nut-progress` and anything whose radius is a **pill by design** on a control
(`.nw-chart-series` chips at 999px, `.tstat` at 999px, `.muscle-pill` at 20px). Those are not
bars. If you find another genuine bar not in the table, add it and say so.

---

# FIX 4 — Reorder the Budget week tab

## What is happening

The order lives in `BUD_LAYOUT` (`js/app.js:11810`) and has drifted as cards were added:

- The two **verdict** cards are separated — "Until next pay" is 10th, "Weekly result" 12th, with
  "Stranded data" between them.
- The **spending goal** no longer sits above the card it caps. Its comment in `index.html:305`
  says it is "between the two expense cards… the ceiling the Variable card below has to stay
  under" — "Record spending" was inserted between them, so that comment is stale.
- **"Record spending" is 7th on a phone**, and it is the thing done most often.
- **`bud-setup-card` is missing from the desktop plan entirely.** `budApplyLayout()` only
  `appendChild`s listed ids, and appending moves a node to the end — so on desktop every other
  card is appended past it and setup ends up **first in the left column, above Income**. It is
  invisible in normal use (`renderBudgetSetupCard()` returns `''` once the current week has any
  income) which is why nobody noticed.

## The change

Replace `BUD_LAYOUT` with the order below. **Mobile is action-first** (record a purchase, see what
it did to the week, then the plan); **desktop keeps the plan on the left and the action, verdict
and tools on the right**, which is what keeps the tall Variable card out of the short column.
Francois wants to live with this and adjust, so keep it a single readable constant.

```js
const BUD_LAYOUT={
  // Mobile: action first. Record a purchase, see what it did to the week, then the plan that
  // week is being measured against, then reference. Setup is a dismissible onboarding banner so
  // it leads; Stranded data is a maintenance state so it trails.
  mobile:[['bud-col-left',[
    'bud-setup-card',
    'bud-record-card','bud-result-card','bud-forecast-card',
    'bud-income-card','bud-savings-card','bud-fixed-card','bud-upcoming-card',
    'bud-vargoal-card','bud-variable-card','bud-days-card',
    'prev-weeks-section','bud-calc-card',
    'bud-stranded-card']]],
  // Desktop: left is the plan and the entry work (the long Variable card lives here, and it is
  // what makes the page tall); right is the action, the verdict and the supporting tools.
  desktop:[
    ['bud-col-left',['bud-setup-card','bud-income-card','bud-savings-card','bud-fixed-card',
      'bud-upcoming-card','bud-vargoal-card','bud-variable-card','bud-days-card']],
    ['bud-col-right',['bud-record-card','bud-result-card','bud-forecast-card',
      'prev-weeks-section','bud-calc-card','bud-stranded-card']]
  ]
};
```

Two things this restores: the verdict cards are adjacent, and **the spending goal sits directly
above Variable expenses again**, which is what its comment claims. Update the stale comment at
`index.html:305` so it describes where the card actually is, and the one at `index.html:311–314`
which says Record "used to be a dashed button inside the Variable expenses card" — that history is
still true, but the sentence about its position is not.

## Make the two modes impossible to desync

`bud-setup-card` went missing because the same list is maintained twice. Derive both modes from
**one** ordered list with a column flag, so a card cannot be added to mobile and forgotten on
desktop:

```js
// ONE ordered list. `col` says which desktop column the card lands in; mobile is simply this
// order, top to bottom. Adding a Budget card means adding ONE line here — the two-list version
// this replaced is how bud-setup-card ended up in the mobile plan and neither desktop column,
// which left it stranded above Income on every desktop render.
const BUD_CARDS=[
  {id:'bud-setup-card',    col:'left' },
  {id:'bud-record-card',   col:'right'},
  …
];
```

…then build `BUD_LAYOUT` from it, or have `budApplyLayout()` read `BUD_CARDS` directly. Either
shape is fine; what matters is that there is one list. If you build `BUD_LAYOUT` from it, keep the
constant name so nothing else that references it breaks.

## What must not change

- **`budApplyLayout()`'s no-op guard.** It compares the column's current children against the
  wanted list and returns early when they already match, because re-appending a node that is
  already in place still detaches and re-inserts it — which would drop focus out of a budget
  input mid-typing. Keep that check.
- **Collapse state is keyed by `data-bud-key`, not by index** (`js/app.js:12088`), so reordering
  cannot mis-apply it. Do not change any `data-bud-key` value.
- **`prev-weeks-section` and `bud-calc-card` carry `bud-span-2`**, which becomes
  `grid-column:1/-1` under `#view-budget #bud-col-left` in the **landscape-phone** block
  (`css/budget-home.css:1574`), where `#bud-col-left` is itself a grid holding every card. Both
  stay in the mobile list, so that rule keeps working. Verify on a landscape phone.
- Every card's own renderer, id and content is untouched. This fix moves nodes; it changes
  nothing about what they contain.

---

# FIX 5 — Home's weight card shows the last three readings

## What is happening

`buildWeightGoalCard()` (`js/app.js:16406`) ends with:

```js
(series.length>=2?'<div class="card-shape">'+sparkline(series,{target:hasGoal?target:null,height:40})+'</div>':'')
```

Francois wants the three most recent readings instead of that line — the pattern
`renderLogWeightCard()` already uses in Log › Today (`js/app.js:24877`, `.lg-weight-recent`).

## The change

Replace the `.card-shape` sparkline block with a three-cell split built from the **shared** card
vocabulary — `statsSplit(cells)` (`js/app.js:3434`), which emits `.card-split` with
`.card-split-div` hairlines, `.card-split-l` labels and `.card-split-v` values.

**Do not use `.lg-weight-recent` / `.lg-weight-reading` on Home.** Those belong to the Log hub's
vocabulary in `css/workout.css`, and Prompt 45 is retiring part of that namespace. Home uses the
shared components; that is what `.card-split` is for ("the two-or-three-up-with-divider pattern",
`CLAUDE.md`).

```js
// The three most recent readings, oldest → newest, so the eye reads left to right into today.
const last3=sorted.slice(-3);
const readings=last3.length
  ? statsSplit(last3.map(w=>[fmtDate(w.date), escText(String(w.weight))+'<span class="card-fig-u">kg</span>']))
  : '';
```

and swap `readings` in where the `.card-shape` block was.

### Rules for this card

- **Never pad to three.** With one or two readings, render one or two cells. With none, the
  existing `!sorted.length` early return already handles it ("Log your weight to start tracking").
  `CLAUDE.md`: delta/trend UI must not treat missing data as zero, and a row of `—` reads as
  broken rather than as "not enough history" — the same fault the Nutrition hero currently has.
- **Nothing is lost by dropping the sparkline.** The target line it drew is already stated as
  "10.5 kg to go" in `.card-cap` via `capParts`, and the On pace / Behind pace verdict is already
  a `.budget-snap-pill` in the header. Keep both exactly as they are.
- `series`, `recent` and `cutoff` become unused once the sparkline goes — **delete them**, and
  check whether `sparkline()` still has other callers before assuming it is dead (it is used
  elsewhere; do not remove the helper).
- The card keeps its `onclick="setView('stats');setStatsTab('body')"` and `cursor:pointer`. It
  opens something, so it stays in the press-lift list by virtue of being a `.card`.
- Home's desktop grid is `1fr 1fr` with `align-items:stretch`; the card's height changes slightly.
  That is expected. **Do not touch `.home-grid-cols`, `HOME_CAPPABLE` or any card-height rule** —
  `CLAUDE.md` records four separate reverted attempts at forcing uniform Home card heights.

---

## Guardrails for the whole prompt

- **No data, storage, calculation or Firebase changes.** Not one, in any of the five fixes.
- **Namespacing.** `CLAUDE.md` records three incidents where a generic class name silently
  restyled another feature — `.set-row`, `.empty` and `.wr-*`. Before introducing
  `.nw-chart-mix`, `.nw-chart-verdict` or `--radius-bar`, grep each across all nine CSS files,
  `index.html`, `js/app.js` and `js/nutrition.js`, including string-concatenation patterns, and
  report that they are free.
- **Accent discipline.** Fills, borders and progress bars that carry white text → `--accent`.
  Accent text or icons on `--bg` / `--card` → `--accent-text`. Hero fills → `--accent-hero` /
  `--accent-hero-2`, which are theme-independent, unlike `--accent-text`.
- **Budget palette.** Income green, expenses/variable red, committed the same red held back,
  saved the live accent, a neutral reference series, amber for warnings only. Income and expenses
  never follow the accent. Fix 1 changes a hero SURFACE, not a data series — do not let it drift
  into the chart colours.
- **Judgements go in `.tstat` chips, not in the colour of a number.** Fix 2 adds a chip to the
  chart card; the `fmtMoney(curNet)` figure beside it stays `var(--text)`.
- **Press-lift discipline.** `.hero-panel` and `.hp-cell` are deliberately absent from the
  press-lift list in `budget-home.css` and the `cursor:pointer` list in `base.css`. Fix 2 makes
  the hero a single cell; it still opens nothing, so it must not gain either.
- Bump `CACHE_NAME` to `daily-v299` exactly once. **Do not commit, push or deploy.**

## Documentation updates

`CLAUDE.md` must come out of this accurate:

- **Hero surface:** `.hero-surface` now reads `--accent-hero` / `--accent-hero-2`; every hero
  panel follows the accent; the no-per-cell-colour rule still stands and is why this is safe.
- **Delete the `.hm-card` / `.hero-metric-grid` half** of the hero section — it describes a
  component that no longer exists — while keeping the `.hero-panel` half and the note that
  `.hm-label` / `.hm-val` / `.hm-sub` / `.hm-chip` are shared with it.
- **Accounts:** net worth now leads the net-worth chart card; the hero panel is one cell, the debt
  payoff position. The `(assets − savers) − debts` definition is unchanged.
- **Add `--radius-bar`** to the design-token list.
- **Budget:** record the new card order and that `BUD_CARDS` is now the single source for both
  layout modes.
- **Home:** the weight card shows the last three readings via `statsSplit()`, not a sparkline.
- Fix the two known-stale facts: `js/nutrition.js` exists and is loaded at `index.html:1232`;
  `js/app.js` is 25,395 lines, not ~24,500.

---

## Verification checklist

Report each as pass, fail or not-tested with the reason.

**Fix 1 — hero accent**

1. Accounts, Budget → Month and Budget → Year heroes are the accent colour, not graphite.
2. Set each of the four accent presets, then a pale custom colour from the picker, then a
   near-black one: every hero stays legible and white labels never drop below readable in
   **both** light and dark mode.
3. Set an achromatic (grey) accent: the hero stays grey rather than being invented into a colour.
4. Turn on per-training-day colours and change day: the heroes follow, and no forced re-render was
   added to `applyDayColour()`.
5. Set a night weather scene as the accent: heroes readable, and no chart series disappeared.
6. Hard-reload with the service worker cleared so the pre-JS fallback paints: the panel is
   graphite for one frame, then becomes the accent. No flash of unreadable text.
7. The `.tstat` chips on a hero (Accounts "In the black" / "Not yet covered") are still white-on-
   translucent, not the card-background tints.

**Fix 1b — dead code**

8. Every hero panel still renders after the deletion — Accounts, Budget Month, Budget Year. If any
   figure, label, sub-line or chip vanished, `.hm-label` / `.hm-val` / `.hm-sub` / `.hm-chip` were
   deleted by mistake.
9. Console clean; no missing-class visual regressions anywhere else in Budget.

**Fix 2 — Accounts merge**

10. The Accounts page shows the net-worth figure **once**.
11. The chart card's figure, assets/debts line and chip describe the chart's own last data point,
    and do not disagree with the line drawn beneath them.
12. Stats → Finance's net-worth card gained the same sub-line and chip, and still shows its
    "Open account records →" link, which the Accounts copy still does not.
13. The under-two-common-dates branch still renders its minimal explanatory card unchanged.
14. The single-cell hero has no stray hairline on any edge. Then check Budget Month (3 cells) and
    Budget Year (6 cells, 3-up and 2-up) still have clean dividers.
15. The payoff cell still shows its headline, chip, `$X spendable − $Y debts` math line, the debt-
    kind line when there is a mix, and the savers note.
16. Flip an asset's "Savers account" toggle: the payoff figure and the savers note both update,
    and net worth does not change.
17. The hero and chart do not lift or show a pointer cursor on press.

**Fix 3 — spending rows**

18. Every row's bar starts at the same x, including "Money Transfer" and any longer label. Check
    at desktop width, at the middle breakpoint and at the narrowest phone.
19. A label longer than the fixed column truncates with an ellipsis and does not move its bar.
20. All bars in the app are square: the month-spend rows and composition strip, `.card-bar` on
    Home, the Weekly Review plan-vs-actual tracks, the hero progress bar and the cooking-mode
    progress bar.
21. Tapping a category row still opens its evidence, and the selected row's highlight still works.

**Fix 4 — Budget order**

22. Mobile order top to bottom: Record spending, Weekly result, Until next pay, Income, Savings,
    Fixed expenses, Upcoming charges, Spending goal, Variable expenses, Day by day, Previous
    weeks, Calculator.
23. Desktop: left column is Income → Day by day; right column starts with Record spending.
    **Nothing is stranded above Income.**
24. Force the setup card to render (a week with no income, setup not dismissed): it leads on both
    mobile and desktop.
25. Force the stranded-data card (delete a category that has saved amounts in a past week): it
    trails on both, and restoring the category makes it disappear.
26. Collapse three cards, switch weeks, resize across the desktop boundary, reload: every card's
    collapsed state is still on the right card.
27. **Type into a Budget input, then trigger a re-render** (change week, resize, log a purchase):
    focus is not dropped and no keystroke is lost.
28. Landscape phone: `prev-weeks-section` and `bud-calc-card` still span the full width.

**Fix 5 — Home weight**

29. The card shows three date/value cells with hairline dividers, oldest to newest, and no
    sparkline.
30. With exactly two readings it shows two cells; with one, one; with none, the "Log your weight
    to start tracking" empty state. **No dashes anywhere.**
31. "10.5 kg to go" and the On pace / Behind pace pill are both still present.
32. The card still opens Stats → Body on tap.
33. Home's two-column desktop grid is unchanged — two columns, `align-items:stretch`, no new gap
    between rows.

**Whole-prompt regression**

34. Every screen in light and dark, on a phone and a laptop. No blank panel, no horizontal body
    scroll, no console errors.
35. `wt_plans`, `wt_split`, `wt_sessions`, `kitchen_pantry`, `daily_review_plan` and every budget
    week are **byte-identical** before and after a full click-through. Diff them.
36. Export a full backup and import it into a clean profile: everything restores.
37. Hard-reload the installed PWA: the new `CACHE_NAME` took effect and no screen is serving stale
    CSS.

## Completion report

Report:

- What the grep for the dead `.hm-*` names turned up, and exactly which rules you deleted.
- Whether the single-cell hero panel needed any `.hp-grid` change, and if so how it still holds
  for 2, 3 and 6 columns.
- Whether the chart card's `curNet` and the live `accountsNetWorth()` differ in Francois's data,
  and by how much — if they do, that is expected, but say so.
- The final label-column widths in Fix 3 and the longest real category name you checked against.
- The shape you chose for `BUD_CARDS` and how `budApplyLayout()` reads it.
- Every file changed, and the `CACHE_NAME` bump.
- Verification results, separating what you tested from what needs Francois's signed-in account, a
  second device or a physical iPhone.
- Anything you deliberately did not do, and why.

None of these five is complete when the code compiles. Fix 1 is complete when a pale custom accent
produces a readable hero; Fix 2 when the net-worth figure appears once; Fix 3 when the longest
label cannot move a bar; Fix 4 when nothing is stranded above Income and no keystroke is lost on
re-render; Fix 5 when two readings render two cells and no dash is drawn.
