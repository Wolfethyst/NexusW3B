// src/sw.js
const CACHE_NAME = "nexus-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/mobile.css",  // <--- Added this so mobile layout works offline
  "/app.js",
  "https://fonts.googleapis.com/css2?family=Marcellus&display=swap",
  "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&display=swap"
];

// 1. Install: Cache core files
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

// 2. Fetch: Serve from cache, fall back to network
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  
  e.respondWith(
    caches.match(e.request).then((cached) => {
      return cached || fetch(e.request);
    })
  );
});

// 3. Activate: Clean up old caches (Critical for updates)
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});