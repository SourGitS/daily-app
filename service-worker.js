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
const CACHE_NAME = 'daily-v251';

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
  './js/app.js',
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
