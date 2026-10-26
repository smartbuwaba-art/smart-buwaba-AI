const CACHE_NAME = "smart-buwaba-shell-v21";
const APP_SHELL = ["/", "/index.html", "/manifest.json", "/icons/smart-buwaba-192.svg", "/icons/smart-buwaba-512.svg"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // AI calls must always reach the server; never cache API replies.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put("/index.html", copy));
        return response;
      }).catch(async () => {
        return (await caches.match("/index.html")) || (await caches.match("/"));
      })
    );
  }
});
