# CARD AESTHETICS REVIEW — Daily
### For suggestions, not implementation

**MODEL: OPUS** — this is a design/judgement task, not a mechanical edit.

---

## WHAT I WANT

An aesthetics review of **the cards** in my personal lifestyle app, and specifically:

1. **Redesigns of existing Home cards** — which ones look wrong, and what they should look like.
2. **New Home cards worth adding** — ideas I haven't thought of, built from data the app
   already has.

**Cards only.** Not navigation, not typography systems, not the colour architecture, not
information architecture. If you find something broken outside the cards, note it in one line
at the end and move on.

**Do not write code.** I want proposals I can decide on. Describe each idea well enough that a
separate implementation session could build it: what's on the card, how it's laid out, what it
looks like in both themes, and what it should do when the data is empty.

---

## HOW TO NOT WASTE YOUR TIME

A previous reviewer looked at one desktop screenshot and got about half their findings wrong,
because they inferred the code from the picture. Everything below is **measured from the actual
repo**, not remembered. Trust it over what a screenshot seems to say.

Where they were wrong, it was almost always the same mistake: proposing something that had
already been tried and reverted, or that a setting already covers. The "SETTLED — DON'T
RE-PROPOSE" section exists so you can skip that whole category.

---

## THE APP IN ONE PARAGRAPH

Personal web app for one user (me). Vanilla HTML/CSS/JS, no framework, no build step. Four
paged tabs (Home, Budget, Log, Stats) plus overlay views (Kitchen, Accounts, Plans, Notes,
Exercise Library, Settings). **Primary target is a bookmarked PWA on a phone**; desktop is a
real but secondary use. Dark mode is the default and what I actually use — a warm near-black
`#080808` with cards as a translucent white gradient ("glass"), deliberately never a pure-black
card surface. Light mode exists and must keep working.

The accent colour is **not fixed**. It is whatever Settings → Appearance resolves to: one of
four presets, a free colour picker, a per-training-day colour, or — the mode I actually run —
a colour derived from the live weather scene, which shifts through the day. **Any card design
that depends on the accent being a particular hue, or on two specific colours sitting well
together, will break.** Assume the accent can be anything from a mid grey to a deep indigo to a
bright blue.

---

## THE HOME CARD INVENTORY

Home is a reorderable, hideable widget list. Eleven widgets exist. This is every one of them,
with the surface treatment it actually uses:

| # | id | Label | Surface treatment | What's on it |
|---|----|----|----|----|
| 1 | `session` | Today's Session | **Solid accent gradient** (`.hero-workout-card`, 90%→55%→35%, 24px radius, 22px padding) | Uppercase label + date, white circular play button, training-day name at 40px, exercise count, "N of M done" + %, progress bar |
| 2 | `weather` | Weather | **Scene gradient** (`.home-weather-card`, one of 16 hand-built skies, no border, animated fx layer) | City, weekday, date · weather icon, temperature, condition, high/low + feels-like |
| 3 | `streak` | Streak & This Week | Neutral `.card` + `.stats-split-card` (a 2-up split with a divider) | Streak in days \| sessions this week of goal, with a segment bar |
| 4 | `calories` | Overview & Greeting | **Accent tint** in light (12%→3%); **neutral white-gradient in dark** (`.hero-card`) | Calorie ring (SVG), remaining kcal, per-meal totals |
| 5 | `review` | Week in Review | **Extra-glassy** (`.weekly-review-card`, white gradient .20→.06, radial top sheen, deeper shadow) | 2×2 stat grid (Workouts, Budget, Cals today, Weight Δ), habits week stats, 7-day habit grid |
| 6 | `habits` | Today's Habits | Neutral `.card` | Checkbox rows, one per habit |
| 7 | `budget` | Weekly Budget | **Solid accent gradient** (`.budget-snapshot-card`, same gradient as #1, plus a 40px accent glow shadow) | "WEEKLY BUDGET" + status pill, one figure, "left of $X", progress bar |
| 8 | `balance` | Net Worth & Accounts | Neutral, **styled entirely inline in JS** (no CSS class of its own) | "💰 Total Assets" + "Manage Accounts →", figure at 30px, net worth/debts line, expandable account list, amber credit-card alert row |
| 9 | `tiles` | Money Quick Tiles | **Not a card** — a 2-col grid of small neutral `.card`s | Emoji, figure, uppercase caption. "Saved this week", "Last week's pay", plus pay-day tiles |
| 10 | `notes` | Notes | Neutral `.card` | Coloured dot + note title rows, "Priority" tag on pinned ones |
| 11 | `recent` | Recent Workout | Neutral `.card` | Last session summary (hidden until a session exists) |

Default order: `session, weather, streak, calories, review, habits, budget, balance, tiles,
notes, recent`. All of it is user-reorderable by drag, and every card except `calories` can be
hidden.

### Measured facts about these cards

- **Six different surface treatments across eleven cards.** Solid accent (×2), scene gradient,
  accent tint, extra-glass, plain neutral, plus one that is only inline styles. There is no
  shared base — each grew per feature.
- **Two cards use the accent at full strength** (`session`, `budget`) and they carry white text.
- **`.hero-card` is neutral in dark mode.** Its accent tint only exists in light. So the
  "calorie hero" reads as a hero on light and as an ordinary card on dark.
- **Three competing implementations of the same card header label:**
  - `.card-label` — 11px / 700 / `.06em` / `--text-2`
  - `.sec-label` — 11px / 600 / `0.5px` / `--text-secondary`
  - inline `font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px` —
    **16 occurrences** in `js/app.js`

  `--text-2` and `--text-secondary` are *the same value* in both themes. Two tokens, one colour.
- **Radius is mostly not tokenised.** Four radius tokens exist (`--radius-card` 22, `--radius-hero`
  24, `--radius-pill` 14, `--radius` 16) and are used 24 times combined. There are ~200 hardcoded
  `border-radius` values across 12 distinct sizes, the most common being 8px (55×), 999px (27×),
  10px (22×), 12px (20×).
- **Card padding varies per card** — 14px, 16px, 18px, 20px, 22px, and `padding:0` with inner
  padding on the ones that need edge-to-edge content.
- Emoji appear in several card headers (💰 Total Assets, 📋 Weekly review, 🗓️ Week in review)
  a few hundred pixels from a clean line-icon sidebar.

---

## DATA THE APP ALREADY HAS THAT IS *NOT* ON HOME

This is the most useful section for new-card ideas. Every item below is **already stored and
already synced** — a card built on it needs no new tracking, no new input, no new permissions.
Suggestions that need data I don't collect are much less interesting to me.

**Training**
- `getPR(exerciseName)` — personal records per exercise, swap-aware. Home has no PR card at all.
- `wt_sessions` / `wt_setdata` — full session and set history (weight, reps, warmup flags).
- `wt_swaps` — which exercises I've substituted.
- Session effort ratings (Easy / Moderate / Hard / Brutal) and optional hours-worked.
- 8-week consistency data (Stats renders a grid from it; Home doesn't).

**Body**
- `daily_weight_log` — full body-weight history.
- `daily_weight_goal` — **a weight goal exists**, and nothing on Home shows progress toward it.

**Nutrition**
- `daily_cal_history` — *historical* daily calorie totals. Home only ever shows **today**. A
  week/month calorie trend is available and unused.
- `daily_saved_foods` — frequently logged foods.

**Kitchen — completely absent from Home**
There is no Kitchen widget at all, despite Kitchen being a full tab with:
- `kitchen_recipes` — recipes with `favourite`, `lastCooked` timestamp, category, servings,
  ingredients, steps, tags
- `kitchen_shopping_selected` / `_checked` / `_manual` — an active shopping list with tick state
- `kitchen_pantry` — pantry stock with low/out flags

**Money**
- `daily_subscriptions` and fixed categories with **billing due dates** — nothing on Home warns
  me a bill is coming.
- `daily_cc_log`, `daily_savings_log`, `daily_income_streams`.
- Weekly **spending goal** (a self-imposed cap on variable spending, stored per week as
  `var_goal`) — shown on the Budget tab, not on Home.

**Other**
- `daily_checkin_log` — every date I've opened the app. An app-usage streak exists as data.
- `wt_plans` — plans carry their own `streak: {lastDate, count}`. No Home card.
- `daily_reminders` — workout and budget reminder settings.

---

## SETTLED — DON'T RE-PROPOSE

Each of these was tried, decided, or is already a setting. Suggesting them again costs us both
a round trip.

1. **"Make the layout multi-column / masonry."** Tried twice, reverted twice. In a packed
   layout, DOM order stops matching visual order, which breaks drag-to-reorder (the save
   function reads DOM order). Home is a CSS grid that fills row-by-row, deliberately.
2. **"This card should be full-width" / "shouldn't be full-width."** Full-width is a per-card
   toggle I control in Settings → Home Layout. Comment on the card's *design*, not its width.
3. **"There should be fewer/more cards" / "reorder them."** Both are settings. Every card is
   hideable and drag-reorderable.
4. **"Cap the Notes card at N items with a '+N more' row."** Already exists — cards that
   overflow get capped with a "Show all / Show less" button, and only when they actually
   overflow.
5. **"The credit-card alert should read as a state, not decoration."** Already does — amber
   background, amber border, own radius.
6. **"Shrink the weather card to a strip."** Rejected. It's a 16-scene system with per-scene
   gradients and sun/moon/star/cloud/fog/rain effects; the gradients need vertical run to
   resolve, and the star layer is the only thing separating three of the night scenes. It can
   be redesigned, but not flattened.
7. **"Fix the tiny 8–9px text."** Every sub-10px size in the app is inside a deliberate
   miniature — the Settings → Home Layout preview thumbnails or the onboarding mini-screens.
   Not real UI.
8. **Accent contrast / readability of accent-coloured text.** Just fixed. There's a derived
   `--accent-text` token now.
9. **Desktop hover states on cards.** Just added.

---

## WHAT I'M ACTUALLY UNSURE ABOUT

Direct questions. Answer these explicitly.

1. **Six surface treatments across eleven cards — is that the problem, or is it fine?** My
   instinct says it looks like several people designed it. But a dashboard where every card is
   identical might just be boring. If you'd consolidate, say how many treatments should survive
   and which cards get which.
2. **Two cards carry the accent at full strength with white text on them.** Is that one too
   many? If you cut one, which, and what does it become instead — given the accent can be any
   hue, so a "10% tint" is not reliably visible.
3. **The neutral cards are the majority and they're plain** — background, border, radius,
   padding, done. Is there something they should have that they don't? I don't want decoration
   for its own sake, but they're flat next to the accent and weather cards.
4. **Card density.** Most cards show 1–4 facts. Is that right for a phone, or are they sparse
   and I should be fitting more in?
5. **What's the single worst-looking card of the eleven, and why?**

---

## PRACTICAL CONSTRAINTS

- No framework, no build step, no npm. New CSS goes in one of six existing files; new markup is
  built as template strings in `js/app.js`.
- Chart.js is already loaded, so charts inside cards are cheap. Tabler Icons and two Google
  Fonts (Manrope for UI, Space Grotesk for numerals) are available.
- **Both themes must work.** Dark is the one I use; light must not break.
- **Phone first.** A card that only works at 550px wide is a card that only works on my laptop.
  On desktop, Home lays out as 2–3 columns of ~480–556px depending on window width.
- Cards can be tall on phone (it scrolls) but on desktop a card is stretched to match its row
  partner's height, so **think about what a card looks like with more vertical space than its
  content needs**.
- Every card needs a sensible **empty state** — a new user, or a week with no data, must not see
  a blank box or a bare dash.

---

## OUTPUT I WANT

**Part 1 — Redesigns (existing cards).**
Ranked by how much better it'd make Home look. For each: which card, what's wrong with it now
in one or two sentences, what it should become, and roughly how big a change it is.

**Part 2 — New cards.**
Five to eight ideas, each built on data from the inventory above. For each:
- Name and what it answers at a glance
- The layout — what's on it, arranged how
- Why it earns a spot on Home
- Its empty state
- Whether it's better half-width or full-width

Rank these too. I'd rather have three ideas you're confident about at the top than eight
even-handed ones.

**Part 3 — The card system.**
If you think the eleven cards should share more than they currently do, describe the shared
system: how many surface treatments, what each one means, and which cards use which. If you
think they're fine as they are, say that instead — I'd rather hear it than have a system
invented for its own sake.

**Part 4 — One line on anything outside the cards** that's a bigger problem than what's above.

Be blunt. If an existing card should just be deleted, say so.
