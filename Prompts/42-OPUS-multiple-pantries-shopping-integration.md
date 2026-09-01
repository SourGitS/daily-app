# 42 — OPUS — Multiple named pantries + pantry-aware shopping list

Implement this in the **Daily** app. Work in the existing checkout, inspect the current code
before editing, preserve unrelated local changes, and do not commit or push unless Francois
explicitly asks. `main` is the live GitHub Pages deployment, so a push is a production release.

---

## Product outcome

Daily currently has one Pantry inventory and a partly disconnected Shopping list:

- Pantry items marked **Low** or **Out** are appended under “Pantry needs”.
- Recipe ingredients are filtered through the hard-coded `PANTRY_STAPLES` set rather than the
  user's actual Pantry status.
- Consequently, an ingredient can still appear as something to buy even when the user has
  explicitly marked the matching pantry item **In stock**.
- There is no way to keep separate inventories for different kitchens.

Replace that with one coherent system:

1. The user can maintain multiple named pantry locations, for example **Home**, **Mum's house**
   and **Dad's house**.
2. The active pantry is used when generating and viewing the Shopping list.
3. A recipe ingredient matched to an **In stock** pantry item is not shown as something to buy.
   It appears in a secondary, collapsible **Already in [pantry name]** section so the user can
   see why it was excluded.
4. A matched pantry item marked **Low** or **Out** remains something to buy, with its status
   visible, and must never be duplicated elsewhere in the list.
5. Pantry lists can be created, renamed and deleted without losing or mixing the inventories
   belonging to the other locations.

This is a data-sensitive change. Read `AGENTS.md`, the Kitchen sections of `CLAUDE.md`, and the
current Shopping/Pantry implementation in `js/app.js` and `css/kitchen-extras.css` before
editing. Re-grep all callers rather than relying on the approximate line numbers below.

---

## Current implementation to replace carefully

At the time this prompt was written:

- `kitchen_pantry` is one synced blob containing an item map.
- `KITPANTRY_CATS`, `KITPANTRY_SEED_META`, `kitPantryLoad()`,
  `kitPantryItemsByCat()`, `kitPantryNeeds()` and the pantry render/actions are together near
  the end of `js/app.js`.
- `PANTRY_STAPLES` is a static set used by `kitShopComputeItems()` to remove recipe ingredients
  regardless of actual pantry state.
- `kitShopRenderList()` separately prepends `kitPantryNeeds()`.
- `kitShopComputeItems()` and `kitPantryNeeds()` also feed the Home Kitchen card and the AI
  Kitchen snapshot. Those callers must keep reporting only real things to buy.
- `kitchen_pantry` already syncs through
  `syncBlobListen(user.uid, 'kitPantry', 'kitchen_pantry', ...)` and is already part of full
  restore through `SYNC_BLOB_REG`.
- `daily_pantry_ui` is intentionally device-local UI state and must remain outside cloud sync
  and backup data.

Do not leave the old static staple logic active alongside the new inventory lookup. There must
be one source of truth: the selected pantry's actual items and statuses.

---

## Data model and migration

### Keep one synced storage path

Continue using the existing `kitchen_pantry` / `kitPantry` synced blob. Evolve its value to an
explicit, versioned multi-pantry shape rather than introducing several independently timestamped
stores. A suitable shape is:

```javascript
{
  schemaVersion: 2,
  activePantryId: "pantry_uuid",
  order: ["pantry_uuid"],
  pantries: {
    pantry_uuid: {
      id: "pantry_uuid",
      name: "Home",
      items: {
        smoked_paprika: {
          name: "Smoked paprika",
          cat: "spices",
          inStock: true,
          runningLow: false,
          custom: false
        }
      }
    }
  }
}
```

Equivalent naming is fine, but retain these invariants:

- Pantry IDs are stable and never derived from the editable display name.
- Each pantry owns a completely separate `items` map.
- Item metadata is explicit inside each pantry. Do not make missing seed entries silently appear
  as “In stock”, because a genuinely empty new pantry must stay empty.
- There is always at least one valid pantry and `activePantryId` always points to one.
- Names are trimmed, non-empty and compared case-insensitively for duplicate validation.

### Migrate the existing pantry losslessly

When `kitchen_pantry` contains the current legacy item map:

1. Create one pantry named **Home**.
2. Convert every built-in seed entry using `KITPANTRY_CATS` for its name/category and preserve
   its exact `inStock` / `runningLow` state.
3. Preserve every custom item, including its name, category and status.
4. Do not silently discard an unfamiliar legacy entry. Preserve it as a custom item using its
   stored metadata, or a safe human-readable fallback if metadata is absent.
5. Make the migration idempotent; already-versioned data must not be migrated again.

This migration is subject to Daily's load-bearing sync rule:

- Never stamp a boot/default/migration write with a raw `Date.now()`.
- Save only through `lsSave` / the existing timestamp-aware path so `_bootPhase` and
  `stampFor()` remain authoritative.
- Remove the current raw boot-time `localStorage.setItem('kitchen_pantry', ...)` default write.
- A fresh device must not upload a newly seeded Home pantry over older real cloud data.
- Migration must also run correctly when legacy data arrives later from the Firebase listener,
  not only during the first synchronous local load.
- Do not hard-code a second restore/sync path. Keep using the existing registered blob.

On a genuinely new account, initialise one **Home** pantry with the existing built-in catalogue
and its current default status (In stock), preserving today's first-run experience.

---

## Multiple-pantry UI

Add a compact pantry-location control at the top of the Pantry sub-tab, above search and status
filters. It must show the active pantry name and make switching locations obvious on a phone.
Use the app's existing controls/card vocabulary; do not introduce a visually unrelated admin UI.

Required actions:

- **Switch pantry** — selecting a location immediately re-renders Pantry, Home's Kitchen summary
  and Shopping if it is visible.
- **New pantry** — ask for a name, then offer:
  - **Start empty** (default): no items and no assumed stock.
  - **Copy current pantry**: copy item names, categories and statuses into a new independent list.
    Reusing item IDs inside the new pantry is fine because the pantry ID provides the namespace.
- **Rename pantry** — edits only the display name; the stable ID and all contents remain intact.
- **Delete pantry** — show a confirmation naming the pantry. Delete only that pantry and any UI
  state namespaced exclusively to it. Never delete recipes or another pantry's contents. The last
  remaining pantry cannot be deleted; explain this in the UI instead of allowing a broken state.
  If the active pantry is deleted, select the next available pantry deterministically.

The existing search, filters, category collapse controls, add-item flow and three-state
In stock / Low / Out control must operate only on the active pantry. Preserve custom-item deletion.
An empty pantry needs a useful empty state explaining that untracked recipe ingredients will
remain on the shopping list, plus the existing add-item action.

Keep `daily_pantry_ui` device-local. It may remain shared across pantry locations or be safely
namespaced by pantry ID, but it must not be added to `SYNC_BLOB_REG`.

---

## Shopping-list location context

Show the active pantry/location in both Shopping states:

- Recipe selector: **Shopping for [pantry name]** with a switch control.
- Generated list: the same context remains visible without requiring a trip to the Pantry tab.

Switching the pantry from Shopping updates `activePantryId` and immediately recomputes the list
against the newly selected inventory. Keep the existing selected recipes, serving adjustments and
manual shopping items as the same cooking/shopping plan while comparing it with another kitchen.
Manual items are deliberate user entries and must never be suppressed by pantry matching.

The existing checked-state map must not leak a checked recipe row from Home into Mum's house.
Namespace generated-row checked keys by pantry ID (or use an equivalent safe structure), and
migrate existing checked keys into the migrated/default Home pantry without losing them.

---

## Ingredient matching

Create one reusable matcher/index for recipe ingredient names against items in the active pantry.
It must be deterministic and conservative:

1. Prefer an exact normalised-name match.
2. Normalisation may lowercase, trim, collapse whitespace, normalise punctuation/Unicode and
   remove known presentation-only parentheticals such as `(ground)`, `(dried)` or `(whole)`.
3. Use a small explicit alias map for known safe equivalents such as:
   - `pepper` ↔ `black pepper`
   - `vanilla` ↔ `vanilla extract`
   - `worcestershire` ↔ `worcestershire sauce`
   - `balsamic` ↔ `balsamic vinegar`
   - `mayo` ↔ `mayonnaise`
   - `ketchup` ↔ `tomato ketchup`
   - `dijon` ↔ `dijon mustard`
   - existing catalogue display qualifiers such as `Paprika (ground)` ↔ `paprika`
4. Do **not** use substring matching. `onion` must not consume `spring onion`; ground coriander
   must not accidentally consume coriander leaves.
5. Prevent adding a duplicate pantry item whose exact/alias canonical name already exists in that
   pantry, and show a clear inline error.

Retire `PANTRY_STAPLES` as an unconditional shopping filter. An ingredient absent from the active
pantry is something to buy, even if it used to be in that set. For example, garlic or onion is
excluded only when the selected pantry actually tracks a matching item as In stock.

---

## Generated shopping-list rules

Build the recipe quantities exactly as today, then classify each recipe ingredient against the
active pantry:

### Matched + In stock

- Remove it from the active buy list.
- Put it in a collapsible section titled **Already in [pantry name]** with an item count.
- Show the ingredient name, required quantity/unit when available, and an **In stock** badge.
- This section is informational and does not use shopping checkboxes.
- Default it collapsed to keep the phone shopping experience focused, but keep its header/count
  visible. Its expanded/collapsed state can be device-local UI state.

### Matched + Low or Out

- Keep it as something to buy under **Pantry needs**.
- Show **Low** or **Out** visibly and retain the recipe's required quantity/unit when possible.
- If the pantry item is also a general pantry need, render one row only. Do not show it again in a
  normal recipe category.
- If several selected recipes need the same name/unit, preserve today's quantity-combining rules.
  If the same pantry item is required in incompatible units, show the requirements clearly without
  inventing a conversion.
- Checking the row restocks that item in the pantry that produced the row (In stock, not Low).
  If it is used by a selected recipe, it then moves to **Already in [pantry name]**; otherwise it
  disappears from the Shopping list.

### Not present in the active pantry

- Keep it in the normal Produce / Protein / Dairy / Bakery & Grains / Other buy categories.
- Preserve quantity combining, serving scaling, alphabetical sorting and normal checkbox behaviour.

### Pantry need not used by a selected recipe

- Preserve today's behaviour: Low/Out pantry items still appear once under **Pantry needs** so the
  pantry can be replenished independently of this week's recipes.

### Counts and empty states

- The Shopping count badge and Home Shopping count represent items still to buy only. Do not count
  rows in **Already in [pantry name]**.
- If everything required is stocked, say **Everything needed is already in [pantry name]** and
  still show the expandable stocked section.
- If there are no recipes/manual items and no pantry needs, keep a sensible “Nothing to buy” state.

Keep recipe items, manual items and pantry needs deduplicated by explicit source-aware logic. Do not
hide a manual item merely because its name matches a pantry item.

---

## Other callers and system integration

Re-grep and update every caller affected by the changed data and computed-list shapes:

- Firebase pantry sync callback must normalise/migrate incoming legacy or versioned data and then
  render the active views without a listener loop.
- Home Kitchen card must use the active pantry name/status and count only actual buy items.
- The AI Kitchen snapshot/context must identify the active pantry and report its items/statuses.
  It must not mistake stocked informational rows for shopping items.
- Backup export/restore must continue to cover all pantry locations through the existing registered
  `kitchen_pantry` blob. Restore remains authoritative under the existing timestamp rules.
- Pantry restock handlers must carry enough pantry identity that a stale row cannot mutate a
  different location after the user switches pantries.
- Existing recipes, selected recipe servings, manual shopping entries, category filters and all
  non-Kitchen features must remain intact.

Update `CLAUDE.md` and the relevant factual sections of `AGENTS.md` so the new schema, migration,
matching rules and multi-pantry behaviour are documented for the next coding agent. Remove or amend
comments that claim the pantry store is still the old `{inStock, runningLow}` item map.

---

## Visual and accessibility requirements

- Design phone-first and verify the current desktop Kitchen layout as well.
- Use existing colour tokens, typography, card vocabulary and button patterns.
- Pantry switching and management controls must work in light and dark themes.
- Interactive controls need clear labels, focus states and at least a 44px practical touch target.
- Management actions must be real buttons; menus/dialogs must be keyboard reachable and must not
  leave focus trapped or behind a closed overlay.
- Avoid sticky-header collisions with the existing Shopping/Pantry headers and mobile navigation.
- Do not regress the fixed Shopping manual-add bar or safe-area behaviour.

---

## Data-safety and release requirements

- Do not weaken `database.rules.json`.
- Do not add a second hard-coded sync registry.
- Do not wholesale-replace cloud pantry data during an ordinary sync.
- Do not use a raw current timestamp for boot seeding or migration.
- Preserve unrelated working-tree changes.
- Because this changes `js/app.js` and CSS, bump `CACHE_NAME` in `service-worker.js` to the next
  unused version and update its version comment after the implementation is complete.
- Run syntax/static checks available in this no-build repo and serve it over HTTP for browser
  verification. `file://` is not a valid test environment.

---

## Verification checklist

### Existing-data migration and sync safety

1. Start with a legacy `kitchen_pantry` object containing a mix of In stock, Low, Out and custom
   items. Load the app: exactly one pantry named **Home** appears and every item/status is preserved.
2. Reload again: migration is not repeated, IDs remain stable and no duplicate items appear.
3. Test a fresh/no-local-data profile signing into an account whose cloud still contains the legacy
   pantry shape. Cloud data wins over boot defaults, then migrates without being reset.
4. Test a fresh account with no pantry data: one seeded **Home** pantry appears with today's default
   items/statuses.
5. Refresh and, if credentials are available, round-trip through Firebase/backup restore: all pantry
   names, order, items, statuses and the active pantry survive.

### Pantry management

6. Create **Mum's house** using Start empty. It contains no assumed stock; Home is unchanged.
7. Add Salt as In stock and Olive oil as Low to Mum's house. Switch to Home and back: inventories do
   not mix and both statuses persist.
8. Create **Dad's house** by copying Home. Change one item at Dad's house and confirm Home does not
   change.
9. Rename Dad's house. The name changes everywhere, while its ID, contents and shopping context stay
   intact.
10. Attempt a blank or case-insensitive duplicate pantry name: saving is blocked with a clear error.
11. Delete Mum's house after confirmation. Only Mum's inventory and its namespaced checked state are
    removed. Recipes, manual shopping items, Home and Dad's house remain.
12. Attempt to delete the final remaining pantry: the app refuses and explains why.

### Shopping integration

13. Select a recipe containing a tracked Home ingredient marked In stock. It is absent from buy
    categories and appears once under collapsed **Already in Home**, with quantity and In stock.
14. Mark that item Low: it moves to **Pantry needs**, displays Low and appears exactly once.
15. Mark it Out: it remains exactly once, displays Out and retains the useful recipe quantity.
16. Check that Pantry-needs row: it becomes In stock in the correct pantry and moves to Already in
    Home if still required by the recipe.
17. Use a recipe ingredient not listed in Home, including something formerly hard-coded in
    `PANTRY_STAPLES` such as garlic/onion. It remains in the normal buy categories.
18. Add that ingredient to Home as In stock. The generated list recomputes and moves it to Already.
19. Confirm aliases: `Paprika` matches `Paprika (ground)` and `mayo` matches `Mayonnaise`.
20. Confirm conservative matching: `onion` does not match `spring onion`, and ground coriander does
    not consume coriander leaves.
21. A Low/Out pantry item not used by any selected recipe still appears once in Pantry needs.
22. A manually added shopping item remains visible even if an identically named pantry item is In
    stock.
23. Switch Shopping from Home to Mum's house: the same selected recipes/servings remain, but rows
    immediately reclassify against Mum's inventory. Checked recipe rows do not leak between locations.
24. With every recipe ingredient stocked, the buy count is zero, the empty message names the active
    pantry and the stocked section remains expandable.
25. Home's Kitchen card and AI context count only things to buy and use the currently active pantry.

### Regression and presentation

26. Recipe selection, serving scaling, cross-recipe quantity combining, different-unit separation,
    manual add/delete, Clear checked and Clear all still work.
27. Pantry search, All/Stocked/Low/Out filters, category filters, collapse controls, custom add/delete
    and three-state status cycling work independently in every pantry.
28. Check 375px phone width in light and dark themes: location controls fit, touch targets are usable,
    the stocked section expands cleanly and sticky headers/manual-add bar do not overlap.
29. Check desktop at 1024px or wider: Pantry and Shopping retain the established desktop layout and
    switching/managing locations does not create awkward empty columns or clipped menus.
30. Reload with the console open: no load, render, sync-listener or service-worker errors. Confirm the
    service-worker cache version was bumped once for this release.
