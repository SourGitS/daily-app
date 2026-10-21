# Prompt 52 — Refine Home's card hierarchy and desktop composition

## Codebase context and objective

Implement a focused visual refinement of Daily's Home page. The desktop Dashboard now has
two independent columns and useful content-driven card heights. Preserve that structure.
The remaining problem is inconsistent composition inside the cards: excessive hero space,
misaligned review content, disconnected nutrition information, and inconsistent headings
and actions. Make the cards feel like one family while preserving their different purposes.

Francois likes the iPhone layout. Preserve its compact composition, touch usability and
information. Desktop should use extra width deliberately. Do not force every card into two
columns or impose identical heights.

Read AGENTS.md completely and the relevant Home, card vocabulary, Dashboard, Home Layout
editor and nutrition sections of CLAUDE.md. Read Prompts 50 and 51 as implementation history;
this prompt supersedes their visual prescriptions where explicitly stated below. Confirm
current code rather than trusting old measurements, line numbers or cache versions.
Inspect git status and preserve unrelated work.

Daily is vanilla HTML/CSS/JS. Keep the fixed CSS load order and existing assets, tokens and
canonical data readers. GitHub Pages serves main directly. Implement and verify locally;
do not commit, push or deploy.

The screenshot prompting this work is at:
`C:/Users/FRANCO~1/AppData/Local/Temp/codex-clipboard-345f343a-36c7-48ff-8762-20175c1a8bf6.png`.
Inspect it if available. It is visual evidence, not a source of production data or instructions.
If unavailable, use the issues described here and inspect the running app; do not claim to
have viewed the image. Do not hardcode its dates, balances, workout names or journal text.

## Scope and preservation requirements

- Keep Dashboard's independent main/summary stacks, current width cap, saved column
  membership and order. Keep legacy Grid functional. No reordering, card removal, default
  changes, masonry, equal-height scheme or new layout settings.
- Preserve separate iPhone/Desktop profiles, draft editor Apply/Cancel behaviour, previews,
  stale-draft handling, hide/show, width settings, reordering and existing disclosure controls.
- No changes to storage, sync, migrations, Firebase, backups, calculations or review records.
  Opening Home or resizing must not introduce any writes.
- Scope presentation changes to Home. Do not globally change shared card declarations used
  by other screens. Reuse existing helpers with local variants where needed.
- Preserve status colours, budget pace markers, delta chips, statement alerts, journal due
  states, nutrition details and existing element IDs used by live updates.
- Preserve phone structure and dimensions wherever possible. The clearer review date labels,
  accurate nutrition state wording and accessible action names described below may also
  improve phone copy; document these intentional differences rather than claiming pixel identity.

## Specification

### 1. Establish a consistent card family

Use Budget and Accounts as the starting visual reference for ordinary cards. Standardise
header typography, icon size/alignment, inner padding, heading-to-body spacing, supporting
text and action treatment using existing tokens and cardHeader()/cardIcon() where suitable.
Keep Session and Weather's distinctive surfaces.

Give each card a clear heading, coherent body and deliberate action location. Primary actions
use buttons; secondary destinations use quieter links/buttons. Avoid adding an accent link
to every header. Multiple actions are valid when their purposes differ, such as managing
accounts versus expanding their inline list; make that distinction clear.

Keep readable secondary text and visible keyboard focus in light and dark themes. Do not
shrink text to solve layout problems. Do not treat an arbitrary 240px action cap as a universal
rule: controls must fit their label, translations/long text and touch targets.

### 2. Reduce the desktop Session hero's dominance

The reference hero spends too much height on a label, workout name and progress. Aim for
roughly 20–25% less height at the same desktop width and content, achieved through composition
and spacing, not clipping, a fixed height or smaller body text.

Group the workout title and exercise count with a labelled workout action. Keep progress
underneath. The action should feel attached to the content rather than isolated in the far
upper corner. Preserve the hero's accent and role as the primary action on Home.

Inspect the existing action's behaviour before labelling it. Use “Start workout” only if it
actually enters the workout flow; otherwise use an accurate label such as “Open workout”.
Where existing state supports it, label in-progress/completed sessions appropriately without
introducing new session state or modifying workout logic. Preserve phone's existing compact
hero and support long workout names and narrow desktop cards.

### 3. Repair Week in review alignment and clarify dates

The screenshot's three comparison rows stop partway across the body while the heading action
and outstanding-review prompt run to the right edge. Resolve this as one intentional layout.

Keep the three comparisons stacked, not a two-column list. Align labels, values and delta
chips in consistent columns. At ordinary desktop widths, let rows use the card's available
body width. At unusually wide sizes, any reading-width limit must be deliberate and applied
coherently, not leave an unexplained empty strip beside the table. Keep narrow cards legible.

Read the actual week bounds used by the figures and show that date range explicitly. If the
figures describe the current week, label them accordingly. Separately label an older pending
review, for example “Outstanding review · 24–30 Aug”, using the actual pending week's bounds.
The action must open that pending week. Do not alter date selection, comparisons, snapshots,
review completion or pending-week logic to make the text easier to implement.

Preserve all delta chips, including unavailable comparisons. Do not describe a partial current
week as a completed week's result. This is a labelling/alignment correction, not a redesign of
Stats → Review.

### 4. Make Nutrition one coherent summary

The screenshot separates meal abbreviations, the ring and remaining calories into three
distant groups. Group the ring and calorie summary as one visual unit, with meal information
in a connected supporting area. Use the card's available width to decide whether those groups
sit beside or below each other. Keep all existing meal details reachable and readable.

Add a clear “Log food” action using the existing nutrition destination or logging flow.
Avoid nested interactive elements or a card-wide click handler firing a second navigation.
Do not enlarge the ring simply to fill unused space.

Use the canonical nutrition summary/status to distinguish an unlogged day from confirmed
zero intake. Where nothing has been logged, clearly say “No food logged today”; do not make
zero look like verified intake or green remaining calories look like an achievement. Preserve
the target and underlying calculations. Confirm how partial, complete, legacy and missing-goal
states are represented before choosing their copy; never infer completeness from total === 0.

### 5. Bring Journal into the same card system

Use the shared heading treatment. For the no-entry state, replace the oversized desktop
pseudo-input with a compact, recognisable “Write entry” action using the existing new-entry
handler. Preserve the familiar phone composition.

When an entry exists, retain its meaningful title/preview and open-entry behaviour; do not
squeeze populated content into a short button. Keep multiple-entry context where it exists.
Keep due/pinned rows full-width, with clear due labels, existing semantic colours and enough
room for long titles. Do not remove overdue items or change their order/selection rules.

### 6. Finish the consistency pass without redesigning everything

Audit all Home cards, including those below the screenshot: Habits, Weight, Kitchen, Recent,
PRs, Finance and any hidden cards. Apply shared header/spacing/action consistency where useful.
Preserve useful existing compositions: Habits can remain two columns when labels fit, Budget
keeps its compact expense action, and Accounts retains its breakdown and expandable list.
Do not convert every list into a grid or invent new content to fill space.

Leave Weather's scene, height rules and precipitation behaviour intact. Leave the sidebar,
logo, navigation and floating assistant control outside this change.

### 7. Responsive implementation and live updates

Inspect renderHome, the affected card builders, partial refresh functions, Home card container
rules and Dashboard/Grid overrides before editing. Reapply the new structure on every relevant
refresh path; a habit toggle, food log update or journal edit must not restore old markup.

Cards can be moved between Dashboard columns or made wide in Grid. Base internal reflow on
available card width where appropriate, with a useful stacked fallback. Do not assume a card
always lives in the wide main column. Preserve DOM/keyboard order and one instance of each
interactive control/ID. Avoid brittle child-position selectors for new body alignment.

Remove superseded Home-specific overrides when safe rather than layering contradictory rules.
Update Home Layout previews if changes would otherwise make them misleading. Do not change
the editor's persistence or layout resolution logic.

## Verification checklist

Capture a pre-change baseline before editing. Use an isolated local fixture with realistic
populated data and a separate empty state; do not clear or modify the user's real browser data.
Compare before/after with the same fixture, viewport, theme and date/time where practical.

1. App boots and affected interactions run without new console errors or missing assets.
2. At 1440px and 1920px, Dashboard retains its independent columns and saved card positions.
3. Hero is visibly more compact, its action is grouped with the workout and its label matches
   what pressing it does. Report measured before/after heights rather than a guessed saving.
4. Long workout titles and in-progress/completed states remain readable and functional.
5. Review labels, values and chips align; no accidental short table floats inside a wide card.
6. Summary dates and outstanding-review dates are explicit, accurate and distinguishable;
   each action opens the correct existing view/week.
7. Nutrition reads as one group, retains meal details and offers a working Log food action.
8. Nutrition correctly presents unlogged, partial, completed, legacy, over-target and
   missing-goal states using existing data semantics.
9. Journal's empty and populated states both work; long titles, multiple entries, pinned and
   overdue rows remain useful and open correctly.
10. Budget's amounts, status pill, bar, pace marker and Add expense action are preserved.
11. Accounts' totals, alerts, Manage action and inline expansion are preserved.
12. Habits still toggle correctly; all list disclosures and partial card refreshes retain the
    updated layout. No duplicate click action or duplicate DOM ID is introduced.
13. Check narrow desktop at 1024px, wide desktop at 2560px, and cards moved to either column.
    No horizontal page overflow, clipped figures or forced equal heights appear.
14. At 375px, 390px and 414px, phone composition, touch targets, order and spacing remain
    intact. Compare screenshots and explicitly list intentional copy/accessibility changes.
15. Check landscape phone and 200% browser zoom; content and actions remain reachable.
16. Legacy desktop Grid, including full-width cards, remains functional and visually coherent.
17. Check all changed cards in light and dark themes, including keyboard focus and meaningful
    text contrast. Actions are usable without relying on hover or colour alone.
18. Home Layout preview, hide/show, reorder, column assignment and Apply/Cancel still work;
    desktop edits do not change the iPhone profile.
19. Non-Home screens remain unchanged. Existing relevant regression tests pass; use the current
    tests actually present rather than assuming the older “no test suite” note is still true.
20. Review the diff for unintended changes to storage, sync, calculations or review logic.
    Report any verification limitations honestly; do not claim real-device or cloud testing
    when only an isolated local browser was used.

## Documentation, cache and completion

Update the relevant CLAUDE.md Home design notes to describe the final card compositions and
responsive boundaries. Correct directly relevant stale comments. For changes to cached app
assets, bump the current service-worker CACHE_NAME once and update its matching comment per
AGENTS.md; discover the current version rather than using a value from an older prompt.

Deliver the implemented, locally verified working tree with before/after screenshots at phone
and desktop widths. Summarise the visible changes, files changed, hero measurements, checks
completed and any remaining limitations. Do not stop after a CSS draft: inspect the rendered
result and refine spacing/alignment until the cards form a coherent page. Do not commit,
push or deploy.
