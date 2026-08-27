# PROMPT 29 — Design and Implement a Real Mobile Landscape Mode

## CODEBASE CONTEXT

Daily is a phone-first personal lifestyle PWA: Home, Log, Budget and Kitchen are the four
bottom-nav destinations; Stats, Accounts, Plans, Notes, Exercise Library and Settings are
also full screens. It is vanilla HTML/CSS/JS with no framework or build step. `index.html`
loads the six existing stylesheets in their current order and all behaviour lives in
`js/app.js`.

Landscape phone use is currently blocked rather than supported:

- `index.html` contains `#rotate-overlay`, a full-screen “Rotate your phone” placeholder.
- `checkOrientation()` near the bottom of `js/app.js` displays that overlay whenever width is
  greater than height and width is below 1024px.
- `manifest.json` declares `"orientation": "portrait"`.

This task replaces that block with a deliberately designed landscape-phone layout. Do not
just remove the overlay and call the exposed portrait layout finished.

Read `AGENTS.md` and the relevant layout history in `CLAUDE.md` before editing. Inspect the
actual DOM and CSS for every screen named below; these files have drifted before, so do not
design from this prompt alone when the implementation says otherwise.

## DESIGN INTENT

Landscape mode is useful when the phone is on a gym bench, kitchen counter, stand, or car
mount. Its scarce resource is vertical height, not horizontal width. It should feel like a
compact control surface: shorter chrome, important controls always reachable, and content
using the extra width without pretending the phone is a desktop monitor.

The target is a polished dark-first landscape layout at roughly:

- 740 × 360 — small/older phone
- 844 × 390 — common iPhone landscape
- 932 × 430 — large modern phone

Portrait phone remains the primary layout and must not visually change. Desktop at ≥1024px
must also remain unchanged.

## TASK

### 1. Remove the portrait-only enforcement completely

- Remove `#rotate-overlay` from `index.html`.
- Remove `checkOrientation()` and its resize/orientation listeners from `js/app.js`.
- Remove the forced `"orientation": "portrait"` manifest setting (use a standards-valid
  unrestricted value if required, otherwise omit the property).
- Do not replace it with a different warning, interstitial or reduced-function placeholder.

### 2. Create one explicit landscape-phone breakpoint

Use a targeted landscape-phone media query, not loose width inference. The intended scope is
equivalent to:

```css
@media (orientation: landscape) and (max-width: 1023px) and (max-height: 600px) { ... }
```

Put shared shell/navigation rules in the appropriate existing stylesheet. Put feature rules
with their existing feature CSS. Do not add a seventh stylesheet and do not reorder the six
links in `index.html`.

Avoid `100dvh` on `#app`: the fixed `position:fixed; inset:0` shell is a deliberate iOS cold-
launch fix. Continue using that shell and account for `env(safe-area-inset-left/right/bottom)`
where landscape introduces side insets.

### 3. Replace the bottom bar with a compact left navigation rail in landscape

The four primary destinations should become a narrow fixed rail down the left side:

- Home
- Budget
- Log
- Kitchen

Use the existing icons and buttons; do not duplicate navigation markup. Labels may remain in
small type if they fit cleanly, but icons must remain immediately recognisable. Preserve nav
badges. The rail must respect the left safe area and must not trigger the ≥1024px desktop
sidebar.

The ordinary app header should become shorter in landscape, while Profile and the hamburger
menu remain available. Main content must use the space to the right of the rail and below the
compact header without horizontal page scrolling.

### 4. Give each primary screen an intentional landscape composition

#### Home

- Use exactly two columns, never masonry, `column-count`, auto-fit or a third column.
- Preserve the saved card order and per-card wide setting; a wide card spans both columns.
- Keep `align-items:stretch` so row gaps do not return.
- Reduce excessive top/bottom padding, but do not shrink real type below the current readable
  phone scale.
- Each column must scroll as part of the normal page order; do not create two independently
  scrolling columns that make card order ambiguous.

#### Log — highest-priority landscape screen

This mode will genuinely be used with the phone resting sideways during a workout.

- Use a two-region layout: a compact left control column for the day hero, workout progress,
  session/rest timer and exercise jump list; the exercise cards occupy the wider right region.
- Only the exercise region should carry the long vertical scroll. The core timer controls
  should remain visible while moving between sets.
- Keep weight, reps, warm-up and done controls comfortably tappable. Do not achieve fit by
  making inputs tiny.
- Preserve the explicit Start workout control, the flat Start rest/Pause rest control,
  automatic rest timing, active-exercise treatment, auto-collapse, drag-reordering edit mode,
  swaps, session-only badges and save/partial-session behaviour.
- Ensure the on-screen keyboard does not cover the active set row. Existing keyboard-aware
  modal handling is not proof that ordinary set inputs are safe—test them.
- The fullscreen rest timer must itself have a purposeful landscape composition, with the
  primary time and controls visible without scrolling.

#### Budget

- Keep Week/Month/Year switching and week navigation visible in a compact header region.
- Use the extra width to pair related cards where it genuinely reduces vertical travel, but
  preserve DOM order and collapse behaviour keyed by `data-bud-key`.
- Do not create masonry or reorder cards visually away from their DOM order.
- The calculator, editable fields and number keyboard workflow must remain usable at 360px
  landscape height.

#### Kitchen

- Keep Recipes, Shopping and Pantry as the existing three sub-areas.
- Recipe browsing may use a compact list/detail split only when it leaves a usable reading
  width; mobile recipe detail must still have a clear back path.
- Shopping and Pantry should use horizontal space for density without turning checkbox/status
  targets into small desktop rows.
- Cooking Mode needs its own landscape treatment: current step text, ingredient panel/toggle,
  timer and Next/Previous controls must all remain legible at arm's length. Keep the header
  pinned and constrain internal ingredient scrolling as intended by the current implementation.

### 5. Support every secondary/overlay screen

Audit Stats, Accounts, Plans, Notes, Exercise Library, Settings, recipe forms/import, training
split editor, exercise detail, modals, side menu and onboarding.

For these screens, a consistent compact landscape shell is more important than inventing a
unique layout for each. Requirements:

- sticky/detail headers do not double-apply safe-area padding;
- modal sheets fit within the short viewport and their action buttons remain reachable;
- charts receive a real height rather than collapsing or becoming excessively tall;
- the new Accounts net-worth graph remains readable, including its 1M/3M/1Y/ALL controls and
  series toggles;
- the side menu is fully usable and independently scrollable;
- textareas and inputs can be focused without trapping content behind the keyboard;
- no close/back control sits underneath a notch or home indicator.

### 6. Keep the implementation maintainable

- Prefer CSS responsive composition and the existing DOM over parallel landscape markup.
- If JavaScript must react to the breakpoint, use `matchMedia` and one clear helper rather
  than scattered `innerWidth > innerHeight` checks.
- Do not derive business state from orientation.
- Orientation changes must preserve the current tab, scroll position where practical, entered
  set/budget/form values, running timers and open cooking session.
- Do not rerender whole screens merely because the phone rotates unless the existing component
  genuinely requires a measured redraw (for example Chart.js). If charts need it, resize or
  rerender only those charts.
- No new localStorage key should be necessary. If one becomes necessary, follow the sync and
  restore-registration rules in `AGENTS.md`.

### 7. Visual language

- Dark-first warm-black/glass-card system remains intact; light mode must work.
- The runtime accent can be any hue. Use `--accent` for controls/surfaces and `--accent-text`
  for coloured text/icons on the background.
- Do not hardcode a landscape-only accent.
- Avoid cramming. More horizontal space should produce better grouping, not more simultaneous
  information.
- Do not introduce desktop hover-dependent interactions on a touch phone.

### 8. PWA release requirement

This changes `index.html`, CSS, JS and `manifest.json`, all of which are cached. Bump
`CACHE_NAME` in `service-worker.js` and update its version comment. Do not push or deploy
unless explicitly asked; finish with the changes locally testable first.

## VERIFICATION CHECKLIST

1. At 390 × 844 portrait, Home, Log, Budget and Kitchen look unchanged from before this task.
2. Rotate to 844 × 390: no “Rotate your phone” overlay appears and the app remains on the same
   screen with entered state intact.
3. Landscape uses the compact four-item left rail; Home/Budget/Log/Kitchen navigation and
   notification badges still work.
4. Profile and hamburger menu remain reachable without touching a notch/safe-area edge.
5. Home renders exactly two ordered columns; wide cards span both; there is no masonry, third
   column, overlap or horizontal page scroll.
6. Log shows its day/progress/timers in the compact left control region and exercises in the
   wider right region.
7. Start a workout, enter weight/reps, complete a working set and rotate both directions: the
   values, completed state, session time and running rest time all survive.
8. In landscape Log, focus the lowest visible weight and reps inputs with the keyboard open;
   the active row can be scrolled fully above the keyboard and the done control remains usable.
9. Open the fullscreen rest timer in landscape: time, Start/Pause, reset/lap controls and close
   affordance fit without accidental clipping.
10. Budget Week/Month/Year navigation works; edit a field and use the calculator at 740 × 360;
    no card overlap or lost collapse state occurs.
11. Recipe list/detail, Shopping, Pantry and Cooking Mode are usable at all three target sizes;
    Cooking Mode's Next/Previous controls remain large and visible.
12. Stats and Accounts charts resize correctly after rotating repeatedly; the Accounts graph's
    range and Assets/Debts controls remain tappable.
13. Open every major overlay/editor/modal listed in section 5 at 740 × 360. Headers, close/back
    buttons, fields and final action buttons are all reachable.
14. Test dark and light theme in landscape. Text remains readable and no design assumes a fixed
    accent colour.
15. Test 932 × 430 and 740 × 360 as well as 844 × 390. None produces horizontal page scrolling.
16. Return to 1440 × 900 desktop: the persistent desktop sidebar and all existing desktop
    layouts are unchanged.
17. Install/launch behaviour no longer forces portrait through `manifest.json`.
18. Browser console shows no errors during repeated portrait ↔ landscape rotations.
19. `service-worker.js` has a new cache name so installed PWAs receive the landscape release.

