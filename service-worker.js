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
const CACHE_NAME = 'daily-v301';

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
  './js/app.js',
  './js/nutrition.js',
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
