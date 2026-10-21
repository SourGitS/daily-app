# Prompt 51 — Home desktop composition: independent columns, preserved layouts

## Codebase context and objective

Read AGENTS.md and the relevant Home/layout, CSS, sync and release sections of CLAUDE.md first. Verify current code; line numbers and historical notes can be stale. Daily is vanilla HTML/CSS/JS with no build step. GitHub Pages serves main directly; pushing is a production deploy.

Starting reference: v309, commit 5ee4ff9. That release improves individual card composition but preserves equal grid rows. The result still wastes space: Weekly Budget stretches to the height of Habits, for example. Fix the page arrangement, not just its padding. Preserve Daily's established visual identity and all feature behaviour.

Use the accompanying desktop example as a composition reference, not as replacement production markup or sample data. Reuse the actual card builders, live values, existing actions, typography, colour tokens, weather scene, logo and icon assets. Do not copy illustrative values, abbreviated content or the example's text-based logo into the app.

The user has accepted the direction of the later, realistic preview using their actual 13 visible cards at a 1646 × 873 desktop viewport. Reference images are `C:/Users/FrancoisPeters/.codex/visualizations/2026/09/07/01a079c8-7517-76c1-90a3-a491db3408a5/daily-your-desktop-1646.png` and `daily-your-desktop-full.png` in the same directory. This preview uses the existing card content and retains relative saved order within each column. Prefer it over the earlier illustrative sample. Read the actual files if available; do not claim to have inspected them otherwise.

The Home Layout settings tool is explicitly part of this same implementation, not a later follow-up. Its iPhone and Desktop modes must become distinct, useful editors that accurately represent each composition.

Inspect HOME_WIDGETS, HOME_DEFAULT_ORDER, renderHome, homeLayout/profile normalisation and merge/save helpers, homeLayoutOrderIds, the Home Layout editor, applyHomeEditMode and applyHomeCardCaps. Inspect the card container rules in css/kitchen-extras.css and desktop/landscape rules in css/budget-home.css. Derive all card availability from the existing registry/render paths.

The code records an earlier two-column arrangement being retired because its visual placement disagreed with ordering and drag/drop. This change must solve that interaction problem explicitly. Do not reintroduce alternating distribution, shortest-column placement, CSS columns, dense packing or masonry.

## Specification

### 1. Two explicit desktop columns

Add a desktop-only Dashboard composition with two independent vertical stacks. The main column is approximately 60% and the supporting column approximately 40%. Use content-sized cards and one consistent vertical gap; a tall card must never size a card in the other column. No fixed universal heights, height equalisation, spacer elements, absolute positioning or JavaScript height measurement for packing.

Column headings are “Today & activity” and “At a glance”. Give the groups semantic regions with that reading order: main column top-to-bottom, then supporting column top-to-bottom. DOM, keyboard navigation, screen-reader order and editor order must agree. There is no implied left-right row order between groups.

Recommended initial placement, preserving these existing IDs:

| Main: Today & activity | Supporting: At a glance |
| --- | --- |
| session — Today's session | weather — Weather |
| habits — Daily habits | calories — Overview & greeting |
| notes — Journal | streak — Streak & this week |
| kitchen — Kitchen snapshot | budget — Weekly budget |
| recent — Recent workout | balance — Accounts |
| prs — Personal records | weight — Weight & goal |
| review — Week in review | finance — Finance check-in |
| | tiles — Money quick tiles |

The table defines default column membership and a fallback order for a fresh layout. When an existing user explicitly applies Dashboard for the first time, partition their effective saved desktop order into those columns while preserving relative order within each column, as in the accepted realistic preview. Do not replace their arrangement with the table's order. Keep hidden card positions too. A separately labelled reset-to-recommended action may use the fallback order, scoped to the selected profile/composition.

Account for every registry card, including hidden, conditionally absent and future cards. Absent content leaves no empty shell. Each visible card appears exactly once. Keep existing fixed-card restrictions. Unknown stored IDs must not corrupt the layout; newly registered cards must receive a deterministic fallback location without writing defaults during render.

Keep Daily's existing sidebar. Use a Home Dashboard content cap around 1600px, centred within the existing app maximum, rather than stretching cards indefinitely on ultrawide screens. Start with a 16–20px column gap and about 14px between cards. Retain shared card padding tokens; adjust only if measured evidence warrants it.

Use available content width as well as the existing 1024px desktop condition. Aim to support two columns from about 660px of available dashboard width, with a supporting column of at least 280px; test actual content at this minimum. Below the safe width, stack the two groups in their semantic order. Do not collapse merely because a viewport is a typical laptop size. Avoid browser-specific masonry dependencies.

Portrait and landscape mobile must continue to use their current layout, order, widths, navigation and actions. Scope the new renderer/CSS separately from .home-grid-cols; that wrapper also serves landscape phones. Keep the existing grid composition functional.

### 2. Consistent card anatomy, flexible height

Standardise headers, padding, value hierarchy and action treatment. Do not standardise outer height.

- Summaries: Budget, Accounts, Weight, Streak and money tiles use compact content-driven layouts. On the supporting column, stack primary figures above support when that is clearer. Keep balances, units and account totals readable without shrinking fonts or clipping numbers. Support very large and negative amounts.
- Lists: PRs, Review, Finance and Recent retain readable aligned rows. Habits may use two columns only if each item has sufficient room; a long habit label must wrap. All today's habits must remain reachable. Preserve existing disclosure behaviour initially; do not add a universal 280px cap or silently drop rows.
- Features: Session, Weather, Calorie overview, Journal and Kitchen retain their established content and treatment. The session fills its main column, not both columns. The Journal's populated composer retains sufficient width. Keep account alerts, nutrition details and workout metadata intact.

Audit v309's .card-cols, reading caps and action overrides in the new composition. Reuse useful rules, scope unsuitable rules to the legacy grid, and remove only code proven unused. Do not leave broad min-height, height:100%, flex-growth or centring rules stretching these new cards. Do not let shared style changes leak into other screens. Update Home Layout previews deliberately as specified below; do not accidentally restyle unrelated Settings thumbnails.

Expansion, hiding, loading and live updates must move only subsequent cards in the same column. Unequal column bottoms are acceptable; do not pad or shuffle cards to make them finish together. Use normal page scrolling, not independent column scrollbars.

### 3. Reversible layout choice and usable editing

#### Separate iPhone and Desktop editors

Keep the existing Settings > Home Layout entry and use the established segmented control with clearly labelled **iPhone** and **Desktop** tabs. Reuse the existing `mobile` and `desktop` profile keys; “iPhone” is the user-facing label, not a storage-key rename. Do not create another settings screen or another parallel preference system.

- Initially select the profile for the device being used. After the user explicitly selects a tab, viewport resizing must not switch the editing target underneath them. Both profiles must be editable from either device.
- Show which profile is being edited, with concise guidance that changes apply to that view. The profile tabs select an editing target; they must not change the live app's global device mode or mobile navigation.
- **iPhone:** show the existing ordered phone feed in a phone-shaped preview, with show/hide and reorder controls. Preserve its current behaviour and restrictions. Do not expose Desktop-only columns, Dashboard/Grid or wide-card controls here.
- **Desktop:** show the actual selected desktop composition. Dashboard needs a wider main column and narrower supporting column with independent heights and the same named groups as Home. Grid needs its existing row order and wide-card treatment. Do not reuse the iPhone thumbnail arrangement and merely change its label.
- Use one editing area and one corresponding preview for the selected profile. Scale or simplify card previews for legibility, but keep real card identity, visibility, order and column placement recognisable. Give miniature previews inert content; clicking them must not log workouts, toggle real habits, open live financial forms or write data. Omit hidden cards from the Home preview while keeping their clearly marked entries available in the editor.
- Keep separate in-memory drafts for the two profiles. Switching tabs preserves each unsaved draft without committing it. Use target-specific actions such as “Apply desktop layout” and “Apply iPhone layout”; Apply commits only that profile. Cancel discards the selected draft. Handle leaving the editor with outstanding drafts explicitly without silently saving or losing them.
- On a phone, the Desktop editor may stack its two named column lists vertically to remain usable; the group labels and placement controls must still make the desktop arrangement clear. Do not shrink interactive targets to fit a miniature desktop.

#### Desktop composition and placement controls

Existing saved desktop layouts must initially render exactly as before. Add a “Dashboard” option alongside the existing “Grid” composition in Settings > Home Layout, with an unsaved preview and an explicit Apply action. Switching back to Grid must recover its saved order and wide-card choices. Do not silently convert all existing users during boot.

For Dashboard, let users choose a column and move a card up/down within it. Show both named column lists in the editor. Provide keyboard-operable Move up, Move down and Move to the other column controls; do not rely on dragging. If existing drag/drop is retained, it must resolve to a named column and explicit insertion index and use the same saving path. Home's Edit layout entry point must reach the correct editor for the active composition.

Home's Edit layout should select the current device profile and composition on entry. After a Desktop save, reopening the editor must show that saved arrangement, not default groups. Card count summaries on the main Settings page must continue to distinguish iPhone and Desktop correctly. Update the selected profile's preview immediately for draft edits, without changing the live Home arrangement until Apply.

No full-width cards in Dashboard v1. Preserve the Grid wide array untouched and explain in the editor that full-width placement is available in Grid. Do not display a width control that has no effect. Hiding/showing remains supported without deleting a card's saved position or its underlying data.

Store the composition and independent column orders in the existing desktop layout profile through the established layout save/sync/backup mechanism. A suitable additive representation is composition: 'grid' | 'dashboard' plus dashboard: {main: [ids], summary: [ids]}. Missing fields in existing profiles mean Grid. Preserve the existing order, wide, hidden and mobile profile; Dashboard ordering must not overwrite Grid ordering. Do not create another synced localStorage key or change schemaVersion casually.

Audit every normaliser, merger, copy/reset operation, editor save path and backup/restore consumer so the added fields survive round trips. Preserve unknown data where appropriate; deduplicate IDs deterministically. Document old-client compatibility limits rather than assuming an older normaliser understands new fields.

Keep cross-profile copying explicit and directional, showing what will be copied before applying. If copying Dashboard to iPhone, use main-column order followed by supporting-column order and copy visibility subject to fixed-card restrictions; do not copy desktop-only fields. If copying iPhone to Dashboard, partition that order by the destination's existing column assignments, falling back to the default memberships for new IDs. Copying must leave the source profile and the destination's inactive Grid/Dashboard arrangement intact. Treat Copy and Reset as draft edits requiring the selected profile's Apply action; neither may silently reset both profiles. Explain the conversion in concise user-facing terms.

Only the selected profile's Apply action may stamp/save its draft preferences. Cancel, preview, tab switching, resize, opening Home, opening Settings, missing fields, or receiving cloud data must not create a fresh edit. Applying Desktop must not stamp or rewrite the iPhone profile, and vice versa. Reuse saveHomeLayout and its current safe sync path. A cloud update received while editing must not be silently overwritten by an older draft: detect the changed profile revision and offer an explicit resolution before committing that draft.

### 4. Data preservation

The pre-change backup is already verified at `C:/Users/FrancoisPeters/.codex/visualizations/2026/09/07/01a079c8-7517-76c1-90a3-a491db3408a5/backups/daily-v309-before-dashboard/`. Read RESTORE-NOTES.md if recovery is needed. It includes source, Git history and a personal-data export. Never publish the data file or import the older snapshot just to undo a visual change; a layout rollback should preserve newer workout entries.

This is a layout feature, but extending a synced layout profile makes that part sync-sensitive. Preserve _bootPhase/stampFor, existing conflict rules, cloud-read gates and restore behaviour. Never raw-stamp defaults with Date.now(), seed cloud data from a fresh window, replace synced stores wholesale, alter Firebase rules or mutate workout/budget/nutrition/account data.

Use isolated fixtures/mocked Firebase and disposable browser profiles for verification. Never clear the user's actual localStorage, sign them out, overwrite their account or seed test records into production. Verify old profile compatibility, new profile round trips, stale-window conflicts, reload before/after sign-in, and backup/restore. Existing workout preservation tests must still pass. If a required real-account check cannot be performed safely with available access, report that limitation explicitly rather than claiming it passed.

## Numbered verification checklist

1. Capture before/after Home with the same data at 1024, 1180, 1440, 1646 × 873, 1920 and 2560px. Include a fixture matching the accepted 13-card arrangement as well as every registered card and populated/empty states. Report what was actually checked.
2. Increase Habits from 3 to 12 entries, expand Recent and Accounts, and use a long Journal entry. Budget and the other column's cards must not stretch or shift because of those expansions.
3. Check a negative net worth, six/seven-digit balances, three account totals, long PR/habit names and multi-line finance alerts. No clipping, overlap, squeezed digits or hidden essential content.
4. Verify empty Budget, missing weight history, no sessions, no due finance items and partially populated Home. No phantom gaps or new setup writes.
5. Compare portrait mobile at 375/414px and landscape at 932px with the baseline in both themes. Existing card geometry and order must remain unchanged, apart from time-dependent/animated content.
6. Check light/dark and at least two accent colours. Keep actual logo/weather behaviour and visible keyboard focus. Verify browser zoom and the narrow desktop fallback.
7. Move a Dashboard card within a column and between columns using keyboard controls. Hide/show it, reload and confirm placement. Test dragging if shipped. DOM and visual group order must agree.
8. Preview then cancel: no saved changes. Apply Dashboard: desktop preferences only change. Return to Grid: original order/wide choices return. Mobile preferences remain intact. Existing users are not switched on load.
9. Exercise session opening, habit toggles, account disclosure, Add expense, Finance > Budget, Journal and review navigation. Check focus after rerenders and ensure there is one DOM instance per card, not duplicate hidden mobile/desktop trees.
10. Run relevant syntax and existing automated checks. Test layout normalisation, merging, backup/restore and fresh/stale-window data preservation using isolated data. Report failures or untested real-account scenarios.
11. Give a candid visual assessment: show the Budget/Habits comparison, measure inter-card gaps and list visible cards in a typical laptop viewport. Do not claim success from total page height alone or promise to eliminate all whitespace.
12. Verify Home Layout's iPhone and Desktop tabs on both a phone and desktop. Preview and editor agree on order, visibility, column assignment and Grid wide cards. Switching tabs or resizing neither saves drafts nor changes the selected target. Apply, Cancel, Copy and Reset affect only their intended profile/composition. Test unsaved drafts and a cloud profile update arriving during editing.
13. Start with the user's existing saved order, apply Dashboard for the first time, and confirm relative order is preserved within each column. Reopen Home Layout and confirm it matches Home. Return to Grid and confirm its saved order/wide choices. Confirm settings summaries and Home's Edit layout entry open the right profile.
14. Update the relevant documentation. When ready to ship, bump the service-worker cache once from the current repository version for the actual cached-asset changes; do not assume it is still v309. Provide Home AND Home Layout screenshots and a concise change/test summary. Do not commit or push until explicitly instructed in the implementation session.

Deliver Home and its updated Home Layout tool together as one working, locally verified implementation. Do not ship the desktop composition with an outdated editor, stop at a plan, or replace this scope with another round of padding adjustments.
