// ===== LIFEHUB SERVICE WORKER =====
// Sprint 1: sekarang didaftarkan sebagai ES module ({type:'module'} di
// main.js) supaya bisa import APP_VERSION langsung dari core/version.js —
// jadi nama cache otomatis ikut naik tiap kali version.js di-bump, tanpa
// perlu ingat-ingat edit sw.js manual lagi.
import { APP_VERSION } from './js/core/version.js';

const CACHE_NAME = `lifehub-v${APP_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './css/base.css',
  './css/components.css',
  './css/pages/dashboard.css',
  './css/pages/todo.css',
  './css/pages/habit.css',
  './css/pages/journal.css',
  './css/pages/sholat.css',
  './css/pages/sleep.css',
  './css/pages/water.css',
  './css/pages/goals.css',
  './css/pages/stats.css',
  './css/pages/activity.css',
  './css/pages/settings.css',
  './css/pages/weeklyReview.css',
  './css/pages/game.css',
  './manifest.json',
  './js/main.js',
  './js/legacy.js',
  './js/core/version.js',
  './js/core/db.js',
  './js/core/state.js',
  './js/core/utils.js',
  './js/core/router.js',
  './js/core/modal.js',
  './js/core/notifications.js',
  './js/core/platform.js',
  './js/core/db.web.js',
  './js/core/db.native.js',
  './js/core/geo.js',
  './js/core/fileExport.js',
  './js/features/todo.js',
  './js/features/journal.js',
  './js/features/sholat.js',
  './js/features/water.js',
  './js/features/goals.js',
  './js/features/activity.js',
  './js/features/dashboard.js',
  './js/features/habit.js',
  './js/features/sleep.js',
  './js/features/stats.js',
  './js/features/settings.js',
  './js/charts/donut.js',
  './js/charts/line.js',
  './js/features/game/engine.js',
  './js/features/game/achievements.js',
  './js/features/game/canvas.js',
  './js/features/prayer.js',
  './js/features/weeklyReview.js',
  './js/pdf/generator.js',
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
