# Prompt 45 — One navigation registry, one visual system

## Objective

Two jobs, one project, because they are the same fault seen from two sides: **the same thing is
built more than once, slightly differently each time.**

**Part A — Navigation.** Replace the flat desktop sidebar and the mobile hamburger menu with one
registry-driven navigation tree: six labelled groups, one open at a time, reaching every real
destination in the app instead of only the twelve top-level ones. The sidebar and the hamburger
must render from the SAME source, the way Settings already renders from `SETTINGS_SECTIONS`.

**Part B — Visual consistency.** Collapse five near-identical segmented controls into one,
settle the uppercase micro-label scale to three steps, put the Log hub's cards on the same
surface token as every other card, and finish the `--accent-hero` migration that stalled at two
of eleven hero surfaces.

Both halves are consolidation. Neither is a redesign. When you finish, the app should look like
the same app it is today, made by one person instead of five.

```text
                    Before                          After
  sidebar:   12 literal <button>s in index.html   ─┐
  hamburger: MENU_NAV + MENU_SECTIONS + literals  ─┼─→  NAV_TREE (one registry)
  quick set: renderQuickSettingsMenu()            ─┘

  tab strips: .stats-tab-row .log-tab-row         ─┐
              .nut-tabs .kit-subnav .sub-toggle   ─┴─→  .seg-tabs (one control)
```

## Repository context and required reading

You are working in **Daily**, Francois Peters's personal lifestyle PWA.

Before changing anything:

1. Read `AGENTS.md` completely. Its sync, migration, data-preservation and service-worker rules
   are mandatory.
2. Read the navigation, design-token, surface-hierarchy, Settings, Log-hub and Weekly Review
   sections of `CLAUDE.md`.
3. Re-grep `index.html`, all nine CSS files, `js/app.js` and `js/nutrition.js`. **Both
   documentation files have been stale before; current code wins.** Two facts in `CLAUDE.md` are
   already known-stale and you should fix them as part of this work:
   - it says all logic is in one `js/app.js` — there is now also `js/nutrition.js` (326 lines),
     loaded at `index.html:1243`;
   - it gives `js/app.js` as ~24,500 lines; it is 25,334.
4. Inspect `git status` and preserve every unrelated edit or untracked file. Never reset or
   discard the user's work. At the time this prompt was written the tree had uncommitted changes
   in `css/budget-home.css`, `index.html` and `js/app.js`.

Facts that constrain the work:

- Vanilla HTML/CSS/JS. No build step, bundler, modules or package manager.
- The CSS cascade order in `index.html` is load-bearing. **Do not reorder the `<link>` tags.**
  New rules go in the file that already owns the class, or are APPENDED to the last file that
  needs to win a tie.
- Most logic is global-scope code in `js/app.js`.
- GitHub Pages serves `main` directly. **Do not commit, push or deploy.** Leave a verified
  working tree.
- `service-worker.js` is cache-first. Any change to a cached asset needs `CACHE_NAME` bumped
  from `daily-v297` to `daily-v298` **exactly once**, with a matching version comment describing
  this release.

---

# PART A — One navigation registry

## A0. What is wrong today

The desktop sidebar (`index.html:45–68`) is twelve hand-written `<button class="ds-item">`
elements under a single `<div class="ds-section">Menu</div>`. The mobile hamburger
(`buildSideMenu()`, `js/app.js`) rebuilds a similar-but-different list from `MENU_NAV`,
`MENU_SECTIONS` and four more literals. The desktop quick-settings popover
(`renderQuickSettingsMenu()`) is a third list. This is the exact fault Settings already fixed —
`CLAUDE.md` records that ten settings destinations used to live in four hand-maintained lists,
"which is how 'Export' survived being renamed everywhere else."

Three specific consequences:

1. **The rows are at four different altitudes and all look identical.** Five are swipe-deck
   tabs; Stats is a top-level view that is not in the deck; Accounts, Daily AI, Journal and
   Plans are overlays; and **two rows lie** — "Exercise Library" and the workout half of "Plans"
   now navigate into **Log › Exercises** and **Log › Program** (`openExerciseLibrary()` /
   `openWorkoutHistory()` were re-pointed when the Log hub was built), so the row promises a
   destination and delivers you inside another tab.
2. **Roughly 30 destinations exist and 12 are addressable.** Log's four sub-tabs, Stats' six,
   Budget's four, Kitchen's three, Nutrition's three and Settings' ten are invisible until you
   land on the parent screen and read a strip.
3. **The active state is duplicated six times.** These lines all do the same thing and all key
   only on `data-tab`:
   `js/app.js:2035`, `2824`, `7722`, `7731`, `18893`, `18902`, `23240`.

There is also dead CSS: `#desktop-sidebar` is defined twice — `css/budget-home.css:886` (160px,
12px rows, `border-left` rail) and `css/kitchen-extras.css:801` (260px, 14px pill rows). The
second wins on load order. Reconcile them into one ruleset in this work; do not leave both.

## A1. The registry

Add ONE constant, near `NAV_ORDER` (`js/app.js:~2071`), declared with `const` **above** `init()`.

> **This placement is load-bearing.** `CLAUDE.md` records that the Log hub's state had to move
> above `init()` because `init()` restores a `#hash` view through `setView()`, function
> declarations hoist and `let`/`const` do not — declaring them lower threw
> `Cannot access 'logTodayView' before initialization` and aborted boot for anyone reloading on
> a hash, silently, because the restore only fires when the URL carries one. `NAV_TREE` is read
> by the same path. Put it with `NAV_ORDER`.

```js
// The ONE source for the desktop sidebar and the mobile hamburger. Six groups, one open at a
// time. A row is data, not code: {id, label, view, sub} — navGo() turns view+sub into the
// right call, and navMatch() turns the current state back into a row id, so the active state
// is computed in one place instead of the seven .ds-item toggles this replaced.
// Adding a destination = adding a row here. Never add a literal button to index.html again.
const NAV_TREE=[
  {id:'today', label:'Today', rows:[
    {id:'home',      label:'Home',            view:'home'},
    {id:'log-today', label:"Today's session",  view:'log',       sub:'today'},
    {id:'nut-today', label:'Food log',         view:'nutrition', sub:'today'},
  ]},
  {id:'training', label:'Training', rows:[
    {id:'log-program',   label:'Program',   view:'log', sub:'program'},
    {id:'log-exercises', label:'Exercises', view:'log', sub:'exercises'},
    {id:'log-history',   label:'History',   view:'log', sub:'history'},
  ]},
  {id:'money', label:'Money', rows:[
    {id:'bud-week',   label:'This week',     view:'budget',   sub:'week'},
    {id:'bud-month',  label:'Month',         view:'budget',   sub:'month'},
    {id:'bud-bills',  label:'Bills',         view:'budget',   sub:'bills'},
    {id:'bud-year',   label:'Year',          view:'budget',   sub:'year'},
    {id:'accounts',   label:'Accounts',      view:'accounts'},
    {id:'wkr',        label:'Weekly review', view:'stats',    sub:'review'},
  ]},
  {id:'kitchen', label:'Kitchen', rows:[
    {id:'kit-recipes',  label:'Recipes',      view:'kitchen',   sub:'recipes'},
    {id:'kit-shopping', label:'Shopping',     view:'kitchen',   sub:'shopping'},
    {id:'kit-pantry',   label:'Pantry',       view:'kitchen',   sub:'pantry'},
    {id:'nut-foods',    label:'Food library', view:'nutrition', sub:'foods'},
  ]},
  {id:'stats', label:'Stats', rows:[
    {id:'st-overview',  label:'Overview',  view:'stats', sub:'overview'},
    {id:'st-training',  label:'Training',  view:'stats', sub:'training'},
    {id:'st-body',      label:'Body',      view:'stats', sub:'body'},
    {id:'st-nutrition', label:'Nutrition', view:'stats', sub:'nutrition'},
    {id:'st-finance',   label:'Finance',   view:'stats', sub:'finance'},
  ]},
  {id:'more', label:'More', rows:[
    {id:'journal',  label:'Journal',  view:'notes'},
    {id:'plans',    label:'Plans',    view:'plans'},
    {id:'aihub',    label:'Daily AI', view:'aihub'},
    {id:'settings', label:'Settings', view:'settings'},
  ]},
];
```

Notes on the shape, so you do not "improve" it back into the problem:

- **Rows carry `view` + `sub` as DATA, not an `onclick` string or a closure.** That is what lets
  one function compute the active row instead of seven scattered `classList.toggle` calls.
- **Weekly review is filed under Money, not Stats,** even though it opens `stats.review`. It is
  a money review in practice — its first and largest section is Money — and the group is about
  what the user is doing, not which screen hosts it. Both are true; pick the useful one.
- **Exercise Library and workout History stop being top-level rows.** They become Training ›
  Exercises and Training › History, which is where they actually go. `openExerciseLibrary()` and
  `openWorkoutHistory()` stay exported — other call sites use them — but the nav rows must call
  `navGo('log','exercises')` / `navGo('log','history')` directly.
- **Plans stays, and stays named Plans**, but it now means imported plan DOCUMENTS only, which
  is all it has been since the Log hub took the saved programs.
- **The Settings row pushes the Settings screen** and stops there. That screen is already
  registry-driven and searchable; do not mirror its ten destinations into the nav tree. A second
  nesting level anywhere in this component is out of scope.

## A2. Navigation and active state — one function each

```js
// One dispatcher. Every nav row goes through here; nothing calls setView + a sub-tab setter
// by hand any more.
function navGo(viewId, sub){
  closeMenu();
  if(viewId==='accounts') return openAccounts();
  if(viewId==='aihub')    return openAIHub();
  setView(viewId);
  if(!sub) return;
  if(viewId==='log')            setLogTab(sub);
  else if(viewId==='stats')     setStatsTab(sub);
  else if(viewId==='budget')    setBudgetView(sub);
  else if(viewId==='kitchen')   kitSetTab(sub);
  else if(viewId==='nutrition' && typeof nutSetTab==='function') nutSetTab(sub);
}
```

Order matters inside `navGo`: `setView('log')` deliberately resets `logTodayView` to `'overview'`
and `setView('stats')` calls `setStatsTab(statsSubTab,true)`, so the explicit sub-tab call must
come **after** `setView`, never before.

```js
// The current destination as a NAV_TREE row id, or '' on a screen with no row (a full-screen
// editor, an evidence overlay). Read the same state the screens themselves read — do not add a
// parallel "currently selected nav row" variable, which is the thing that goes stale.
function navCurrentRow(){ /* map S.view (+ logSubTab / statsSubTab / budgetView / kitState.tab
                             / nutTab, and the Accounts + AI Hub overlay flags) to a row id */ }

// The ONLY place a nav row's selected state is written, for BOTH surfaces.
function setNavActive(){ /* toggle .is-on on [data-nav-row] in the sidebar and the hamburger,
                            and open the group that owns the active row */ }
```

**Delete all seven of the duplicated toggles** at `js/app.js:2035`, `2824`, `7722`, `7731`,
`18893`, `18902`, `23240` and call `setNavActive()` from the one place that already runs on every
navigation (`setView`), plus from the sub-tab setters `setLogTab`, `setStatsTab`,
`setBudgetView`, `kitSetTab`, `nutSetTab`, so the sidebar follows a sub-tab change made from
inside a screen. The stale comment at `js/app.js:2001` ("handled by line ~1165") must go with
them.

`renderQuickSettingsMenu()` currently emits `.ds-item` buttons with no `data-tab`, which is the
only reason the old toggles did not light them up. Your new selector must be `[data-nav-row]`,
not `.ds-item`, so it cannot reach anything but real nav rows.

## A3. Rendering — one builder, two mounts

```js
function renderNav(){ /* build the six groups once; mount into #ds-nav (sidebar) and
                         #side-menu-list (hamburger) */ }
```

Both surfaces get the same tree, the same group labels, the same order and the same accordion
behaviour. They may differ in **density only** (the hamburger's 16px rows and 44px targets stay;
the sidebar's 14px rows stay) — never in content, order or which destinations exist.

- Retire `MENU_NAV`, `MENU_SECTIONS`, `buildSideMenu()`, `renderQuickSettingsMenu()`,
  `setQuickSettingsOpen()`, the `daily_qs_open` key, `.ds-settings-row`, `.ds-caret-btn` and
  `#quick-settings-menu`.
- **The quick-settings caret is deliberately removed.** Its three shortcuts (All settings,
  Account & sync, Appearance) are one tap deeper on a Settings landing page that is itself
  searchable, and keeping it meant the sidebar had one row that expanded differently from every
  other row. Say in the completion report that it was removed and what would restore it, so the
  decision is reversible.
- Delete the twelve literal `.ds-item` buttons from `index.html:51–68`, replacing them with an
  empty `<div id="ds-nav"></div>` between `.ds-logo` and `.ds-profile`.
- Keep `.ds-item` as the ROW class if you like, but the hook the JS reads is `[data-nav-row]`.

Group headers reuse the existing `.ds-section` type (11px / 700 / .08em / uppercase) and become
`<button>`s with a chevron that rotates 180° when open, matching `.ds-caret-btn.open svg`, which
is the app's existing disclosure idiom.

## A4. Accordion behaviour

- **Exactly one group is open at a time.** Navigating opens the group that owns the destination
  and closes the rest. This is what keeps the component shorter than the twelve flat rows it
  replaces while reaching twice as many places.
- Tapping a closed group's header opens it and closes the open one. Tapping the open group's
  header collapses it (all closed is a valid state).
- The animation is `max-height` + `transform` on the chevron, matching `#quick-settings-menu`'s
  existing 0.25s ease. No layout thrash, no JS-measured heights.
- **Expansion state is device-local.** Store it under `daily_nav_ui` with a plain
  `localStorage.setItem`, **never** `lsSave(key, value, syncName)` — the three-argument form is
  the synced path, and the sidebar is desktop-only, so a phone must not write a preference only
  the laptop reads. `daily_pantry_ui` is the precedent. Wrap reads and writes in try/catch and
  render correctly with no stored value.

## A5. The sidebar must be able to scroll — this WILL break otherwise

`#desktop-sidebar` is `height:100vh; position:sticky; top:0` with **no `overflow-y`**, and
`.ds-profile{margin-top:auto}` pins the profile row to the bottom. Twelve rows just fit. The
moment a group expands past the viewport the profile is pushed off screen with nothing to
scroll.

Required:

```css
#ds-nav{flex:1;min-height:0;overflow-y:auto;scrollbar-width:none;-ms-overflow-style:none}
#ds-nav::-webkit-scrollbar{display:none}
```

`min-height:0` is the part that is easy to miss and the part that makes it work — a flex child
will not shrink below its content height without it. Hide the scrollbar the same way every other
horizontal strip in the app does (`.lg-scroll-x`, `.stats-tab-row`), for the same reason.

`#side-menu` already has `overflow-y:auto`; confirm the accordion does not fight it and that the
sheet still reaches its last row above the home indicator.

## A6. What must NOT change in Part A

- **`NAV_ORDER` and the swipe deck.** The five bottom-nav tabs, their order, the pill and the
  swipe gesture are out of scope. `CLAUDE.md`: the list IS the deck, and a view named there must
  be a `.swipe-panel` inside `#swipe-deck`.
- **`#header-stats-pill`** — the mobile header's Stats chip stays.
- **`SETTINGS_SECTIONS` / `SETTINGS_GROUPS` / `SETTINGS_SEARCH`** and the Settings screen's own
  master–detail layout at `STG_SPLIT_MIN` (1180). Untouched.
- **Persisted keys.** Settings section keys are persisted for deep links; `NAV_TREE` row ids are
  new and internal, so they may be anything, but nothing existing may be renamed.
- No data, no calculation, no storage shape, no Firebase path changes anywhere in Part A.

---

# PART B — One visual system

## B1. One segmented control

There are five implementations of the same strip and no two agree:

| Screen | Class | Track r / pad / gap | Button | Type | Desktop width |
|---|---|---|---|---|---|
| Stats | `.stats-tab-row` `css/workout.css:467` | 10 / 3 / 4 | r8, 8×13 | 12px 500 → **700** | 760px **centred** |
| Log | `.log-tab-row` `css/workout.css:344` | 10 / 3 / 4 | r8, 8×13 | 12px 500 → 700 | 760px **left** |
| Nutrition | `.nut-tabs` `css/nutrition-modals.css:212` | 12 / 3 / **0** | r9, 9×5 | 12px **700** → 700 | **full width** |
| Kitchen | `.kit-subnav` `css/kitchen-extras.css:4` | 12 / 3 / 6 | r9, 8 | **13px 600 → 600** | full width |
| Budget | `.sub-toggle` **inline styles**, `index.html:201` | 10 / 3 / 0 | r8, 8 | 13px 500 → 700 | full width |

Replace all five with **one** class, defined once in `css/workout.css` (which already owns two of
them and loads before the three files that would otherwise have to be edited to win a tie):

```css
/* The ONE segmented control. Five near-identical implementations were collapsed into this —
   .stats-tab-row, .log-tab-row, .nut-tabs, .kit-subnav and Budget's inline-styled .sub-toggle.
   Geometry, type and the selected treatment live here and nowhere else. The only thing a
   screen chooses is whether its buttons FILL the track (3-4 tabs, fits a phone) or SCROLL
   (Stats' six), and that is a modifier, not a second control. */
.seg-tabs{display:flex;gap:4px;background:var(--border);border-radius:10px;padding:3px;
  margin-bottom:16px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.seg-tabs::-webkit-scrollbar{display:none}
.seg-tabs>button{padding:8px 13px;border:none;background:transparent;border-radius:8px;
  font:inherit;font-size:12px;font-weight:500;color:var(--muted);cursor:pointer;
  white-space:nowrap;-webkit-tap-highlight-color:transparent}
.seg-tabs>button.on{background:var(--card);font-weight:700;color:var(--text);
  box-shadow:0 1px 3px rgba(0,0,0,.1)}
.seg-tabs>button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.seg-fill>button{flex:1 0 auto}      /* Log, Nutrition, Kitchen, Budget */
.seg-scroll>button{flex:0 0 auto}    /* Stats — six tabs do not fit a phone */
```

- `.seg-fill` for Log (4), Nutrition (3), Kitchen (3), Budget (4). `.seg-scroll` for Stats (6).
- The selected class is `.on`, matching `.stats-seg button.on` and `.wkr-tabs button.on`. Update
  the JS that toggles it: `setLogTab`, `setStatsTab`, `kitSetTab` (which currently toggles
  `.active` on `#kit-tab-<t>`), `nutRender` (which rebuilds the strip's HTML each render) and
  `setBudgetView` (which currently **writes inline styles** to swap tab state — that is the one
  that must change the most; strip every `style=` attribute off those four buttons in
  `index.html:202–205`).
- **`.kit-subnav-btn` and `.stats-tab-btn` appear in the press-lift and `:active` selector lists
  at `css/budget-home.css:738` and `:741`.** Replace both entries with `.seg-tabs>button` — do
  not leave the old names behind and do not drop the press feedback.
- Kitchen's strip is the one that visibly changes: 13px/600 → 12px/500, and its selected tab now
  gains weight instead of relying on fill alone. That is the point.

### B1.1 Alignment — this is the fault in the screenshots

`css/workout.css:629` gives the Stats strip `max-width:760px; margin:0 auto 20px`.
`css/budget-home.css:1021` gives the identical Log strip the same cap with **no auto margin**.
So on Stats the strip is centred at the middle of a 2200px canvas while the week selector, the
Money/Work/Life/Reflection pills and both card columns start at the left content edge — the strip
is the only element on the page off that line.

One rule, applied to every strip:

```css
@media (min-width:1024px){
  .seg-tabs{max-width:760px;margin-left:0;margin-right:auto}
}
```

Delete `css/workout.css:629–630` and `css/budget-home.css:1021`. 760px is not new — it is the cap
Log and Stats already chose, and it exists because four pills stretched across a wide monitor is
absurd.

### B1.2 Sticky behaviour

Today: Stats sticky at ≥1024 only, Nutrition sticky at every width, Budget sticky on landscape
phone with its own `--bud-switch-h` and a `::before` bleed, Log and Kitchen never sticky.

Make it uniform — `position:sticky; top:0; z-index:8` on `.seg-tabs` at every width — and give
the track a bleed so content does not show through the panel padding beside it, modelled exactly
on `#view-budget .sub-toggle::before` (`css/budget-home.css:1569`), which already solves this.

**Escape hatch:** if the bleed cannot be made clean on a particular screen — the likely candidate
is Log, where `#view-log` › `#log-sub-today` › `#log-session` › `.log-cols` is a chain of
flex pass-throughs that exists specifically to keep the pinned rest timer from scrolling away —
then leave THAT screen's current sticky behaviour, and say which screen and why in the completion
report. Do not leave a half-pinned strip with a transparent gutter on any screen.

### B1.3 What must not change

**The Log strip must not use `scrollIntoView()`.** `#view-log` is a `.swipe-panel` inside the
transformed `#swipe-deck`; `scrollIntoView()` walks every scrollable ancestor and shoves the deck
sideways, exposing bare background. `setLogTab` and `setStatsTab` both nudge the strip's own
`scrollLeft` by a measured rect offset instead. Keep that; if you unify the strips, unify that
scroll-into-view helper too, and keep it rect-based (`.seg-tabs` is `position:static`, so it does
not depend on `offsetParent`).

## B2. The uppercase micro-label scale — three steps, not nine

Nine near-identical eyebrow treatments exist at 9, 9.5, 10, 10.5 and 11px, weights 600–800,
tracking .04–.12em, across three colour tokens. Two of them appear in the same card on Stats ›
Review: "SPENDING" at 11px/700/.06em and "TOTAL SPENT" at 12px/800/.04em.

Settle on three steps, each with a different JOB:

| Step | Value | Job |
|---|---|---|
| **Section / card eyebrow** | `11px / 700 / .06em / var(--text-2)` | the label above a card or a group of cards — canonical `.card-label, .sec-label`, `css/kitchen-extras.css:516`, unchanged |
| **Sub-label** | `10px / 700 / .06em / var(--muted)` | a label INSIDE a card: a totals row, a split cell, a field |
| **Hero eyebrow** | `10px / 800 / .1em / rgba(255,255,255,.72)` | white-on-accent, on a hero surface only |

Change these selectors to alias the right step, keeping each one's own margins, hairlines and
layout:

- → **eyebrow**: `.lg-card-lbl` (`css/workout.css:373`), `.stats-kicker` / `.stats-sec-label`,
  `.wkr-sec-divider` (keep its `::after` hairline), `.nut-section-label`, `.jrn-month`,
  `.jrn-ed-kind`, `.jrn-loops-ttl`
- → **sub-label**: `.wkr-total-l`, `.card-split-l`, `.mt-lbl`, `.jrn-ed-lbl`, `.wkr-opp-n`
- → **hero eyebrow**: `.lg-hero-lead`, `.nut-kcal-label`, `.budget-hero-week-label`,
  `.budget-hero-income-label`, `.budget-hero-stat-label`, `.kitchen-hero-card .card-label`,
  `.log-strip-label`

**Do not sweep beyond that list.** Specifically leave alone:

- Every `font-size` below 10px inside `.hl-*` (Settings → Home Layout preview thumbnails) and
  `.ob-mini-*` / `.ob-pv-*` (onboarding mini screens). `CLAUDE.md` is explicit: these are
  scaled-down replicas of real cards, and the small type is deliberate.
- The dense recipe/pantry labels (`.kit-pchip-def`, `.kit-step-who`, `.kit-po-def`,
  `.kitpantry-*`) — different component, different density, not card headers.
- Roughly half the app's type is declared inline in `js/app.js` and `index.html` (~420
  declarations against ~420 in all CSS). A blind CSS-only sweep would make the app **less**
  consistent, not more. The eyebrow is one of the few cases that is almost entirely in CSS,
  which is exactly why it is the one being done.

## B3. Log card headers join the shared vocabulary

The Log hub builds its headers by hand — `'<div class="lg-card-hd"><span class="lg-card-lbl">…'`
at `js/app.js:24733, 24759, 24784, 24808, 24871, 24889, 24908, 24941, 24956, 24562, 24569, 24584`
— with **no icon** and a 6px bottom margin, while Home, Budget, Stats and Weekly Review all use
`cardHeader(icon, label, rightHtml)` → `.card-hd` + a 14px `--text-2` icon + `.card-label` with a
10px margin. Those four bare headers in Log › Today are the only iconless card headers in the app.

Convert every one to `cardHeader()`, using names that already exist in `CARD_ICONS`
(`js/app.js:17246`): `wallet bank scale trophy check note pot calendar cloud flame receipt trend
target cart pin alert repeat down medal`. Suggested mapping — 7-day consistency → `calendar`,
What should I improve? → `trend`, How is my weight moving? → `scale`, What have I completed? →
`check`, Now training → `flame`, Saved programs → `pin`, Import & export → `down`. **Do not add
new icons to `CARD_ICONS` for this**; if nothing fits, say so rather than inventing one.

The right-hand action links keep their behaviour but adopt one class: `.lg-card-act` (12px/800),
`.card-hd-act` (12px/700), `.stats-inline-link` (12px/700 underlined) and `.rev-act` (11px/800 in
a bordered button) are four treatments of "the secondary action on a card header". Keep
`.rev-act` — it is a real button in a row of buttons, a different component — and collapse the
other three onto `.card-hd-act`.

Retire `.lg-card-hd` / `.lg-card-lbl` once nothing references them.

## B4. Log's cards are on the wrong surface token

`css/workout.css:370`:

```css
.lg-card{background:var(--card);border:1px solid var(--border);…}
```

`--card` is the **control** token — in dark mode a flat `rgba(255,255,255,.055)`, meant for
inputs, calculator keys, segmented "on" states and filter chips. Genuine content cards read
`--surface-card` / `--surface-card-border` / `--surface-card-top`, applied through the explicitly
named selector list at `css/budget-home.css:794` ("The matte content-card surface"). **`.lg-card`
is not in that list.** So the four Log overview cards render as translucent wash panels with a 1px
`--border` outline while every other card in the app renders on solid `#1b1b1d` with a 0.5px
`--card-border` and an inset top highlight.

Add `[data-theme="dark"] .lg-card,` to that selector list and change `.lg-card`'s own border to
`0.5px solid var(--card-border)` to match `.card` (`css/budget-home.css:2`). `.psw-card` is
already in the list, so the pattern is established — `.lg-card` simply missed it.

**Do not "simplify" this by pushing the card treatment into `--card`.** ~120 rules read that
token and most of them are controls; a global swap puts a miniature card behind every button. And
never widen the list to `[class*="card"]` — several classes use "card" as a historical name while
behaving like a button or a row (`.kit-subnav-btn.active`, `.acct-type-btn.on`, `.hl-prev-plain`,
`.ob-pv-card`).

## B5. Finish the `--accent-hero` migration

`applyAccent()` (`js/app.js:1382`) writes `--accent-hero` / `--accent-hero-2` as contrast-checked
**solid** stops from `heroStopsFor()`, which keeps hue and saturation and walks lightness down
until white clears 4.2:1. Exactly two rules consume them: `.hm-accent`
(`css/budget-home.css:543`) and the AI hub header (`css/kitchen-extras.css:1593`).

Nine hero surfaces are still on the retired `rgba(var(--accent-rgb), .9 → .4)` ramp, which blends
into `--bg` at its pale end:

| Rule | File | Has a `[data-theme="light"]` floor? |
|---|---|---|
| `.ov-hero` | `css/workout.css:681` | yes (patching the symptom) |
| `.fin-hero` | `css/workout.css:534` | yes |
| `.hl-prev-hero` | `css/nutrition-modals.css:102` | yes |
| `.budget-hero-card` | `css/budget-home.css:348` | **no** |
| `.hero-workout-card` | `css/kitchen-extras.css:526` | **no** |
| `.kitchen-hero-card` | `css/kitchen-extras.css:1225` | **no** |
| `.nut-hero` | `css/nutrition-modals.css:215` | **no** |
| `.lg-hero` | `css/workout.css:358` | **no** |
| `.ldh-*` day hero | `css/workout.css:261, 332` | **no** |

Convert all nine to `linear-gradient(150deg, var(--accent-hero), var(--accent-hero-2))` and
**delete the three `[data-theme="light"]` floors**, which exist only to patch the ramp's pale end
and become dead weight once the stops are solid. The hero stops are theme-INdependent by design —
a hero fill carries white in both themes — unlike `--accent-text`, which `applyTheme()` re-derives.

Two things not to disturb:

- **`.log-day-hero-card`'s gradient and shadow are set INLINE per training day in `js/app.js`
  (~line 1979).** That is the dynamic day-colour system. If you touch it, it must go through
  `applyAccent()` / `heroStopsFor()`, never a fixed CSS gradient.
- **The heroes now restyle themselves the moment `applyAccent()` writes the token**, which is why
  `applyDayColour()` no longer force-re-renders the Month/Year or Finance heroes. Do not re-add
  that re-render.

## B6. Nutrition adopts the tokens

`js/nutrition.js` and `css/nutrition-modals.css` were written after the design tokens were
settled and ignore several of them.

1. **Radii.** `.nut-hero` is `20px`, `.nut-meal` `16px`, `.nut-food-list` `15px`. Tokens are
   `--radius-hero:24px` and `--radius-card:22px`. Use the tokens.
2. **Empty state.** `nutRenderToday()` renders a literal `—` at 38px for calories and three more
   for the macros when nothing is logged. That reads as broken, not as "nothing logged yet",
   despite the chip beside it saying exactly that. The house rule is that every card needs a real
   empty state and that missing data is never drawn as zero. Replace the four dashes with one
   short line of copy in the hero's own voice ("Nothing logged yet · target 3,062 kcal") and drop
   the macro row entirely until there is a value — the meal cards below already carry the
   "+ Add food" affordance, so the hero does not need to repeat it.
3. `.nut-meal` and `.nut-food-list` already read `var(--surface-card, var(--card))`; leave that,
   it is correct.

## B7. Reconcile the duplicate sidebar CSS

`#desktop-sidebar` and `.ds-item` are each defined twice, in `css/budget-home.css:886–897` and
`css/kitchen-extras.css:801–809`. The second wins on load order; the first's width (160px),
font-size (12px) and `border-left` rail are dead. Since Part A rewrites this component anyway,
end with ONE ruleset. Keep the winning values (260px, 14px rows, pill selected state,
`rgba(var(--accent-rgb),.13)` fill with `--accent-text` label). Keep the `.ds-item.active`
transition entry in the day-colour fade list at `css/kitchen-extras.css:826`.

---

## Guardrails for the whole prompt

- **No data, storage, calculation or Firebase changes.** Not one. Both parts are presentation and
  wiring. The only new persisted value in the entire prompt is the device-local `daily_nav_ui`
  expansion state.
- **Do not seed anything at boot.** `AGENTS.md`'s `_bootPhase` trap applies: `daily_nav_ui` must
  stay absent until the user actually collapses or expands a group.
- **Namespacing.** `CLAUDE.md` records three separate incidents where a generic class name
  silently restyled another feature — `.set-row` (settings vs workout rows), `.empty` (a live
  bare class in `workout.css` that matched a `.jrn-comp-line.empty` modifier), and `.wr-*`
  (Weekly Review vs Home's Week-in-review card). Before introducing `.seg-tabs`, `.seg-fill`,
  `.seg-scroll`, `#ds-nav` or `[data-nav-row]`, **grep for each one across all nine CSS files,
  `index.html`, `js/app.js` and `js/nutrition.js`** and report that they are free. Remember
  `js/app.js` builds some class names by string concatenation (e.g.
  `` `kit-card kit-c-${category}${sel}` ``), so grep for the concatenation pattern too, not just
  the literal.
- **Accent rules.** Fills, borders and progress bars that carry white text → `--accent`. Accent
  text or icons on `--bg` / `--card` → `--accent-text`. The default accent is a neutral grey, so
  a selected state carried by an accent TINT alone is invisible on `#080808` — that is why
  `.stats-tab-btn.active`, `.wkr-tabs button.on` and the Journal rail all carry the selection
  with fill and weight instead. The nav's selected row must do the same.
- **Colour is never the only cue.** A selected nav row needs its accent rail AND its weight
  change; a selected tab needs its fill AND 700.
- **Press-lift discipline.** The lift means "this opens something". It covers `.card`,
  `.ex-card`, `.stat-card`, `.sum-card`, `.session-card`, `.week-section` and `.stg-group`, and
  must never cover a form card or a hero panel. If nav groups get a press state, it is the row
  that responds, not the group card.
- **Do not reorder the CSS `<link>` tags.** New files are appended, never inserted.
- **Bump `CACHE_NAME` to `daily-v298` exactly once** in `service-worker.js`, with a version
  comment describing this release.
- **Do not commit, push or deploy.**

## Update the documentation

`CLAUDE.md` must come out of this accurate. At minimum:

- Rewrite the **Navigation** section: the sidebar and hamburger are one `NAV_TREE` registry with
  six accordion groups; `MENU_NAV`, `MENU_SECTIONS`, `buildSideMenu()` and the quick-settings
  popover are gone; `navGo()` / `navCurrentRow()` / `setNavActive()` are the entry points; the
  sidebar's nav list scrolls independently of the profile row.
- Add `.seg-tabs` to the shared vocabulary alongside `.card-hd` / `.card-fig`, and record that
  the five old strip classes are retired and must not come back.
- Record the three-step micro-label scale and the named selector list it applies to.
- Add `.lg-card` to the matte-surface note.
- Update the `--accent-hero` note: the migration is finished, all hero surfaces read the tokens,
  and the three `[data-theme="light"]` floors are gone.
- Fix the two stale facts named in "Required reading" above.

---

## Verification checklist

Work through these on the phone and on the laptop. Report each as pass, fail or not-tested with
the reason.

**Navigation — structure**

1. Desktop sidebar shows exactly six group headers and no loose rows.
2. Every row in every group opens the destination its label promises, including the deep ones:
   Training › Exercises lands on Log › Exercises with that sub-tab selected, Money › Month lands
   on Budget › Month, Stats › Finance lands on Stats › Finance.
3. Opening a group closes the previously open one. Tapping the open group's header collapses it.
4. Navigating from anywhere — a bottom-nav tap, a swipe, a card's "All history →" link, a hash
   reload — opens the correct group and lights the correct row.
5. Exactly one row is ever lit. Screens with no row (full-screen editors, the evidence overlay,
   Settings detail) light none, and nothing is left lit from before.
6. The hamburger shows the same six groups, the same rows, in the same order, with phone-sized
   targets.
7. Reload with `#log`, `#budget` and `#stats` in the URL: the app boots, no
   `Cannot access … before initialization` in the console, and the nav lands on the right group.

**Navigation — layout**

8. Expand the largest group (Money, six rows) on a 1024px-tall window: the sidebar's nav list
   scrolls and the profile row stays pinned at the bottom, visible.
9. Expand a group in the hamburger on the shortest phone viewport you can reach: the sheet
   scrolls to its last row and nothing is trapped under the home indicator.
10. Collapse a group, reload: the state is remembered. Sign in on the phone: the phone's menu is
    unaffected by the laptop's expansion state.
11. Resize across 1024px with a group open — no stranded, blank or duplicated nav.

**Segmented controls**

12. Log, Stats, Nutrition, Kitchen and Budget: the strip has the same height, corner radius, text
    size and selected treatment on all five. Measure, do not eyeball.
13. On desktop all five strips start at the same left edge as the content beneath them and stop
    at the same width. **The Stats strip is no longer centred** — this is the specific fault this
    prompt was written for.
14. Stats' six tabs still scroll horizontally on a phone; the other four still fill their track.
15. Cycle every sub-tab on Log: `#swipe-deck`'s transform and `#app-main.scrollLeft` are
    unchanged afterwards (the `scrollIntoView` trap).
16. Budget's Week/Month/Bills/Year still switch correctly with the inline styles removed, and the
    selected tab is right after a reload and after switching weeks.
17. Any strip that is sticky is opaque across the full panel width while content scrolls under
    it — no content visible in the gutter beside the track.

**Visual system**

18. Log › Today's four cards sit on the same surface as Stats' and Budget's cards in dark mode —
    same fill, same border weight, same top highlight. Compare them side by side.
19. Log › Today's card headers have icons and match the Weekly Review card headers in size,
    weight, tracking and colour.
20. No two uppercase eyebrows on the same screen are different sizes. Check Stats › Review
    ("SPENDING" vs "TOTAL SPENT") and Log › Today specifically.
21. The Home Layout preview thumbnails and the onboarding mini screens still have their
    deliberate sub-10px type.
22. Every hero — Home session, Log Today, Budget week, Budget Month/Year, Kitchen, Nutrition,
    Stats Overview, Stats Finance, Accounts — is a solid gradient with legible white labels, in
    **both themes**. The five that had no light-mode floor are the ones to check hardest in light
    mode.
23. Set a pale custom accent in Settings → Appearance and repeat 22. Then set a night weather
    scene and repeat. No hero goes unreadable; no chart series disappears.
24. Switch to a per-training-day colour: the day heroes still change colour and the Month/Year
    and Finance heroes update without a forced re-render.
25. Nutrition › Today with nothing logged reads as "nothing logged yet", not as a broken card
    with dashes. Log one food: the hero fills in correctly.
26. Nutrition's hero, meal cards and food list use the same corner radii as cards elsewhere.

**Regression**

27. Every screen in both themes, on a phone and a laptop, top to bottom. No blank panel, no
    doubled scrollbar, no horizontal body scroll.
28. Kitchen: recipes, shopping list, pantry switching and cooking mode all still work with the
    new strip class.
29. Weekly Review: open a completed review and an unstarted one. The frozen snapshot still
    renders exactly as completed; the Money figures still reconcile with Budget and Stats ›
    Finance.
30. Console clean on load and on every navigation. No uncaught errors, no 404s.
31. `wt_plans`, `wt_split`, `wt_sessions`, `kitchen_pantry`, the budget weeks and
    `daily_review_plan` are **byte-identical** before and after a full click-through. Diff them.
32. Sign in on a second device and confirm nothing about the nav wrote to the synced blob.
33. Export a full backup, import it into a clean profile: everything restores, and the nav
    expansion state does NOT travel with it.
34. Hard-reload the installed PWA and confirm the new `CACHE_NAME` took effect and no screen is
    serving stale CSS.

## Completion report

Report:

- The final `NAV_TREE` (groups and rows as shipped), and any row you placed differently from the
  spec, with the reason.
- Every duplicated `.ds-item` active-state site you removed, by line, and the single function
  that replaced them.
- Which screens' strips are sticky and which are not, with the reason for any that kept their old
  behaviour under the B1.2 escape hatch.
- The exact selector list you applied each micro-label step to.
- Confirmation that `.seg-tabs`, `.seg-fill`, `.seg-scroll`, `#ds-nav` and `[data-nav-row]` were
  grep-clean before use, including the string-concatenation check.
- Every file changed, and the `CACHE_NAME` bump.
- Verification results, separating what you tested from what needs Francois's signed-in account,
  a second device or a physical iPhone.
- What the removal of the quick-settings caret cost, and how to restore it if he wants it back.
- Anything you deliberately did not do, and why.

This is not complete when the sidebar has groups. It is complete when there is **one** place to
add a destination, **one** segmented control, **one** eyebrow scale, and no screen that looks like
it was built by a different person.
