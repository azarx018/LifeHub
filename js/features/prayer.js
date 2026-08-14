/* ===== PRAYER TIME CALCULATOR ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
// Rumus: Calculation Method = MWL (Muslim World League)
import { DB } from '../core/db.js';
import { S } from '../core/state.js';
import { KV, today, el, showToast } from '../core/utils.js';
import { renderSettings } from './settings.js';

// Rumus: Calculation Method = MWL (Muslim World League)
// Fajr angle: 18°, Isha angle: 17°
const PT = {
  toRad: d => d * Math.PI / 180,
  toDeg: r => r * 180 / Math.PI,
  fixAngle: a => { a = a % 360; return a < 0 ? a + 360 : a; },
  fixHour: h => { h = h % 24; return h < 0 ? h + 24 : h; },

  sunPosition(jd) {
    const D = jd - 2451545.0;
    const g = this.fixAngle(357.529 + 0.98560028 * D);
    const q = this.fixAngle(280.459 + 0.98564736 * D);
    const L = this.fixAngle(q + 1.915 * Math.sin(this.toRad(g)) + 0.020 * Math.sin(this.toRad(2*g)));
    const e = 23.439 - 0.00000036 * D;
    const RA = this.toDeg(Math.atan2(Math.cos(this.toRad(e)) * Math.sin(this.toRad(L)), Math.cos(this.toRad(L)))) / 15;
    const eqt = q/15 - this.fixHour(RA);
    const decl = this.toDeg(Math.asin(Math.sin(this.toRad(e)) * Math.sin(this.toRad(L))));
    return { decl, eqt };
  },

  julianDate(y, m, d) {
    if(m <= 2) { y--; m += 12; }
    const A = Math.floor(y/100);
    const B = 2 - A + Math.floor(A/4);
    return Math.floor(365.25*(y+4716)) + Math.floor(30.6001*(m+1)) + d + B - 1524.5;
  },

  midDay(t, jd) {
    const { eqt } = this.sunPosition(jd + t);
    return this.fixHour(12 - eqt);
  },

  sunAngleTime(angle, t, jd, lat, direction) {
    const { decl } = this.sunPosition(jd + t);
    const cosVal = (-Math.sin(this.toRad(angle)) - Math.sin(this.toRad(decl)) * Math.sin(this.toRad(lat))) /
                   (Math.cos(this.toRad(decl)) * Math.cos(this.toRad(lat)));
    if(Math.abs(cosVal) > 1) return NaN;
    const T = this.toDeg(Math.acos(cosVal)) / 15;
    return this.midDay(t, jd) + (direction === 'ccw' ? -T : T);
  },

  asrTime(factor, t, jd, lat) {
    const { decl } = this.sunPosition(jd + t);
    const angle = -this.toDeg(Math.atan(1 / (factor + Math.tan(this.toRad(Math.abs(lat - decl))))));
    return this.sunAngleTime(angle, t, jd, lat, 'cw');
  },

  calculate(lat, lng, date) {
    const jd = this.julianDate(date.getFullYear(), date.getMonth()+1, date.getDate());
    const tz = date.getTimezoneOffset() / -60;
    const times = {
      subuh:   this.sunAngleTime(18, 5/24, jd, lat, 'ccw'),
      terbit:  this.sunAngleTime(0.833, 6/24, jd, lat, 'ccw'),
      dzuhur:  this.midDay(12/24, jd),
      ashar:   this.asrTime(1, 13/24, jd, lat),
      maghrib: this.sunAngleTime(0.833, 18/24, jd, lat, 'cw'),
      isya:    this.sunAngleTime(17, 18/24, jd, lat, 'cw'),
    };
    // Convert to local time
    const result = {};
    Object.entries(times).forEach(([k, v]) => {
      const localH = this.fixHour(v + tz - lng/15);
      const h = Math.floor(localH);
      const m = Math.floor((localH - h) * 60);
      result[k] = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    });
    return result;
  },

  toMinutes(timeStr) {
    const [h,m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }
};

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
  }
}

export function getLocation() {
  if(!navigator.geolocation) { showToast('GPS tidak didukung browser ini'); return; }
  showToast('Mendapatkan lokasi...');
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    _prayerCoords = { lat, lng };
    await KV.set('prayer_coords', { lat, lng });
    _prayerTimes = PT.calculate(lat, lng, new Date());
    renderPrayerCountdown();
    startPrayerCountdownTick();
    renderSettings();
    showToast('Lokasi berhasil didapat 📍');
  }, err => {
    showToast('Gagal mendapat lokasi. Coba lagi.');
  }, { timeout: 10000 });
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
    // Cek reminder
    checkPrayerReminder(next);
  }, 30000); // update tiap 30 detik
}

let _lastPrayerNotified = '';
async function checkPrayerReminder(next) {
  const enabled = await KV.get('prayer_reminder_enabled', false);
  if(!enabled) return;
  if(Notification.permission !== 'granted') return;
  const minutesBefore = parseInt(await KV.get('prayer_reminder_minutes', 5));
  const notifKey = `${today()}_${next.key}`;
  if(next.minutesLeft <= minutesBefore && next.minutesLeft > 0 && _lastPrayerNotified !== notifKey) {
    _lastPrayerNotified = notifKey;
    const msg = minutesBefore === 0
      ? `Waktunya sholat ${next.name} (${next.time})`
      : `Sholat ${next.name} dalam ${next.minutesLeft} menit (${next.time})`;
    try {
      new Notification('🕌 Reminder Sholat', { body: msg, icon: 'icon-192.png', tag: 'prayer-'+next.key });
    } catch(e) {}
    showToast(`🕌 ${msg}`);
  }
}

