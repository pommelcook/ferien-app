// ===========================================================
// SERVICE WORKER - macht die App offline nutzbar
// ===========================================================
// Speichert die "Hülle" der App (HTML/CSS/JS) im Gerätecache,
// damit sie auch ohne Internet startet. Die eigentlichen Daten
// laufen separat über store.js (localStorage + OneDrive-Sync).

const CACHE_NAME = "ferienapp-cache-v9";
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/config.js",
  "./js/auth.js",
  "./js/graph.js",
  "./js/store.js",
  "./js/app.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Graph-API-Aufrufe NIE aus dem Cache bedienen - die müssen live sein
  if (event.request.url.includes("graph.microsoft.com") || event.request.url.includes("login.microsoftonline.com")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
