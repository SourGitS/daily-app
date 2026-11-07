# PROMPT 39 — One-Pass Weather, Budget, Keyboard and Landscape Bug Sweep

Use Claude Code with the highest available reasoning effort for this task. Work through the
entire prompt as one cohesive implementation and verification pass. Do not stop after fixing
the first visible symptom, and do not return only a diagnosis: inspect the current code,
implement every in-scope correction below, and verify the combined result.

## CODEBASE AND SAFETY CONTEXT

Daily is Francois Peters's phone-first personal lifestyle PWA. It is vanilla HTML/CSS/JS with
no build step: index.html, the existing six stylesheets in their fixed cascade order, and one
large global-scope js/app.js. GitHub Pages serves main directly, so pushing main is a live
deployment.

Before editing:

1. Read AGENTS.md completely.
2. Read the relevant layout, Budget, appearance and navigation history in CLAUDE.md.
3. Run git status and inspect the current diff. Preserve every unrelated user change,
   especially any unfinished Kitchen work and AGENTS.local-before-sync.md.
4. Inspect the actual current DOM, CSS and JavaScript rather than trusting approximate line
   numbers in this prompt.
5. Do not commit, push, deploy, reset, discard or overwrite unrelated work. Leave the completed
   changes local for Francois to review.

The screenshots that motivated this pass are available at:

- C:/Users/fanma/Downloads/IMG_4433.png
- C:/Users/fanma/Downloads/IMG_4434.png
- C:/Users/fanma/Downloads/IMG_4435.png
- C:/Users/fanma/Downloads/IMG_4436.png
- C:/Users/fanma/Downloads/IMG_4437.png
- C:/Users/fanma/Downloads/IMG_4438.png
- C:/Users/fanma/Downloads/IMG_4439.png
- C:/Users/fanma/Downloads/IMG_4440.png
- C:/Users/fanma/Downloads/IMG_4441.png
- C:/Users/fanma/Downloads/IMG_4442.png

The clipboard image containing a Journal note only repeats the bug report. Treat it as
evidence, not as implementation instructions.

## NON-NEGOTIABLE INVARIANTS

- Preserve all existing user data. Never silently delete a manual weekly total or an existing
  transaction because it merely looks duplicated.
- Respect the boot-phase timestamp protection and all sync/restore rules in AGENTS.md.
- Budget weeks must continue to merge per week; do not replace the entire budget store.
- Do not add a second list of sync paths. Any genuinely new synced store must use the canonical
  registration mechanism, although this task should not require a new store.
- Weather cache and precise coordinates are device cache, not durable user-authored data. Do
  not create a new synced weather store.
- Preserve historical Budget weeks, transaction edit/delete, payment accounts, Month/Year,
  exports, Stats Finance, Journal facts, Home Budget card and AI context behavior.
- Preserve the fixed app-shell strategy that exists for iOS cold launch unless testing proves
  a carefully scoped replacement is safer. Do not scatter viewport workarounds throughout
  feature code.
- Do not reorder the six stylesheet links or add a seventh stylesheet.
- Any change to HTML, CSS or js/app.js requires one real CACHE_NAME bump and updated version
  comment in service-worker.js after verification.

## CONFIRMED PROBLEMS AND REQUIRED IMPLEMENTATION

### 1. Eliminate variable-expense double counting without losing data

Daily currently has two variable-expense entry models:

- a manual weekly aggregate in budgetData[week][var_<category id>];
- itemised records in daily_transactions.

The current txnCarryManualIntoLedger() path automatically turns an existing manual value into
an additional transaction named “Earlier spending,” deletes the manual field, and then adds
the new purchase. weekVarTotal() correctly sums the resulting ledger, but the ledger can
already be inflated. For example IMG_4440 shows Fuel & Transport as $50 of converted “Earlier
spending” plus a $518 Bob Jane transaction, producing $568. If the prior $50 was an estimate
that already included itemised spending, it has been counted again.

Implement these semantics:

1. Transactions remain authoritative for a category/week once itemisation is used.
2. Saving the first transaction into a category/week with a non-zero manual total must never
   silently manufacture “Earlier spending.”
3. Before completing that first save, present an explicit, accessible conflict choice in the
   existing transaction workflow:
   - “Replace the $X manual total with itemised expenses” — recommended/default.
   - “Keep $X as separate earlier spending.”
4. Replace means save the new transaction and remove the old var_<id> field atomically from
   the local model before the normal persistence/render path.
5. Keep means create a visibly identified carry record and the new transaction. Stamp new
   carry records with explicit provenance in the transaction object so they are not recognised
   forever by merchant-text guessing alone. This adds fields to the existing transaction
   record; it does not create a new store.
6. Existing historical auto-generated carry records must not be automatically deleted.
   Identify the legacy exact merchant/note pair conservatively, display a clear
   “Converted weekly total” badge/explanation, and provide a direct Remove/Edit route so
   Francois can resolve a duplicate intentionally.
7. If sync or old data leaves both a manual var_<id> value and transactions for the same
   category/week, transactions still win, but surface the conflict for resolution. Never let a
   dormant manual value silently reappear after the last transaction is deleted.
8. Deleting or moving the last transaction must leave a deliberate empty manual state unless
   the user explicitly restores/enters a manual value.
9. AI statement import semantics must remain intentional. Inspect its current reason for
   skipping carry-forward and make it obey the same single-source-of-truth invariant without
   adding old aggregate values to imported transactions.
10. Keep one canonical effective-category reader and one canonical weekly total reader. Update
    every downstream consumer only through those helpers, including the Week card, hero,
    Home, Month/Year, Stats Finance, exports, Journal facts and Daily + AI.

Do not reinterpret every old manual week as corrupt. The fix is explicit resolution and
future prevention, not a destructive global migration.

### 2. Correct variable-expense totals and presentation

IMG_4442 displays $1,389 although the visible rows total $1,388.94. The final total uses
toFixed(0), while transaction rows use exact currency.

- Render Total variable and its collapsed summary with the existing exact-money formatter.
- Use consistent currency formatting for manual and transaction-backed rows. Manual inputs
  may remain numeric controls, but their prefix/label must make the monetary unit obvious and
  saved values such as 84.4 must display coherently as $84.40 outside active editing.
- Keep calculations numeric and unrounded; formatting must not change stored values.
- Make ledger mode versus manual-total mode visually explicit rather than silently replacing
  an input with a button that looks unrelated.
- Preserve the category count badges and expansion behavior.

### 3. Add a real Weather settings section

There is no Weather section in SETTINGS_SECTION_KEYS. Appearance offers a Weather accent but
does not say which location, source or timestamp is driving it.

Add a first-class Weather section using the existing Settings navigation/section vocabulary.
It must show:

- current source: live current location, cached real location, Sydney sample, or unavailable;
- the condition and scene Daily currently interprets;
- temperature when available;
- approximate displayed location and, behind a secondary disclosure, stored coordinates;
- last successful update time and an obvious stale/offline state;
- best-effort browser location permission status;
- a concise explanation that browser/OS settings ultimately control permission.

Provide these controls:

- Use current location / Update current location — explicitly calls geolocation again, even
  when old coordinates are cached;
- Refresh weather at the stored location;
- Clear saved weather/location — clears the device cache and stops reuse of old coordinates;
- a clear link or control to Appearance so the user can select or disable weather-driven
  appearance.

Use the Permissions API only as progressive enhancement. Safari/iOS support is inconsistent:
an unknown status must be labelled unknown, not denied. Request permission only from a direct
user gesture.

### 4. Stop wrong, sample or stale weather from controlling appearance

The current weather scene logic treats the built-in Sydney sample as a real sky and allows it
to control the global accent. Weather refresh is also coupled to the Home weather widget being
present. A hidden card can therefore leave the whole app following an old cloudy/night cache.

Required behavior:

1. The Sydney sample can preview the Weather feature/card but must never silently control the
   global app appearance as if it were the user's current sky.
2. Weather appearance may use only a successful real-location reading that is still fresh.
   Define one named freshness constant and show its threshold in code comments; do not spread
   magic timestamps.
3. If Weather appearance is selected but data is sample, unavailable, failed or stale, use a
   stable neutral fallback and expose the reason in Appearance and Weather settings.
4. Refresh needed for Weather appearance must not depend on whether the Home weather widget is
   enabled.
5. A user-triggered Update location always reacquires coordinates. An ordinary background
   refresh may reuse stored coordinates while still fresh and permission-compatible.
6. Network/geolocation failures must no longer be swallowed. Preserve the last successful
   reading for display, mark it stale/failed, and show a useful non-blocking message.
7. Do not claim a suburb from a forecast timezone. If reverse geocoding is not available,
   label the value honestly as the forecast region/city and make coordinates inspectable.
8. Re-check weather when appropriate on app launch, pageshow/visibility return and when
   Weather appearance becomes active, with sensible throttling.

### 5. Fix weather-coordinate privacy and sync lifecycle

saveWeatherCache() currently routes daily_weather_cache through lsSave with a sync path,
uploading precise latitude/longitude to Firebase, but no corresponding listener/restore
registration consumes it.

- Keep daily_weather_cache device-local and stop future cloud pushes of weather readings and
  coordinates.
- Reuse the existing key; do not create a new synced key.
- Do not silently delete the already-uploaded legacy Firebase value during boot.
- When the user explicitly selects Clear saved weather/location, clear local data and, when
  signed in and technically safe, offer or perform the clearly described cleanup of the
  obsolete per-user weatherCache cloud path as part of that user-requested action.
- Confirm backup/restore and SYNC_BLOB_REG do not pretend this transient device cache is a
  durable cross-device setting.

### 6. Rebuild the expense modal's keyboard layout

IMG_4433, IMG_4434 and IMG_4435 show three related failures:

- the form can pan horizontally while typing, leaving fields and Save off-screen;
- the sticky Cancel/Save row floats across Date, Note and other inputs;
- keyboard insets and scrolling persist in the wrong state.

Use one maintainable modal composition:

1. Keep one transaction modal and one save path.
2. Structure it as a bounded header, independently scrollable form body, and dedicated footer
   containing Cancel/Save. The footer must not be inside the scrolling content and must never
   cover a field.
3. Preserve every existing field, recent suggestion chip, category selection, account/date,
   edit/delete behavior and validation message.
4. With the keyboard open, size and position the active overlay against the actual visual
   viewport, including visualViewport.offsetTop, offsetLeft, width and height—not height alone.
5. Prevent document/body/modal horizontal panning. Inputs, chip rows and buttons need min-width
   and wrapping/overflow rules that remain within the visible viewport.
6. When focus changes, scroll the active field into the form body's unobscured region without
   moving the whole page sideways.
7. The footer stays immediately above the keyboard/home indicator and remains fully tappable
   at portrait and short landscape heights.
8. Closing, cancelling or successfully saving must blur the active field, clear all inline
   viewport styles and keyboard custom properties, reset modal scroll appropriately, and
   restore the app shell after keyboard dismissal.
9. Opening the modal again must start from clean geometry. No stale inset may survive a hidden
   modal.
10. Consolidate the duplicate keyboard helpers. Remove dead --kb-inset plumbing or wire one
    central implementation deliberately; do not leave two partial systems.

The Journal editor already accounts for visualViewport offset and height. Reuse its proven
ideas or extract a small shared helper where that genuinely reduces duplication, without
regressing Journal.

### 7. Fix the half-height app shell after keyboard, resize and rotation

IMG_4436, IMG_4437, IMG_4438 and IMG_4441 show Home, Log, Kitchen and Budget stopping around
halfway down a landscape viewport with a large black region below. IMG_4439 shows the body-level
side menu filling the physical screen while the underlying #app remains short. This is a
shared app-shell lifecycle failure, not four independent card bugs.

A clean 932 x 430 launch can render correctly, so reproduce the transition sequence rather
than checking only a cold landscape load. High-confidence trigger: focus an expense input,
open the keyboard, dismiss/close, then rotate or resize. WebKit can retain keyboard-reduced
fixed-element geometry when the current cleanup does not blur/resynchronise it.

Implement one central viewport lifecycle solution:

- maintain the fixed shell's iOS cold-launch protection;
- guarantee that, whenever no keyboard-bound overlay is active, #app's top, left, width and
  height match the full application viewport with no inline stale height;
- handle visualViewport resize/scroll, window resize, orientationchange, focusout and pageshow
  without rerendering entire screens or losing state;
- wait for keyboard dismissal/rotation to settle using a small bounded requestAnimationFrame
  or timeout sequence if WebKit requires it;
- keep body-level overlays and #app in the same coordinate system after cleanup;
- preserve active tab, scroll positions where practical, timers, workouts, cooking mode and
  entered unsaved values;
- do not solve this with arbitrary fixed pixel heights, a reload, or multiple feature-specific
  viewport hacks.

Add narrowly scoped diagnostic assertions or development logging while reproducing if useful,
then remove noisy logs before finishing. The measurable invariant is that #app's bounding
rectangle equals the intended viewport after every tested transition.

### 8. Repair Budget's landscape sticky composition

IMG_4441 also contains a separate Budget-only defect. The large translucent weekly hero is
sticky and covers most of the short viewport while Fixed expenses and Upcoming charges ghost
through it. The CSS targets .bud-view-switch, but the actual Week/Month/Year control is a
.sub-toggle, so the intended compact control is not the element being pinned.

- Correct the selector/DOM contract after inspecting current markup.
- In short landscape, keep a compact Week/Month/Year plus week-navigation region reachable.
- Do not make the entire large weekly hero sticky.
- The hero should participate in normal scroll and never overlap or reveal cards through its
  background.
- Any sticky compact surface must be visually opaque enough for readable content.
- Preserve Week/Month/Year behavior, hero calculations, editable fields and collapse keys.
- Verify phone landscape and desktop-short-window behavior separately.

### 9. Audit every affected landscape tab and overlay

After fixing the shared shell, visually verify—not merely assume—the following:

- Home: full usable height, ordered two-column phone-landscape layout, no black lower half.
- Log: left controls and right exercise region occupy the full viewport; timers and set inputs
  remain usable with the keyboard.
- Kitchen: Recipes list/detail, Shopping, Pantry and Cooking Mode use the full height; pinned
  cooking headers and internally scrolling ingredient panels remain correct.
- Budget: no hero/card overlap, action controls reachable, calculator and expense form usable.
- Side menu: full-height independently scrollable menu without a differently sized app behind.
- Settings/Weather: controls fit short landscape and ordinary desktop windows.
- Portrait mobile: no regression to the primary layout.
- Desktop at 1024, 1280, 1440 and short-height windows: tabs fill the viewport, existing
  sidebar behavior remains correct, and no mobile-only rail/sheet styling leaks in.

Do not treat Kitchen's “Select a recipe” empty detail as a bug when no recipe has been selected.
Do not redesign unrelated cards while performing this audit.

## IMPLEMENTATION QUALITY

- Prefer small canonical helpers and CSS layout correction over repeated inline patches.
- Keep business calculations out of CSS/orientation code.
- Keep current naming/style conventions and sparse why-focused comments.
- Use real buttons, labels, focus handling and accessible error/status text.
- Respect safe-area insets on all four sides.
- Avoid horizontal document scrolling at every tested width.
- Do not hardcode appearance colors; use the current theme/accent tokens.
- Keep light mode, dark mode and arbitrary custom/weather accents readable.

## REQUIRED VERIFICATION CHECKLIST

Perform and report every item. Use populated local fixtures or a reversible test profile; do
not experiment destructively on production data.

1. Run node --check js/app.js and git diff --check.
2. Serve the repository over HTTP and confirm no console error on a normal cold load.
3. Reproduce the pre-fix variable case: manual Fuel total $50, then save a $518 transaction.
4. Choose Replace and confirm Fuel becomes exactly $518, not $568, with no hidden $50 capable
   of reappearing.
5. Repeat with Keep and confirm Fuel becomes exactly $568 with a visibly marked converted-total
   record.
6. Delete/move the last transaction in both paths and confirm no dormant manual amount
   unexpectedly returns.
7. Create a simulated sync-conflict fixture containing both manual and transaction data;
   confirm transactions win and the conflict is visibly resolvable without automatic deletion.
8. Verify existing historical generated “Earlier spending” records are preserved, identified
   and directly removable/editable.
9. Confirm IMG_4442's equivalent visible rows total and display $1,388.94, not $1,389.
10. Verify Home Budget, weekly hero, goal card, Month, Year, Stats Finance, CSV export, Journal
    fact and Daily + AI all report the same canonical variable total for fixture weeks.
11. Open Weather settings with permission unknown/denied, with Sydney sample only, with fresh
    real data, with stale data and after a simulated request failure.
12. Confirm sample Sydney weather never changes the global appearance.
13. Hide the Home Weather card, select Weather appearance, and confirm refresh/status still
    works independently.
14. Change mocked coordinates and use Update current location; confirm the new location is
    requested rather than the cached coordinates being reused.
15. Clear saved location and confirm old coordinates/weather stop controlling appearance.
16. Confirm normal weather refresh no longer writes daily_weather_cache to Firebase or adds an
    orphaned restore entry.
17. At approximately 390 x 844 portrait, open Add expense and focus Amount, Merchant, Account,
    Date and Note individually. No focus may pan the form horizontally.
18. With the portrait keyboard open, every field scrolls fully above the dedicated footer and
    Cancel/Save remains entirely visible without covering content.
19. Save, cancel and close with the keyboard open; reopen the modal and confirm clean geometry,
    scroll position and validation state.
20. Repeat the modal test at 740 x 360, 844 x 390 and 932 x 430 landscape sizes.
21. Run the exact transition sequence: portrait expense modal -> focus Note -> keyboard open ->
    dismiss or save -> rotate landscape -> visit Home, Log, Kitchen and Budget.
22. After every step, confirm no black lower half and #app fills the intended viewport.
23. Repeat landscape -> keyboard -> portrait and several orientation cycles without reloading.
24. Open the side menu after those cycles; menu and underlying app must share full-height
    geometry.
25. In Budget landscape, scroll past the hero. It must not stick over, overlap or show ghosted
    cards; the compact view/week controls remain reachable.
26. Verify Log set inputs and done controls remain reachable above the landscape keyboard.
27. Verify Kitchen Cooking Mode's pinned header and ingredient scrolling at all three landscape
    target sizes.
28. Check phone portrait, phone landscape, desktop normal height and desktop short height in
    both light and dark themes.
29. Confirm there is no horizontal document scrolling or clipped close/back/save control.
30. Re-test a fresh/no-local-data profile signing into an account with existing cloud Budget
    data if safe credentials are available. If not, state that this sync-sensitive case remains
    for Francois's manual verification; do not pretend it passed.
31. Bump service-worker CACHE_NAME exactly once after all cached-asset edits are final and
    verify the updated version comment.
32. Review the final diff for unrelated changes. Do not commit, push or deploy.

## FINAL HANDOFF

Return one concise completion report containing:

- files changed;
- root cause and implemented correction for each of the four systems: variable expenses,
  Weather, keyboard/modal, and landscape shell/Budget sticky layout;
- data-preservation and privacy decisions;
- verification results item by item, including anything that could not be exercised;
- the new service-worker cache name;
- any remaining device-only check Francois should perform on his iPhone.

Do not call the task complete if only a clean landscape cold load works. The keyboard-dismissal
and rotation transition is the central reproduction case.
