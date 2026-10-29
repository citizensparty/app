// Offline shell. Network first so new deploys show up at once; the cache is the fallback.
// build.py stamps VERSION with a hash of the files, so each deploy gets a fresh cache.
const VERSION = "__VERSION__";
const SHELL = ["./", "index.html", "styles.css", "app.js", "adapter-local.js", "adapter-nostr.js", "config.js", "party.json", "vendor/nostr.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  // party.json may not exist yet (no hosts), so add files one by one and skip what fails
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const url = new URL(r.url);
  const fonts = url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com";
  if (url.origin !== location.origin && !fonts) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(r, copy)); }
    return res;
  }).catch(() => caches.match(r).then(m => m || (r.mode === "navigate" ? caches.match("index.html") : Response.error()))));
});
