# Prompt 44 — Independent iPhone and desktop layouts, shared data

## Objective

Rework Daily so its iPhone/mobile and desktop experiences are deliberately designed as two
independent layouts while continuing to use exactly the same underlying user data, calculations,
feature actions, sync and backup.

The phone must not be a narrow desktop screen, and desktop must not be a stretched one-column
phone screen. A layout choice made for one form factor must not unexpectedly rearrange the other.

This is a presentation-architecture project, not a fork into two apps:

```text
Canonical feature data and actions
              ↓
     Shared feature view models
          ↙             ↘
 iPhone composition   Desktop composition
 iPhone preferences   Desktop preferences
```

## Repository context and required reading

You are working in **Daily**, Francois Peters's personal lifestyle PWA.

Before changing anything:

1. Read `AGENTS.md` completely. Its sync, migration, data-preservation and service-worker rules
   are mandatory.
2. Read the navigation, responsive layout, Home grid, Settings, Journal, Kitchen, overlay and
   viewport sections of `CLAUDE.md`.
3. Re-grep the current `index.html`, all CSS files and `js/app.js`. Both documentation files have
   been stale before; current code wins.
4. Inspect `git status` and preserve every unrelated edit or untracked file. Never reset or discard
   the user's work.

Important facts:

- Vanilla HTML/CSS/JS; no build step, bundler, modules or package manager.
- `index.html` loads the existing CSS cascade in a fixed order. Do not reorder those links.
- Most feature logic is global-scope code in `js/app.js`.
- Mobile currently uses a bottom navigation/swipe deck for its primary tabs.
- Desktop currently uses the persistent `#desktop-sidebar` and disables deck paging.
- Several screens already have valuable desktop-specific layouts: Home's two-column grid,
  Kitchen's list/detail split, Settings' master/detail layout and Journal's wider two-pane layout.
  Preserve and build on those patterns rather than flattening them into one universal breakpoint.
- GitHub Pages serves `main` directly. **Do not commit, push or deploy.** Leave a verified working
  tree for Francois.
- Any real change to cached HTML/CSS/JS requires a new `CACHE_NAME` and matching version comment in
  `service-worker.js`.

If Prompt 43's first-class Nutrition tab is already present, include it fully in this work. If it
is not yet present, do not invent a duplicate calorie implementation; make the layout architecture
ready for a future `nutrition` destination and state that dependency in the completion report.

## Non-negotiable principle: shared data, independent presentation

All feature data remains canonical and shared across form factors:

- workouts, exercises and sessions;
- calorie/nutrition logs and targets;
- recipes, shopping and pantry data;
- budget weeks, transactions and categories;
- accounts, weight, habits, plans and Journal records;
- Firebase paths and backup payloads.

Never create `mobileBudgetData`, `desktopBudgetData`, mobile recipe copies, desktop food logs or any
other form-factor copy of feature data. An edit made on iPhone must immediately appear on desktop
after sync, and vice versa.

Only presentation may differ:

- composition and region placement;
- card order, visibility and desktop width;
- list/detail versus single-screen navigation;
- drawers, sheets and persistent side panels;
- density, control placement and sticky actions;
- collapsed/expanded presentation state;
- mobile bottom navigation versus desktop sidebar.

Business calculations and mutations must be shared functions. Do not copy a budget calculation,
nutrition total, recipe resolver or workout save path into a second renderer.

## Form-factor contract

Use layout capability/breakpoint detection, never iPhone user-agent sniffing.

- **Mobile profile:** viewport below the established desktop breakpoint. This includes portrait and
  landscape phones. Landscape may gain more columns where already appropriate, but it still uses
  the mobile preference profile and mobile navigation semantics.
- **Desktop profile:** viewport at or above the established desktop breakpoint (currently around
  1024px; verify current code).
- Preserve feature-specific wider split points where the content requires them. Settings and
  Journal already use wider thresholds because the sidebar reduces usable content width. Do not
  force every master/detail screen to split at 1024px.
- Use `matchMedia()` with a single shared form-factor helper. Avoid dozens of unrelated
  `window.innerWidth` decisions that disagree at the boundary.
- Recompose only when crossing a meaningful layout boundary, not on every resize event.
- A resize across the boundary must preserve the active destination, selected record/sub-tab,
  unfinished safe draft state and focus where practical.

## Architecture to implement

### 1. Shared form-factor service

Create one small global layout API following existing naming conventions, with semantics similar
to:

```js
layoutMode()                  // "mobile" or "desktop"
layoutIsDesktop()
layoutOnModeChange(callback)
```

Requirements:

- One authoritative desktop media query.
- Initial render is correct before the user interacts.
- Boundary changes are debounced/coalesced and do not create duplicate listeners.
- Respect `prefers-reduced-motion` when layout changes trigger transitions.
- Existing landscape-phone helpers may remain for genuinely landscape-specific composition, but
  must not cause a phone to read/write desktop preferences.

### 2. Shared feature view models

For any screen whose mobile and desktop DOM compositions materially differ, introduce a shared
read-only view-model/helper layer before the renderers.

Example pattern:

```js
function nutritionTodayModel(){
  return {target, totals, meals, partial, recent};
}

function renderNutrition(){
  const model=nutritionTodayModel();
  if(layoutIsDesktop()) renderNutritionDesktop(model);
  else renderNutritionMobile(model);
}
```

The exact names should follow the feature's current prefix. Do not perform storage writes inside a
view-model builder. Event handlers call existing shared actions, then re-render the active
composition.

Use separate renderers only when the structure or interaction genuinely differs. Ordinary spacing,
font sizing or a grid changing from one to two columns belongs in CSS, not duplicate JS markup.

### 3. Independent saved layout profiles

The current Home preference combines phone and desktop order/visibility in one
`daily_home_layout`, with desktop `wide` settings added to the same object. Migrate it safely to
independent profiles.

Implement a versioned synced model with these semantics:

```js
{
  schemaVersion: 2,
  mobile: {
    order: [],
    hidden: [],
    updatedAt: 0
  },
  desktop: {
    order: [],
    hidden: [],
    wide: [],
    updatedAt: 0
  }
}
```

Exact storage shape may differ if the existing sync system makes two separately registered keys
safer, but the two profiles must be independently timestamped/mergeable. Editing the mobile layout
on a phone and the desktop layout on a laptop must converge without last-write-wins erasing the
other profile.

Migration requirements:

- Preserve every existing `daily_home_layout` order, hidden and wide choice.
- On first migration, copy existing `order` and `hidden` into both profiles because they express
  the user's current intent.
- Copy the existing `wide` array into desktop only.
- Seed mobile and desktop defaults independently for genuinely fresh installs.
- Migration is idempotent and respects `_bootPhase`; a fresh device must not stamp defaults as a
  new edit and overwrite cloud preferences.
- Legacy data arriving later through Firebase must still migrate safely.
- Keep reading the legacy key as a fallback. Do not delete it in this prompt.
- Register the new synced store(s) through existing sync/restore infrastructure. Do not maintain a
  second hardcoded sync-path list.

Settings → Home Layout must make the active profile unmistakable:

- A segmented selector or two explicit sections: **iPhone layout** and **Desktop layout**.
- Each profile has its own order and show/hide controls.
- Desktop alone offers half-row/full-row card width.
- The preview accurately resembles that profile.
- Changing one profile never changes the other.
- Offer explicit actions such as **Copy iPhone order to Desktop** and **Copy Desktop order to
  iPhone**, with confirmation. Never copy automatically.

Keep purely transient/device UI state local where it already belongs. Do not sync scroll position,
open sheets, temporary editor drafts or keyboard state merely because layout profiles are synced.

## App shell and navigation

### iPhone/mobile

- Keep primary navigation at the bottom and thumb reachable.
- Keep swipe navigation only for destinations actually inside the swipe deck.
- Bottom-nav order, `NAV_ORDER`, panel DOM order, CSS width/order, transforms, indicator/pill
  geometry and swipe bounds must come from one source of truth or be verified as an exact mapping.
- Full-screen editors and bottom sheets must respect the opaque status bar and bottom safe area.
- A floating action must never resolve against the transformed multi-panel deck and land off-screen.
- Five navigation destinations must remain readable if Prompt 43 has added Nutrition. Do not let
  labels, badges or the central Log affordance overlap on the narrowest supported iPhone.

### Desktop

- Use the persistent sidebar as the sole primary navigation; hide mobile bottom nav and swipe
  affordances.
- The selected sidebar item must follow the active destination, including overlay-like peer
  destinations such as Accounts if they remain peers.
- Do not stretch content edge to edge. Keep the existing shared maximum content width and sensible
  internal column measures.
- Prefer persistent context, list/detail and side panels over phone-style modal hopping when enough
  width exists.
- The sidebar must remain visible unless a deliberately immersive workflow such as cooking mode
  has an established reason to cover it.

### Boundary changes

Test resizing while:

- a primary tab is active;
- a recipe detail is selected;
- Settings or Journal has a selected list item;
- an editor/sheet is open;
- a text field has focus;
- the mobile deck is between settled gestures.

Close or re-home incompatible transient overlays safely, but never discard a user's saved or typed
data. Document any unavoidable transient reset.

## Required layouts by destination

These are product requirements, not pixel-perfect mock-ups. Reuse existing components and design
tokens.

### Home

**iPhone:**

- One readable vertical card column.
- Uses mobile order and mobile visibility.
- No desktop wide/full-row controls.
- Quick actions remain thumb reachable.

**Desktop:**

- Preserve the accepted two-column Home grid. Do not introduce auto-fit third/fourth columns or
  masonry packing.
- Uses desktop order, desktop visibility and desktop wide/full-row choices.
- Preserve load-bearing card-height/row decisions documented in `CLAUDE.md`; do not restart the
  rejected grid experiments.
- Desktop can expose more persistent controls/context inside cards where this does not duplicate
  feature logic.

### Log / workout

**iPhone:** one-column exercise flow, sticky rest/session controls and large touch targets.

**Desktop:** use the available width for a deliberate workspace—for example session overview and
timer context beside the exercise/set column—without changing what gets saved. Do not simply make
every set input extremely wide. Keyboard navigation through set inputs must remain logical.

### Nutrition, when present

**iPhone:** Today/Foods/Recipes in a compact single-column composition; Add food uses a bottom
sheet/full-screen flow; meals stack vertically.

**Desktop:** persistent multi-region workspace: daily summary/targets, meal log and food
search/recent foods can coexist. Foods and Recipe Nutrition Review use list/detail rather than
full-screen step hopping. Both renderers read the same canonical nutrition models and call the same
logging/recipe actions.

### Budget

**iPhone:** preserve the guided vertical card/editor flow and sticky actions.

**Desktop:** compose summary, plan/inputs and transaction/context regions so the width reduces
scrolling without changing week calculations. Preserve current element identity if code re-parents
live inputs; crossing the breakpoint must not lose unsaved values.

### Kitchen

**iPhone:** recipe list → full-screen detail → sheets/editors; shopping and pantry remain touch
first.

**Desktop:** preserve/enhance the current list/detail split. Recipe selection, protein selection,
shopping and cooking actions share the same state as mobile. Do not render two live editors for the
same recipe.

### Stats

**iPhone:** one-column cards/charts with evidence screens that fit the viewport.

**Desktop:** denser overview grids and appropriately sized charts, with filters/evidence context
beside content where useful. Never change the statistical calculation based on layout mode.

### Journal

Preserve the established wider split threshold and two-pane desktop workspace. Mobile remains a
list-to-editor flow. Selection and draft content must survive crossing the threshold.

### Settings

Preserve the established master/detail desktop threshold rather than forcing the split at 1024px.
Mobile remains list-to-full-screen detail. Add the independent Home layout profile editor here.

### Plans, Accounts and secondary destinations

Audit each for stretched phone markup. Use mobile stack/full-screen flows and desktop list/detail or
multi-column composition where it materially improves use. Do not redesign a screen merely to say
it has two renderers; simple responsive CSS is correct when content relationships are unchanged.

## Styling and component rules

- Use existing CSS variables, typography, card vocabulary, icons and surface hierarchy.
- Keep CSS responsible for presentational changes wherever the semantic DOM can be shared.
- Scope mobile and desktop selectors tightly. A desktop rule must not leak into similarly named
  components elsewhere.
- Do not add inline-style duplication to both renderers when a shared class expresses the rule.
- No arbitrary viewport-height shell changes; preserve the established fixed-shell and safe-area
  behaviour.
- Do not use CSS order to create a visual order that disagrees with focus/DOM order for interactive
  content.
- Desktop list/detail panes need useful empty selections, not large blank regions.
- Mobile controls require comfortable touch targets; desktop controls must support keyboard and
  pointer interaction.
- Layout state cannot be conveyed by colour alone.

## Accessibility and state continuity

- Both compositions expose the same feature labels and actions to assistive technology.
- Hidden inactive composition markup must not remain focusable or create duplicate IDs.
- Prefer rendering only the active composition when two semantic structures are necessary.
- Preserve meaningful focus across re-render where possible; otherwise focus the destination
  heading and announce the layout change only when useful.
- Browser back/delegated back controls must behave according to the active composition.
- An action started in one layout and completed after resizing must save exactly once.

## Data, sync and backup safety

- Layout changes never modify feature data.
- New layout preference writes go through the timestamp-aware save/sync helpers.
- Boot-time seeds/migrations retain timestamp zero or the existing timestamp as required by
  `_bootPhase`.
- Independent mobile and desktop profile edits merge independently across devices.
- Backup export includes both layout profiles.
- Signed-in restore pushes both profiles authoritatively using the existing restore contract.
- Restoring an older backup with only `daily_home_layout` produces two valid profiles without
  losing its order/hidden/wide values.
- Do not weaken Firebase rules or create device-global cloud paths.

## Implementation sequence

1. Audit and document current layout modes, breakpoints, re-parenting and overlay ownership.
2. Add the shared form-factor helper and boundary-change lifecycle.
3. Introduce/migrate independent Home layout profiles and update Settings UI.
4. Stabilise the app shell/navigation mapping for mobile and desktop.
5. Extract shared view models where a destination needs materially different composition.
6. Implement Home first and verify preference/data isolation.
7. Implement or refine each primary destination in the order: Nutrition (if present), Log,
   Budget, Kitchen, Stats.
8. Verify existing Journal, Settings and secondary desktop splits against the shared lifecycle.
9. Remove obsolete layout branches only after all callers are migrated; do not leave two competing
   resize handlers or preference readers.
10. Bump the service-worker cache once after the final cached-asset set is known.

## Required verification checklist

Run locally over HTTP and check the console throughout. Do not claim items that were not actually
exercised.

1. **Fresh mobile:** clear localStorage, load at a narrow iPhone viewport and confirm mobile defaults
   seed without a fresh timestamp outranking cloud data.
2. **Fresh desktop:** load the same account on desktop and confirm feature data is shared while the
   desktop layout/profile is distinct.
3. **Legacy migration:** start with an existing `daily_home_layout`; confirm order/hidden copy into
   both profiles, wide copies only to desktop, and two reloads do not migrate again.
4. **Late cloud migration:** allow legacy layout data to arrive after boot and confirm it normalises
   without overwriting newer profile choices.
5. **Independent order:** move the calorie/nutrition card to the top on iPhone and elsewhere on
   desktop; reload both and confirm neither rearranges the other.
6. **Independent visibility:** hide a card on mobile but show it on desktop; confirm underlying data
   remains available and unchanged.
7. **Independent width:** make a desktop card full row; confirm mobile has no corresponding width
   setting or side effect.
8. **Explicit copy:** use each copy-layout action, confirm before applying and verify only the
   intended fields copy.
9. **Two-device preference merge:** edit mobile layout on one client and desktop layout on another;
   sync and confirm both changes survive.
10. **Shared feature data:** add/edit representative workout, food, recipe, transaction and Journal
    data on one form factor; confirm the other layout shows the same records and calculations.
11. **Navigation mapping:** tap and swipe through every mobile deck destination in both directions;
    confirm the panel, active button, indicator and `S.view` agree.
12. **Desktop navigation:** open every destination from the sidebar; confirm active state, header and
    content agree, with no leftover mobile transform.
13. **Narrow iPhone:** test the narrowest supported viewport, safe areas, enlarged text if practical,
    all nav labels/badges and primary actions without overlap or horizontal body scroll.
14. **Landscape phone:** rotate a phone; confirm it remains on the mobile preference profile, keeps
    its destination and does not write desktop settings.
15. **Boundary resize:** cross mobile/desktop while Home, Log, Budget, Kitchen, Stats, Journal and
    Settings are active. Confirm state is preserved and no screen blanks.
16. **Focused input:** cross the boundary with a safe unsaved input/draft active; confirm its value is
    preserved or the documented safe behaviour occurs without an accidental save.
17. **Recipe selection:** select a recipe on desktop, narrow to phone, and confirm the same selection
    opens in the appropriate phone detail flow without duplicate editors.
18. **Budget live inputs:** type unsaved week values, cross the boundary and confirm no value is lost
    through DOM re-parenting/re-render.
19. **Overlay ownership:** test modal, bottom sheet, evidence screen, Settings detail, Accounts,
    recipe editor and workout history across layouts; none appears behind the sidebar/nav or remains
    invisibly open and focusable.
20. **Home desktop grid:** two columns only, full-row preferences work, DOM/focus order matches visual
    order, and no rejected masonry/auto-fit behaviour returns.
21. **Long/empty content:** test empty and heavily populated Home, meal log, recipe list, budget,
    Stats and Journal states in both compositions.
22. **Keyboard/accessibility:** tab through desktop actions and mobile-emulated controls; no duplicate
    IDs, focus traps, hidden focusable copies or colour-only state.
23. **Themes:** check every changed destination in light and dark mode on mobile and desktop.
24. **Backup/restore:** export layouts/data, diverge both profiles, restore while signed in, and
    confirm both restored profiles become authoritative while feature data remains intact.
25. **Fresh-profile cloud test:** sign into an existing account from a clean/private profile and
    confirm layout defaults never overwrite real cloud data.
26. **Console/PWA:** no uncaught errors, no stale cached layout after reload/install, and
    `service-worker.js` cache name/comment are bumped exactly once for the changed cached assets.

## Completion report

Report:

- The final mobile/desktop breakpoint and any feature-specific split thresholds retained.
- Which screens use shared DOM plus CSS and which use separate mobile/desktop renderers, with the
  reason for each separate renderer.
- The shared view-model/action boundaries introduced.
- The layout-profile storage shape, migration and multi-device merge behaviour.
- Every file changed.
- Verification checklist results, clearly separating completed tests from tests requiring
  Francois's signed-in account, second device or physical iPhone.
- Any intentionally deferred destination and why.

Do not describe the project as complete merely because desktop has more columns. It is complete
when iPhone and desktop each feel intentionally composed, their layout preferences can diverge,
and every actual Daily record remains one shared source of truth.
