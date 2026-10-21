# Prompt 43 — Build Daily's calorie and common-food system

## Codebase context

You are working in **Daily**, Francois Peters's personal lifestyle PWA.

Before making changes:

1. Read `AGENTS.md` completely. It is the safety-critical operating reference.
2. Read the relevant calorie, Stats, Kitchen, sync, backup and service-worker sections of
   `CLAUDE.md`.
3. Re-grep the current code. Line numbers below are orientation only and may have moved.
4. Inspect `git status` and preserve all unrelated work. Do not reset, discard or overwrite
   existing changes.

Important repository facts:

- Vanilla HTML/CSS/JS; no build step, package manager or module system.
- `index.html` loads the existing CSS cascade in a fixed order. Do not reorder it.
- Most logic is in global-scope `js/app.js`.
- Firebase Realtime Database mirrors localStorage. Data preservation and timestamp rules in
  `AGENTS.md` are load-bearing.
- GitHub Pages serves `main` directly. **Do not commit, push or deploy.** Leave a tested working
  tree for Francois to review.
- Any cached asset change requires a real `CACHE_NAME` bump and updated version comment in
  `service-worker.js`.

## Why this work is needed

Calories is presented as a main Daily feature across Home, the full calorie overlay, Settings,
Stats, weekly review, Journal and Kitchen, but its data foundation is currently incomplete:

- Manual logging requires the user to type both a food name and kcal.
- There is no usable common-food search or quantity-aware calorie catalogue.
- Old `savedFoods` code is effectively orphaned and stores only `{name,kcal}`.
- `wt_calories` preserves only the current day's entry detail.
- `daily_cal_history` preserves only one kcal total per older day; meal detail and macros are
  discarded.
- Kitchen recipes can store per-serving calories/macros, but values are manually entered and
  are not calculated from ingredients.
- New/imported recipes may contain `null` nutrition.
- Logging a recipe with unknown calories currently turns unknown into `0 kcal`. That false zero
  then affects Home, Stats and Journal.
- Legacy/manual entries with category `other` count toward the ring but are omitted from the
  overlay's four meal sections.
- Today's log and calorie history are separate last-write-wins blobs, so multi-device edits can
  disagree or replace one another.
- The normal Health settings save/select-goal paths appear not to push updated personal info to
  Firebase even though onboarding does.

The goal is not merely a bigger calorie screen. Build one honest, shared nutrition foundation
that powers food logging and Kitchen recipes while preserving every existing record.

## Product outcome

After this prompt is complete, Daily must provide:

1. A first-class **Nutrition** tab in Daily's primary navigation and desktop sidebar.
2. A fast, searchable offline list of common foods with calories and macros.
3. Quantity/serving-aware logging into Breakfast, Lunch, Dinner or Snacks.
4. Recent foods, favourite foods, custom foods and Kitchen recipes in the same add-food flow.
5. Honest handling of unknown nutrition: unknown is never silently stored or displayed as zero.
6. Durable dated food-entry history, not just historical totals.
7. Recipe nutrition that can be calculated from linked ingredients, with a clear manual fallback.
8. A safe Nutrition Review workflow for every pre-existing recipe, including protein variants.
9. Consistent Home, Stats, Journal and Kitchen figures derived from the same canonical log.

Calories and the three existing macros are in scope. Micronutrients, barcode scanning, dieting
advice and a live third-party API are not required for this prompt.

## Non-negotiable data rules

### Unknown is not zero

- Never convert missing recipe or food nutrition to `0`.
- A log entry may be explicitly marked `unknown`, but its day must then be labelled **Partial**.
- A partial day may show a known subtotal such as `1,420 kcal + 1 unknown item`; it must not
  claim that 1,420 is the day's complete intake.
- Exclude partial days from averages/comparisons that require a complete total. Still show the
  dated record and explain why it is excluded.
- A genuine zero-value ingredient (water, salt, etc.) is different from unknown. Preserve that
  distinction in the model.

### Historical entries are snapshots

- Each food-log entry must retain the name, quantity, measure, meal category and nutrition that
  applied when it was logged.
- Later edits to a catalogue food or recipe must not rewrite historical intake.
- Optional source references (`foodId`, `recipeId`, `proteinOptionId`) may travel beside the
  snapshot for navigation, but the snapshot remains authoritative for history.

### Preserve all existing data

- Do not delete `wt_calories`, `daily_cal_history`, `daily_saved_foods` or `kitchen_recipes`
  during migration.
- Migrate idempotently. Reloading or receiving legacy data from Firebase later must not duplicate
  entries or re-run destructive work.
- Historical totals without entry detail remain valid **legacy totals**. Do not invent the foods
  or macros that produced them.
- Preserve all existing manually entered recipe calories/macros until the user explicitly accepts
  a calculated replacement.
- Do not replace `kitchen_recipes` wholesale.
- Do not fuzzy-match and overwrite recipes or ingredients automatically. Suggest conservative
  matches and require confirmation when identity, preparation state, brand or measure is unclear.

### Sync and restore

- Any new synced localStorage store must be registered through the existing sync infrastructure
  and included in full restore using the established dynamic registration/special keyed-store
  pattern. Do not create a second hardcoded blob list.
- Respect `_bootPhase`, `stampFor()`, `lsSave()` and `lsSaveTS()`. A fresh device's seeded food
  catalogue or migration must never outrank genuine cloud data.
- Food-log entries need stable IDs and merge-safe deletion semantics. Do not use array position as
  identity.
- Two devices adding different foods to the same date must converge to the union rather than one
  whole-day array replacing the other. Use entry-level timestamps and tombstones, or an equivalent
  keyed merge that preserves deletions.
- A backup restore remains authoritative and must replace the synced nutrition state exactly,
  including deletions, using the same restore contract as the rest of Daily.
- Firebase security rules must remain scoped to `users/<uid>`.

## Canonical data design

Choose names that follow the existing Daily prefixes, but implement an explicit versioned model.
The following shape describes the required semantics; adjust exact field names only when the
current code makes a demonstrably safer equivalent clearer.

```js
{
  schemaVersion: 1,
  entries: {
    "stable-entry-id": {
      id: "stable-entry-id",
      date: "YYYY-MM-DD",
      meal: "breakfast|lunch|dinner|snacks",
      name: "Banana",
      quantity: 1,
      measureId: "medium",
      measureLabel: "medium banana",
      grams: 118,
      nutrition: { calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
      nutritionStatus: "known|unknown",
      source: "catalog|custom|recipe|manual|legacy",
      foodId: null,
      recipeId: null,
      proteinOptionId: null,
      servings: null,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null
    }
  },
  legacyTotals: {
    "YYYY-MM-DD": { calories: 1800, source: "daily_cal_history" }
  }
}
```

Requirements:

- Derive daily totals, macro totals, meal totals and coverage from this one canonical source.
- Do not keep two independently writable sources of truth for today's total.
- Normalise old calorie-entry shapes defensively.
- Keep tombstones long enough for offline devices to learn about deletions; do not allow a stale
  device to resurrect a deleted food entry.
- Any cleanup/compaction must be safe, bounded and documented in code with the reason.

## First-class Nutrition tab and navigation

Nutrition must become its own top-level destination, not remain a full-screen overlay attached to
Home.

- Add a real `view-nutrition` section handled by `setView('nutrition')` like Daily's other
  first-class views.
- Add **Nutrition** to the desktop sidebar with a suitable existing-style line icon and correct
  active state.
- Add **Nutrition** to the mobile bottom navigation and swipe deck. Update `NAV_ORDER`, deck panel
  markup/order, transforms, pill/indicator geometry, keyboard/focus handling and responsive CSS as
  one coherent five-tab system. Do not merely add a button that points at a non-deck overlay.
- Keep the central Log/workout action visually prominent and ensure five labels remain readable on
  narrow phones and with safe-area padding.
- Add Nutrition to any hamburger/menu registry or navigation helper that enumerates destinations,
  without creating duplicate menu entries.
- Header titles, active sidebar state, mobile nav state, swipe position, browser back behaviour and
  return-from-overlay behaviour must all recognise `nutrition`.

The Nutrition view should use a compact internal sub-navigation:

1. **Today** — calorie/macro summary, target, meal groups and Add food.
2. **Foods** — searchable common foods, recent/favourites and My Foods management.
3. **Recipes** — recipe nutrition coverage and the Nutrition Review workflow, with links into the
   Kitchen recipe detail/editor rather than duplicating the entire Recipe Book.

Navigation responsibilities:

- Home keeps its calorie summary card, but tapping it goes to `setView('nutrition')`.
- Kitchen's **Log this meal** finishes in Nutrition → Today with the new entry highlighted or
  scrolled into view.
- Stats → Nutrition remains the historical analysis screen; its **Food log** action opens the
  top-level Nutrition tab. Do not duplicate the full logger inside Stats.
- Journal opens Nutrition → Today for today's calorie source and Stats → Nutrition evidence for an
  older day.
- Replace `openCalorieOverlay()` call sites with explicit navigation. Remove the obsolete calorie
  overlay markup/logic/CSS when no longer needed, or leave a tiny compatibility wrapper only if a
  migration path genuinely requires it. Do not keep two fully functional calorie screens.
- Opening Nutrition must work even when no calorie target is configured; foods and logging are not
  conditional on Health setup.

## Common-food catalogue

### Source and scope

Build a compact, offline, Australia-oriented starter catalogue rather than shipping thousands of
unfiltered records or calling a live API.

- Target approximately 100–200 genuinely common foods for the first version.
- Cover the ingredients used by all nine seeded recipes and the pantry catalogue, plus everyday
  fruit, vegetables, meat, fish, eggs, dairy, rice, pasta, bread, cereal, oils, sauces, snacks and
  drinks.
- Prefer official Australian food-composition information from FSANZ AFCD/AUSNUT.
- Record the source dataset/release on catalogue records or catalogue metadata.
- Review and comply with the applicable FSANZ attribution/licence requirements. Add a concise
  in-app data-source/limitations note in the nutrition area or Settings. Do not imply FSANZ
  endorses Daily.
- Food-composition values are estimates that vary by brand and preparation; say this plainly.

Each built-in food needs:

- Stable ID.
- Display name, search aliases and category.
- Preparation state where material: raw/cooked, drained, skin on/off, etc.
- Calories, protein, carbohydrates and fat per 100 g edible portion.
- Useful food-specific measures with gram equivalents, such as a medium banana or slice of bread.
- Source/version metadata.

Do not use universal conversions for `cup`, `tbsp`, `tsp`, `piece` or arbitrary count units.
Volumes require food-specific density/measure data. Pieces require a food-specific gram measure.
When a conversion is unavailable, ask for grams or allow an explicit custom serving instead of
guessing.

### Custom and favourite foods

- Add a synced **My Foods** store for branded/custom foods.
- A custom food can be entered from a nutrition label using either per 100 g or per serving data.
- Allow edit, favourite/unfavourite and delete with confirmation.
- Built-in foods are immutable; favouriting them stores only user preference.
- Migrate reachable legacy `daily_saved_foods` records conservatively into My Foods as a named
  custom serving with known calories and unknown macros. Preserve the old store.
- Duplicate-name handling must be explicit; never silently overwrite another custom food.

## Food logging experience

Replace the four repeated free-text/kcal rows with one coherent add-food flow while keeping meal
sections easy to scan.

The flow must support:

1. Open the top-level Nutrition tab directly, or arrive from Home, Stats, Journal or Kitchen.
2. Tap Add food from a meal section; that meal is preselected.
3. Search across, in useful ranking order:
   - recent logged foods;
   - favourites/My Foods;
   - Kitchen recipes;
   - built-in common foods.
4. Select quantity and a valid measure; update calories/macros live.
5. Confirm the meal and log it.
6. Edit an existing entry's quantity, meal or nutrition snapshot.
7. Delete an entry safely.
8. Repeat a recent entry or copy a previous meal without retyping.
9. Use a clearly labelled manual fallback when the food is not in the catalogue.

Manual fallback must accept either known calories/macros or an explicit Unknown nutrition state.
It must not default to `other`; every visible entry belongs to one of the four meal groups.

The overlay must show:

- Known daily calories versus target.
- Partial status and unknown-item count when applicable.
- Protein, carbs and fat totals when the day is complete enough to calculate them.
- Per-meal totals.
- Food-entry quantity/serving, not only its name.
- A useful empty state and no orphaned/dead saved-food UI.

Remove or deliberately repurpose the unreachable `renderCalorieLog`/`renderSavedFoods` paths so
there is one maintained logging UI, not parallel code that silently diverges.

## Kitchen recipe nutrition

### Ingredient linkage

Extend recipe ingredients without breaking the existing import/export, shopping, pantry, scaling,
protein-option or cooking flows.

- Existing `{name, amount, unit}` remains readable and exportable.
- An ingredient may additionally reference a built-in/custom `foodId`, a selected measure and its
  resolved gram quantity.
- Ingredient search uses conservative exact/alias matching. Do not reuse broad substring/fuzzy
  matching that could confuse onion with spring onion or raw with cooked food.
- Preserve unknown/custom units exactly when opening and saving a recipe, including `""`, `kg`
  and `L`, as required by the existing ingredient-unit regression rule.

### Calculation

- Calculate whole-recipe and per-serving calories/protein/carbs/fat from linked ingredients.
- Make the calculation basis visible: `Calculated from 8 ingredients`, `Manual estimate`,
  `Partial — 2 ingredients unresolved`, or `Missing`.
- Do not claim a full calculated value if any energy-contributing ingredient is unresolved.
- Allow a manual per-serving nutrition override, but label and preserve its provenance.
- Never replace an existing manual value merely because an ingredient match becomes available.
- Recalculate only after the user confirms the linked ingredient/quantity change.
- Use the existing recipe serving count consistently. Make it unmistakable whether a figure is
  whole recipe, per serving, or the servings currently being logged.

### Protein options

- Shared ingredients contribute to every option.
- Each option adds its own protein ingredient and option-only extras.
- Calculate and store/display the complete per-serving nutrition for each option.
- Never duplicate the protein in shared ingredients.
- Missing nutrition in one option must not contaminate another option's status.
- Continue using `kitResolve()` as the central read path for the selected recipe variant.

### Recipe logging

- Logging a complete recipe/option snapshots calories and macros into the canonical food log.
- Logging an unresolved recipe must offer: return to Nutrition Review, enter a manual estimate, or
  log explicitly as Unknown. It must never silently log `0 kcal`.
- Preserve recipe name, option label, servings eaten and stable references in the entry snapshot.

## Nutrition Review for existing recipes

Add a clear Kitchen entry point named **Nutrition Review**.

It must audit all recipes and all protein options, classifying them as:

- Calculated
- Manual estimate
- Partial / needs ingredient matches
- Missing

The review must:

- Show an overall count and allow filtering to incomplete recipes.
- Walk the user through unresolved ingredients one recipe at a time.
- Suggest exact/alias catalogue matches but require confirmation for ambiguous foods, preparation
  state, brands and household measures.
- Preserve current calorie/macronutrient values while calculation is pending.
- Offer an explicit compare screen before replacing manual values with calculated values.
- Never identify a pre-existing seeded recipe solely by random ID. If adding stable seed keys,
  migrate only through conservative name plus ingredient-signature checks and leave edited/unclear
  records for review.
- Ensure the nine fresh-install seeded recipes all have a reviewed nutrition status.
- Give newly created/imported recipes a visible needs-review state whenever nutrition is not
  complete. Imports remain lossless; do not reject a valid recipe merely because an assistant
  correctly used `null` rather than guessing.

## Home, Stats, Journal and calorie targets

Update every calorie consumer to read the canonical nutrition helpers.

### Home

- Ring and meal totals come from canonical entries.
- Tapping the calorie card navigates to the top-level Nutrition tab; it no longer opens a separate
  full-screen calorie overlay.
- Partial days display a partial known subtotal and unknown count rather than a confident
  remaining-calorie number.
- Weekly strip distinguishes complete, partial and unlogged days.

### Stats and weekly review

- Preserve legacy historical calorie totals.
- Complete new days may contribute calorie and macro trends.
- Partial days are visible but excluded from complete-day averages, with the exclusion explained.
- Missing remains unknown, never zero.
- Do not draw the current calorie target as though it were the historical target for older dates.
  Either store target snapshots/episodes from this release forward or label the line clearly as a
  current reference.
- Update the obsolete statement that macros were never stored once durable macro history exists;
  accurately distinguish legacy totals from new detailed days.
- The Stats Nutrition sub-tab remains analysis/evidence and links to the top-level Nutrition tab
  for logging and food management.

### Journal

- Day context and weekly reflections use the same complete/partial semantics as Stats.
- A partial day's known subtotal must not be described as its complete calorie intake.

### Targets and personal-info sync

- Keep Mifflin-St Jeor as an estimate, not medical advice.
- Validate Health inputs before calculating; do not produce implausible/negative targets from
  invalid values.
- Make the weight and activity basis used by the estimate visible.
- Do not silently replace the chosen profile weight from the weight log. If offering the latest
  logged weight, require an explicit confirmation/update.
- Ensure normal Health saves and goal selection sync through the established personal-info
  Firebase path, not only onboarding.
- Allow a custom calorie target without erasing the calculated cut/maintain/bulk references.

## Import, export, AI context and compatibility

- Extend the recipe import/export schema only through optional fields; existing recipe JSON must
  continue to import.
- Export enough optional food-link/provenance data for a Daily-to-Daily round trip without making
  external assistants invent catalogue IDs.
- AI instructions must continue saying `null` rather than guessing when nutrition is unknown.
- Update Daily's AI context so it reports calculated/manual/partial recipe nutrition honestly.
- Full app backup/restore must include the canonical nutrition log, My Foods, preferences and
  recipe additions.
- Continue reading legacy calorie keys indefinitely unless there is a separately approved removal
  migration.

## Validation and error handling

- Calories and macros must be finite and non-negative.
- Quantities and serving counts must be finite and greater than zero.
- Reject or report invalid imported numeric values precisely; never partially apply a malformed
  import.
- Escape all user-controlled food/recipe names before placing them in HTML or inline handlers.
- A catalogue miss, invalid recipe option or malformed legacy record must not blank Home, Kitchen,
  Stats or the calorie overlay.
- Avoid noisy console output in normal use; actionable migration failures may use concise warnings.

## Visual and interaction requirements

- Follow the existing card vocabulary and design tokens. Read `CLAUDE.md` before layout work.
- Mobile phone is the primary viewport; desktop must remain usable.
- Test light and dark themes.
- Respect safe areas, overlay stacking and the existing Kitchen action-sheet/detail hierarchy.
- Verify the five-item mobile navigation at the narrowest supported phone width. No clipped labels,
  overlapping indicator, incorrect swipe width or unreachable panel is acceptable.
- Use real buttons, labels, focusable controls and accessible names.
- Do not rely on colour alone for known/partial/missing states.
- Keep common logging fast: a recent/favourite food should take only quantity confirmation and one
  final tap to log.

## Required verification checklist

Do not mark the work complete until every item below has been exercised locally over HTTP with no
uncaught console errors.

1. **Fresh profile:** with empty localStorage, Daily seeds the common-food catalogue and nine
   recipes without a fresh boot timestamp outranking populated cloud data.
2. **Existing cloud account:** a private/fresh browser profile signs into an account with existing
   recipes/calorie history and pulls the cloud copy without defaults overwriting it.
3. **Legacy migration:** old `wt_calories`, `daily_cal_history` and `daily_saved_foods` data remains
   present, migrates once, and does not duplicate after two reloads.
4. **Late legacy sync:** legacy data arriving from Firebase after boot is normalised without loss.
5. **Unknown recipe:** log a recipe with missing calories; confirm it is Unknown/Partial and never
   appears as `0 kcal`.
6. **Mixed day:** log one known and one unknown item; Home, overlay, Stats and Journal all show a
   partial subtotal and exclude the day from complete averages.
7. **Common food:** log a medium banana (or equivalent measured food); quantity, gram resolution,
   calories and macros persist after reload.
8. **Custom food:** create a branded food from per-serving label data, favourite it, log two
   servings, edit it later, and confirm the historical entry does not change.
9. **Meal visibility:** migrate/log an old `other` entry and confirm it is assigned/reviewable and
   never counted invisibly.
10. **Entry editing:** move an item between meals, change quantity, then delete it; all totals and
    history update correctly.
11. **Two-device merge:** simulate two clients adding different entries to the same date; both
    entries survive. Delete one while the other client is stale; the deleted entry does not return.
12. **Recipe calculation:** link all ingredients in a recipe and confirm whole-recipe, per-serving
    and logged-serving figures agree.
13. **Unresolved ingredient:** leave one caloric ingredient unmatched and confirm the recipe is
    Partial, not confidently calculated.
14. **Manual preservation:** open an existing manually-valued recipe and save without accepting a
    calculation; its nutrition remains byte-for-byte unchanged.
15. **Comparison approval:** accept a calculated replacement only through the explicit compare
    action and confirm the new provenance is recorded.
16. **Protein options:** calculate two protein variants, switch between them in detail/cooking/log
    flows, and confirm the correct option's complete nutrition is logged.
17. **Ingredient-unit regression:** open and save recipes containing `unit:""`, `kg`, `L` and a
    previously unknown unit without touching the dropdown; every stored unit remains unchanged.
18. **Import:** import a legacy recipe, a recipe with `null` nutrition and a protein-option recipe;
    all remain lossless and receive the correct review status.
19. **Historical integrity:** edit/delete a catalogue food and a recipe; previously logged entries
    retain their original snapshot values and names.
20. **Legacy Stats:** old total-only days still appear as legacy totals, with no invented macros.
21. **New Stats:** complete detailed days show calorie/macro trends; partial and missing days are
    distinguished and excluded honestly.
22. **Target sync:** change Health details, select a goal and set a custom target while signed in;
    reload on another client and confirm the current setting arrives without changing old target
    history.
23. **Backup/restore:** export, add/change/delete nutrition data, restore the backup while signed in,
    and confirm the restored nutrition state becomes authoritative in Firebase and after reload.
24. **Empty/error states:** test no foods, no recipes, malformed legacy data, a deleted protein
    option reference and an unavailable Firebase connection; no primary screen goes blank.
25. **Navigation:** reach Nutrition by mobile tap, mobile swipe in both directions, Home calorie
    card, desktop sidebar, Stats, Journal and Kitchen meal logging. Confirm active states, header,
    focus, back/return behaviour and the selected Nutrition sub-tab are correct each time.
26. **Responsive QA:** exercise the five-item mobile nav, full add-food flow, Nutrition Review and
    recipe editor on the narrowest supported phone and desktop in both light and dark themes.
27. **PWA update:** verify every changed cached asset is listed appropriately and `CACHE_NAME` plus
    its version comment were bumped exactly once for this real content change.

## Completion report

At the end, report:

- The canonical data model and migration strategy implemented.
- The common-food source, count, coverage and attribution/licence handling.
- How calculated, manual, partial and missing nutrition are represented.
- How multi-device additions and deletions merge.
- Every file changed.
- Which verification items were completed, which require Francois's signed-in account or second
  device, and exact manual steps for those remaining items.
- Any deliberately deferred work.

Do not claim completion merely because the screens render. The feature is complete only when
unknown nutrition cannot masquerade as zero, existing data survives migration/restore, and food
logging plus recipe nutrition share one trustworthy foundation.
