// ===== LIFEHUB SERVICE WORKER =====
const CACHE_NAME = 'lifehub-v4.7';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@600;700&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Fix: cache.add() biasa masih bisa kena HTTP cache browser (bukan cache SW),
      // jadi file "baru" yang di-fetch pas install bisa aja ternyata masih versi lama
      // kalau belum expired menurut header cache server. Pake {cache:'reload'} biar
      // fetch-nya beneran skip HTTP cache dan ambil langsung dari network.
      return Promise.allSettled(ASSETS.map(a =>
        fetch(a, { cache: 'reload' }).then(res => {
          if (res && res.ok) return cache.put(a, res);
        }).catch(() => {})
      ));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ===== NOTIFICATION CLICK =====
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow('./');
    })
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
