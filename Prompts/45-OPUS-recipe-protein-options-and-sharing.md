# 45 — OPUS — Add protein options and lossless recipe sharing

## Codebase context

Implement this feature in the existing Daily app checkout. Read `AGENTS.md` first, then inspect the current Kitchen, calorie-log, AI Inbox and sync implementations rather than relying on old line numbers. Read the relevant Kitchen and layout sections of `CLAUDE.md`, especially the recipe editor, shopping list, cook mode, pantry matching, mobile overlays and shared card vocabulary.

Daily is a vanilla HTML/CSS/JavaScript PWA with no build step. Preserve all unrelated work already in the checkout, including the multiple-pantry and pantry-aware shopping implementation. Do not commit or push. A push to `main` deploys the live app.

This is a data-preservation-sensitive change:

- `kitchen_recipes` is one timestamped synced blob. Keep it that way; nested protein-option data does not need a new Firebase path.
- `kitchen_shopping_selected` is also already a timestamped synced blob. Extend its entries without creating a second store.
- Do not perform a boot migration that rewrites every existing recipe or gives old data a fresh timestamp. Existing recipes must work through runtime normalisation/resolution without being saved merely because the app opened.
- Any normalisation that genuinely must save during boot must use the existing `lsSave`/`lsSaveTS` path and respect `_bootPhase`/`stampFor()`.
- Do not weaken Firebase rules or create public Firebase reads to support sharing.
- Do not replace a synced store wholesale except through the app's existing explicit restore path.
- Preserve the countable ingredient unit `""`, plus `kg`, `L` and unknown existing units. Re-test the ingredient-unit regression described in `AGENTS.md`.

If implementation changes `js/app.js`, `index.html` or any CSS file, bump the service-worker cache name and version comment as required by `AGENTS.md`.

## Product outcome

Upgrade Daily so a single recipe can support one default protein and any number of alternatives without creating duplicate recipes when the overall dish remains the same.

For example, **Chimichurri Roll** can offer **Rump steak** or **Chicken thigh**. Chimichurri, bread, vegetables and assembly steps remain shared. The selected protein supplies its own quantity, preparation, cooking instruction, cooking time, safe internal temperature and nutrition. Shopping, cooking and meal logging must use only the selected option.

Also add two user-facing sharing paths:

1. **Share recipe** — a human-readable recipe sent through the device's normal share sheet, with a reliable copy fallback.
2. **Copy for Daily** — lossless structured recipe JSON that another Daily user can paste into Kitchen → Recipe Book → Import.

Keep the existing AI recipe workflow useful. Do not confuse human-readable sharing, Daily-to-Daily transfer and the existing AI-oriented copy prompt; each has a clear purpose.

## Product boundaries

- Keep recipes separate when the overall dish, sauce, shared ingredient set, assembly or preparation sequence changes substantially.
- Combine recipes when the dish remains the same and only the protein component and its local handling change.
- Do not build public recipe hosting, share URLs, cross-account reads, collaboration, permissions or a recipe marketplace in this prompt.
- Do not place complete recipe JSON in a URL or URL fragment. Recipe payloads can be too large and would leak into browser history and copied links.
- Do not auto-detect proteins by ingredient-name regex. Existing recipes include eggs, patties, mixed dishes and protein words that cannot be classified safely.
- Do not force recipes without a meaningful protein choice—such as Hash Browns—into the new model.

## 1. Canonical recipe model

Design and implement one explicit variant-capable recipe shape. Exact internal helper names may follow the surrounding code, but preserve these semantics.

### Shared recipe data

The recipe continues to own shared fields such as:

- Stable recipe ID
- Name, emoji, category, description, servings/yield and tags
- Shared ingredients, sauces and garnishes
- Shared method steps
- Favourite, batch-prep, created and last-cooked metadata

For a variant recipe, the main protein ingredients must live in the protein options rather than being duplicated in the shared ingredient list.

### Protein options

A variant recipe has:

- `defaultProteinOptionId`
- `proteinOptions`, containing one or more options with stable IDs

Each option needs:

- Stable ID independent of its editable name
- Display label, such as `Rump steak`
- Main shopping ingredient in the existing `{name, amount, unit}` shape
- Optional small list of option-specific extra ingredients for genuine minor differences, such as cornflour needed only for chicken; do not use this to duplicate shared sauces
- Preparation instruction
- Cooking instruction
- Cooking time in minutes, suitable for the existing timer where appropriate
- Safe internal temperature in °C, nullable when it is genuinely not applicable
- Complete dish nutrition **per serving** for this selected option: calories, protein, carbohydrate and fat

Do not store nutrition as only the raw protein contribution. Store the complete per-serving dish values for each option. Repeating four small values is preferable to deriving nutrition from incomplete ingredient data.

Do not keep a second authoritative copy of the default option's nutrition or cooking fields at the recipe top level. For variant recipes, resolve those values from the selected option. Top-level `cookTime`, `calories`, `protein`, `carbs` and `fat` remain the legacy source only for recipes without `proteinOptions`.

### Shared method and protein slot

Shared method steps must be stored once. Add an explicit protein-step placeholder/slot to the supported step model so the selected option's preparation and cooking instructions appear at the correct point in the method.

For example, a method can conceptually be:

1. Make the chimichurri.
2. Protein slot.
3. Warm the bread.
4. Assemble the roll.

Cook mode and recipe detail resolve the protein slot into only the selected option's protein instructions, timer and temperature. Do not duplicate the complete method inside every option and do not compare strings at render time to guess which instructions differ.

Existing string steps and `{text, timerMinutes}` steps must continue to work unchanged. A legacy recipe does not need a protein slot.

### One resolver for every consumer

Create one central, side-effect-free recipe resolver that accepts a recipe, a protein option ID and a serving count and returns the effective view needed downstream, including:

- Selected/default protein metadata
- Shared ingredients plus only the chosen protein and its option-specific extras
- Scaled ingredient amounts
- Resolved ordered method steps
- Cooking time and internal temperature
- Per-serving nutrition and optional scaled batch totals

Use this same resolver, or small helpers built directly on it, for recipe detail, search/cards where applicable, shopping, pantry classification, cook mode, meal logging, export/AI context and sharing. Do not scatter independent `if (proteinOptions)` calculations throughout those flows.

The resolver must never mutate or save the recipe while reading it.

## 2. Resolve the existing nutrition ambiguity

Daily currently conflicts with itself: the editor says macros are per recipe, import/export says per serving, and detail/logging scale the stored values using the recipe yield.

Standardise recipe nutrition as **per serving**:

- Existing legacy values are treated as per-serving values without rewriting every recipe.
- Label the editor and recipe display clearly as `Per serving`.
- Changing the selected protein changes the per-serving calorie and macro values immediately.
- Changing the recipe's cooking yield scales the selected protein and all shared ingredients.
- Per-serving nutrition remains per serving when the cooking yield changes.
- If batch totals are useful, display them explicitly as `Batch total` rather than replacing or ambiguously scaling the per-serving values.

Meal logging must distinguish **servings cooked** from **servings eaten**:

- The recipe detail serving scaler controls the batch being cooked.
- Logging opens a confirmation/selector that asks for the protein option and number of servings eaten, defaulting sensibly to one serving.
- Logged calories and macros equal the selected option's per-serving values multiplied by servings eaten.
- Do not silently log the full cooking batch merely because the recipe was scaled to four servings.

Extend new calorie-log entries with optional recipe metadata and macro values while preserving old entries:

- Human-readable recipe name snapshot
- `recipeId`
- Selected `proteinOptionId` and protein-label snapshot when applicable
- Servings eaten
- Calories, protein, carbohydrate and fat
- Existing category field

All existing entries containing only name, calories and category must continue to render and calculate correctly. Continue the existing calorie-history behaviour. Do not invent or backfill historical macro totals, and do not expand this prompt into a full historical macro Stats redesign.

## 3. Recipe editor and conversion flow

Add a clear, phone-friendly **Protein options** section to the recipe editor.

- A normal legacy recipe can remain a normal recipe.
- Let the user explicitly enable protein options.
- When enabling them on an existing recipe, ask the user which existing ingredient is the default protein, or allow them to enter it manually. Never guess from the ingredient name.
- Move/copy the chosen ingredient into the first option only after explicit user action and show what will change before saving.
- Provide controls to add, duplicate, reorder and delete alternatives, and to set the default.
- The default option cannot be deleted until another option is selected as default.
- Stable IDs must survive renaming and reordering.
- Make it easy to duplicate the default option and then edit only the differing fields.
- Keep option-specific extra ingredients visually subordinate so users do not accidentally duplicate all shared ingredients.
- Temperature is numeric °C and optional only when not applicable. Never invent a temperature when none was supplied.
- Preserve recipe data if the editor is opened and saved without touching protein controls.

For variant recipes, make the separation visually understandable:

- Shared ingredients and shared method
- Protein choices
- The protein slot's position in the shared method

Do not make users edit raw JSON.

## 4. Recipe book and detail behaviour

Variant-aware recipe cards and detail views must remain easy to scan.

- Recipe cards and the featured recipe use the default protein's cooking time/nutrition when no action-specific option is selected.
- Add a restrained label such as `2 protein options`; do not list every option on every card.
- Recipe search must find a variant recipe by any protein option label or option ingredient name as well as shared ingredients.
- Opening a variant recipe shows a compact protein selector with the default initially selected.
- Changing the selector updates the protein ingredient, any option-specific extras, active protein instructions, cook time, temperature and macros immediately.
- Shared ingredients and shared steps remain visually single-copy.
- Only the active protein's instruction block is shown; do not show every option's method at once.
- Clearly distinguish safe internal temperature from timer duration.
- Hide irrelevant temperature UI when the active option has no applicable value; never show `0°C` or `null`.
- The serving scaler updates the selected protein and shared ingredient quantities together.
- Keep `lastCooked` at recipe level for this prompt; do not create a separate recipe for each option or a large new history system.

Use Daily's established card vocabulary and mobile overlay patterns. Check mobile first, then desktop split-pane behaviour, light and dark themes, and long labels/instructions.

## 5. Shopping-list protein selection

The shopping workflow must carry an explicit protein selection.

- When adding a multi-protein recipe to shopping, show a protein selector with the default preselected.
- Each saved shopping selection contains the stable recipe ID, stable protein option ID and serving count.
- Treat selection identity as the recipe plus protein option, not recipe ID alone.
- Allow the same dish to be planned more than once with different proteins in the same shopping list—for example one Chimichurri Roll with rump and another with chicken.
- Avoid accidental duplicate entries for the same recipe, same protein option and same intent; provide one clear way to adjust servings.
- Legacy saved shopping selections missing `proteinOptionId` continue to work. For a variant recipe they may resolve to the default only because no explicit old choice exists.
- If an explicitly saved option ID no longer exists, do not silently substitute the default. Mark the selection as needing attention and ask the user to choose again.

Shopping item computation must include:

- All shared ingredients at the selected serving scale
- Only the chosen protein ingredient
- Only the chosen option's extra ingredients
- Never any unselected protein option

Feed the resolved ingredients into the existing `kitShopComputePlan()` pantry-aware classification path. Preserve exact-first conservative pantry matching, aliases, low/out/in-stock behaviour, manual-row behaviour, pantry-specific checked state and the stocked disclosure. Do not create a second pantry or shopping classification path for proteins.

When changing a protein option on an existing shopping selection, ensure stale checked state for an item that disappeared does not cause a newly selected item to appear incorrectly checked. Preserve checked state for genuinely unchanged shared ingredients.

## 6. Cook-mode protein selection

Starting cook mode for a multi-protein recipe must confirm the protein choice. The detail view's current selection can prefill the chooser, but the cook action owns and locks its own selected option.

- Store `proteinOptionId` in cook state alongside the recipe ID.
- Once cooking begins, use that locked option for all ingredients, steps, timers, cooking time, temperature and finishing behaviour.
- Display the chosen protein clearly in the cook-mode header or an equivalent persistent location.
- Resolve the protein slot into the selected preparation and cooking instructions only.
- Show the selected safe internal temperature prominently at the relevant protein step, not as an unrelated global decoration.
- The existing timer controls must use the selected protein's timer where applicable.
- `For this step` ingredient matching must include the chosen protein. If the current text-name heuristic cannot represent the explicit protein slot reliably, extend the resolved step with explicit ingredient references rather than adding fuzzy matching.
- Changing recipe selection elsewhere must not alter an in-progress cook session.
- Recipes with no protein options start exactly as they do now, without an unnecessary chooser.

## 7. Meal-log protein selection

Logging a multi-protein recipe must confirm:

- Protein option
- Servings eaten
- Resulting calories and macros before saving

The detail selection can prefill this confirmation, but it must not reuse a shopping-list choice or an unrelated in-progress cooking choice.

Use a readable log name such as `Chimichurri Roll · Chicken thigh`, while also storing the stable IDs and label snapshot separately. Renaming or deleting a recipe later must not rewrite historical log text.

Recipes without variants retain a simple logging flow, with the added servings-eaten clarification if needed to make the corrected per-serving nutrition rule consistent.

## 8. Human-readable sharing

Add a clearly labelled **Share recipe** action to the recipe's action/overflow area.

Build one readable plain-text representation containing:

- Recipe name, description, category and base servings
- Shared ingredients
- All protein options, with the default clearly labelled
- Each option's quantity, preparation, cooking instruction, time, safe temperature and per-serving nutrition
- Shared method steps with the protein-slot relationship expressed understandably
- Tags where useful
- A short `Shared from Daily` footer

Do not expose Firebase IDs, user IDs, sync timestamps or internal implementation metadata in human-readable text.

On devices supporting the native Web Share API, open the system share sheet from the user's direct button gesture. On unsupported devices, rejected shares other than deliberate cancellation, or contexts where sharing is unavailable, provide a reliable clipboard fallback and a clear toast. A user cancelling the native share sheet is not an error and should not trigger a surprise clipboard copy.

The human-readable version is for Messages, email, notes and people who may not use Daily. It does not need to be re-importable and must not contain a huge opaque JSON block.

## 9. Lossless Daily-to-Daily copy

Add a separate **Copy for Daily** action.

- Copy only valid importable JSON, or a JSON code fence that the existing parser accepts directly from the first character.
- Include the complete recipe, shared ingredients/steps, protein slot, every protein option, default option ID, option-specific extras, timers, safe temperatures and per-serving nutrition.
- Do not prepend human instructions that make the paste invalid in Daily's strict importer.
- Show a concise confirmation such as `Recipe copied — paste it into Daily's Import screen`.
- The receiving user pastes it into Kitchen → Recipe Book → Import and gets an independent new recipe with new local stable recipe/option IDs as appropriate. Do not retain IDs in a way that could collide with an existing local recipe.

Preserve the existing **Copy for AI** capability, but make the three purposes unambiguous in labels and generated content:

- Share recipe — human-readable/native share
- Copy for Daily — raw lossless transfer
- Copy for AI — the existing AI briefing/export workflow, upgraded to describe and preserve protein options

If three actions make the phone UI crowded, place them in the existing recipe overflow/action area rather than reducing tap targets or using unclear icons.

## 10. Import, export and AI integration

Extend the strict recipe parser and exporter so old and new shapes round-trip losslessly.

- Existing single-protein/fixed recipes remain valid with their current unversioned shape.
- Variant recipes validate `defaultProteinOptionId`, unique stable option IDs, required option labels/main ingredients, numeric or null nutrition, numeric or null cooking times and safe temperatures, ingredient units and the protein slot.
- Reject a malformed variant recipe with a specific error before applying anything. Never half-import a recipe and never silently discard `proteinOptions` or a protein slot.
- A default ID must resolve to an existing option.
- Preserve `unit:""`, `kg`, `L` and unknown existing units exactly through import, edit, export and re-import.
- The Daily-to-Daily exported payload must re-import with no meaningful data loss.
- The AI-oriented export instructions must explain the variant schema, per-serving nutrition, shared ingredients, option-specific extras and protein slot.
- AI `add_recipe` actions must reuse the same strict parser instead of duplicating validation rules.
- Update the AI Inbox schema guidance for variant recipes.
- Update compact and full Kitchen context so AI can see available protein option labels; full context includes complete option details and properly serialised step objects rather than `[object Object]`.
- When AI returns a new variant recipe, the preview summary should mention the number of protein options.

Do not create a second recipe interchange format for AI. The strict parser remains the single validation path.

## 11. Backward compatibility and failure handling

Every existing recipe must continue to work without an eager rewrite:

- No `proteinOptions`: use current ingredients, steps, cooking time and flat per-serving nutrition.
- Has valid `proteinOptions`: use the central resolver and chosen/default option.
- Has malformed nested option data arriving from an older/newer device: preserve the raw recipe, fail safely in the affected action and show a useful message rather than deleting fields or crashing the Kitchen tab.

Existing recipe IDs, favourites, created dates and last-cooked dates must remain stable. Existing shopping entries, checked rows, manual rows, pantry data, calorie entries, backups and Firebase data must continue to load.

Do not infer or save a default protein for legacy recipes at boot. Conversion is an explicit editor action only.

## 12. Visual and interaction quality

- Use accessible native buttons/selectors or the app's established segmented/chip controls with correct labels and focus states.
- Make the default choice obvious without implying alternatives are unavailable.
- Do not rely on colour alone to indicate the chosen protein.
- Maintain minimum practical phone tap targets and avoid nested click handlers that accidentally toggle the whole shopping recipe while changing an option.
- Long protein labels, long preparation text and recipes with many alternatives must wrap without horizontal scrolling.
- On desktop, keep the recipe list/detail split pane in sync without resetting the selected option on every incidental render.
- On mobile, opening a chooser, editor, import, share or calorie overlay must not place it behind the recipe detail overlay.
- Native-share cancellation, clipboard failure and malformed import errors must leave the recipe and UI state intact.

## Numbered verification checklist

Complete all relevant checks locally before handing the work back. Report anything that cannot be verified rather than claiming it passed.

1. Start the app with the current real recipe data and confirm Kitchen opens with no console errors and no recipe blob is rewritten merely by booting.
2. Open and save an existing fixed recipe without changing anything; confirm every ingredient, string/object step, macro, unit and metadata value remains intact.
3. Specifically open/save recipes containing a countable `unit:""`, `kg`, `L` and an unknown/custom unit; confirm none silently changes to `g` or another dropdown default.
4. Confirm legacy recipes show no protein selector and retain their existing detail, shopping and cook flows.
5. Convert an existing steak-based recipe by explicitly choosing its steak ingredient as the default protein; confirm no ingredient is lost or duplicated.
6. Create **Chimichurri Roll** with Rump steak as default and Chicken thigh as an alternative, shared chimichurri/bread ingredients and shared assembly steps.
7. Give both options distinct quantities, preparation, cooking instructions, cooking times, temperatures and complete per-serving macros; save, close and reopen it.
8. Rename and reorder an option; confirm its stable ID and any saved action selections remain attached to the correct option.
9. Attempt to delete the default option; confirm Daily requires another default rather than leaving invalid data.
10. Add and remove an option-specific extra ingredient; confirm shared ingredients remain single-copy.
11. Put the protein slot between shared sauce and assembly steps; confirm detail and cook mode resolve the selected protein at that exact position.
12. Search for `chicken` and confirm Chimichurri Roll is found even though Rump steak is the default.
13. Switch protein options in recipe detail; confirm ingredient, option extras, cooking time, temperature, protein instructions and per-serving macros all update together.
14. Scale Chimichurri Roll from its base yield to another serving count; confirm the chosen protein and every shared numeric ingredient scale from the same base while per-serving macros remain correctly labelled and stable.
15. If a batch macro total is shown, confirm it scales accurately and is unmistakably labelled `Batch total`.
16. Add the rump version to shopping; confirm chicken and chicken-only extras do not appear anywhere in the computed shopping or pantry-requirement plan.
17. Replace it with chicken; confirm rump disappears and chicken appears with the correct scaled amount.
18. Add both rump and chicken versions of Chimichurri Roll to the same weekly selection; confirm both proteins and shared ingredient totals are correct without duplicating unrelated rows.
19. Test the selected protein against an exact pantry match in stock, low and out; confirm the existing `Already in [pantry]` and `Pantry needs` rules remain correct.
20. Confirm manual shopping rows are never suppressed by a protein/pantry match and pantry-specific checked state does not leak between named pantries.
21. Change an explicitly saved protein option after checking shopping rows; confirm removed-item checked state does not incorrectly check the new protein.
22. Delete a protein option used by a saved shopping selection; confirm the selection asks for attention and does not silently buy the default.
23. Start cook mode with rump selected; confirm the start action explicitly shows/prefills the protein choice and locks rump for the session.
24. In cook mode, confirm only rump preparation/cooking instructions, timer, temperature, ingredient and option extras appear, at the protein slot.
25. Repeat cook mode with chicken and confirm every protein-specific value switches while shared steps appear only once.
26. Change the detail-view selector while cook mode is active, if the UI permits returning to it; confirm the in-progress cook session does not change protein.
27. Log one serving of the rump version; confirm the preview and saved entry use rump's calories/macros and a readable protein label.
28. Log a different number of chicken servings; confirm calories/macros multiply by servings eaten, not by the recipe's batch yield.
29. Confirm old calorie-log entries with only name/kcal/category still render, total and sync without errors.
30. Copy Chimichurri Roll with **Copy for Daily**, paste the result directly into Import and confirm the recipe imports with all options, default, shared data, protein slot, temperatures, timers, units and macros intact.
31. Export the imported recipe again and compare its meaningful recipe data with the source; confirm the round trip is lossless apart from intentionally regenerated local IDs/metadata.
32. Import an existing legacy recipe JSON and confirm it remains a normal fixed recipe.
33. Try malformed variant JSON: missing default option, duplicate option IDs, invalid ingredient, invalid temperature and broken protein slot. Confirm each is rejected specifically and nothing is partially imported.
34. Use **Copy for AI** and confirm the generated instructions and JSON describe all protein options and remain suitable for AI editing/re-import.
35. Inspect AI compact/full Kitchen context and AI `add_recipe`; confirm options are represented and step objects never become `[object Object]`.
36. Use **Share recipe** on a device/browser with native sharing; confirm the readable text contains shared content once, all protein options clearly, no private/internal IDs and a `Shared from Daily` footer.
37. Cancel the native share sheet; confirm Daily does not show an error or unexpectedly overwrite the clipboard.
38. Exercise the no-native-share fallback; confirm the readable recipe is copied and the toast accurately explains what happened.
39. Confirm **Share recipe**, **Copy for Daily** and **Copy for AI** have distinct labels/results and remain reachable on a phone without cramped controls.
40. Test a variant recipe with no applicable internal temperature; confirm no `0°C`, `null` or misleading safety value appears.
41. Test long protein labels, long instructions and at least five alternatives on phone and desktop; confirm wrapping, scrolling, selectors and overlays remain usable.
42. Test Recipe Book, detail, editor, shopping, cook mode, logging and sharing in light and dark themes.
43. Test mobile portrait plus the current supported desktop layout; verify no accidental horizontal scrolling, clipped bottom actions or overlay stacking errors.
44. Verify a fresh/private profile with no local data signing into an account containing legacy and variant cloud recipes. Confirm boot defaults do not outrank cloud data and neither recipe type is lost or downgraded.
45. Verify the updated recipe and shopping blobs sync to a second profile/device without changing stable option selections or dropping nested fields.
46. Export and restore a full Daily backup containing legacy recipes, variant recipes and mixed shopping selections; confirm the restored data remains authoritative under the existing restore timestamp rules.
47. Confirm the service-worker cache name/version was bumped exactly once for the changed cached assets.
48. Reload the locally served app, inspect the console and complete a final smoke test across Home, Kitchen, Shopping, Pantry, calorie logging and AI Inbox before handoff.

## Handoff requirements

At the end, provide:

- A concise summary of the product behaviour implemented
- The final recipe/protein-option and shopping-selection shapes
- How legacy recipes and old calorie/shopping entries remain compatible
- Which sharing paths were added and their fallbacks
- Every file changed
- Verification results against the numbered checklist, including checks not run and why
- Any data, safety-temperature, browser-share or sync limitations that remain

Do not commit, push, deploy, alter Firebase rules or claim unperformed tests passed.
