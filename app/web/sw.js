// Minimal app-shell cache so the log stays usable offline. Data lives in
// IndexedDB (db.js), never in this cache — the service worker only caches
// static app files so the UI itself can load with no network.
const CACHE = "tcm-app-shell-v11";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/daily-log.js",
  "./js/calendar.js",
  "./js/summary.js",
  "./js/dates.js",
  "./js/sync.js",
  "./js/merge.js",
  "./js/ids.js",
  "./js/cycle.js",
  "./js/cycle-store.js",
  "./js/cabinet-store.js",
  "./js/health-import.js",
  "./js/home.js",
  "./js/profile.js",
  "./js/connect.js",
  "./js/ui.js",
  "./js/db.js",
  "./js/schema.js",
  "./js/i18n.js",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first: a deployed update must take effect on the next load, not the
// one after. Serving cache-first left the app one reload behind its own code,
// which is how a stale stylesheet survives a "reload". The cache remains the
// offline fallback, which is the only job it actually needs to do here.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return; // never intercept the GitHub API
  // "no-cache" revalidates against the server instead of trusting the browser's
  // HTTP cache (GitHub Pages sends max-age=600), so a deploy can't leave the
  // app running a mix of new and ten-minute-old modules.
  const request = event.request.mode === "navigate"
    ? event.request
    : new Request(event.request, { cache: "no-cache" });
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
