# 40 — Settings: from a menu of forms to a searchable control centre

Ran against an external UX review that scored the Settings surface **6.5/10**. The landing
page was already good; the weakness was *inside* the sections — different card headers,
buttons, spacing, help text, icons and saving behaviour on almost every screen, so Settings
read as several feature-specific forms that happened to share a menu.

All three phases of the review were implemented.

---

## What changed

### Phase 1 — organisation and findability

1. **The four groups are labelled.** `PERSONAL` / `PLANNING` / `APP EXPERIENCE` /
   `DATA AND SUPPORT`. They were four unlabelled cards, so the split looked arbitrary.
2. **Destinations renamed** — Export → **Data & backup**, Training → **Training setup**,
   Budget → **Budget setup**, Health → **Health & goals**, Account → **Account & sync**,
   Replay setup → **Run setup again**.
3. **"Run setup again" moved** out of App experience into Data and support. Replaying
   onboarding is a maintenance action, not a look-and-feel preference.
4. **Settings search**, between the profile card and the groups. It indexes *individual
   settings*, not the ten destination names: `weight`, `calories`, `location`, `colour`,
   `income`, `backup`, `workout reminder` all resolve, each result showing its parent
   ("Weight goal — Health & goals › Weight goal") with the matched words highlighted.
   `color` and `colour` find each other.
5. **Results open and highlight.** Picking a result opens the right section, scrolls to the
   exact card and outlines it for about a second.
6. **Form cards no longer lift on press.** `.settings-card` was in the global press-lift
   list, so tapping an input made the whole form card rear up. The lift now means what it
   should: "this opens something".

### Phase 2 — one card system

7. **One anatomy for every settings card**, in the new `css/settings.css`:
   icon + title + a line saying what the card affects → rows or fields → help → actions →
   save confirmation. Health was the worst offender (a `.settings-card`, a `.week-section`
   and another `.week-section`, three internal structures on one screen); it is now four
   identical cards.
8. **Inline styles replaced with classes.** The profile card, the whole Export section, the
   weight cards, the reminders and the Weather screen were carrying their own inline CSS.
9. **Save behaviour is now a rule, not a per-screen decision.** Single toggles and selectors
   save on change and their card *says so*; multi-field forms get an explicit **Save changes**
   and a subtle **Saved** tick; collection editors (Training, Budget) keep their top-bar Save.
10. **Emoji gone from settings chrome** — the 🏋️/💰 reminder headings, the 📲 install card
    and the ⚖️ empty state. Emoji ignore `currentColor`, so they can follow neither the theme
    nor the accent. Monochrome icons from `SETTINGS_ICONS` throughout.
11. **Danger zones.** "Reset onboarding" and "Clear saved weather & location" now sit in their
    own labelled red-bordered card instead of being the third button in an ordinary list.

### Phase 3 — desktop and polish

12. **Two-column desktop landing.** Profile and search span the full width; the four groups
    pair up. Detail screens deliberately keep their 640px measure.
13. **Row summaries.** Each row answers its own question without being opened — Weather:
    *Sydney*; Appearance: *Dark · Weather colour*; Account & sync: *Connected · …*;
    Habits: *5 active*; Training setup: *3 days · 3-day rotation*; Home Layout: *14 of 14 cards*.
14. Recent searches deliberately **not** built — the review said only if a need shows up.

### Structural change worth knowing

**Settings is now registry-driven.** `SETTINGS_SECTIONS` / `SETTINGS_GROUPS` /
`SETTINGS_SEARCH` in `js/app.js` are the single source for every label, icon, colour,
`open()` target, row summary and search subtitle. The same ten things previously lived in
four hand-maintained lists — literal rows in `index.html`, `SETTINGS_TITLES`,
`MENU_SECTIONS`, and `renderQuickSettingsMenu()` — which is exactly how "Export" survived
being renamed everywhere else. Section *keys* are persisted, so they never change; only
labels do. That is why "Data & backup" is still keyed `export`.

### Bug found and fixed on the way

`.set-row` was defined twice at the same specificity: once in `budget-home.css` for the
Settings list and once in `workout.css` for the workout **set** row. `budget-home.css` loads
later, so its `display:flex` had been silently overriding the Log screen's `display:grid`
app-wide. Renaming the settings copy to `.stg-nav-row` retired the collision — **the Log
screen's set rows now render on their intended grid**, which is the one visible change
outside Settings in this batch. Worth a look on Log.

---

## Verification checklist

Settings tab, on your phone:

1. Four grey labels sit above the groups: PERSONAL, PLANNING, APP EXPERIENCE, DATA AND SUPPORT.
2. Every row shows a small second line under its name with a real value (Habits says how many
   are active, Weather names your region, Appearance says Dark/Light plus the colour mode).
3. The rows read Account & sync, Health & goals, Training setup, Budget setup, Habits,
   Appearance, Weather, Home Layout, Data & backup, Run setup again.
4. "Run setup again" is in the last group, not with Appearance.
5. Type `weight` into the search box → three results, each naming where it lives.
   Tap "Weight goal" → Health opens and the Weight goal card is scrolled to and briefly outlined.
6. Try `colour`, `color`, `backup`, `calories`, `location`, `reminder` — all find something.
   Type nonsense → a friendly "nothing matches" with suggestions, not an empty screen.
7. Tap the ✕ in the search box → the grouped list comes back.
8. Open **Health & goals**: four cards, each with an icon, a title and one grey line under it —
   Health details, Daily calorie targets, Body weight, Weight goal. They should look like
   siblings, not three different designs.
9. In Health details, press and hold on the Name field — **the card must not lift or jump**.
   Then press a row in the Settings menu list — that one *should* still lift.
10. Change your age and tap **Save changes** → a small green "Saved" appears to the left of the
    button for a second. The button keeps saying "Save changes".
11. Open **Account & sync**: Cloud sync, Profile, Reminders, then a red-bordered **Danger zone**
    holding Reset onboarding. The reminder sub-headings read WORKOUT and BUDGET — no emoji.
12. Open **Weather**: three cards, the last a red **Danger zone** with "Clear saved weather".
13. Open **Data & backup**: Backup / Restore / Spreadsheet export / Daily + AI, four cards,
    same shape. Cloud sync is a row, not squeezed into the header.
14. Open **Habits**: the rows sit directly on the card — no lighter panel behind them.
15. **Log tab**: the set rows (W · number · kg · × · reps · ✓ · ✕) should look correctly
    aligned, with kg and reps the same width. This is the collision fix — flag it if anything
    looks off.
16. Home, Budget, Stats and Kitchen should be untouched.

On a laptop:

17. Settings shows the profile card and search full width, then the four groups in **two
    columns** (Personal + Planning, then App experience + Data and support).
18. Opening any section still pushes a full-screen page whose content stays in a narrow
    readable column rather than stretching across the window.
19. The sidebar's Settings chevron dropdown says "Account & sync" and "Appearance"
    (the renames flow through automatically now).

---

## Files touched

- `css/settings.css` — **new**, the whole `.stg-*` vocabulary + desktop layout.
- `index.html` — settings landing rebuilt as a search box + `#stg-list-root`; the Health,
  Habits, Appearance and Data & backup sections rebuilt on the new anatomy; stylesheet link.
- `js/app.js` — the registry, search, `renderSettingsList`, `stgCardHead`/`stgIcon`/`stgSaved`/
  `stgRevealCard`; Account, Reminders, Install, TDEE, Body weight, Weight goal, Weather and
  Home Layout renderers converted; `MENU_SECTIONS` reduced to keys; What's new v3.
- `css/budget-home.css`, `css/nutrition-modals.css`, `css/base.css` — dead settings rules
  removed, press-lift list corrected, `.set-row` collision retired.
