// Georgia Contractors service worker — generated, v0.17.1.
// Network-first for pages (always fresh online, cached offline); cache-first for
// versioned static assets. Cross-origin requests (map tiles, fonts) are untouched.
const CACHE = 'gac-v0.17.1';
const PRECACHE = ['/', '/css/app.css?v=0.17.1', '/js/app.js?v=0.17.1', '/manifest.json', '/android-icon-192x192.png', '/android-icon-512x512.png'];
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {})); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; }).catch(() => caches.match(req).then((r) => r || caches.match('/'))));
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
});
