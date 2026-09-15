// BUMP THIS ON EVERY RELEASE THAT CHANGES ANY FILE IN ASSETS.
// The fetch handler is cache-first, so an installed PWA keeps serving the old bundle until the
// cache NAME changes — a deploy with the same name reaches nobody who already has the app on
// their home screen. v247: stop variable-expense double counting behind an explicit
// Replace/Keep choice, show exact money in the variable totals, add a real Weather settings
// section and stop sample/stale weather driving the app colour, rebuild the expense modal
// around the visual viewport, and give the app shell one central viewport lifecycle so the
// half-height landscape screen after a keyboard + rotation cannot come back. v248 lifts the
// exercise-swap sheet above the iOS keyboard so its Reset/Save row stays reachable, stops the
// Pantry stock-indicator badges sticking to the top of the list while it scrolls, re-pages the
// swipe deck after a rotation reports the old orientation's width (the "stuck halfway"
// screen), makes the pinned Budget controls opaque across the panel's own padding, and shrinks
// the weather card's sun and moon so the glow reads as sky rather than as the card's subject.
// v249: rebuild onboarding — a Home preview instead of an emoji feature list, a focus step
// that branches the flow so nobody is walked through setup they did not ask for, appearance
// folded in with accent modes, income/bills deferred to a Budget setup card, a weather
// permission moment that turns the sample card into the user's real sky, live outcome
// previews, named-phase progress, and a finish that lists what was actually created.
// v250 gives that approved journey its final Living Home visual direction: the opening is
// assembled from atmospheric versions of Daily's real cards, every setup surface now shares
// the app's glass/card language, cloud sync uses the shared line-icon family, and Ready closes
// on a quieter single-focus confirmation without changing any onboarding behaviour.
// v251: rebuild Pantry around what needs replacing — the summary counts become the filter, a
// search field, collapsible categories carrying their own warning counts, one three-state
// status pill in place of a checkbox plus an always-present Low button, compact rows grouped
// onto one surface per category, category filter chips, and a single add form replacing five
// permanent per-category inputs. Filter and collapsed state are device-local.
// (v250 shipped separately as the onboarding visual pass, so this takes the next name — a
// device that already fetched v250 would otherwise never see the Pantry rebuild.)
// v252 collapses Kitchen's two always-visible recipe filter rows behind one mobile Filters
// button while keeping a one-tap All recipes reset and the existing desktop filter layout,
// and flattens Home's Personal records rows into a divided list instead of nested grey boxes.
// v253: centre the Daily + AI grid. It was capped at 1180px but left-aligned, so a 1900px
// window showed 421px of dead space against the right edge, under a centred title bar.
// v254: rebuild Settings as a searchable control centre — labelled groups, a search index over
// individual settings rather than the ten menu names, live value summaries on every row, one
// shared card/field/button/save vocabulary across every settings screen (the new
// css/settings.css, added to ASSETS below), danger zones for destructive actions, and a
// two-column desktop landing. Also retires the .set-row collision that had been overriding the
// Log screen's set-row grid app-wide, so the Log tab changes appearance too.
// v255: stop the Home weather card's sky gradient tiling under its 1px border. The image is
// sized to the padding box but painted across the border box, and background-repeat defaults
// to repeat, so the top edge was showing the gradient's LAST colour stop — a bright pink
// hairline on clear-dusk, orange on the warm scenes.
// v256: replace Settings' uneven two-column desktop landing with a master-detail workspace:
// one continuous navigation surface, a live overview, and inline section content at >=1180px,
// while preserving the pushed detail screens on phones and narrower desktop windows.
// v257: equalise paired Stats Overview cards on desktop and use the signed-in Google profile
// photo in the desktop sidebar as well as the existing header and Settings profile surfaces.
// v258: add a Bills calendar view to Budget (current month + next two, generated read-only
// from each recurring charge's saved dueDate + cycle, plus credit-card statement due dates),
// an "Until next pay" forecast above the due banner, and an optional Finance check-in card on
// Home. Also unifies Budget's four competing warning colours on the --warn amber set — the
// credit-card due banner was rendering red via --amber, which is #ef4444.
// Two long-standing arithmetic bugs surfaced by that work are fixed in the same release:
//   · budRecalc merged the live inputs over the week, and only non-recurring categories have
//     inputs — so weekFixedTotal took that as the week's whole category list and dropped every
//     recurring charge from Committed. A new week showed "Recurring $69.08" above "Total fixed
//     $67" until its first save froze fixRates, at which point the figure jumped.
//   · catNextDue stepped month by month with setMonth(), which overflows (31 Jan + 1 month =
//     3 Mar) and compounded because each step started from the previous overflowed result. A
//     bill anchored on 31 Jan 2026 reported its next charge as 3 Sept rather than 30 Sept.
//     Anything dated on the 29th, 30th or 31st was affected.
// v259 is a surface-hierarchy pass. Dark-theme content cards stop using the full-height
// white gradient that made a card's height a visual property — a solid charcoal
// (--surface-card, new in css/base.css) replaces it, applied to a NAMED list of content
// containers rather than through --card, which ~120 rules read and most of them are controls.
// --card itself is flattened from a gradient to one tone so inputs, keys and segmented
// controls stay flat. Heroes and the weather card are untouched.
// Journal's desktop layout is rebuilt as a real two-pane workspace: a 380-420px navigation
// list of flat rows beside a lifted charcoal editor that opens on today by default (nothing is
// persisted until a real edit — typing, a mood, a tag). Its split point is JRN_SPLIT_MIN
// (1240), not the app's 1024 desktop line. Mobile Journal stays list-first, and the composer's
// `.empty` modifier is renamed `.is-empty` — workout.css's bare `.empty` was matching it and
// inflating the phone's composer to 167px.
// Budget goes neutral-first: totals and summary figures are plain foreground text, charts map
// to accent = saved, neutral greys = income/committed, one muted warm tone = variable, and the
// savings-rate line is separated by dash and markers rather than a fifth hue. Judgements move
// into tonal status chips (.tstat, sage/ochre/coral, each with an icon and a word). Decorative
// emoji in Budget card chrome are replaced with the monochrome CARD_ICONS set.
// v260 keeps the Daily habits weekly-progress strip visible on wide screens instead of
// hiding it behind the generic Home-card disclosure.
// v261 adds multiple named pantry locations and makes the active pantry the single source of
// truth for Shopping: stocked recipe ingredients move into an informational section, Low/Out
// matches merge into Pantry needs, checked rows are isolated per location, and legacy pantry
// data migrates losslessly through the timestamp-safe sync path.
// v262 refines Stats, Budget and Journal: Overview becomes one compact accent hero without
// decorative sparklines, Finance stacks independently on desktop, the Journal workspace line
// respects its rounded shoulders, and Until next pay moves beneath Variable expenses with a
// persisted collapsed state.
// v263 makes Home's Recent Sessions disclosure reveal the full saved-session list instead of
// expanding a renderer that had already discarded every row after the newest four.
// v264 keeps Pantry location management behind the app's standard Edit / Done disclosure so
// its New, Rename and Delete controls no longer occupy the everyday inventory view.
// v265 also keeps custom pantry-item deletion behind that same deliberate edit state.
// v266 makes Recent Sessions collapse on complete rows with its disclosure inside the card.
// v267 keeps recipe ingredient names visible and editable on phone-sized screens.
// v268 rebuilds Stats > Finance around one shared range, adds Spent in [year], and moves every
// budget and finance chart onto a semantic money palette. v269 reins in the Month and Year
// summaries: compact neutral tiles replace the oversized saturated hero banners while a slim
// semantic edge keeps green-in, red-out and accent-saved easy to scan. v269 also gives recipes
// protein options — one dish, one default protein and any number of alternatives, resolved
// through a single reader for shopping, cooking, logging, export and AI — plus Share recipe
// (readable text) and Copy for Daily (lossless JSON) beside the existing Copy for AI.
// v270 puts the hero treatment back on the Month and Year summaries at SUMMARY size — 84px
// rather than the 136px banners — after the flat-tile version lost the look entirely. The
// accent variant reads --accent-hero, a contrast-checked pair of stops so any colour the
// picker can produce still carries its own white labels.
// v271 gives the Accounts net-worth and debt-payoff cards the same hero surface, at their own
// full width — the surface now carries covered-vs-short, which used to be a coloured figure on
// a flat card.
// v272 replaces Budget > Month's unsorted max-relative spending bars with a reconciled
// category-composition donut, ranked exact-value list, like-for-like month comparison and
// source-week evidence, while keeping transfers explicit and legacy category gaps visible.
// v273 gives every Pantry row a local item editor for category and canonical stock status,
// plus custom-item rename and pantry-scoped removal without changing the schema or reseeding.
// v274 visually links each monthly spending slice to its matching category total.
// v275 resolves historical spending IDs to configured category names and merges duplicates.
// v276 renames the user-facing Daily + AI destination to Daily AI.
// v277 reorganises Daily AI into separate guided Ask AI and Import actions workflows.
// v278: first-class Nutrition, canonical dated food entries and an offline AUSNUT catalogue.
// v279: full-width headerless Nutrition and gold favourites in recipes and Shopping.
// v280: keep favourite recipes at the top of the Shopping recipe picker.
// v281: independent iPhone/desktop composition service and Home layout profiles.
// v282: add a conversational Talk it through goal to Daily AI context export.
// v283: make visible weekly income authoritative over stale legacy snapshots in Finance.
// v285: reconcile duplicate legacy income without hiding genuine archived week history.
// v286: add the opt-in Weekly Review (money/work/life) to Stats > Review, plus css/review.css.
// v287: move Kitchen favouriting off the recipe card face into its menu; the gold card stays.
// v288: Log becomes the workout hub - Today/Program/Exercises/History; Plans is documents only.
// v289: add canonical weight check-ins and a compact recent trend to Log > Today.
// v290: keep the Weekly Review plan editor compact on wide desktop screens.
// v291: add seven-day consistency and progression focus to the Log Today hub.
// v292: replace the Log weight chart with the three latest recorded weights.
// v293: show current weight and the latest recorded change above those readings.
// v294: give Budget's Accounts link a clearer secondary-action hierarchy.
// v295: consolidate the hero cards - one .hero-panel for Budget > Year and Accounts.
// v296: add Budget > Week 'Day by day'; Month's summary becomes one .hero-panel too.
// v297: Month's spending breakdown becomes a ranked bar list - donut and leader lines out.
// v298: one navigation registry (NAV_TREE drives the sidebar AND the hamburger as six
// accordion groups; the quick-settings popover is gone) and one visual system - five
// segmented controls collapse into .seg-tabs, the uppercase micro-labels settle to three
// steps, Log's cards join the matte content-card surface and use cardHeader(), every hero
// reads the contrast-checked --accent-hero stops, and Nutrition adopts the radius tokens
// plus a real empty state.
// v299: heroes follow the accent (.hero-surface reads --accent-hero, so Accounts, Budget >
// Month and Budget > Year stop being the only graphite screens) and the dead .hm-card /
// budHeroMetric component goes; Accounts states net worth once, on the chart card it belongs
// to, leaving the hero panel one cell for the debt payoff position; the Month spending rows
// get fixed label/amount columns so every bar starts at one x, and every magnitude bar in the
// app squares off behind a new --radius-bar token; the Budget week's cards are reordered from
// ONE BUD_CARDS list that both layout modes derive from; and Home's weight card shows the last
// three readings instead of a sparkline.
// v300: the nav groups stop being an accordion - any number can be expanded at once, closing
// one never touches another, and whatever is open persists across a reload.
// v301: promote Budget > Bills calendar's summary into the shared hero panel.
// v302: refine Home weather into 19 scenes with layered cloud banks, fine rain and line icons.
// v303: give Stats > Review a local rail on wide desktop and flow its cards vertically.
// v304: pin the five phone tabs above the nav groups so they are one press, not two.
// v305: financial import - income, transfers, reimbursements, bill payments, balance
// snapshots and expense corrections, with source-row duplicate safety and a grouped preview.
// v308: data safety plus the new identity. Sync: no boot/default uploads, no stale-window
// replacement of workout history, per-record reconciliation for sessions, weights, savings
// entries and budget weeks, listeners released on an account change, and setup waits for the
// restored data. Brand: the borderless DAILY wordmark as a CSS mask inked with the live accent,
// and the static DA app icon for the manifest, favicon and Apple touch icon.
// v309: Home cards compose across a wide desktop column - a figure beside its supporting
// information (Weekly budget, Weight, Accounts), the habits checklist in two columns, a
// reading measure on the comparison lists, and single-line actions sized to their label.
// Opt-in per card, behind the existing 1024px desktop condition plus a 460px container query,
// preserving the phone layout; metric regions wrap when their content needs more room.
// v310: Home gains a second DESKTOP composition. Dashboard lays the cards out as two
// independent vertical stacks - a ~60% "Today & activity" column beside a ~40% "At a
// glance" one - so a tall card no longer stretches the card beside it. The existing Grid
// is unchanged and still the default; every saved layout keeps rendering as Grid until the
// user applies Dashboard themselves. Settings > Home Layout is now two real editors
// (iPhone / Desktop) with per-profile drafts, an explicit Apply, a composition chooser and
// keyboard placement controls. Phone and landscape layouts are untouched.
// v311: the Dashboard weather card gets a proportional height (clamp(150px, 42cqw, 230px))
// instead of sizing to its own text, and the rain and snow fields scale their travel and
// duration with it so precipitation reaches the bottom edge at the same falling speed.
// Dashboard only - the Grid, the phone and landscape are pixel-identical.
// v312: Home's cards become one family. Every card uses the shared header (Journal and
// Habits had their own near-miss label styles); header actions split into a navigation link
// and a quiet in-place button. The session hero is recomposed as a grid with its action
// labelled and grouped with the workout - 241px to 187px at 1440, phone hero unchanged.
// Week in review names the week its figures cover and the older week still awaiting a
// review, and its rows align in fixed columns. Nutrition is one group - ring, figure and
// meals - reads its state from nutDaySummary so an unlogged day says so instead of showing
// its untouched target in green, and shows snacks. Journal's empty composer is a compact
// action on desktop. No storage, sync, calculation or review-record change.
// v313: restore the original plain-gradient workout hero and give Dashboard weather a layered
// neighbourhood scene. Column labels appear only in edit mode. Phone layout stays unchanged.
// v314: Dashboard's workout and weather feature cards share a 300px resting height.
// v315: desktop navigation group controls use the same 14px type scale as destination links.
// v316: Weekly Review begins from an explicit start week, so older Budget history never
// becomes an automatic review backlog; its timing and private-data behaviour are explained in-app.
// v317: private weekly reset, optional pages, dated next-week allocations and guarded drafts;
// remove the personal public starter template.
// v318: rounded, slanted wordmark frame follows the live accent; app icons stay borderless.
// v319: connected weather fronts and a brighter, varied night-sky star field on Home.
// v320: rebuild Budget → Week around six groups. The hero is the one authoritative weekly
// result and carries Add expense; Spending goal + Variable expenses + Day by day merge into one
// Spending card with a By category / By day switch; Income + Fixed + Savings merge into Week
// plan; Upcoming charges + Until next pay merge into Outlook until next pay; Weekly result loses
// the headline the hero repeats and becomes Close out week; Previous weeks, the calculator and
// Accounts move into a compact History & tools section. Presentation only — no calculation,
// store, sync path or migration changed.
// v321: combine Kitchen and Nutrition into one Food destination (Today / Recipes / Shopping /
// Pantry, with Food library and Nutrition Review as supporting screens), and return Stats to the
// five-item mobile bottom nav as a full swipe-deck destination: Home · Budget · Log · Food · Stats.
// Navigation and presentation only — no store, sync path, calculation or migration changed. Old
// #nutrition and #kitchen links resolve through one central mapping (navResolve).
// v322: make Stats → Review look native to Daily. The numbered local sidebar and its
// table-of-contents descriptions are gone, replaced by one compact header (title, week, review
// status, section row) aligned with the Stats content edge; the landing leads with the selected
// week’s figures beside a compact dated next-week summary; insights gain a prominent figure,
// visible dates and a methodology disclosure, with limitations never hidden; and the .rev-list
// flex/align-items contradiction that shrank insight cards to their own text is removed at
// source. Presentation and copy only — no calculation, record, draft rule, storage, sync or
// migration changed.
// v323: three Budget follow-ups. Fixed expenses is a card of its own again, directly below
// Spending on both layouts, so the week's commitments and their weekly total are readable
// without opening Week plan — which keeps a quiet, non-editable echo of the same #sum-fix
// figure so income − fixed − savings still reads there. Accounts gains a labelled button
// beside the four view tabs, outside the tablist because it is an overlay and not a fifth
// budgetView; closing it returns to the same sub-view, week and launcher focus. Outlook holds
// two labelled parts: the unchanged Until next pay projection, and a complete Next 14 days
// schedule (today through today + 13, inclusive) drawn with the Bills calendar's own rows,
// logos and statement treatment, with its own total. The fortnight is a schedule, never a
// projection: it is not truncated, not stopped at payday, and never subtracted from the
// weekly hero. Presentation and navigation only — no calculation, store, sync path or
// migration changed.
// v324: two small Budget corrections. Fixed expenses' header total prints cents
// (fmtMoneyExact) because it sits directly above per-cent rows and a $201 header over a
// $201.08 subtotal read as a bug; Week plan's echo stays whole-dollar, because the
// subtraction printed under IT has to add up on screen. And the recurring breakdown
// remembers whether it is open, in the existing device-local daily_budget_ui blob, which
// is now written read-modify-write so the two preferences sharing it cannot erase each
// other. The disclosure is a real control now (role=button, keyboard, focus ring).
// No store, sync path, calculation or migration changed.
// v325: finish the Outlook card's projection half. Its three supporting facts were stacked
// grey sentences at one size and weight, with a figure and nothing structural under it,
// which is what made it read as unfinished beside the timeline's labelled header row.
// They are cells now, on the app's own .card-split two-up-with-divider vocabulary, each
// carrying a label, a figure and one line of context. The unit says what the number MEANS
// rather than which operation produced it, the no-income state's run-on label became a
// caption, and "dated in the list below" is gone -- it pointed at a list already on screen.
// Fixes one real state bug: with no income entered the figure is the BILLS DUE, and it was
// being painted --positive, stating money going out as a good outcome.
// No store, sync path, calculation or migration changed.
// v326: tighten the projection copy to "estimated left before your next pay" (or estimated
// shortfall), and retire the coloured left-rail declarations that never rendered. The figure
// remains the single green / amber / red state signal. Presentation only.
// v327: Budget gains an OVERVIEW as its first view and its landing screen -- Overview / Week /
// Month / Bills / Yearly, with the Accounts button unchanged beside them and outside the
// tablist. It answers what is available this week, what needs attention, what is due over the
// next fortnight, where the accounts stand and how the month is going, then leads into the
// screens that can change any of it. Read-only: no localStorage key, Firebase path, sync
// registration, migration or boot write, and the one write it can cause is the existing Add
// expense modal. "Available to spend" is now defined once, in budAvailable(), which the Week
// hero, Home's Finance check-in and the Overview all go through; the pay-cycle projection's
// copy and tone come from one shared budForecastPart(). The view strip scrolls (.seg-scroll)
// because five labels plus Accounts do not fit a phone at the filling control's width.
// v328: one correction to that Overview. The "This month" card always describes the CURRENT
// calendar month, but its Open month action was the plain setBudgetView('month'), which
// preserves the browsed month index -- so after paging back to June the September card opened
// June. It calls a new openBudgetCurrentMonth() instead, which resets the index first. Every
// other way into Month (the tab, History & tools, Money > Month, returning from a source view,
// ordinary movement between Budget views) still remembers where you were, deliberately.
// In-memory navigation only: no storage, migration, Firebase path or calculation changed.
// v329: the destination is FINANCE, and Accounts is one of its views. The bottom nav, the
// sidebar's pinned strip, the quick-nav label and "Open Budget" all say Finance now; the
// budgeting CONCEPT keeps its own name (weekly budget, over budget, budget goal, Budget setup,
// budget categories, budget CSV, budget reminder), and the internal view id, the bud* prefixes,
// every DOM id, every storage key and the #budget route are unchanged -- this is a user-facing
// rename, not a data migration. Accounts stops being a full-screen overlay (#view-accounts,
// its top bar, its Back button and closeAccounts() are gone) and becomes the sixth registered
// Finance view: Overview - Week - Month - Bills - Accounts - Yearly, one role="tablist", one
// panel each, remembered within a session like any other. openAccounts() survives as the
// compatibility helper every existing caller still reaches it through. The accounts store, its
// ids, its sync registration, its Firebase path and every calculation are untouched.
// v330: Log > Today is a training BRIEFING, and one canonical reader answers what it shows.
// logTodayBrief() resolves Ready / In progress / Saved today / No usable exercises from
// suggestDay(), S.dayIdx, the draft and the saved record, so the hero can no longer say
// "Session saved", print the name of the NEXT rotation and open a third thing when pressed --
// and Home's session hero reads the same helper instead of a second calculation of its own.
// The overview is now a state-aware hero, Today's plan (per-exercise last result in the
// exercise's OWN unit, with a progression target only where poShouldIncrease supports one),
// a factual Last 7 days -- the "3 / 7 days" score is gone, seven training days was never a
// goal anyone set -- and Recent sessions. Weight left Log entirely; it stays in Stats > Body,
// Home's weight card and the post-save prompt. The set logger, its drafts, timers, swaps,
// session-only exercises, partial saves and sync are untouched.
// v331: two correctness fixes to that overview. A saved session records its exercises, its
// working sets, its duration and its `completed` flag -- it does NOT store how many exercises
// were PLANNED at the time. Reconstructing that from the current program at the record's
// dayNum meant editing the program silently rewrote an old partial workout's displayed
// progress, so it is gone: a partial save now states only what it recorded (no "1 of 5", no
// percentage, no bar), and only a record whose `completed` flag is true shows a full progress
// state, from its own exercise count. Home's empty state also stops falling through to
// UP NEXT -- it reads NO EXERCISES YET / "No exercises configured" / Set up program, matching
// Log. And the end-to-end save check found one more: saveSession() clears wt_setdata but
// leaves the entered sets on screen, so the sets that PRODUCED today's record kept reading as
// a newer draft and the overview said "In progress" the instant you pressed Save. A draft now
// outranks a same-day record only when it has moved since (wt_setdata present again).
// No session schema, storage key, migration, Firebase path or sync helper changed.
// v332: post-save notes, a new timer and session-only adds count as a newer draft even before
// wt_setdata is recreated. Retained saved sets still resolve to Saved today; the reader stays
// read-only and note keystrokes use the unchanged logger path.
// v333: saved partial workouts offer a secondary Continue saved workout action only when
// the logger retains matching meaningful sets. Opening rechecks eligibility, preserves the
// draft and Saved today state, and leaves the primary history action and save path unchanged.
// v334: Food Today becomes a recipe-first overview with in-memory filters, per-serving
// comparison and canonical pantry/shopping/log summaries. The existing food logger remains
// at #food/log; explicit logging links, recipe options and return destinations are preserved.
// Overview browsing and incoming-data refresh add no storage, migration or sync changes.
// v335: Finance tabs keep content widths and consistent side padding on phones, including
// short touch landscapes past the desktop breakpoint. Reveal selection after panel rendering;
// desktop sizing and tab routing stay intact.
// v336: Splits picker, read-only preview, independent creation and explicit workout protection
// on activation. Existing program routes, stores and sync paths remain in place.
// v337: Favourite recipe borders, tints and selection glows follow the dynamic system accent
// in Recipes and the Shopping picker; category colours and favourite behaviour are unchanged.
// v338: Month spending bars and Stats Money flow use theme-aware neutral greys;
// income, saved series and semantic warning colours retain their existing palettes.
// v339: Desktop sidebar groups follow app destinations, with quieter selected rows,
// fixed quick access and reachable group scrolling at short viewport heights.
// v340: Weather refreshes through one lifecycle coordinator with guarded requests and honest
// freshness/retry states; the phone card adds a location-timezone hourly forecast and scene.
// v341: Weather keeps its coordinator but drops the everyday refresh button for a Retry shown
// only when a reading is missing, stale, failed or offline, and the phone card is given room to
// breathe with a scrolling hourly strip; expenses gain an optional Essential / need label with
// week and month totals; the sidebar separates brand, quick access, groups and footer; Finance
// Overview's hero leads with one primary action, This week.
const CACHE_NAME = 'daily-v341';

// Relative to this script's own location (whatever path GitHub Pages serves it under —
// used to be hardcoded to /workout-tracker/, which broke outright when the repo was
// renamed to daily-app: the old absolute paths pointed at a URL that no longer exists).
const ASSETS = [
  './',
  './index.html',
  './css/base.css',
  './css/layout.css',
  './css/workout.css',
  './css/nutrition-modals.css',
  './css/budget-home.css',
  './css/kitchen-extras.css',
  './css/journal.css',
  './css/settings.css',
  './css/review.css',
  './css/brand.css',
  './js/app.js',
  './js/nutrition.js',
  // Runtime brand assets only. The masters, the export script and the ZIP under
  // assets/brand/refined/ are sources, not application assets, and are never precached.
  './assets/brand/daily-wordmark-mask.png',
  './assets/brand/daily-wordmark-light.png',
  './assets/brand/daily-wordmark-dark.png',
  './assets/brand/daily-app-icon-192.png',
  './assets/brand/daily-app-icon-512.png',
  './assets/brand/daily-app-icon-180.png',
  // The retired root icons stay cached: an installed home-screen app can still be pointing at
  // them until the platform refreshes its own copy.
  './icon-192.png',
  './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Only handle GET requests; let Firebase auth/DB and non-GET requests pass through
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // Network-first for the app shell (HTML/CSS/JS) so code updates take effect
  // immediately and you never get a stale/mismatched index.html + app.js combo.
  const isAppShell = event.request.mode === 'navigate' ||
    /\.(?:html|js|css)$/.test(url.pathname);

  if (isAppShell) {
    event.respondWith(
      // cache:'no-cache' forces a revalidation against the server. A plain fetch() here uses the
      // DEFAULT cache mode, which the browser may satisfy from its own HTTP cache — so
      // "network-first" was still capable of returning a stale app.js, and a deployed fix could
      // sit unseen behind a disk-cached copy. This asks the server every time and falls back to
      // the SW cache only when genuinely offline.
      fetch(new Request(event.request.url, {cache: 'no-cache', credentials: 'same-origin'})).then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else (images, CDN libraries)
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
