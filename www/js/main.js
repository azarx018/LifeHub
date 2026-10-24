/* ===== MAIN (entry point) ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + disusun ulang
// jadi import eksplisit. Ini satu-satunya file yang dimuat langsung dari
// index.html (<script type="module" src="js/main.js">).
import { DB } from './core/db.js';
import { S } from './core/state.js';
import { APP_VERSION } from './core/version.js';
import { KV, el, qs } from './core/utils.js';
import { navigateTo } from './core/router.js';
import { scheduleNotifications } from './core/notifications.js';
import { migrateHabitDays } from './features/habit.js';
import { migrateTodoDates } from './features/todo.js';
import { applySettings } from './features/settings.js';
import { updateSkyBackground, updateClock, updateGreetingSlow } from './features/dashboard.js';
import { initPrayerTimes } from './features/prayer.js';
import { checkWeeklyReviewTrigger } from './features/weeklyReview.js';
import { setupEvents } from './legacy.js';
import { cleanupTempApk } from './core/updateChecker.js';
import { initUpdateUI, runStartupUpdateCheck } from './core/updatePopup.js';


// Mode hemat (v6.7): HP kelas bawah (RAM <= 3 GB atau <= 4 core) -> matikan blur kaca
// (bagian termurah untuk dilepas, paling berat di GPU lemah). Tampilan tetap rapi.
{
  const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
  if ((mem && mem <= 3) || (cores && cores <= 4)) document.documentElement.classList.add('lite');
}
// ===== PWA SERVICE WORKER =====
// Service worker cuma relevan untuk mode web/PWA (offline caching lewat
// browser). Saat app jalan sebagai APK Capacitor, file sudah lokal di HP dan
// SW ini tidak diperlukan — malah berisiko bentrok, jadi di-skip.
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const { isNativeApp } = await import('./core/platform.js');
  if (await isNativeApp()) return; // skip di APK native
  // type:'module' supaya sw.js bisa import versi dari core/version.js
  // (single source of truth untuk nama cache).
  navigator.serviceWorker.register('sw.js', { type: 'module' }).catch(()=>{});
}

// ===== INIT =====
async function init() {
  try { await DB.init(); } catch(e) { console.error('DB init failed', e); }
  // Migrasi habit lama (yang cuma punya `target` angka) ke sistem hari spesifik
  // (`days`) — sekali jalan aja, abis itu field `days` selalu ada di tiap habit.
  try { await migrateHabitDays(); } catch(e) { console.error('migrateHabitDays failed', e); }
  // Migrasi todo lama (belum punya field `date`) ke sistem todo per hari —
  // sekali jalan aja, abis itu tiap todo selalu punya `date` (tanggal pemiliknya).
  try { await migrateTodoDates(); } catch(e) { console.error('migrateTodoDates failed', e); }
  // Set versi otomatis dari APP_VERSION ke meta description (versi TIDAK lagi
  // ditampilkan di "Tentang" sejak v6.6.0 — Tentang cuma deskripsi app + changelog).
  try {
    const metaDesc = qs('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', `Personal Life Management App — v${APP_VERSION}`);
  } catch(e) { console.error('Version display failed', e); }
  // Minta browser jadikan storage LifeHub "persistent" biar ngga di-evict
  // otomatis pas HP kehabisan ruang / browser bebersihin data situs jarang dipake.
  try {
    if (navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        const granted = await navigator.storage.persist();
        console.log('Storage persist request:', granted ? 'granted' : 'denied');
      }
    }
  } catch(e) { console.error('Storage persist request failed', e); }
  try {
    const savedSettings = await KV.get('lifehub_settings');
    if(savedSettings) S.settings = { ...S.settings, ...savedSettings };
    // Restore active sleep session
    const savedSleepSession = await KV.get('sleep_active_session', null);
    if(savedSleepSession && savedSleepSession.timestamp) S.sleepSession = savedSleepSession;
  } catch(e) { console.error('Settings load failed', e); }
  applySettings();
  try { setupEvents(); } catch(e) { console.error('setupEvents error:', e); }
  try { initUpdateUI(); } catch(e) { console.error('initUpdateUI error:', e); }
  // Bersihin APK temporary sisa percobaan update sebelumnya (berhasil,
  // dibatalkan, atau gagal) — lihat cleanupTempApk() untuk alasannya kenapa
  // ini dilakukan di startup, bukan langsung setelah download/install.
  cleanupTempApk().catch(e => console.error('cleanupTempApk error:', e));
  updateSkyBackground();
  setInterval(updateSkyBackground, 60000);
  // FIX PERFORMA (v6.4.3): updateClock() sekarang cuma ngerjain hal berat
  // (locale date formatting, dsb) kalau lagi di Dashboard — lihat catatan
  // panjang di dashboard.js. Greeting/nama/tanggal dipisah ke interval 60
  // detik sendiri (updateGreetingSlow), karena itu nggak perlu di-refresh
  // tiap detik — cukup tiap menit, biar main thread nggak ke-ganggu tiap
  // detik pas lagi ada animasi (modal/page-transition) atau lagi ngetik.
  setInterval(updateClock, 1000);
  setInterval(updateGreetingSlow, 60000);
  setInterval(checkWeeklyReviewTrigger, 60000); // cek auto-trigger setiap menit
  updateClock();
  updateGreetingSlow();
  // Init prayer times after DB ready
  initPrayerTimes();
  setTimeout(() => {
    el('splash').classList.add('fade-out');
    el('app').classList.remove('hidden');
    setTimeout(() => {
      el('splash').style.display='none';
      // Baca ?page=... dari URL (dipakai shortcut manifest, misal long-press icon
      // app -> langsung ke Todo/Habit/Game), fallback ke Dashboard kalau ngga ada.
      const requestedPage = new URLSearchParams(location.search).get('page');
      const validPages = ['dashboard','todo','habit','journal','sholat','sleep','water','goals','stats','activity','game','settings'];
      navigateTo(validPages.includes(requestedPage) ? requestedPage : 'dashboard'); // navigateTo sudah nge-trigger PIXEL.init() sendiri
    }, 500);
  }, 1500);
  registerSW();
  setTimeout(() => scheduleNotifications(), 3000);
  // Update check: TIDAK BOLEH menghalangi startup (spec bagian 3), makanya
  // ditunda dikit lewat setTimeout & dijalankan async setelah splash selesai.
  // runStartupUpdateCheck() sendiri sudah graceful kalau GitHub/internet
  // gagal diakses (lihat updateChecker.js checkForUpdate()).
  setTimeout(() => {
    runStartupUpdateCheck().catch(e => console.error('runStartupUpdateCheck error:', e));
  }, 2000);
}

document.addEventListener('DOMContentLoaded', init);
