# KITCHEN — FUNCTIONAL SPEC
### For an outside design pass. Describes what exists and how it behaves — not what's wrong
### with it, and not what to build. Hand this to a design-focused chat as ground truth.

---

## WHAT THIS IS FOR

I'm getting an outside AI to redesign the look of this screen and give feedback. It will only
have what's in this document plus whatever screenshots I attach — it can't read the code. Every
fact below is pulled directly from the app's source, not remembered or guessed, so treat it as
accurate. If something here looks like a design opinion, it isn't meant to be one — flag it back
to me rather than assuming it's deliberate.

**This is Kitchen specifically** — one of several tabs in a personal lifestyle app (workouts,
budget, habits, kitchen). It has never had a design pass. It's also the most functionally
complex area in the app: three sub-areas that read and write each other's data, plus a
distinct full-screen cooking mode.

---

## THE APP IN ONE PARAGRAPH

Vanilla HTML/CSS/JS, no framework, no build step. Runs as an installable PWA — **phone is the
primary target**, desktop is real but secondary. Dark mode is default and what's actually used:
warm near-black background, cards as a translucent white-gradient "glass" surface. Light mode
exists and must keep working. The app's accent colour is **not fixed** — it can be a static
preset, a per-training-day colour, or (the mode actually in use) a colour derived from live
weather that shifts through the day. Any design that assumes a specific accent hue, or that
pairs two accent-dependent colours against each other, will break.

---

## NAVIGATION INTO KITCHEN

Kitchen is one of four tabs in the phone's bottom nav (Home, Budget, Log, Kitchen — Kitchen
recently replaced Stats there, which moved to a hamburger menu; that swap is done, not something
to redesign). Desktop has the same four in a persistent left sidebar.

Inside Kitchen there are three sub-tabs, switched by a row of buttons at the top of the screen:
**Recipes | Shopping | Pantry**. Only one is visible at a time. There's no indicator of "3 items
need attention" or similar on these sub-tab buttons currently — switching is the only way to see
what's pending in another sub-area.

---

## PART 1 — RECIPE BOOK

### What's on the list screen

Top to bottom:
1. **Featured/latest recipe** — a small callout, algorithm: most recently cooked favourite, or
   if no favourites are cooked yet, the newest recipe. Not shown if the list is empty.
2. **Search box** — matches recipe **name or any ingredient name**, live as you type.
3. **"+ Add Recipe" button** and a separate **"⇩ Import" button**, side by side with the search
   box.
4. **Filter chips**: All · Favourites ♥ · Recently Cooked 🕐 — pick one.
5. **Category pills**: All · Breakfast · Lunch · Dinner · Dessert — pick one, independent of the
   filter chip above (both apply at once, e.g. "Favourites" + "Dinner").
6. **The recipe list** — cards for every recipe matching search + filter + category.

### What's on a recipe card (list view)

Recipe name, category tag, an emoji (either a user-set per-recipe emoji or a category default —
🍳 breakfast, 🥪 lunch, 🍽️ dinner, 🍰 dessert), servings count, a short description, and — if the
recipe has been cooked before — "Cooked N days ago" (or "Cooked today" / "Cooked yesterday").
Tapping a card opens the recipe detail. A card also carries a "🍱 Batch" badge if the recipe is
tagged `batch-prep`.

### Recipe detail — what's on it

Back button (mobile) or nothing (desktop, since it's a persistent column) · favourite toggle
(⭐/☆) · recipe emoji (large) · name · category tag + batch badge + cook-time badge + any custom
tags · description · a **"▶ Start Cooking" button** (full width, prominent) · a **servings
scaler** (− / current number / +, floor of 1) · a **macros row** (calories / protein / carbs /
fat — only shown if at least one is set on the recipe, values scale live with the servings
scaler) · **Ingredients list** (name + amount, amounts scale live with servings) · **Method**
(numbered steps; a step can carry an optional timer badge, e.g. "⏱ 30 min") · three action
buttons at the bottom: **🍴 Log this meal** / **✏️ Edit** / **🗑️ Delete**.

**"Log this meal" is a real cross-feature link, not decoration.** It computes calories at the
*currently scaled* serving size and pushes an entry straight into the app's daily calorie log
(the same log the Home screen's calorie ring reads from), then opens the calorie tracker
overlay. A redesign has to preserve this — it's the one place Kitchen writes into Nutrition
data.

### Desktop vs mobile layout — this is a real structural difference, not just responsive reflow

- **Mobile (<1024px)**: the recipe list is the whole screen. Tapping a recipe pushes a
  full-screen detail overlay with its own back button.
- **Desktop (≥1024px)**: **master/detail split** — list column at **40% width**, detail column
  at **60%, sticky** (stays in view while the list scrolls), with its own card background,
  border and rounded corners. Selecting a recipe from the list updates the detail column in
  place; there's no overlay at all on desktop. With the app's width cap this currently puts the
  list around 850px and the detail around 1260px on a wide monitor.

### Add / Edit form

A recipe is: name, emoji, category, servings, description, optional cook time (minutes),
ingredients (each: name / amount / unit, added one row at a time), method steps (each: text +
optional per-step timer in minutes, added one row at a time), tags (free text), and four
optional macro numbers (calories/protein/carbs/fat). The same form services both "Add" and
"Edit" — editing pre-fills every field.

### Import

A separate flow: paste JSON (with a "Show the format" example expandable inline), the app
validates and parses it, and adds one or more recipes in one go. This exists because recipes are
commonly generated by an AI chat elsewhere and pasted in — the format is specifically documented
so that workflow keeps working. **This needs to survive a redesign as a real feature**, not be
treated as a power-user afterthought.

### Data behind Recipe Book

Stored under `kitchen_recipes` (synced across devices when signed in). Each recipe: `id, name,
emoji, category, servings, description, cookTime, ingredients[], steps[], tags[], calories,
protein, carbs, fat, favourite, batchPrep, lastCooked (timestamp or null), createdAt`. Ships
with **9 preloaded recipes** (3 breakfast, 3 lunch, 3 dinner) on first use.

---

## PART 2 — SHOPPING LIST

### The flow, in order

1. **Selector screen** (shown first): every recipe as a pickable tile. Tap to select a recipe
   for the list; each selected recipe gets its own **servings stepper** (independent of that
   recipe's own default servings — you can shop for 6 servings of a recipe that normally makes
   2). A "Build list" action moves to the list view.
2. **List view**: every selected recipe's ingredients, combined.

### How the list is built (this is the part most likely to need explaining to a design AI)

- Ingredients from every selected recipe are **aggregated by name+unit** — if two recipes both
  need "Garlic, cloves", they combine into one line with the summed amount (scaled by whatever
  serving count you picked for each recipe).
- **Pantry staples are automatically excluded** — a fixed list (~45 items: salt, pepper, common
  oils, common sauces, herbs/spices, eggs, onion, garlic) never appears on the shopping list even
  if a recipe calls for it, on the assumption you always have them. This list is exact-match, not
  fuzzy — a recipe has to spell an ingredient the same way the staples list does.
- Every item is auto-sorted into one of five categories by keyword matching against its name:
  **Produce, Protein, Dairy, Bakery & Grains, Other** — this categorisation is automatic, not
  user-set.
- **Manual items** can be typed in directly (an always-visible add bar at the bottom of the list
  view) — these land in "Other" unless given a category, and carry a delete (✕) button the
  aggregated recipe-ingredients don't have.
- **Pantry needs surface here too**: anything flagged out-of-stock or running-low in the Pantry
  sub-tab appears as its own "🥫 Pantry needs" section at the top of the shopping list, tagged
  ⚠ Low or Out. Ticking one of these off doesn't just check it — it **marks that pantry item
  back in stock**, closing the loop between the two sub-tabs.
- Each line item is a checkbox row: name, quantity (if numeric), and a checked/unchecked state
  that persists.
- A "Clear checked" action and a "Clear all" action both exist.
- Empty state: "✅ Nothing to buy" when every recipe ingredient is either checked or a pantry
  staple and there are no pantry needs.

### Data behind Shopping

`kitchen_shopping_selected` (which recipes + servings are chosen), `kitchen_shopping_checked`
(tick state, keyed by item), `kitchen_shopping_manual` (hand-typed items). All independent of
the recipe data itself — deleting a recipe doesn't affect an already-built shopping list.

---

## PART 3 — PANTRY / SPICE TRACKER

A stock-tracking list, grouped into five fixed categories: **Spices, Dried Herbs, Dry Goods,
Oils & Fats, Sauces & Condiments** — ~35 seeded items across them (e.g. Spices: smoked paprika,
cumin, garam masala…). Each item has two independent flags: **in stock / out of stock**, and
**running low** (a separate toggle — an item can be in stock AND running low at once). Each
category has its own inline "add custom item" input at the bottom.

This is the data source for the shopping list's "Pantry needs" section (see above) — anything
out-of-stock or running-low here is what surfaces there.

### Data behind Pantry

`kitchen_pantry` — a flat map of item-id → `{inStock, runningLow}`, plus custom items which also
carry their own `name` and `cat`.

---

## PART 4 — COOKING MODE

A **separate full-screen overlay**, launched from a recipe's "Start Cooking" button. This is
the one part of Kitchen genuinely designed for a different physical situation than the rest of
the app: used at arm's length, possibly with wet or messy hands, while something is actively on
the stove. **Nobody has reviewed this screen for that use case specifically** — it's worth
extra attention.

### What's on it

- Top bar: **✕ Exit**, recipe name (with its emoji), centred.
- A **progress bar** across the top showing how far through the steps you are.
- "Step N of M" label.
- The current step's text, large.
- **If that step has a timer** (set per-step in the recipe data, in minutes): a circular
  countdown ring with the time remaining in mm:ss, a Start/Pause button, and a Reset button.
  The ring visually depletes as time passes. On completion: the phone vibrates (a
  short-pause-short pattern) and a toast appears ("Timer done! ⏰"). **The timer is
  timestamp-based** (like the workout rest-timer elsewhere in the app), so it keeps correct
  time even if the step timer is paused/resumed or the screen locks.
- Bottom nav: **← Prev** / **Next →**, except on the final step where "Next" becomes
  **🎉 Finish Cooking**.
- Finishing marks the recipe's `lastCooked` timestamp (which is what the featured-recipe logic
  and the Home tab's "cook again" suggestion both read), shows a congratulatory toast, and
  exits back to the recipe.
- The screen requests a **wake lock** while active, so the phone screen doesn't sleep mid-step.
- Changing steps resets any running timer for the step you're leaving.

---

## CROSS-FEATURE LINKS A REDESIGN MUST PRESERVE

These aren't obvious from looking at one screen in isolation — listing them because a redesign
that doesn't know about them could silently break real functionality:

1. **Recipe detail → Home calorie log** ("Log this meal", scaled to current servings).
2. **Pantry → Shopping list** (out-of-stock/low items surface as a dedicated section).
3. **Shopping list → Pantry** (checking a pantry-need item restocks it).
4. **Cooking mode → Recipe Book** (`lastCooked` drives the "cook again" suggestion logic, both
   inside Kitchen's own featured-recipe slot and in a separate Home-tab Kitchen card that shows
   the same suggestion outside Kitchen entirely).
5. **Recipe import** — an external, chat-generated JSON format that has to keep working
   character-for-character; there is a companion tool elsewhere that produces this exact format.

---

## THINGS I NOTICED WHILE PUTTING THIS TOGETHER (flagging, not asking you to fix)

- There appear to be **two separate "add recipe" controls active at once on the Recipes
  screen**: an inline "+ Add Recipe" button next to the search box, and a floating circular "+"
  button fixed to the bottom-right of the screen. Both open the identical form. Worth deciding
  whether that's intentional (e.g. one for mobile reach, one for desktop) or just duplicated.
- The pantry-staples exclusion list matches shopping ingredients by **exact string**, not
  meaning — a recipe ingredient has to be spelled the same way the staples list expects it, or
  it won't be recognised as a staple and will show up on the shopping list unnecessarily. This
  is a data-matching characteristic, not a visual one, but it affects what the shopping list
  actually shows.
- Category assignment on the shopping list (Produce/Protein/Dairy/etc.) is automatic keyword
  matching, with no user override visible anywhere — an odd ingredient name could land in the
  wrong bucket with no way to correct it short of renaming the ingredient.

---

## SETTLED — DON'T RE-PROPOSE

(Carried over from an earlier design pass on this app's Home tab — the same ground rules apply
here.)

- **Don't propose masonry / `column-count` / dense-packing layouts.** Tried and reverted twice
  elsewhere in this app because it breaks drag-to-reorder by desyncing visual order from DOM
  order. If Kitchen ever gets reorderable elements, the same constraint applies.
- **Don't design around a fixed accent colour.** It's runtime-variable (see above). Any colour
  pairing has to survive the accent being anywhere from grey to deep indigo to bright blue.
- **Don't assume desktop is the primary surface.** Phone is. A desktop-only idea (like the
  current 40/60 master-detail split) is fine to critique, but any proposal needs a mobile
  answer too, since mobile is what's actually used day to day.

---

## WHAT I WANT FROM THIS

Feed this document (and however many screenshots you're taking yourself) to the design-focused
chat and ask for:

1. **Redesign proposals** for each of the three sub-areas (Recipe Book, Shopping, Pantry) and
   for Cooking Mode specifically — treated as a distinct design problem given the "wet hands,
   arm's length" use case.
2. **Whether the three sub-areas should be more integrated** — right now they're three separate
   screens behind a sub-tab switch that barely acknowledge each other, despite genuinely sharing
   data (see the cross-feature links above).
3. **Whether the desktop master/detail split is right**, or whether a different desktop layout
   (e.g. a card grid that opens full-width) would serve a recipe book better.
4. **Anything that's a function problem, not just a design one** — a flow that takes two taps
   and should take one, a state that's missing, something confusing.

Ask for the same shape of output as any design critique: ranked proposals, explicit call-outs on
anything ambiguous, and a clear "don't bother" list for ideas not worth the churn.
