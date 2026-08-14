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
import { applySettings, checkAutoBackup } from './features/settings.js';
import { updateSkyBackground, updateClock } from './features/dashboard.js';
import { initPrayerTimes } from './features/prayer.js';
import { checkWeeklyReviewTrigger } from './features/weeklyReview.js';
import { setupEvents } from './legacy.js';

// ===== PWA SERVICE WORKER =====
function registerSW() {
  if('serviceWorker' in navigator) {
    // type:'module' supaya sw.js bisa import versi dari core/version.js
    // (single source of truth untuk nama cache).
    navigator.serviceWorker.register('sw.js', { type: 'module' }).catch(()=>{});
  }
}

// ===== INIT =====
async function init() {
  try { await DB.init(); } catch(e) { console.error('DB init failed', e); }
  // Migrasi habit lama (yang cuma punya `target` angka) ke sistem hari spesifik
  // (`days`) — sekali jalan aja, abis itu field `days` selalu ada di tiap habit.
  try { await migrateHabitDays(); } catch(e) { console.error('migrateHabitDays failed', e); }
  // Set versi otomatis dari APP_VERSION — biar teks "Tentang" & meta description
  // ngga pernah lupa ke-update lagi kayak yang kejadian sebelumnya (nyangkut di v3.3).
  try {
    const aboutVerEl = qs('.settings-info strong');
    if (aboutVerEl && aboutVerEl.nextSibling) aboutVerEl.nextSibling.textContent = ` v${APP_VERSION}`;
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
  updateSkyBackground();
  setInterval(updateSkyBackground, 60000);
  setInterval(updateClock, 1000);
  setInterval(checkWeeklyReviewTrigger, 60000); // cek auto-trigger setiap menit
  updateClock();
  // Init prayer times after DB ready
  initPrayerTimes();
  // Auto backup check (jalankan setelah 3 detik biar tidak ganggu load)
  setTimeout(() => checkAutoBackup(), 3000);
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
}

document.addEventListener('DOMContentLoaded', init);
