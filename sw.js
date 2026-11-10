/* Spendly service worker
 * - App page: network-first, so new versions show up right away; falls back to the cached copy offline.
 * - Versioned libraries (Firebase SDK, Chart.js, export libs, fonts): cache-first.
 * - Firebase data / auth / App Check traffic is never touched: Firestore keeps its own offline copy.
 * Bump CACHE when you change this file.
 */
const CACHE = "spendly-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
const CACHE_FIRST_HOSTS = ["cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("spendly-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Same-origin pages and files: network first, cache fallback
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined)))
    );
    return;
  }

  // Versioned third-party libraries: cache first
  const isFirebaseSdk = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");
  if (isFirebaseSdk || CACHE_FIRST_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }))
    );
  }
  // Everything else (Firestore, Auth, App Check, reCAPTCHA) goes straight to the network
});
