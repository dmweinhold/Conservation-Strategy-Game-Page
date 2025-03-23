const CACHE_NAME = "conservation-game-cache-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/main.js",
  "/UserInput.js",
  "/grid.js",
  "/strategy.js",
  "/gameLogic.js",
  "/images/title_cover.png",
  "/images/terrain.png",
  "/images/icon-192.png",
  "/images/icon-512.png",
  "/images/Conservation_Game_UserManual.pdf",
  // Add any other assets or images you use
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
