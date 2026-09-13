// Minimal app-shell cache (Build Spec §8 PWA). Vite fingerprints built asset
// filenames, so this deliberately does NOT try to pre-list them — it caches
// whatever the browser actually fetches (runtime caching) instead of a
// build-time manifest, which keeps this file dependency-free and correct
// across every build without a companion generation step.
const CACHE_NAME = 'wrvu-shell-v1';
const APP_SHELL = ['.', 'index.html', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept API POSTs — the app's own offline queue owns retry logic
  if (new URL(req.url).origin !== self.location.origin) return; // don't cache the Apps Script backend

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match('index.html').then((res) => res || caches.match('.')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
