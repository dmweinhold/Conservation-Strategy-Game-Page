const CACHE_NAME = 'conservation-game-v1.18.0'; // or whatever version you prefer

const urlsToCache = [
  '/',
  '/index.html',
  '/main.js',
  '/UserInput.js',
  '/grid.js',
  '/strategy.js',
  '/gameLogic.js',
  '/images/title_cover.png',
  '/images/terrain.png',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/images/Conservation_Game_UserManual.pdf',
  '/manifest.json'
];

// Install event: cache files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting(); // activate immediately
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event: serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});


