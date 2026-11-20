// WINDMILL — service worker.
// Cache convention (from Dandelions): bump CACHE by hand whenever ANY cached
// file changes, e.g. 'windmill-v1' -> 'windmill-v2'. Otherwise phones that
// installed the app keep serving the old files.
const CACHE = 'windmill-v4';

const ASSETS = [
  '.',
  'index.html',
  'wake.js',
  'game.js',
  'style.css',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
];

// Install: pre-cache all game assets.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  // Activate immediately instead of waiting for old tabs to close.
  self.skipWaiting();
});

// Activate: delete any old cache versions.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first, fall back to network.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
