# Home briefing and new-user hierarchy

## Correction to implementation scope — 2026-10-04

Restore the original accent gradient and budget status within the compact desktop hero.
Keep the approved hierarchy and existing weather illustration. The announcement belongs in
a simple swipeable launch pop-up, not an inline Home card. The final desktop weather panel spans
the hero's height and owns its date. The user authorised commit and push on 2026-10-04.

Status: implemented for v370; release authorised on 2026-10-04.
Updated: 2026-10-04.

## User direction

- Retain one prominent desktop mega hero, with a shallower horizontal composition.
- Use the existing Daily briefing reference: compact common header and side-by-side
  training, budget and a smaller inset weather window. Preserve mobile presentation.
- Revise the starting hierarchy for new users to match the six cards in Francois's
  supplied screenshot: independent Dashboard columns below the hero, with Week in Review,
  Journal and Daily Habits on the left, and Accounts, Nutrition Today and Weight on the right.
  The remaining cards follow below; their order is not important to Francois.
- Make Home customisation discoverable. Users should not have to know that card order,
  visibility, widths and desktop composition can be changed.

## Review findings

- At a 1440px desktop viewport, the current hero measured about 1101px wide by 518px tall
  with forecast open, and 491px tall with forecast closed. This was an isolated synthetic
  profile with a long workout title and no entered budget income, not production data.
- Training and budget stack on the left; weather spans both rows. The composition is the
  principal height problem. A 10% reduction would still leave about 466px in this fixture.
- Existing fresh profiles use Grid. Equal row heights can stretch a shorter card beside a
  taller one. Dashboard has independently sized columns but is currently an optional choice.
- After the grouped desktop hero, the default order begins with Streak and Personal Records,
  then Nutrition and Weight. The order reflects old feature additions rather than an
  intentional new-user journey.
- Edit layout is below the Home cards. Layout settings is initially hidden and appears
  only after Edit layout is pressed. Changing the label alone will not fix this extra step.

## Desktop hero proposal

- Keep the existing content width. Target roughly 340–380px in a typical desktop state,
  with natural growth for wrapped content, weather errors and expanded forecast detail.
  Validate this target in the actual app; do not enforce a clipping fixed height.
- Start with approximately 35% training, 35% budget and 30% weather. Define a deliberate
  fallback where desktop width is too narrow for three readable sections.
- One leading item per area: workout title, budget remainder and current temperature.
  Supporting data stays secondary. Use compact saved-training-day markers and spending meter.
- Keep Open/Continue/Review workout and Add expense visibly labelled; align actions where
  practical. Preserve canonical workout state, navigation and existing expense capture.
- Use Daily's existing theme/accent system and actual weather scenes. Keep freshness,
  missing-data, offline, retry and forecast disclosures functional and accessible.
- Allow the budget label and date range to follow the chosen period when the Finance period
  model ships. Until then, preserve truthful weekly labels and existing calculations.
- Keep the new Finance graphic announcement separate from the hero's three sections.

## Starting hierarchy and customisation

- New desktop profiles start in Dashboard, with a wider left column and a supporting right
  column, each keeping independent card heights as shown in the supplied screenshot.
- The first three regular cards in the left column are Week in Review (`review`), Journal
  (`notes`) and Daily Habits (`habits`). The first three on the right are Accounts (`balance`),
  Nutrition Today (`calories`) and Weight (`weight`). Keep the shared hero above these cards.
- Append all other regular cards beneath this six-card arrangement, retaining their existing
  relative order and column membership where possible. Do not create a mandatory six-item
  row grid or stretch the shorter card to match its neighbour.
- Copy only the arrangement from the screenshot. Its balances, journal item, habit names,
  calorie goal and weight readings are personal records and must never become default data.
- Setup prompts within these cards should explain one useful next action. Missing records
  stay honestly empty; no invented activity or values are used to fill the arrangement.
- Preserve onboarding focus choices and avoid forcing unrelated features into the foreground.
  Never use invented activity, balances or achievements to fill the starting dashboard.
- Put a clearly labelled **Customise Home** action near the top of Home, outside the hero's
  activity sections. Open the layout editor directly for the current device's profile.
- Include reorder, show/hide and desktop arrangement choices in that editor, with existing
  draft/Apply/Cancel behaviour. Keep accessible move controls alongside any drag gesture.
- Give new users a brief dismissible hint: **Make Home yours — choose and arrange your cards.**
  Avoid adding a mandatory layout tutorial to onboarding.
- Make Reset to recommended restore the agreed starting arrangement with the existing
  confirmation and clearly described effect. Keep mobile and desktop independent.

## Preservation and validation

- Apply revised defaults only to genuinely new profiles. Do not reinterpret an existing
  missing composition field as permission to replace a legacy Grid arrangement.
- Preserve existing saved card order, hidden cards, widths and Dashboard columns. An existing
  user may explicitly choose the new recommended arrangement; never overwrite it at boot.
- Follow existing layout sync, restore and timestamp invariants. No fresh boot-time timestamps
  or unregistered preference stores. Any persisted hint state must use an appropriate existing
  registered store or the established device-local, excluded pattern after an explicit decision.
- Validate fresh profiles, legacy Grid profiles, customised Dashboard profiles and independent
  mobile choices. Check onboarding focus selections, empty/partial/established data, hidden
  hero areas, long titles, weather states, keyboard controls and reduced motion.
- Browser review should include desktop widths near the breakpoint and larger monitors,
  portrait/landscape mobile, light/dark and different accents. Use isolated test records.
- Production asset changes require a service-worker cache bump without stylesheet reordering.

Related: FINANCE-CYCLE-PLAN.md. This Home plan is a presentation workstream; it must consume
the canonical Finance period reader when available rather than implement a second budget model.
