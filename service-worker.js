// BUMP THIS ON EVERY RELEASE THAT CHANGES ANY FILE IN ASSETS.
// The fetch handler is cache-first, so an installed PWA keeps serving the old bundle until the
// cache NAME changes — a deploy with the same name reaches nobody who already has the app on
// their home screen. v241: Stats becomes an evidence-led insight system with canonical finance,
// literal training history, honest coverage states, and source-record drill-downs.
const CACHE_NAME = 'daily-v241';

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
