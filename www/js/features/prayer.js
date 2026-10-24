/* ===== PRAYER TIME CALCULATOR ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { DB } from '../core/db.js';
import { S } from '../core/state.js';
import { KV, today, el, showToast } from '../core/utils.js';
import { renderSettings } from './settings.js';
import { getCurrentCoords } from '../core/geo.js';
import { hasNotificationPermission, schedulePrayerNotifications, cancelPrayerNotifications } from '../core/notifications.js';
import { PT, PRAYER_KEYS, PRAYER_NAMES, buildPrayerSchedule } from '../core/prayerCalc.js';

// State prayer times
let _prayerTimes  = null;
let _prayerCoords = null;
let _prayerReminderIntervalId = null;

export async function initPrayerTimes() {
  // Load saved coords
  const saved = await KV.get('prayer_coords', null);
  if(saved) {
    _prayerCoords = saved;
    _prayerTimes = PT.calculate(saved.lat, saved.lng, new Date());
    renderPrayerCountdown();
    startPrayerCountdownTick();
    syncPrayerNotifications().catch(e => console.error('syncPrayerNotifications', e));
    bindPrayerResume();
  }
}

export async function getLocation() {
  showToast('Mendapatkan lokasi...');
  try {
    const { lat, lng } = await getCurrentCoords();
    _prayerCoords = { lat, lng };
    await KV.set('prayer_coords', { lat, lng });
    _prayerTimes = PT.calculate(lat, lng, new Date());
    renderPrayerCountdown();
    startPrayerCountdownTick();
    syncPrayerNotifications(true).catch(e => console.error('syncPrayerNotifications', e));
    bindPrayerResume();
    renderSettings();
    showToast('Lokasi berhasil didapat 📍');
  } catch (e) {
    showToast(e.message === 'Izin lokasi ditolak' ? 'Izin lokasi ditolak. Aktifkan di Pengaturan HP.' : 'Gagal mendapat lokasi. Coba lagi.');
  }
}

function getNextPrayer(prayerTimes) {
  const PRAYER_KEYS = ['subuh','dzuhur','ashar','maghrib','isya'];
  const PRAYER_NAMES = {subuh:'Subuh',dzuhur:'Dzuhur',ashar:'Ashar',maghrib:'Maghrib',isya:'Isya'};
  const now2 = new Date();
  const nowMin = now2.getHours()*60 + now2.getMinutes();
  for(const key of PRAYER_KEYS) {
    const pMin = PT.toMinutes(prayerTimes[key]);
    if(pMin > nowMin) return { key, name: PRAYER_NAMES[key], time: prayerTimes[key], minutesLeft: pMin - nowMin };
  }
  // Semua sholat hari ini sudah lewat → next adalah Subuh besok
  const subuhMin = PT.toMinutes(prayerTimes['subuh']);
  const minutesLeft = (24*60 - nowMin) + subuhMin;
  return { key:'subuh', name:'Subuh', time: prayerTimes['subuh'], minutesLeft, tomorrow: true };
}

export function renderPrayerCountdown() {
  const container = el('prayerCountdownContent'); if(!container) return;
  if(!_prayerTimes) {
    container.innerHTML = `<div class="prayer-location-prompt">
      <p style="font-size:.8rem;color:var(--text3);margin-bottom:8px">Izinkan lokasi untuk waktu sholat otomatis</p>
      <button class="btn-sm btn-primary" id="btnGetLocation">📍 Izinkan Lokasi</button>
    </div>`;
    const btn = el('btnGetLocation'); if(btn) btn.addEventListener('click', getLocation);
    return;
  }

  const next = getNextPrayer(_prayerTimes);
  const PRAYER_KEYS = ['subuh','dzuhur','ashar','maghrib','isya'];
  const PRAYER_NAMES = {subuh:'Subuh',dzuhur:'Dzuhur',ashar:'Ashar',maghrib:'Maghrib',isya:'Isya'};

  // Format countdown
  const h = Math.floor(next.minutesLeft / 60);
  const m = next.minutesLeft % 60;
  const countdownStr = h > 0 ? `${h}j ${m}m` : `${m} menit`;
  const isUrgent = next.minutesLeft <= 15;

  // Ambil status sholat hari ini
  const todayStr = today();

  container.innerHTML = `
    <div class="prayer-next-wrap">
      <div class="prayer-next-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
      </div>
      <div class="prayer-next-info">
        <div class="prayer-next-name">${next.tomorrow?'Besok · ':''}${next.name}</div>
        <div class="prayer-next-time">${next.time} WIB</div>
      </div>
      <div class="prayer-countdown-timer${isUrgent?' urgent':''}" id="prayerCountdownTimer">
        ${countdownStr}
      </div>
    </div>
    <div class="prayer-times-row" id="prayerTimesRow"></div>
  `;

  // Render semua waktu sholat
  const rowEl = el('prayerTimesRow');
  if(rowEl) {
    rowEl.innerHTML = '';
    PRAYER_KEYS.forEach(key => {
      const isNext = key === next.key && !next.tomorrow;
      const div = document.createElement('div');
      div.className = `prayer-time-item${isNext?' active-prayer':''}`;
      div.innerHTML = `<div class="prayer-time-name">${PRAYER_NAMES[key]}</div><div class="prayer-time-val">${_prayerTimes[key]}</div>`;
      rowEl.appendChild(div);
    });
    // Update done status async
    DB.getAll('sholatLogs').then(logs => {
      const dayLog = logs.find(s => s.date === todayStr);
      if(!dayLog) return;
      PRAYER_KEYS.forEach((key, i) => {
        if(dayLog.prayers[key]) {
          rowEl.children[i].classList.add('done-prayer');
          rowEl.children[i].innerHTML += '<div class="prayer-time-check">✓</div>';
        }
      });
    });
  }

  // Re-bind location button if shown
  const locBtn = el('btnGetLocation'); if(locBtn) locBtn.addEventListener('click', getLocation);
}

let _prayerCountdownInterval = null;
function startPrayerCountdownTick() {
  if(_prayerCountdownInterval) clearInterval(_prayerCountdownInterval);
  _prayerCountdownInterval = setInterval(() => {
    if(S.currentPage !== 'dashboard') return;
    if(!_prayerTimes) return;
    // Recalculate jika hari berganti
    _prayerTimes = PT.calculate(_prayerCoords.lat, _prayerCoords.lng, new Date());
    const next = getNextPrayer(_prayerTimes);
    const h = Math.floor(next.minutesLeft / 60);
    const m = next.minutesLeft % 60;
    const countdownStr = h > 0 ? `${h}j ${m}m` : `${m} menit`;
    const timerEl = el('prayerCountdownTimer');
    if(timerEl) {
      timerEl.textContent = countdownStr;
      timerEl.className = 'prayer-countdown-timer' + (next.minutesLeft <= 15 ? ' urgent' : '');
    }
  }, 30000); // update tiap 30 detik
}

// ===== Reminder sholat (v6.7) =====
// Dulu: dicek lewat setInterval JS yang cuma jalan kalau app terbuka DAN sedang di
// halaman Dashboard, jadi tidak pernah berbunyi di background/app ditutup (dan
// "tepat waktu"/0 menit tidak pernah terpicu). Sekarang: jadwal 7 hari ke depan
// didaftarkan sebagai alarm native sekaligus, lalu disegarkan tiap hari/saat app
// dibuka lagi atau saat lokasi/pengaturan berubah.
let _prayerScheduleKey = '';
let _prayerResumeBound = false;

export function getPrayerTimesFor(date) {
  return _prayerCoords ? PT.calculate(_prayerCoords.lat, _prayerCoords.lng, date) : null;
}

export async function syncPrayerNotifications(force = false) {
  const enabled = await KV.get('prayer_reminder_enabled', false);
  if (!enabled || !_prayerCoords || !(await hasNotificationPermission())) {
    _prayerScheduleKey = '';
    await cancelPrayerNotifications();
    return;
  }
  const minutesBefore = parseInt(await KV.get('prayer_reminder_minutes', 5), 10) || 0;
  const key = `${today()}|${_prayerCoords.lat.toFixed(3)},${_prayerCoords.lng.toFixed(3)}|${minutesBefore}`;
  if (!force && key === _prayerScheduleKey) return;
  const days = [];
  for (let d = 0; d < 7; d++) {
    const date = new Date(); date.setDate(date.getDate() + d);
    days.push({ date, times: PT.calculate(_prayerCoords.lat, _prayerCoords.lng, date) });
  }
  await schedulePrayerNotifications(buildPrayerSchedule(days, minutesBefore, Date.now()));
  _prayerScheduleKey = key;
}

function bindPrayerResume() {
  if (_prayerResumeBound) return;
  _prayerResumeBound = true;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncPrayerNotifications().catch(() => {});
  });
}
