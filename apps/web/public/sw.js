/* C2Pass service worker: offline shell, cached static assets, browser push for centre alerts. */
const VERSION = 'c2pass-v1';
const OFFLINE_URL = '/hors-ligne';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/badge-96.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // API calls, exam data and other origins are never cached: answers, timers and accounts stay live.
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Build assets have content hashes in their names: cache first, they never change.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }

  // Pages: always the network (fresh content), the offline page when there is no connection.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'C2Pass', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    lang: 'fr',
    tag: data.url || 'c2pass',
    renotify: true,
    requireInteraction: true,
    data: { url: data.url || '/alertes' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only open pages of this site, whatever the payload says.
  let target = new URL('/alertes', self.location.origin);
  try {
    const u = new URL(event.notification.data && event.notification.data.url, self.location.origin);
    if (u.pathname.startsWith('/')) target = new URL(u.pathname + u.search, self.location.origin);
  } catch {}
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (open) return open.navigate(target.href).then((w) => (w || open).focus());
    return self.clients.openWindow(target.href);
  }));
});
