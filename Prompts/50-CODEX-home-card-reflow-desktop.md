# Prompt 50 — One card system, two compositions: make Home's cards work at desktop width

## Objective

Daily's Home cards are built as a **vertical stack of full-width rows**. That is the phone
idiom, and it is currently the *only* idiom the card vocabulary owns. Widening the window does
not change any card's internal composition — it just makes every row longer.

Give the shared card vocabulary a **reflow contract**: a small set of opt-in classes that let a
card compose itself as a stack on a phone and as two columns when it actually has the width.
Same markup, same data, same order — one card system, two compositions.

This is a presentation change only. No data, calculation, storage key, sync registration,
migration or Firebase path may change.

## Success criteria

1. On a phone, Home is **pixel-identical** to what ships today.
2. At 1440px and 1920px, no Home card is a mostly-empty rectangle with a line of text in its
   top-left corner.
3. No single-line control renders hundreds of pixels wide.
4. The shared `.card-*` vocabulary gains reflow behaviour **only for cards that opt in**.
   Kitchen, Stats, Budget and every other screen reading those classes are untouched.
5. Card heights fall enough that the void inside short cards shrinks — without touching the
   grid, `align-items:stretch`, or any of the four reverted height schemes.

## Repository context and required reading

You are working in **Daily**, Francois Peters's personal lifestyle PWA.

Before changing anything:

1. Read `AGENTS.md` completely. Its sync, migration, data-preservation and service-worker rules
   are mandatory.
2. Read the **Design tokens**, **Home layout**, and **shared card vocabulary** sections of
   `CLAUDE.md`, plus the Home entries under "Known history worth knowing".
3. Read `Prompts/44-CODEX-independent-mobile-desktop-layouts.md`. This prompt is a direct
   continuation of its principle: *the phone must not be a narrow desktop screen, and desktop
   must not be a stretched one-column phone screen.* Prompt 44 built the independent layout
   **profiles**; this prompt gives the cards inside them independent **compositions**.
4. Re-grep the current `index.html`, all CSS files and `js/app.js`. Both documentation files
   have been stale before; current code wins.
5. Inspect `git status` and preserve every unrelated edit or untracked file. Never reset or
   discard the user's work.

Facts that matter here:

- Vanilla HTML/CSS/JS; no build step, bundler, modules or package manager.
- `index.html` loads the CSS cascade in a fixed order. **Do not reorder those links.**
- The shared card vocabulary (`.card-hd`, `.card-fig`, `.card-split`, `.card-cap`, `.card-bar`)
  lives in `css/kitchen-extras.css`, which loads last and wins ties.
- Home's desktop grid lives in `css/budget-home.css` inside `@media (min-width:1024px)` (block
  begins ~line 859; the grid rule is ~line 946).
- The landscape-phone Home grid is a second copy inside
  `@media (orientation:landscape) and (max-width:1023px) and (max-height:600px)` (~line 1492).
- GitHub Pages serves `main` directly. **Do not commit, push or deploy.** Leave a verified
  working tree.

## The measured problem

Measured against the current working tree, dark theme, default install:

| Viewport | Home grid | Column width |
|---|---|---|
| 375px phone | — (single column) | ~343px |
| **1024px** (desktop grid starts) | 700px | **343px** |
| 1180px | 842px | ~414px |
| 1440px | 1101px | **544px** |
| 1920px | 1581px | **784px** |
| 2560px (2200px cap) | 2136px | ~1061px |

The shared vocabulary has **no responsive step at all**: `.card-fig` is 32px and
`.card-split-v` is 17px at 343px and at 784px alike. The only Home card with any
desktop-specific internals is `weather`. The calorie card's desktop up-sizing was written and
then deliberately removed (see the comment at `css/budget-home.css` ~line 1000).

Consequences measured at 1920px:

- `.txn-quick` ("+ Add expense") renders **742px wide**. It is a one-line button.
- `.jrn-composer` ("Write about today →") renders **750px wide**. It is a one-line placeholder.
- At 1440px the Weekly budget card is **388px tall** — not because it holds 388px of content,
  but because Habits sits beside it and `align-items:stretch` hands it the difference as void.

## Locked design decisions

These are settled. Do not redesign them, and do not "improve" past them.

1. **The reflow threshold is the CARD's own width, not the viewport.** Use CSS container
   queries. At 1024px the desktop grid's columns are 343px — *exactly phone width* — so any
   viewport-keyed breakpoint would either fire when the card is still phone-sized or need a
   magic number kept in sync with the sidebar width, the section padding and the grid gap.
   A container query asks the only question that matters: *does this card have the room?*
   It also answers correctly and for free for `.home-card-wide` (1101px), for the
   landscape-phone grid (~340px columns — no reflow, correctly), and for any future column
   count.
   `:has()` is already load-bearing in this codebase (the Journal desktop grid is gated on
   `#journal-root:has(.jrn-rail)`), so container queries sit inside the baseline the app
   already requires. **Where `@container` is unsupported the card simply stays stacked, which
   is today's behaviour** — the same "degrade to the mobile layout" property the Journal grid
   was built for. Do not add a viewport-query fallback; the degradation is the fallback.
2. **One threshold: 460px.** Below it a card composes exactly as it does today. This puts
   1024px and 1180px desktop, and landscape phone, on the stacked layout, and 1440px+ on the
   reflowed one. Three-column lists are **out of scope** — do not add a second threshold.
3. **Every reflow class is OPT-IN.** `.card-hd`, `.card-fig`, `.card-split`, `.card-cap` and
   `.card-bar` are read by Kitchen, Stats, Budget and Accounts. You may **not** change their
   existing declarations. Add new classes and apply them from the Home builders only.
   `CLAUDE.md` is explicit that layout guidance "is not permission for an automatic app-wide
   refactor". This prompt is scoped to Home.
4. **Do not touch the grid.** `grid-template-columns:1fr 1fr`, `gap:12px 14px` and
   `align-items:stretch` all stay exactly as they are. Four attempts to fix internal card space
   from the grid side (a min-height floor, two `grid-auto-rows` quantisation schemes, and
   masonry with measured spans) have all been reverted and are documented in `CLAUDE.md` as
   worse than what they replaced. **This prompt fixes it from the card side instead**: a card
   that composes into two columns is shorter, so the height difference its neighbour inherits
   shrinks on its own. Do not re-attempt any grid-side scheme.
5. **No type scale.** Do not up-size figures, rings or labels for desktop. That was tried on
   the calorie card and correctly removed. The problem is composition, not size.
6. **No card gains or loses information.** No figure is added, removed, reworded or recoloured.
   Every existing chip, pill, pace marker, empty state, `onclick`, `data-` attribute and element
   `id` survives unchanged.

## 1. Add the reflow classes

In `css/kitchen-extras.css`, beside the existing shared card vocabulary (search
`.card-hd{display:flex`), add a clearly commented block.

Establish the container on the Home card wrapper:

```css
/* ── Card reflow ──────────────────────────────────────────────────
   A Home card is a vertical stack of full-width rows, which is right on a phone and wrong at
   544px+. These classes let a card compose itself in two columns once it actually has the
   width. The query is on the CARD, not the viewport, because the desktop grid's columns are
   343px at 1024px — phone width — and only pass ~414px at 1180px. Asking the card removes the
   magic number entirely and answers correctly for full-width cards and landscape phone too.
   Where @container is unsupported every card stays stacked, i.e. exactly today's layout. */
#view-home .home-card{container-type:inline-size}
```

Then the three shapes. Each must be **inert below the threshold**, so that the phone renders
byte-identical output:

- **`.card-cols`** — a body wrapper. A plain block below 460px (children stack exactly as they
  do now); at ≥460px a two-column grid, `grid-template-columns:auto minmax(0,1fr)`, with the
  figure block on the left and the meter/split/caption on the right, vertically centred, with a
  gap consistent with the existing card rhythm.
- **`.card-rows-2col`** — applied to an existing rows container. A plain block below 460px; at
  ≥460px `display:grid;grid-template-columns:1fr 1fr` with a column gap and `min-width:0` on the
  children so a long label truncates rather than widening its column. Rows keep their existing
  classes, dividers and `justify-content:space-between` — at ~250px per cell that spacing stops
  being a canyon and starts being a row again.
- **`.card-act-inline`** — applied to a full-width single-line control. No effect below 460px;
  at ≥460px caps its width (`max-width` around 240px) and aligns it to the start of the card,
  so a one-line button stops being 742px of button.

Pick the exact gap, max-width and alignment values by eye against the existing card rhythm and
state the final numbers in the completion report.

## 2. Apply the shapes, card by card

Add the wrapper element or class in `js/app.js` in each named builder. Do not restructure any
card beyond what is listed. Where a wrapper is needed, it goes **around the existing body
elements only** — never around the header, which must keep spanning the card's full width so
that headers still line up across a row.

| Card | Builder | Shape | Notes |
|---|---|---|---|
| Weekly budget | `budgetSnapshot` in `renderHome` | `.card-cols` + `.card-act-inline` on `.txn-quick` | Figure left; `.card-bar` (with its **pace marker**) and `.card-cap` right. The pill stays in the header. |
| Weight & goal | `buildWeightGoalCard` | `.card-cols` | Figure left; the `statsSplit()` three readings right. Keep the On pace / Behind pace chip in the header. |
| Accounts | `balanceRow` in `renderHome` | `.card-cols` | Net worth left; the 2- or 3-cell `.card-split` right. Statement alert and the accounts expander stay full width **below** the wrapper. |
| Streak & this week | `statsSplit` in `renderHome` | already 2-up | Verify only — `.stats-split-card` is horizontal already. **If a separate prompt has hidden this card by default, skip it.** |
| Daily habits | `buildTodayHabitsCard` | `.card-rows-2col` on `#habits-today-list` | The single biggest height win. The week strip and stats line stay full width below. |
| Personal records | `buildPRCard` | `.card-rows-2col` around the `.pr-row`s | Needs a wrapper; max 3 rows, so it becomes 2 + 1. |
| Recent sessions | `buildHomeRecentCard` | `.card-rows-2col` around the `.rw-row`s | Verify `applyHomeCardCaps` / `HOME_CAPPABLE` still measures correctly against the new height. |
| Week in review | `buildWeekSummaryCard` | `.card-rows-2col` around the `.wr-row`s | 3 rows → 2 + 1. **Every `.wr-chip` must survive**, including `wr-chip-none`. |
| Finance check-in | `buildFinanceCheckinCard` | `.card-rows-2col` around the `.fin-line`s + `.card-act-inline` on `.fin-act` | |
| Journal | `buildHomeNotesCard` | `.card-act-inline` on `.jrn-composer` | Loop rows stay one column — they are a short due-list, not a grid. |
| Kitchen | `buildKitchenCard` | none | `.card-split` already carries the width. Verify only. |
| Overview / calories | `overviewCard` in `renderHome` | none | Ring + meal totals are already horizontal. Verify only, and **do not up-size the ring**. |
| Session hero, Weather | — | none | Both already have wide handling. Do not touch. |

Also apply `.card-act-inline` to `.home-card-more` if it renders as a full-bleed bar at desktop
width, keeping its absolute positioning intact.

## 3. Watch these three interactions

1. **The body-centring rule.** `css/budget-home.css` has
   `#view-home .home-grid-cols > .home-card > * > *:nth-child(2):last-child{margin-top:auto;margin-bottom:auto}`,
   which vertically centres a card body that is a single block under the header. Adding a
   `.card-cols` wrapper makes **more** cards match that selector. Centring a reflowed body in a
   stretched card is desirable — but confirm it by eye per card and report any card where it
   reads worse than top-aligned.
2. **Card caps.** `applyHomeCardCaps()` and `HOME_CAPPABLE` (currently `['notes']`) measure
   `scrollHeight` against a flat 280px. Two-column lists change those heights. Confirm the
   "Show all" toggle still appears only when content genuinely overflows.
3. **Drag-to-reorder.** `data-card-id` stays on `.home-card`, so `saveHomeOrder()` reads DOM
   order exactly as before. Confirm edit mode, reordering and the Settings → Home Layout
   preview all still work, and that `container-type:inline-size` on `.home-card` does not
   interfere with the drag transform or the hover lift.

## 4. Keep the phone untouched

Every class added must be **inert below its threshold**. After the change, a 375px viewport must
produce the same rendered result as before — same order, same heights, same spacing, same
scroll length. Verify this by direct comparison, not by assumption. If any shape cannot be made
inert on a phone, leave that card stacked and say so in the completion report.

The landscape-phone grid gives ~340px columns and must therefore reflow **nothing**. Confirm
this falls out of the 460px threshold rather than needing a rule of its own.

## 5. Documentation and cache

Add a **Card reflow** entry to `CLAUDE.md` under the shared card vocabulary section recording:

- that a Home card composes as a stack below 460px of its own width and in two columns above it;
- that the query is on the card, not the viewport, and **why** (1024px columns are 343px);
- that unsupported `@container` degrades to the stacked layout by design;
- the three class names and which cards use which;
- an explicit note that the classes are **opt-in and Home-scoped**, and that they are not
  permission to reflow Kitchen, Stats, Budget or Accounts;
- an explicit note that this is the **card-side** fix for the internal-space problem that four
  grid-side schemes failed to solve, and that those schemes must still not be re-attempted.

Correct the stale comment at `css/budget-home.css` ~line 1000, which claims *"Cards no longer
stretch — every card sizes to its own content now"*. `align-items:stretch` is set 54 lines above
it at ~line 946 and cards do stretch. Fix the comment to describe what the CSS actually does.

Because cached JavaScript and CSS change, increment `CACHE_NAME` in `service-worker.js` exactly
once — it is `daily-v308` at the time of writing; confirm the current value before changing it —
and update the matching version comment, following `AGENTS.md`.

## Verification checklist

Serve the repository locally and verify all of the following before reporting completion.

**Boot and safety**

1. The app boots with no JavaScript errors, no CSS parse errors and no missing local assets.
2. A fresh reload leaves the browser console clean.
3. No localStorage key, Firebase path, sync registration, migration or backup payload changed.
4. `exportAllData()` output is unchanged.

**Phone — the layout that must not move**

5. At 375px, Home renders in the same order with the same cards as before the change.
6. At 375px, every card's height and internal spacing match the pre-change build.
7. At 375px, the Weekly budget bar, its pace marker and "+ Add expense" are unchanged.
8. At 375px, Daily habits renders as one column of checkboxes exactly as before.
9. At 375px, Personal records, Recent sessions, Week in review and Finance check-in each render
   one row per line.
10. Total Home scroll length at 375px is unchanged.
11. Landscape phone reflows nothing and shows two columns of stacked cards as before.

**Desktop — the layout being fixed**

12. At 1024px, columns are ~343px and **no card reflows** — it is phone width and must stay
    stacked.
13. At 1180px, columns are ~414px and no card reflows.
14. At 1440px, cards reflow: figures sit beside their bars and splits, and list cards render
    two columns of rows.
15. At 1920px, the same reflow holds and no card is a mostly-empty rectangle.
16. At 2560px the 2200px cap still applies and reflowed cards remain readable, not stretched.
17. "+ Add expense", "Open Budget →" and "Write about today →" are all sensibly sized buttons at
    1440px and 1920px, not full-bleed bars.
18. Daily habits is materially shorter at 1440px than before, and the Weekly budget card beside
    it holds visibly less void.
19. No card is clipped, overlapping or horizontally scrolling at any tested width.
20. The page body never scrolls horizontally at any tested width.

**Content preservation**

21. Weekly budget still shows its status pill, its bar fill colour and its **pace marker**.
22. Weight still shows its On pace / Behind pace chip and its three readings, oldest to newest,
    and still never pads to three.
23. Week in review still shows every delta chip, including "no last week" and "same".
24. Accounts still shows net worth once, the correct 2- or 3-cell split, the amber statement
    alert and the working accounts expander.
25. Kitchen still shows its shopping and pantry cells with their existing colours.
26. Every card's empty state still renders correctly — check with a fresh no-data profile.
27. Every card's `onclick` destination still works, at both phone and desktop widths.

**Interactions**

28. Habit checkboxes toggle correctly in the two-column layout and still write to today.
29. "Show all" on capped cards appears only on genuine overflow and expands correctly.
30. Home edit mode, drag-to-reorder and the saved order all still work at desktop width.
31. Settings → Home Layout still previews, toggles, reorders and sets full-width per card.
32. Setting a card to full width still spans both columns, and that card reflows using its own
    wider measurement.
33. Hiding and re-showing a card behaves as before.
34. The hover lift on `#view-home .home-card` still works and is not broken by
    `container-type`.

**Scope**

35. Kitchen, Stats, Budget, Accounts, Settings, Journal, Log and Daily AI are visually
    unchanged at every tested width.
36. `.card-hd`, `.card-fig`, `.card-split`, `.card-cap` and `.card-bar` have no changed
    declarations.
37. Both light and dark theme are correct at phone and desktop widths.
38. `CLAUDE.md` records the reflow contract accurately.
39. The stale "cards no longer stretch" comment in `css/budget-home.css` is corrected.
40. `service-worker.js` has exactly one cache-version increment from the value found at task
    start, and its adjacent comment matches.
41. No temporary breakpoint switcher, debug outline, console logging or unused experimental CSS
    remains.

## Completion report

At the end, report:

1. Every file changed.
2. The final container threshold and the exact gap / max-width / alignment values chosen.
3. Measured column widths and, for each reflowed card, its height **before and after** at
   1440px and 1920px.
4. Confirmation that the 375px render is unchanged, and how that was verified.
5. Which cards reflow, which were deliberately left stacked, and why.
6. Any card where body-centring read worse than top-alignment.
7. How `applyHomeCardCaps` and drag-to-reorder were confirmed still correct.
8. The service-worker cache change.
9. Which verification items were completed and anything still needing a physical-device check.
10. Explicit confirmation that no data, calculation, storage, sync, Firebase or non-Home screen
    changed.
