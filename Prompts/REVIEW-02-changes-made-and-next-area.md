# CARD REVIEW — WHAT WAS BUILT, AND WHAT TO LOOK AT NEXT
### Round 2 brief. Read the "what actually happened" section before re-reviewing.

**MODEL: OPUS** — judgement task.

---

## PART A — WHAT THIS IS

Two of you reviewed the Home cards of Daily (personal lifestyle PWA: workouts, kitchen,
budget, habits). Both reports were acted on. This document reports back:

1. What was implemented, and what the code review found when it checked your assumptions.
2. Where your recommendations were **wrong on the facts**, so round 2 doesn't repeat them.
3. What's still open.
4. The next area to review — and the specific questions for it.

17 commits, ~1,280 lines added / ~200 removed across `js/app.js` and six CSS files.
Home went from 11 widgets to 14.

**Everything below was verified in a browser against the real app** — computed styles,
measured contrast ratios, seeded data for each state — not asserted from reading code.

---

## PART B — WHERE THE REVIEWS WERE FACTUALLY WRONG

Not point-scoring. These are the specific inference failures to avoid in round 2, because
both reports made the same *kind* of mistake: reasoning about behaviour from a screenshot or
from one CSS rule, without checking what actually wins the cascade.

### B1. "Bills Due" cannot be built. Both of you ranked it top-3.

Both justified it with "the billing due dates already exist." They don't.
`dueDate` appears 18 times in `js/app.js` and **every one is on a debt account**
(`type==='debt' && tracksStatement`). Fixed categories and subscriptions carry
`{amount, cycle, site}` — a recurrence (weekly/monthly/yearly) and a price, but **no anchor
date**. The app can know "Netflix bills monthly, $18". It cannot know it bills on the 14th.

Building it needs a new `billingDay` field, edit UI on every fixed category, and a migration.
That is new tracking, not surfacing existing data. **Not built.** Still the best idea in
either report *if* the owner wants to add the field — that's a data-model decision, not a
design one.

*(Partly the brief's fault — it claimed those due dates existed.)*

### B2. The calorie card was never "a hero in light, neutral in dark".

Both reported this and both recommended committing to one treatment. Measured: it is
**neutral in both**. `.hero-card`'s accent tint (`0,1,0`) is outranked by
`[data-theme="light"] .card.hero-card` and `[data-theme="dark"] .card.hero-card` (`0,3,0`),
so it had not rendered in either theme since those overrides were added. Dead CSS, now deleted.

### B3. `getPR()` cannot back a PR card.

Both assumed reuse. It returns a **bare maximum number** — no reps, no date, no previous best
— and it rescans every session, exercise and set on each call, so asking it for a card's worth
of exercises is O(sessions × exercises × sets) *per exercise, per render*. It also counts
warmup sets, which is a latent bug there.

Replaced with `computePRHistory()`: one pass in date order, recording a PR event whenever a
**working** set beats the running best. Verified a seeded 500 kg warmup is ignored while the
100 kg working set is recorded.

### B4. There is no "invested" account type.

One report proposed a Cash / Invested / Debt split. Zero occurrences of "invested" in the
codebase. There **is** a `saver` flag on assets (ringfenced money, deliberately excluded from
the debt-payoff calculation), so the real three-way split is **Spendable / Savers / Debts** —
which is what was built.

### B5. The weight goal has a target DATE, which both of you missed.

Both used `weightGoal.target`. The stored shape is `{target, date}`. That turns the card from
a subtraction ("3.2 kg to go") into a pace judgement against the straight line from start to
deadline. Built that way. It was already in localStorage.

### B6. Neither of you caught that Week in Review was three-quarters duplicate.

One report flagged the habits overlap and stopped. Verified line by line, **all four** cells
of its 2×2 restated another card: `workoutDays` (line 8525) was character-for-character
identical to `mSessions` (line 9332) in the streak card; Budget repeated the budget card;
Cals today repeated the calorie ring; and Weight Δ — the one unique cell — is now covered
properly by the new Weight card.

This was the single biggest reason Home felt busy without being informative, and it took
listing every card's contents side by side to see. **Round 2 should do that exercise for
whatever screen it reviews.**

---

## PART C — WHAT WAS BUILT

### Foundation (done first, deliberately)
Roughly half this app's typography is inline in JS template strings; every card redesign
rewrites one. Doing redesigns before a class vocabulary existed would have hardcoded the new
values inline. So: a shared card anatomy — `.card-hd` / `.card-fig` / `.card-shape` /
`.card-cap` / `.card-bar` (with pace marker) / `.card-split` — plus `cardHeader()`,
`cardIcon()` with a 9-icon line set, and `sparkline()` (inline SVG, no Chart.js).

Two near-identical header-label rules merged into one. `--text-secondary` was a second token
holding the *same value* as `--text-2` in both themes; it's now an alias.

### Accessibility fix neither review raised
Every accent value in the app is tuned to **carry white text** (≥4.5:1 with `#fff` on top),
but ~54 call sites used the accent **as text on the background** — the opposite test. Against
the dark `--bg`, night weather scenes measured **1.7:1**. Added `--accent-text`, derived at
runtime (hue and saturation kept, lightness moved until it clears 5.0:1 against the current
theme's background). Verified live at the worst case: **1.72 → 5.07**.

The same bug recurred later with the effort-rating chips (coloured text on a tint of its own
colour, so the ratio never improves by itself) — "Moderate" measured **1.76:1** in light mode.
Fixed with per-theme values; all chips now clear 5.3:1 in both themes.

### Redesigns
| Card | Change |
|---|---|
| **Budget** | Off the full accent gradient (it was identical to the session hero, so the top of Home read as two slabs) onto **semantic** colour. Bar now tracks variable spend against the weekly `var_goal` with a **pace marker** — total spend can't be paced, since a fixed cost lands in one lump. |
| **Net worth** | Was the only card with no CSS identity (pure inline styles). Rebuilt; **net worth is now the primary figure**, not total assets — $2,991 assets against $2,812 debts is a $179 position, and leading with the flattering number said the wrong thing. Spendable/Savers/Debts split. Statement alert moved above the collapsed account list. |
| **Week in Review** | Now **week-over-week deltas** (Workouts / Spending / Avg calories). Chips read "no last week" rather than treating absence as zero. The calorie chip reads the actual TDEE goal — the same +300 kcal is green bulking, red cutting, **grey maintaining**. |
| **Calories** | 7-day trend strip folded in (today is the only coloured bar; dashed target line). Hides itself under 3 logged days rather than drawing a chart of gaps. |
| **Money tiles** | Was a bare grid of mini-cards with no container. Now one card with cells. |
| **Recent workout** | Was one session with every set behind tap-to-expand. Now the **last four sessions with date, split, and how each one felt** — the effort rating was recorded on every session and displayed nowhere. |
| **Weather** | Given the border it was missing (the only Home card without one). Scene system untouched. |

### New cards
**Weight & Goal** (paced against the target date), **Personal Records**
(`computePRHistory`, NEW pill within 14 days), **Kitchen Snapshot** (cook-again from
`favourite` + `lastCooked`, shopping/pantry cells omitted when empty).

### Layout
Desktop **hover states** — the app had 7 `:hover` rules total and none on a card, while
`cursor:pointer` promised every card was interactive. Home grid is now
`repeat(auto-fit,minmax(440px,1fr))` — column count derived from width (2 on a laptop, 4 at
2560). One width cap (2200px) for every view.

**`align-items:start`, not stretch** — stretching padded short cards out to match their
tallest row partner, which is where dead space inside cards came from and why card height
stopped meaning anything.

### Emoji
Removed from card **chrome** (they ignore `currentColor`, so they can't follow the theme or
the accent, and render differently per OS). User-typed emoji — note titles, recipe names, the
per-subscription emoji field — untouched. Note `catDisplayName()` exists specifically to strip
a legacy emoji prefix from stored category names, so a bulk find-and-replace would corrupt
data.

---

## PART D — STILL OPEN

- **Bills Due** — blocked on the `billingDay` data-model decision (B1).
- **Credit limit field** on debt accounts, which would enable a utilisation figure. Not built.
- **Account categories** — e.g. separating "money I owe a person" from a credit card, and the
  inverse (money owed *to* me) which has no representation at all today.
- **Bottom nav** — the owner wants Kitchen to replace Stats on mobile, Stats to the hamburger.
  Structural: Kitchen is currently an overlay view, not one of the four `.swipe-panel` tabs.
- **Home card sizing** — the owner's standing complaint is that some cards are still **larger
  than their content justifies**. `align-items:start` fixed the padding-to-match problem; what
  remains is per-card.

---

## PART E — WHAT TO REVIEW NEXT: THE KITCHEN TAB

Home has now had two rounds and is the most-worked surface in the app. **Kitchen is the right
next target**, for three reasons: the owner has said it has overtaken Stats in day-to-day
importance (he wants it in the mobile bottom nav), it has never had a design pass, and it is
the most *functionally* complex area in the app — so there is function to review, not just
aesthetics.

### What Kitchen contains
- **Recipe Book** — 9 preloaded + custom. Category pills (breakfast/lunch/dinner/dessert),
  search, favourites, tags, servings, ingredients with units, method steps with per-step
  timers, macros. Desktop is a **master/detail split** (`kit-cols`: list column + sticky
  detail pane); mobile pushes a full-screen detail overlay.
- **Shopping List** — built from selected recipes, aggregated by ingredient and grouped by
  category, plus manual items and pantry needs, with tick-off state.
- **Spice & Pantry Tracker** — stock with in-stock / running-low / out flags, seeded
  categories plus custom items.
- **Cooking Mode** — step-by-step with timers.

### Storage (all real, all synced)
`kitchen_recipes` (with `favourite`, `lastCooked`, `createdAt`), `kitchen_shopping_selected`,
`kitchen_shopping_checked`, `kitchen_shopping_manual`, `kitchen_pantry`.

### Specific questions for round 2

1. **Is the master/detail desktop split right?** It's 40% list / 60% sticky detail. With the
   width cap now at 2200px that's an 854px list beside a 1262px detail pane. Is a two-pane
   layout even correct for a recipe book, or should the list be a card grid that opens a
   recipe full-width?
2. **Cooking mode is the highest-stakes screen in the app** — it's used with wet hands, at
   arm's length, while something is on the heat. Nobody has ever reviewed it. What does a
   screen designed for *that* posture need that this one probably lacks?
3. **The three sub-areas barely acknowledge each other.** Recipes, Shopping and Pantry are
   separate tabs within Kitchen. Should they be? What would a single Kitchen screen look like?
4. **Recipe tiles use emoji as their primary visual** (`KIT_CAT_EMOJI`, plus a per-recipe
   emoji field). Unlike chrome emoji, these are user content and arguably legitimate. Are they
   working, or should recipes have images?
5. **What in Kitchen is a function problem rather than a design problem?** Missing steps,
   awkward flows, things that need two taps that should need one.

### Constraints (same as before, plus)
- Vanilla JS, no framework, no build step. Phone is the primary target.
- `--accent` is runtime-variable (weather-driven); never design around a specific hue, and
  never pair two accent-dependent colours.
- Both themes must work; dark is the one actually used.
- **Check the cascade before claiming what a rule does** — three findings in round 1 died on
  this (see Part B).
- **List every element's contents side by side before proposing additions** — that's how the
  Week in Review duplication was found, and it's the single most valuable thing round 1 missed.

### Output wanted
Same shape as round 1: ranked redesigns, ranked new-feature proposals with the data they'd
need, an explicit answer to each of the five questions above, and a "don't bother" list.
