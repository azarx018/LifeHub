/* ===== LIFEHUB APP.JS v1.2 ===== */
'use strict';

// ===== DB WRAPPER =====
const DB = {
  _db: null,
  _stores: ['todos','habits','habitLogs','journals','sleepLogs','goals','milestones','waterLogs','sholatLogs','settings'],
  init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('LifeHubDB', 4);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        this._stores.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, {keyPath:'id'}); });
      };
      req.onsuccess = e => { this._db = e.target.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  },
  getAll(store) {
    return new Promise((resolve, reject) => {
      if (!this._db) return resolve([]);
      try {
        const tx = this._db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch(e) { resolve([]); }
    });
  },
  put(store, item) {
    return new Promise((resolve, reject) => {
      if (!this._db) return reject('No DB');
      try {
        const tx = this._db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).put(item);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch(e) { reject(e); }
    });
  },
  delete(store, id) {
    return new Promise((resolve, reject) => {
      if (!this._db) return reject('No DB');
      try {
        const tx = this._db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch(e) { reject(e); }
    });
  },
  get(store, id) {
    return new Promise((resolve) => {
      if (!this._db) return resolve(null);
      try {
        const tx = this._db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch(e) { resolve(null); }
    });
  },
  async clearAll() {
    for (const s of this._stores) {
      if (!this._db) continue;
      try {
        const tx = this._db.transaction(s, 'readwrite');
        tx.objectStore(s).clear();
      } catch(e) {}
    }
  }
};

// ===== UTILS =====
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
// Gunakan local date bukan UTC — fix timezone bug untuk WIB (UTC+7)
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const now = () => Date.now();

// Settings & KV store helper — semua pakai IndexedDB
const KV = {
  async get(key, def = null) {
    const row = await DB.get('settings', key);
    return row ? row.value : def;
  },
  async set(key, value) {
    await DB.put('settings', { id: key, value });
  }
};
const el = id => document.getElementById(id);
const qs = (sel, ctx=document) => ctx.querySelector(sel);
const qsa = (sel, ctx=document) => [...ctx.querySelectorAll(sel)];
const fmt = d => { const dt = typeof d === 'string' ? new Date(d) : d; return isNaN(dt)?'':dt.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}); };
const fmtShort = d => { const dt = typeof d === 'string' ? new Date(d) : d; return isNaN(dt)?'':dt.toLocaleDateString('id-ID',{day:'numeric',month:'short'}); };
function showToast(msg, dur=2500) {
  const t = el('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}

// ===== STATE =====
const S = {
  currentPage: 'dashboard',
  todoFilter: 'all',
  todoPriority: 'all',
  todoSearch: '',
  habitDate: today(),
  sholatDate: today(),
  journalDate: today(),
  journalSearch: '',
  activityRange: 7,
  settings: { name:'Azhar', darkMode:false, sleepTarget:8, waterTarget:8 },
  todos: [], habits: [], habitLogs: [], journals: [],
  sleepLogs: [], goals: [], milestones: [], waterLogs: [],
  sholatLogs: [],
  sleepSession: null
};

// ===== QUOTES =====
const QUOTES = [
  {text:"Jangan hitung harinya, jadikan setiap hari berarti.", author:"Muhammad Ali"},
  {text:"Sukses adalah jumlah usaha-usaha kecil yang diulang hari demi hari.", author:"Robert Collier"},
  {text:"Cara terbaik untuk memulai adalah dengan berhenti bicara dan mulai bekerja.", author:"Walt Disney"},
  {text:"Kebiasaan kecil yang konsisten menciptakan hasil yang luar biasa.", author:"James Clear"},
  {text:"Disiplin adalah jembatan antara tujuan dan pencapaian.", author:"Jim Rohn"},
  {text:"Dua hal yang membentuk hidupmu: kesabaranmu saat tidak punya apa-apa, dan sikapmu saat punya segalanya.", author:"Ali bin Abi Thalib"},
  {text:"Jika kamu tidak bisa terbang, berlarilah. Jika tidak bisa berlari, berjalanlah. Jika tidak bisa berjalan, merangkaklah. Tapi teruslah bergerak maju.", author:"Martin Luther King Jr."},
  {text:"Hidup adalah apa yang terjadi ketika kamu sibuk membuat rencana lain.", author:"John Lennon"},
  {text:"Dua puluh tahun dari sekarang kamu akan lebih kecewa oleh hal-hal yang tidak kamu lakukan daripada yang kamu lakukan.", author:"Mark Twain"},
  {text:"Bukan kurangnya waktu yang jadi masalah, tapi kurangnya arah.", author:"Zig Ziglar"},
  {text:"Kamu tidak perlu menjadi hebat untuk memulai, tapi kamu harus memulai untuk menjadi hebat.", author:"Zig Ziglar"},
  {text:"Setiap jiwa bertanggung jawab atas apa yang dikerjakannya.", author:"Al-Qur'an (74:38)"},
  {text:"Orang yang berhasil adalah orang yang bangkit lebih banyak dari berapa kali ia jatuh.", author:"Vince Lombardi"},
  {text:"Impian tanpa tujuan hanyalah mimpi. Tujuan tanpa rencana hanyalah keinginan.", author:"Antoine de Saint-Exupéry"},
  {text:"Tidak ada yang menghentikan orang yang punya sikap benar untuk mencapai tujuannya.", author:"Thomas A. Edison"},
  {text:"Hari terbaik dalam hidupmu adalah hari kamu mengambil tanggung jawab penuh atas hidupmu.", author:"Brian Tracy"},
  {text:"Bersemangatlah dalam beribadah, dan bersabarlah dalam setiap cobaan.", author:"Imam Syafi'i"},
  {text:"Jangan pernah menyerah pada sesuatu yang tidak bisa kamu jalani sehari tanpa memikirkannya.", author:"Winston Churchill"},
  {text:"Kesuksesan biasanya datang pada mereka yang terlalu sibuk untuk mencarinya.", author:"Henry David Thoreau"},
  {text:"Jadikan setiap detail sempurna dan batasi jumlah detailnya.", author:"Jack Dorsey"},
  {text:"Waktu adalah sumber daya yang paling berharga karena ia tak bisa diulang.", author:"Harvey MacKay"},
  {text:"Ilmu tanpa amal seperti pohon tanpa buah.", author:"Imam Al-Ghazali"},
  {text:"Tidaklah seseorang meninggalkan sesuatu karena Allah, kecuali Allah ganti dengan yang lebih baik.", author:"Hadis Riwayat Ahmad"},
  {text:"Setiap hari lakukan sesuatu yang membuat masa depanmu berterima kasih.", author:"Sean Patrick Flanery"},
  {text:"Pikiran adalah awal dari segala sesuatu yang pernah ada.", author:"Napoleon Hill"},
  {text:"Bangun pagi, bekerja keras, temukan minyak.", author:"J. Paul Getty"},
  {text:"Kualitas bukan kebetulan; ia selalu merupakan hasil dari usaha yang sungguh-sungguh.", author:"John Ruskin"},
  {text:"Jangan biarkan kemarin mengambil terlalu banyak dari hari ini.", author:"Will Rogers"},
  {text:"Kegagalan adalah bumbu yang memberi kesuksesan rasa sesungguhnya.", author:"Truman Capote"},
  {text:"Seorang pemenang hanyalah seorang pemimpi yang tidak pernah menyerah.", author:"Nelson Mandela"},
];

// ===== DONUT CHART =====
function buildDonutSVG(segments) {
  const R = 48, SW = 13, SIZE = 116;
  const C = 2 * Math.PI * R;
  const cx = SIZE / 2, cy = SIZE / 2;
  const GAP = 2.5;
  const validSegs = segments.filter(s => s.total > 0);
  if (!validSegs.length) {
    return { svg: `<svg viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}"><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--border)" stroke-width="${SW}"/><text x="${cx}" y="${cy+5}" text-anchor="middle" font-size="12" fill="var(--text3)">No data</text></svg>`, pct: 0 };
  }
  const totalWeight = validSegs.reduce((a, s) => a + s.total, 0);
  const totalGap = GAP * validSegs.length;
  const availPct = 100 - totalGap;
  let offset = 0, arcs = '';
  validSegs.forEach(s => {
    const segPct = (s.total / totalWeight) * availPct;
    const donePct = (Math.min(s.value, s.total) / s.total) * segPct;
    const rot = -90 + (offset / 100 * 360);
    const dashTotal = (segPct / 100 * C).toFixed(2);
    const dashBg = (C - segPct / 100 * C).toFixed(2);
    const dashDone = (donePct / 100 * C).toFixed(2);
    const dashRest = (C - donePct / 100 * C).toFixed(2);
    arcs += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${s.color}28" stroke-width="${SW}" stroke-dasharray="${dashTotal} ${dashBg}" transform="rotate(${rot} ${cx} ${cy})"/>`;
    if (donePct > 0.3) {
      arcs += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${s.color}" stroke-width="${SW}" stroke-linecap="round" stroke-dasharray="${dashDone} ${dashRest}" transform="rotate(${rot} ${cx} ${cy})"/>`;
    }
    offset += segPct + GAP;
  });
  const totalDone = segments.reduce((a, s) => a + s.value, 0);
  const totalAll = segments.reduce((a, s) => a + s.total, 0);
  const pct = totalAll > 0 ? Math.round(totalDone / totalAll * 100) : 0;
  return { svg: `<svg viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}"><g>${arcs}</g><text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="19" font-weight="700" fill="var(--text)">${pct}%</text><text x="${cx}" y="${cy + 13}" text-anchor="middle" font-size="8" fill="var(--text3)">selesai hari ini</text></svg>`, pct };
}

// ===== PRAYER TIME CALCULATOR =====
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

async function initPrayerTimes() {
  // Load saved coords
  const saved = await KV.get('prayer_coords', null);
  if(saved) {
    _prayerCoords = saved;
    _prayerTimes = PT.calculate(saved.lat, saved.lng, new Date());
    renderPrayerCountdown();
    startPrayerCountdownTick();
  }
}

function getLocation() {
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

function renderPrayerCountdown() {
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

// ===== NOTIFICATIONS =====
let _notifTimers = [];

async function requestNotificationPermission() {
  if (!('Notification' in window)) { showToast('Browser tidak mendukung notifikasi'); return false; }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') { showToast('Notifikasi diblokir. Aktifkan di pengaturan browser.'); return false; }
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

async function showPushNotif(title, body) {
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, icon: './icon-192.png', badge: './icon-192.png', vibrate: [200, 100, 200] });
  } catch(e) {
    if (Notification.permission === 'granted') new Notification(title, { body, icon: './icon-192.png' });
  }
}

async function scheduleNotifications() {
  _notifTimers.forEach(t => clearTimeout(t));
  _notifTimers = [];
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const notifEnabled = await KV.get('notif_enabled', false);
  if (!notifEnabled) return;
  const morningTime = await KV.get('notif_morning', '07:00');
  const eveningTime = await KV.get('notif_evening', '21:00');
  const name = S.settings.name || 'Kamu';

  const scheduleAt = (timeStr, title, body) => {
    const [h, m] = timeStr.split(':').map(Number);
    const now2 = new Date();
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= now2) target.setDate(target.getDate() + 1);
    const delay = target - now2;
    const t = setTimeout(async () => {
      await showPushNotif(title, body);
      scheduleAt(timeStr, title, body); // reschedule for next day
    }, delay);
    _notifTimers.push(t);
  };

  scheduleAt(morningTime, '🌅 Selamat Pagi, LifeHub!', `Hei ${name}! Semangat hari ini. Cek habit & todo kamu yuk 💪`);
  scheduleAt(eveningTime, '🌙 Rekap Malam LifeHub', `Hai ${name}! Jangan lupa rekap aktivitas hari ini sebelum tidur 📋`);
}

// ===== SLEEP SESSION =====
let _sleepElapsedTimer = null;

async function startSleepSession() {
  const now2 = new Date();
  const session = {
    startTime: now2.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}),
    startDate: `${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,'0')}-${String(now2.getDate()).padStart(2,'0')}`,
    timestamp: now2.getTime()
  };
  S.sleepSession = session;
  await KV.set('sleep_active_session', session);
  showToast('😴 Selamat tidur! Waktu tidur dicatat.');
  renderSleepSessionCard();
  renderDashboardSleepBtn();
}

async function cancelSleepSession() {
  S.sleepSession = null;
  await KV.set('sleep_active_session', null);
  if (_sleepElapsedTimer) { clearInterval(_sleepElapsedTimer); _sleepElapsedTimer = null; }
  showToast('Sesi tidur dibatalkan');
  renderSleepSessionCard();
  renderDashboardSleepBtn();
}

function openWakeModal() {
  if (!S.sleepSession) return;
  const now2 = new Date();
  const elapsed = (now2.getTime() - S.sleepSession.timestamp) / 3600000;
  const h = Math.floor(elapsed);
  const m = Math.round((elapsed - h) * 60);
  const durStr = h > 0 ? `${h} jam ${m > 0 ? m + ' menit' : ''}` : `${m} menit`;
  const wdd = el('wakeDurationDisplay');
  if (wdd) wdd.innerHTML = `
    <div class="wake-dur-big">⏱ ${durStr}</div>
    <div class="wake-dur-sub">Tidur: ${S.sleepSession.startTime} · ${fmtShort(S.sleepSession.startDate + 'T00:00:00')}</div>
  `;
  openModal('wakeModal');
}

async function endSleepSession(quality) {
  if (!S.sleepSession) return;
  closeModal('wakeModal');

  const now2 = new Date();
  const endTime = now2.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
  const endDate = `${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,'0')}-${String(now2.getDate()).padStart(2,'0')}`;
  const elapsed = (now2.getTime() - S.sleepSession.timestamp) / 3600000;
  const duration = Math.max(0.1, Math.round(elapsed * 10) / 10);

  await DB.put('sleepLogs', {
    id: uid(),
    date: endDate,
    start: S.sleepSession.startTime,
    end: endTime,
    startDate: S.sleepSession.startDate,
    duration,
    quality
  });

  S.sleepSession = null;
  await KV.set('sleep_active_session', null);
  if (_sleepElapsedTimer) { clearInterval(_sleepElapsedTimer); _sleepElapsedTimer = null; }

  showToast('☀️ Selamat pagi! Catatan tidur disimpan.');
  renderSleepSessionCard();
  renderDashboardSleepBtn();
  if (S.currentPage === 'sleep') renderSleep();
  if (S.currentPage === 'dashboard') renderDashboard();

  // Sleep warning check
  const target = S.settings.sleepTarget || 8;
  if (duration < target) {
    const lack = (target - duration).toFixed(1);
    const warnBody = el('sleepWarnBody');
    if (warnBody) {
      warnBody.innerHTML = `
        <div class="sleep-warn-stat">
          <div class="sleep-warn-stat-item">
            <div class="swsi-val" style="color:#FF6B6B">${duration.toFixed(1)}<span class="swsi-unit">jam</span></div>
            <div class="swsi-lbl">Tidur kamu</div>
          </div>
          <div class="sleep-warn-vs">vs</div>
          <div class="sleep-warn-stat-item">
            <div class="swsi-val" style="color:#43E97B">${target}<span class="swsi-unit">jam</span></div>
            <div class="swsi-lbl">Target</div>
          </div>
        </div>
        <div class="sleep-warn-lack">Kurang <strong>${lack} jam</strong> dari target tidurmu!</div>
        <div class="sleep-warn-effects">
          <div class="sleep-warn-effect-title">Dampak kurang tidur:</div>
          <div class="sleep-warn-effect">😵 Fokus & konsentrasi menurun drastis</div>
          <div class="sleep-warn-effect">🧠 Fungsi memori & kognitif terganggu</div>
          <div class="sleep-warn-effect">😤 Mudah emosi & rentan stres</div>
          <div class="sleep-warn-effect">💪 Pemulihan otot tidak optimal</div>
          <div class="sleep-warn-effect">🦠 Sistem imun melemah</div>
        </div>
        <div class="sleep-warn-tip">💡 <strong>Tips:</strong> Coba tidur lebih awal malam ini dan hindari layar 30 menit sebelum tidur.</div>
      `;
    }
    setTimeout(() => openModal('sleepWarnModal'), 600);
  }
}

function renderSleepSessionCard() {
  const card = el('sleepSessionCard');
  if (!card) return;
  if (_sleepElapsedTimer) { clearInterval(_sleepElapsedTimer); _sleepElapsedTimer = null; }

  if (S.sleepSession) {
    const updateElapsed = () => {
      const now2 = new Date();
      const elapsed = (now2.getTime() - S.sleepSession.timestamp) / 3600000;
      const h = Math.floor(elapsed); const m = Math.round((elapsed - h) * 60);
      const durEl = card.querySelector('.sleep-sess-elapsed');
      if (durEl) durEl.textContent = h > 0 ? `${h} jam ${m} menit` : `${m} menit`;
    };
    card.innerHTML = `
      <div class="sleep-sess-active">
        <div class="sleep-sess-pulse">💤</div>
        <div class="sleep-sess-info">
          <div class="sleep-sess-status">Sedang Tidur...</div>
          <div class="sleep-sess-since">Mulai: <strong>${S.sleepSession.startTime}</strong> · ${fmtShort(S.sleepSession.startDate + 'T00:00:00')}</div>
          <div class="sleep-sess-dur">⏱ <span class="sleep-sess-elapsed">menghitung...</span></div>
        </div>
      </div>
      <div class="sleep-sess-actions">
        <button class="btn btn-primary btn-wake-big" id="btnWakePage">☀️ Aku Sudah Bangun</button>
        <button class="btn btn-outline btn-sm" id="btnCancelSleepPage">Batalkan Sesi</button>
      </div>`;
    qs('#btnWakePage', card).addEventListener('click', openWakeModal);
    qs('#btnCancelSleepPage', card).addEventListener('click', () => confirm2('Batalkan sesi tidur ini?', cancelSleepSession));
    updateElapsed();
    _sleepElapsedTimer = setInterval(updateElapsed, 30000);
  } else {
    card.innerHTML = `
      <div class="sleep-sess-idle">
        <div class="sleep-sess-idle-icon">🌙</div>
        <div class="sleep-sess-idle-text">Belum mulai tidur? Tekan tombol di bawah saat mau tidur.</div>
        <button class="btn btn-primary btn-sleep-big" id="btnStartSleepPage">🌙 Mulai Tidur Sekarang</button>
      </div>`;
    qs('#btnStartSleepPage', card).addEventListener('click', startSleepSession);
  }
}

function renderDashboardSleepBtn() {
  const btn = el('dashSleepBtn');
  if (!btn) return;
  if (S.sleepSession) {
    const now2 = new Date();
    const elapsed = (now2.getTime() - S.sleepSession.timestamp) / 3600000;
    const h = Math.floor(elapsed); const m = Math.round((elapsed - h) * 60);
    const durStr = h > 0 ? `${h}j ${m}m` : `${m}m`;
    btn.innerHTML = `☀️ Bangun <span class="dash-sleep-elapsed">${durStr}</span>`;
    btn.className = 'btn btn-sm btn-wake-dash';
    btn.onclick = openWakeModal;
  } else {
    btn.innerHTML = '🌙 Mulai Tidur';
    btn.className = 'btn btn-sm btn-sleep-dash';
    btn.onclick = startSleepSession;
  }
}


function updateSkyBackground() {
  const h = new Date().getHours();
  const dashHero = el('dashHero');
  if (!dashHero) return;

  let heroBg;
  let showStars = false;

  if (h >= 4 && h < 6) {
    heroBg = 'linear-gradient(135deg,#2c1654 0%,#8B4CA8 50%,#FF8C42 100%)';
  } else if (h >= 6 && h < 10) {
    heroBg = 'linear-gradient(135deg,#FF8C42 0%,#FFD700 40%,#6C63FF 100%)';
  } else if (h >= 10 && h < 14) {
    heroBg = 'linear-gradient(135deg,#1565C0 0%,#1E90FF 60%,#6C63FF 100%)';
  } else if (h >= 14 && h < 17) {
    heroBg = 'linear-gradient(135deg,#6C63FF 0%,#1E90FF 60%,#4ECDC4 100%)';
  } else if (h >= 17 && h < 19) {
    heroBg = 'linear-gradient(135deg,#c0392b 0%,#e67e22 40%,#f39c12 100%)';
  } else if (h >= 19 && h < 21) {
    heroBg = 'linear-gradient(135deg,#1a0a2e 0%,#2d1b69 60%,#6C63FF 100%)';
    showStars = true;
  } else {
    heroBg = 'linear-gradient(135deg,#0a0015 0%,#1a0a3e 50%,#0d1b4d 100%)';
    showStars = true;
  }

  dashHero.style.background = heroBg;

  // Inject / update celestial element inside hero
  let cel = dashHero.querySelector('.hero-celestial');
  if (!cel) {
    cel = document.createElement('div');
    cel.className = 'hero-celestial';
    // Position: top-right corner, above the clock text area
    cel.style.cssText = 'position:absolute;right:14px;top:10px;width:42px;height:42px;border-radius:50%;z-index:2;transition:all 1s ease;pointer-events:none;';
    dashHero.appendChild(cel);
  }
  if (showStars) {
    cel.style.background = 'radial-gradient(circle,#FFFFF0,#E8D5B7)';
    cel.style.boxShadow = '0 0 18px rgba(255,255,180,.6)';
    // Add stars to hero
    let starsWrap = dashHero.querySelector('.hero-stars');
    if (!starsWrap) {
      starsWrap = document.createElement('div');
      starsWrap.className = 'hero-stars';
      starsWrap.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden;border-radius:inherit;';
      dashHero.appendChild(starsWrap);
      generateStars(starsWrap);
    }
    starsWrap.style.opacity = '1';
  } else {
    if (h >= 17 && h < 19) {
      cel.style.background = 'radial-gradient(circle,#FFE44D,#FF8C00)';
      cel.style.boxShadow = '0 0 22px rgba(255,140,0,.8)';
    } else {
      cel.style.background = 'radial-gradient(circle,#FFE44D,#FFD700)';
      cel.style.boxShadow = '0 0 26px rgba(255,220,0,.7)';
    }
    const starsWrap = dashHero.querySelector('.hero-stars');
    if (starsWrap) starsWrap.style.opacity = '0';
  }
}
function generateStars(container) {
  for (let i = 0; i < 25; i++) {
    const star = document.createElement('div');
    const size = Math.random() * 2 + 1;
    star.className = 'star';
    star.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*80}%;top:${Math.random()*100}%;--d:${(Math.random()*2+1).toFixed(1)}s;--del:${(Math.random()*2).toFixed(1)}s`;
    container.appendChild(star);
  }
}

// ===== CLOCK =====
let _lastDate = today();
function updateClock() {
  const clockEl = el('liveClock'); if(!clockEl) return;
  const now2 = new Date();
  const h = now2.getHours().toString().padStart(2,'0');
  const m = now2.getMinutes().toString().padStart(2,'0');
  const s = now2.getSeconds().toString().padStart(2,'0');
  clockEl.textContent = `${h}:${m}:${s}`;

  // Auto-refresh saat hari berganti (midnight fix)
  const currentDate = `${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,"0")}-${String(now2.getDate()).padStart(2,"0")}`;
  if(currentDate !== _lastDate) {
    _lastDate = currentDate;
    // Reset date-scoped states ke hari baru
    S.habitDate  = currentDate;
    S.sholatDate = currentDate;
    S.journalDate= currentDate;
    S._journalManualNav = false; // reset manual nav flag saat hari berganti
    updateSkyBackground();
    if(S.currentPage === 'dashboard') renderDashboard();
    else if(S.currentPage === 'habit')  renderHabits();
    else if(S.currentPage === 'sholat') renderSholat();
    else if(S.currentPage === 'journal') renderJournal();
  }

  updateGreeting();
}
function updateGreeting() {
  const h = new Date().getHours();
  let greet = 'Selamat Pagi';
  if (h >= 11 && h < 15) greet = 'Selamat Siang';
  else if (h >= 15 && h < 18) greet = 'Selamat Sore';
  else if (h >= 18) greet = 'Selamat Malam';
  const gt = el('greetText'); if(gt) gt.textContent = greet;
  const gn = el('greetName'); if(gn) gn.textContent = S.settings.name;
  const gd = el('greetDate'); if(gd) {
    const opts = {weekday:'long',year:'numeric',month:'long',day:'numeric'};
    gd.textContent = new Date().toLocaleDateString('id-ID', opts);
  }
}

// ===== NAVIGATION =====
function navigateTo(page) {
  qsa('.page').forEach(p => p.classList.remove('active'));
  const pg = el('page-' + page); if(pg) pg.classList.add('active');
  qsa('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  qsa('.bnav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  const titles = { dashboard:'Dashboard', todo:'Todo', habit:'Habit Tracker', journal:'Journal', sholat:'Sholat', sleep:'Sleep Tracker', water:'Water Tracker', goals:'Goals', stats:'Statistik', activity:'Log Aktivitas', settings:'Pengaturan' };
  const tb = el('topbarTitle'); if(tb) tb.textContent = titles[page] || page;
  S.currentPage = page;
  closeSidebar();
  switch(page) {
    case 'dashboard': renderDashboard(); break;
    case 'todo': renderTodos(); break;
    case 'habit': renderHabits(); break;
    case 'journal':
      // Kalau journalDate sudah tidak sama dengan today (misal timezone shift), sync ulang
      if(S.journalDate !== today() && !S._journalManualNav) S.journalDate = today();
      renderJournal();
      break;
    case 'sholat': renderSholat(); break;
    case 'sleep': renderSleep(); break;
    case 'water': renderWater(); break;
    case 'goals': renderGoals(); break;
    case 'stats': renderStats(); break;
    case 'activity': renderActivity(); break;
    case 'settings': renderSettings(); break;
  }
}
function openSidebar() {
  el('sidebar').classList.add('open');
  el('sidebarOverlay').classList.add('visible');
}
function closeSidebar() {
  el('sidebar').classList.remove('open');
  el('sidebarOverlay').classList.remove('visible');
}

// ===== MODAL =====
function openModal(id) {
  el('modalBackdrop').classList.add('visible');
  el(id).classList.add('open');
}
function closeModal(id) {
  el(id).classList.remove('open');
  const anyOpen = qsa('.modal.open').length > 0;
  if(!anyOpen) el('modalBackdrop').classList.remove('visible');
}
function closeAllModals() {
  qsa('.modal').forEach(m => m.classList.remove('open'));
  el('modalBackdrop').classList.remove('visible');
}

// ===== CONFIRM =====
let _confirmCb = null;
function confirm2(text, cb) {
  el('confirmText').textContent = text;
  _confirmCb = cb;
  openModal('confirmModal');
}

// ===== DASHBOARD =====
async function renderDashboard() {
  updateGreeting();
  updateSkyBackground();
  // Quote
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(),0,0)) / 86400000);
  const q = QUOTES[dayOfYear % QUOTES.length];
  const dq = el('dashQuote'); const dqa = el('dashQuoteAuthor');
  if(dq) dq.textContent = `"${q.text}"`;
  if(dqa) dqa.textContent = `— ${q.author}`;

  // Mood
  const todayMoodKey = 'mood_' + today();
  const savedMood = await KV.get(todayMoodKey);
  const moodMap = {happy:'😊 Senang',neutral:'😐 Biasa',sad:'😔 Sedih',excited:'🤩 Semangat',tired:'😴 Capek'};
  const dmr = el('dashMoodRow'); const dmt = el('dashMoodText');
  if(dmr) {
    qsa('.mood-btn', dmr).forEach(b => {
      b.classList.toggle('selected', b.dataset.mood === savedMood);
    });
  }
  if(dmt) dmt.textContent = savedMood ? moodMap[savedMood] : 'Pilih mood kamu';

  // Water
  const wl = await DB.getAll('waterLogs');
  const todayWater = wl.filter(w => w.date === today());
  const wt = S.settings.waterTarget || 8;
  const wc = todayWater.length;
  const wp = Math.min(100, Math.round(wc/wt*100));
  const dwf = el('dashWaterFill'); const dwt = el('dashWaterText');
  if(dwf) dwf.style.width = wp + '%';
  if(dwt) dwt.textContent = `${wc} / ${wt} gelas`;

  // Habits
  const habits = await DB.getAll('habits');
  const hLogs = await DB.getAll('habitLogs');
  const dhEl = el('dashHabits');
  if(dhEl) {
    dhEl.innerHTML = '';
    if(!habits.length) { dhEl.innerHTML = '<p style="font-size:0.8rem;color:var(--text3)">Belum ada habit</p>'; }
    habits.slice(0,4).forEach(h => {
      const done = hLogs.some(l => l.habitId===h.id && l.date===today());
      const row = document.createElement('div');
      row.className = 'dash-habit-row';
      row.innerHTML = `<input type="checkbox" ${done?'checked':''} /><span>${h.icon||'🔥'} ${h.name}</span>`;
      const cb = qs('input', row);
      cb.addEventListener('change', async () => { await toggleHabitLog(h.id, today()); renderDashboard(); });
      dhEl.appendChild(row);
    });
  }

  // Todos — prioritas High→Medium→Low, belum selesai duluan
  const todos = await DB.getAll('todos');
  const pOrder = {high:0, medium:1, low:2};
  const pendingTodos = todos
    .filter(t => !t.done && !t.archived)
    .sort((a,b) => (pOrder[a.priority]??1) - (pOrder[b.priority]??1));
  const doneTodayTodos = todos
    .filter(t => t.done && !t.archived && t.doneAt === today())
    .sort((a,b) => (pOrder[a.priority]??1) - (pOrder[b.priority]??1));
  // Tampilkan: pending dulu (sort priority), lalu yang done hari ini, max 5
  const showTodos = [...pendingTodos, ...doneTodayTodos].slice(0,5);
  const dtEl = el('dashTodos');
  if(dtEl) {
    dtEl.innerHTML = '';
    if(!showTodos.length) {
      dtEl.innerHTML = '<p style="font-size:0.8rem;color:var(--text3)">Tidak ada todo aktif 🎉</p>';
    } else {
      const priorityDot = {high:'🔴',medium:'🟡',low:'🟢'};
      showTodos.forEach(t => {
        const row = document.createElement('div');
        row.className = 'dash-todo-row';
        row.innerHTML = `
          <input type="checkbox" ${t.done?'checked':''}/>
          <span style="font-size:.78rem;${t.done?'text-decoration:line-through;color:var(--text3)':''}">${priorityDot[t.priority]||'⚪'} ${t.title}</span>
        `;
        const cb = qs('input', row);
        cb.addEventListener('change', async () => {
          t.done = cb.checked;
          t.doneAt = t.done ? today() : null;
          await DB.put('todos', t);
          renderDashboard();
        });
        dtEl.appendChild(row);
      });
    }
  }

  // Sholat
  const sholatLogs = await DB.getAll('sholatLogs');
  const todaySholat = sholatLogs.find(s => s.date === today()) || { date: today(), prayers: {} };
  const PRAYERS_DASH = [{key:'subuh',name:'Subuh'},{key:'dzuhur',name:'Dzuhur'},{key:'ashar',name:'Ashar'},{key:'maghrib',name:'Maghrib'},{key:'isya',name:'Isya'}];
  const dsEl = el('dashSholat');
  if(dsEl) {
    dsEl.innerHTML = '';
    PRAYERS_DASH.forEach(p => {
      const done = todaySholat.prayers[p.key];
      const item = document.createElement('div');
      item.className = `dash-sholat-item ${done?'done':''}`;
      item.innerHTML = `
        <svg class="dash-sholat-check" viewBox="0 0 24 24" fill="none" stroke="${done?'#43E97B':'currentColor'}" stroke-width="2.5" width="16" height="16">
          ${done
            ? '<path d="M20 6L9 17l-5-5"/>'
            : '<rect x="3" y="3" width="18" height="18" rx="3"/>'}
        </svg>
        <small>${p.name}</small>`;
      item.addEventListener('click', async () => {
        todaySholat.prayers[p.key] = !todaySholat.prayers[p.key];
        if(!todaySholat.id) todaySholat.id = uid();
        await DB.put('sholatLogs', todaySholat);
        renderDashboard();
      });
      dsEl.appendChild(item);
    });
  }

  // Sleep
  const sleepLogs = await DB.getAll('sleepLogs');
  const lastSleep = sleepLogs.filter(s => s.date <= today()).sort((a,b) => b.date.localeCompare(a.date))[0];
  const dsh = el('dashSleepHours');
  if(dsh) dsh.textContent = lastSleep ? lastSleep.duration.toFixed(1) : '—';
  renderDashboardSleepBtn();

  // Stats
  const doneTodos = todos.filter(t => t.done).length;
  const doneHabits = hLogs.filter(l => l.date === today()).length;
  const journals = await DB.getAll('journals');
  const sGrid = el('dashStatsGrid');
  if(sGrid) {
    sGrid.innerHTML = `
      <div class="stats-mini-item"><div class="stats-mini-val">${doneTodos}</div><div class="stats-mini-lbl">Todo Selesai</div></div>
      <div class="stats-mini-item"><div class="stats-mini-val">${doneHabits}</div><div class="stats-mini-lbl">Habit Hari Ini</div></div>
      <div class="stats-mini-item"><div class="stats-mini-val">${habits.length}</div><div class="stats-mini-lbl">Total Habit</div></div>
      <div class="stats-mini-item"><div class="stats-mini-val">${journals.length}</div><div class="stats-mini-lbl">Jurnal</div></div>
    `;
  }

  // Donut Chart
  const donutCard = el('dashDonutCard');
  if(donutCard) {
    const sholatDone = Object.values(todaySholat.prayers || {}).filter(Boolean).length;
    const todoActive = todos.filter(t => !t.archived);
    const segments = [
      { label: 'Todo',   value: todoActive.filter(t => t.done).length, total: todoActive.length,  color: '#6C63FF' },
      { label: 'Habit',  value: doneHabits,  total: habits.length,                               color: '#FF6584' },
      { label: 'Sholat', value: sholatDone,  total: 5,                                           color: '#43E97B' },
      { label: 'Air',    value: wc,           total: wt,                                          color: '#44A8E0' },
    ];
    const { svg } = buildDonutSVG(segments);
    const legendHtml = segments.map(s => `
      <div class="donut-legend-item">
        <span class="donut-legend-dot" style="background:${s.color}"></span>
        <span class="donut-legend-label">${s.label}</span>
        <span class="donut-legend-val">${s.value}/${s.total}</span>
      </div>
    `).join('');
    donutCard.innerHTML = `
      <div class="card-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21.21 15.89A10 10 0 118 2.83"/><path d="M22 12A10 10 0 0012 2v10z"/></svg> Progress Hari Ini</div>
      <div class="donut-wrap">
        <div class="donut-svg-wrap">${svg}</div>
        <div class="donut-legend">${legendHtml}</div>
      </div>
    `;
  }

  // Prayer countdown card
  renderPrayerCountdown();
}

// ===== TODO =====
async function renderTodos() {
  const todos = await DB.getAll('todos');
  S.todos = todos;
  let filtered = todos.filter(t => {
    if(S.todoFilter === 'all' && !t.archived) return true;
    if(S.todoFilter === 'pending') return !t.done && !t.archived;
    if(S.todoFilter === 'done') return t.done && !t.archived;
    if(S.todoFilter === 'archived') return t.archived;
    return false;
  });
  if(S.todoPriority !== 'all') filtered = filtered.filter(t => t.priority === S.todoPriority);
  if(S.todoSearch) filtered = filtered.filter(t => t.title.toLowerCase().includes(S.todoSearch.toLowerCase()) || (t.note||'').toLowerCase().includes(S.todoSearch.toLowerCase()));
  const allActive = todos.filter(t => !t.archived);
  const done = allActive.filter(t => t.done).length;
  const total = allActive.length;
  const pf = el('todoProgressFill'); const pl = el('todoProgressLabel');
  if(pf) pf.style.width = total ? (done/total*100)+'%' : '0%';
  if(pl) pl.textContent = `${done} dari ${total} selesai`;
  const list = el('todoList'); if(!list) return;
  list.innerHTML = '';
  if(!filtered.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>Tidak ada todo di sini</p></div>';
    return;
  }
  const sorted = [...filtered].sort((a,b) => {
    const pOrder = {high:0,medium:1,low:2};
    if(a.done !== b.done) return a.done ? 1 : -1;
    return (pOrder[a.priority]||1) - (pOrder[b.priority]||1);
  });
  sorted.forEach(t => {
    const item = document.createElement('div');
    item.className = `todo-item animate-in ${t.done?'done-item':''}`;
    const deadlineTxt = t.deadline ? `📅 ${fmtShort(t.deadline+'T00:00:00')}` : '';
    item.innerHTML = `
      <input type="checkbox" class="todo-check" ${t.done?'checked':''} />
      <div class="todo-body">
        <div class="todo-text">${escHtml(t.title)}</div>
        <div class="todo-meta">
          <span class="todo-badge badge-${t.priority||'low'}">${{high:'🔴 High',medium:'🟡 Medium',low:'🟢 Low'}[t.priority]||'Low'}</span>
          ${t.category?`<span class="todo-badge badge-cat">🏷️ ${escHtml(t.category)}</span>`:''}
          ${deadlineTxt?`<span class="todo-badge badge-date">${deadlineTxt}</span>`:''}
        </div>
      </div>
      <div class="todo-actions">
        <button class="icon-btn" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="icon-btn" title="${t.archived?'Pulihkan':'Arsip'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg></button>
        <button class="icon-btn" title="Hapus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
      </div>
    `;
    const cb = qs('.todo-check', item);
    cb.addEventListener('change', async () => {
      t.done = cb.checked; t.doneAt = t.done ? today() : null;
      await DB.put('todos', t); renderTodos();
    });
    const btns = qsa('.icon-btn', item);
    btns[0].addEventListener('click', () => openTodoModal(t));
    btns[1].addEventListener('click', async () => {
      t.archived = !t.archived; await DB.put('todos', t); renderTodos();
      showToast(t.archived ? 'Diarsipkan' : 'Dipulihkan');
    });
    btns[2].addEventListener('click', () => confirm2('Hapus todo ini?', async () => { await DB.delete('todos', t.id); renderTodos(); showToast('Todo dihapus'); }));
    list.appendChild(item);
  });
}
function openTodoModal(t=null) {
  el('todoEditId').value = t ? t.id : '';
  el('todoTitle').value = t ? t.title : '';
  el('todoNote').value = t ? (t.note||'') : '';
  el('todoPriority').value = t ? (t.priority||'medium') : 'medium';
  el('todoCategory').value = t ? (t.category||'') : '';
  el('todoDeadline').value = t ? (t.deadline||'') : '';
  el('todoModalTitle').textContent = t ? 'Edit Todo' : 'Tambah Todo';
  openModal('todoModal');
  setTimeout(() => el('todoTitle').focus(), 300);
}
async function saveTodo() {
  const title = el('todoTitle').value.trim();
  if(!title) { showToast('Judul tidak boleh kosong'); return; }
  const id = el('todoEditId').value || uid();
  const existing = await DB.get('todos', id) || {};
  await DB.put('todos', { ...existing, id, title, note: el('todoNote').value.trim(), priority: el('todoPriority').value, category: el('todoCategory').value.trim(), deadline: el('todoDeadline').value, done: existing.done||false, archived: existing.archived||false, createdAt: existing.createdAt||today() });
  closeModal('todoModal');
  renderTodos();
  showToast('Todo disimpan ✅');
}

// ===== HABIT =====
async function renderHabits() {
  const habits = await DB.getAll('habits');
  const hLogs = await DB.getAll('habitLogs');
  const dateEl = el('habitCurrentDate');
  if(dateEl) dateEl.textContent = fmt(S.habitDate + 'T00:00:00');
  const list = el('habitList'); if(!list) return;
  list.innerHTML = '';
  if(!habits.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔥</div><p>Belum ada habit. Tambah habit pertamamu!</p></div>';
  }
  habits.forEach(h => {
    const done = hLogs.some(l => l.habitId===h.id && l.date===S.habitDate);
    const streak = calcStreak(h.id, hLogs);
    const last7 = getLast7Days(h.id, hLogs);
    const weekDone = last7.filter(Boolean).length;
    const pct = Math.round(weekDone / (h.target||7) * 100);
    const item = document.createElement('div');
    item.className = 'habit-item animate-in';
    item.innerHTML = `
      <div class="habit-item-header">
        <div class="habit-icon-badge" style="background:${h.color||'#6C63FF'}22">${h.icon||'🔥'}</div>
        <div class="habit-info">
          <div class="habit-name">${escHtml(h.name)}</div>
          <div class="habit-streak">🔥 ${streak} hari beruntun · Target: ${h.target||7}x/minggu</div>
        </div>
        <button class="habit-check-btn ${done?'checked':''}" data-id="${h.id}">${done
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" width="16" height="16"><path d="M20 6L9 17l-5-5"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="9"/></svg>`
        }</button>
      </div>
      <div class="habit-progress-bar"><div class="habit-progress-fill" style="width:${Math.min(100,pct)}%;background:${h.color||'#6C63FF'}"></div></div>
      <div class="habit-stats-row">
        <span class="habit-stat">${weekDone}/${h.target||7} minggu ini</span>
        <span class="habit-stat">${pct}%</span>
        <div style="display:flex;gap:6px">
          <button class="icon-btn" style="width:26px;height:26px" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="icon-btn" style="width:26px;height:26px" title="Hapus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>
        </div>
      </div>
    `;
    const checkBtn = qs('.habit-check-btn', item);
    checkBtn.addEventListener('click', async () => { await toggleHabitLog(h.id, S.habitDate); renderHabits(); });
    const editBtns = qsa('.icon-btn', item);
    editBtns[0].addEventListener('click', () => openHabitModal(h));
    editBtns[1].addEventListener('click', () => confirm2('Hapus habit ini?', async () => {
      await DB.delete('habits', h.id);
      const logs = hLogs.filter(l => l.habitId === h.id);
      for(const l of logs) await DB.delete('habitLogs', l.id);
      renderHabits(); showToast('Habit dihapus');
    }));
    list.appendChild(item);
  });
  renderHabitCalendar(habits, hLogs);
}
async function toggleHabitLog(habitId, date) {
  const hLogs = await DB.getAll('habitLogs');
  const existing = hLogs.find(l => l.habitId===habitId && l.date===date);
  if(existing) { await DB.delete('habitLogs', existing.id); }
  else { await DB.put('habitLogs', { id: uid(), habitId, date }); }
}
function calcStreak(habitId, logs) {
  const dates = logs.filter(l => l.habitId===habitId).map(l => l.date).sort().reverse();
  let streak = 0; let cur = today();
  for(const d of dates) {
    if(d === cur) { streak++; cur = prevDay(cur); }
    else if(d === prevDay(cur)) { streak++; cur = prevDay(d); }
    else break;
  }
  return streak;
}
function getLast7Days(habitId, logs) {
  const result = [];
  for(let i=6; i>=0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    result.push(logs.some(l => l.habitId===habitId && l.date===ds));
  }
  return result;
}
function prevDay(ds) {
  const d = new Date(ds+'T12:00:00'); d.setDate(d.getDate()-1);
  return d.toISOString().slice(0,10);
}
function renderHabitCalendar(habits, hLogs) {
  renderStreakCalendar(habits, hLogs);
}

function renderStreakCalendar(habits, hLogs) {
  const gridEl   = el('habitStreakGrid');
  const monthsEl = el('habitStreakMonths');
  const summaryEl= el('habitStreakSummary');
  if(!gridEl) return;

  const WEEKS = 16;
  const DAYS  = WEEKS * 7; // 112 hari
  const totalHabits = habits.length || 1;

  // Helper: tanggal lokal — fix timezone WIB
  const localStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  // Buat array 112 hari: index 0 = 111 hari lalu, index 111 = hari ini
  const days = [];
  for(let i = DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(12,0,0,0);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  const todayStr = localStr(days[days.length - 1]);
  const totalCols = WEEKS; // selalu tepat 16 kolom

  // Build logMap: date -> Set of habitIds
  const logMap = {};
  hLogs.forEach(l => {
    if(!logMap[l.date]) logMap[l.date] = new Set();
    logMap[l.date].add(l.habitId);
  });

  // Current streak — hitung mundur dari hari ini
  let currentStreak = 0;
  {
    const now3 = new Date(); now3.setHours(12,0,0,0);
    for(let i = 0; i < 365; i++) {
      const ds = localStr(now3);
      const cnt = logMap[ds] ? logMap[ds].size : 0;
      if(i > 0 && cnt === 0) break;
      if(cnt > 0) currentStreak++;
      now3.setDate(now3.getDate() - 1);
    }
  }

  // Best streak & total active days
  let bestStreak = 0, tempStreak = 0, totalActiveDays = 0;
  const allDates = Object.keys(logMap).filter(ds => logMap[ds].size > 0).sort();
  allDates.forEach((ds, i) => {
    totalActiveDays++;
    if(i === 0) { tempStreak = 1; }
    else {
      const diff = Math.round((new Date(ds+'T12:00:00') - new Date(allDates[i-1]+'T12:00:00')) / 86400000);
      tempStreak = diff === 1 ? tempStreak + 1 : 1;
    }
    bestStreak = Math.max(bestStreak, tempStreak);
  });

  // Month labels — tampilkan bulan saat ada tanggal 1 di kolom tsb, atau kolom pertama
  if(monthsEl) {
    monthsEl.innerHTML = '';
    let shownMonths = new Set();
    for(let w = 0; w < WEEKS; w++) {
      const colDays = days.slice(w * 7, w * 7 + 7);
      // Cari hari pertama bulan baru dalam kolom ini
      const newMonthDay = colDays.find(d => d.getDate() === 1);
      const labelDay = newMonthDay || (w === 0 ? colDays[0] : null);
      const span = document.createElement('span');
      span.className = 'streak-month-label';
      span.style.flex = '1';
      if(labelDay && !shownMonths.has(labelDay.getMonth())) {
        span.textContent = labelDay.toLocaleDateString('id-ID', {month:'short'});
        shownMonths.add(labelDay.getMonth());
      }
      monthsEl.appendChild(span);
    }
  }

  // Grid — 16 kolom × 7 baris, langsung dari array days
  gridEl.innerHTML = '';
  const tooltipEl = el('habitStreakTooltip');

  for(let w = 0; w < WEEKS; w++) {
    const col = document.createElement('div');
    col.className = 'streak-week-col';
    for(let d = 0; d < 7; d++) {
      const idx = w * 7 + d;
      const cellDate = days[idx];
      const ds = localStr(cellDate);
      const isToday = ds === todayStr;
      const cnt = logMap[ds] ? logMap[ds].size : 0;

      const cell = document.createElement('div');
      cell.className = 'streak-cell';

      const pct = cnt / totalHabits;
      let level = 0;
      if(pct >= 0.01) level = 1;
      if(pct >= 0.5)  level = 2;
      if(pct >= 0.75) level = 3;
      if(pct >= 1.0)  level = 4;
      cell.classList.add('level-' + level);
      if(isToday) cell.classList.add('today');

      const tipText = `${cellDate.toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}: ${cnt}/${totalHabits} habit`;
      const showTip = e => {
        if(!tooltipEl) return;
        tooltipEl.textContent = tipText;
        tooltipEl.classList.add('visible');
        const ex = e.clientX || e.touches?.[0]?.clientX || 0;
        const ey = e.clientY || e.touches?.[0]?.clientY || 0;
        tooltipEl.style.left = Math.min(ex + 10, window.innerWidth - 190) + 'px';
        tooltipEl.style.top  = (ey - 38) + 'px';
      };
      cell.addEventListener('mouseenter', showTip);
      cell.addEventListener('mouseleave', () => tooltipEl && tooltipEl.classList.remove('visible'));
      cell.addEventListener('touchstart', e => {
        showTip(e);
        setTimeout(() => tooltipEl && tooltipEl.classList.remove('visible'), 2000);
      }, {passive: true});

      col.appendChild(cell);
    }
    gridEl.appendChild(col);
  }

  if(summaryEl) {
    summaryEl.textContent = `${totalActiveDays} hari aktif · Streak sekarang: ${currentStreak} hari · Terbaik: ${bestStreak} hari`;
  }
}

function openHabitModal(h=null) {
  el('habitEditId').value = h ? h.id : '';
  el('habitName').value = h ? h.name : '';
  el('habitTarget').value = h ? (h.target||7) : 7;
  el('habitColor').value = h ? (h.color||'#6C63FF') : '#6C63FF';
  const icon = h ? (h.icon||'💧') : '💧';
  el('habitIcon').value = icon;
  qsa('.icon-opt', el('habitIconPicker')).forEach(b => b.classList.toggle('selected', b.dataset.icon===icon));
  el('habitModalTitle').textContent = h ? 'Edit Habit' : 'Tambah Habit';
  openModal('habitModal');
  setTimeout(() => el('habitName').focus(), 300);
}
async function saveHabit() {
  const name = el('habitName').value.trim();
  if(!name) { showToast('Nama tidak boleh kosong'); return; }
  const id = el('habitEditId').value || uid();
  const existing = await DB.get('habits', id) || {};
  await DB.put('habits', { ...existing, id, name, icon: el('habitIcon').value, target: parseInt(el('habitTarget').value)||7, color: el('habitColor').value, createdAt: existing.createdAt||today() });
  closeModal('habitModal');
  renderHabits();
  showToast('Habit disimpan 🔥');
}

// ===== JOURNAL =====
async function renderJournal() {
  const journals = await DB.getAll('journals');
  S.journals = journals;

  // Update nav date display
  const dateEl = el('journalCurrentDate');
  const isToday2 = S.journalDate === today();
  if(dateEl) dateEl.textContent = isToday2 ? 'Hari Ini' : fmt(S.journalDate + 'T00:00:00');

  // Disable next button if already at today
  const nextBtn = el('journalNextDay');
  if(nextBtn) nextBtn.style.opacity = isToday2 ? '0.3' : '1';

  // Filter: if search active → show all matching, else show selected date
  const search = S.journalSearch.toLowerCase();
  let filtered;
  if(search) {
    filtered = journals.filter(j =>
      (j.title||'').toLowerCase().includes(search) ||
      (j.content||'').toLowerCase().includes(search)
    ).sort((a,b) => b.date.localeCompare(a.date));
  } else {
    filtered = journals
      .filter(j => j.date === S.journalDate)
      .sort((a,b) => b.date.localeCompare(a.date));
  }

  renderJournalCalendar(journals);

  const list = el('journalList'); if(!list) return;
  list.innerHTML = '';

  if(!filtered.length) {
    const emptyMsg = search ? 'Jurnal tidak ditemukan' : `Belum ada jurnal untuk ${isToday2 ? 'hari ini' : fmt(S.journalDate+'T00:00:00')}`;
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg></div>
      <p>${emptyMsg}</p>
    </div>`;
    return;
  }

  const moodEmoji = {happy:'😊',neutral:'😐',sad:'😔',excited:'🤩',tired:'😴'};
  filtered.forEach(j => {
    const item = document.createElement('div');
    item.className = 'journal-item animate-in';
    const tags = (j.tags||[]).map(t => `<span class="tag-badge">#${t}</span>`).join('');
    item.innerHTML = `
      <div class="journal-item-header">
        <div class="journal-item-title">${escHtml(j.title||'Tanpa Judul')}</div>
        <div class="journal-item-meta">
          ${j.mood?`<span class="journal-mood">${moodEmoji[j.mood]||''}</span>`:''}
          <span class="journal-date">${fmtShort(j.date+'T00:00:00')}</span>
        </div>
      </div>
      <div class="journal-preview">${escHtml(j.content||'')}</div>
      ${tags?`<div class="journal-tags">${tags}</div>`:''}
    `;
    item.addEventListener('click', () => openJournalView(j));
    list.appendChild(item);
  });
}
function renderJournalCalendar(journals) {
  const cal = el('journalCalendar'); if(!cal) return;
  cal.innerHTML = '';
  const days = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  days.forEach(d => { const h = document.createElement('div'); h.className='jcal-header'; h.textContent=d; cal.appendChild(h); });

  // Show month of currently selected date
  const selDate = new Date(S.journalDate + 'T12:00:00');
  const year = selDate.getFullYear();
  const month = selDate.getMonth();
  const first = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();

  for(let i=0; i<first; i++) { const e = document.createElement('div'); e.className='jcal-day empty'; cal.appendChild(e); }
  for(let d=1; d<=daysInMonth; d++) {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const hasEntry = journals.some(j => j.date === ds);
    const isToday3 = ds === today();
    const isSelected = ds === S.journalDate;
    const div = document.createElement('div');
    div.className = `jcal-day${hasEntry?' has-entry':''}${isToday3?' today':''}${isSelected&&!isToday3?' selected':''}`;
    div.textContent = d;
    div.addEventListener('click', () => {
      S.journalDate = ds;
      renderJournal();
    });
    cal.appendChild(div);
  }
}
function openJournalView(j) {
  el('journalViewTitle').textContent = j.title || 'Jurnal';
  const moodEmoji = {happy:'😊',neutral:'😐',sad:'😔',excited:'🤩',tired:'😴'};
  const tags = (j.tags||[]).map(t => `<span class="tag-badge">#${t}</span>`).join(' ');
  el('journalViewBody').innerHTML = `
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px">
      <span style="font-size:0.85rem;color:var(--text3)">${fmt(j.date+'T00:00:00')}</span>
      ${j.mood?`<span style="font-size:1.3rem">${moodEmoji[j.mood]}</span>`:''}
    </div>
    <p style="font-size:0.9rem;line-height:1.7;white-space:pre-wrap;color:var(--text)">${escHtml(j.content||'')}</p>
    ${tags?`<div class="journal-tags" style="margin-top:12px">${tags}</div>`:''}
  `;
  el('btnDeleteJournal').onclick = () => confirm2('Hapus jurnal ini?', async () => { await DB.delete('journals', j.id); closeModal('journalViewModal'); renderJournal(); showToast('Jurnal dihapus'); });
  el('btnEditJournalFromView').onclick = () => { closeModal('journalViewModal'); openJournalModal(j); };
  openModal('journalViewModal');
}
function openJournalModal(j=null) {
  el('journalEditId').value = j ? j.id : '';
  el('journalTitle').value = j ? (j.title||'') : '';
  el('journalContent').value = j ? (j.content||'') : '';
  el('journalTags').value = j ? (j.tags||[]).join(', ') : '';
  el('journalMood').value = j ? (j.mood||'') : '';
  const moodBtns = qsa('#journalModal .mood-btn');
  moodBtns.forEach(b => b.classList.toggle('selected', b.dataset.mood === (j ? j.mood : '')));
  el('journalModalTitle').textContent = j ? 'Edit Jurnal' : `Tulis Jurnal — ${S.journalDate === today() ? 'Hari Ini' : fmtShort(S.journalDate+'T00:00:00')}`;
  // Store selected date so save uses correct date
  el('journalEditId')._journalDate = j ? j.date : S.journalDate;
  openModal('journalModal');
  setTimeout(() => el('journalContent').focus(), 300);
}
async function saveJournal() {
  const content = el('journalContent').value.trim();
  if(!content) { showToast('Isi jurnal tidak boleh kosong'); return; }
  const id = el('journalEditId').value || uid();
  const saveDate = el('journalEditId')._journalDate || S.journalDate || today();
  const existing = await DB.get('journals', id) || {};
  const rawTags = el('journalTags').value;
  const tags = rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : [];
  await DB.put('journals', {
    ...existing, id,
    title: el('journalTitle').value.trim()||'Tanpa Judul',
    content, mood: el('journalMood').value||'', tags,
    date: existing.date || saveDate,
    updatedAt: today()
  });
  closeModal('journalModal');
  renderJournal();
  showToast('Jurnal disimpan 📓');
}

// ===== SHOLAT =====
const SVG_MOON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`;
const SVG_SUN  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const SVG_CLOUD= `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>`;
const SVG_SUNSET=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 18a5 5 0 00-10 0"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/><line x1="23" y1="22" x2="1" y2="22"/><polyline points="8 6 12 2 16 6"/></svg>`;
const PRAYERS = [
  {key:'subuh',   name:'Subuh',   icon: SVG_MOON,   time:'04:30'},
  {key:'dzuhur',  name:'Dzuhur',  icon: SVG_SUN,    time:'12:00'},
  {key:'ashar',   name:'Ashar',   icon: SVG_CLOUD,  time:'15:15'},
  {key:'maghrib', name:'Maghrib', icon: SVG_SUNSET,  time:'18:00'},
  {key:'isya',    name:'Isya',    icon: SVG_MOON,   time:'19:15'},
];
const SVG_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" width="16" height="16"><path d="M20 6L9 17l-5-5"/></svg>`;
const SVG_BOX   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>`;

async function renderSholat() {
  const dateEl = el('sholatCurrentDate');
  if(dateEl) dateEl.textContent = fmt(S.sholatDate + 'T00:00:00');
  const label = el('sholatDateLabel');
  if(label) label.textContent = S.sholatDate === today() ? 'Hari ini' : '';
  const sholatLogs = await DB.getAll('sholatLogs');
  const dayLog = sholatLogs.find(s => s.date === S.sholatDate) || { date: S.sholatDate, prayers: {} };
  const list = el('sholatList'); if(!list) return;
  list.innerHTML = '';
  PRAYERS.forEach(p => {
    const done = dayLog.prayers[p.key];
    const item = document.createElement('div');
    item.className = `sholat-item ${done?'done':''}`;
    item.innerHTML = `
      <div class="sholat-icon">${p.icon}</div>
      <div class="sholat-info">
        <div class="sholat-name">${p.name}</div>
        <div class="sholat-time">${p.time} WIB</div>
      </div>
      <button class="sholat-toggle ${done?'done':''}">${done ? SVG_CHECK : SVG_BOX}</button>
    `;
    const btn = qs('.sholat-toggle', item);
    btn.addEventListener('click', async () => {
      dayLog.prayers[p.key] = !dayLog.prayers[p.key];
      if(!dayLog.id) dayLog.id = uid();
      await DB.put('sholatLogs', dayLog);
      renderSholat();
      showToast(dayLog.prayers[p.key] ? `${p.name} tercatat ✓` : `${p.name} dibatalkan`);
    });
    list.appendChild(item);
  });
  renderSholatWeek(sholatLogs);
}
function renderSholatWeek(sholatLogs) {
  const grid = el('sholatWeekGrid'); if(!grid) return;
  grid.innerHTML = '';
  const dayNames = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  for(let i=6; i>=0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dayLog = sholatLogs.find(s => s.date===ds);
    const col = document.createElement('div');
    col.className = 'sholat-week-col';
    col.innerHTML = `<div class="sholat-week-day">${dayNames[d.getDay()]}</div>`;
    PRAYERS.forEach(p => {
      const done = dayLog && dayLog.prayers[p.key];
      const dot = document.createElement('div');
      dot.className = `sholat-week-dot ${done?'done':''}`;
      dot.title = p.name;
      dot.textContent = done ? '✓' : '';
      col.appendChild(dot);
    });
    grid.appendChild(col);
  }
}

// ===== SLEEP =====
async function renderSleep() {
  const target = S.settings.sleepTarget || 8;
  const tDisp = el('sleepTargetDisplay'); if(tDisp) tDisp.textContent = `${target} jam`;
  renderSleepSessionCard();
  const logs = await DB.getAll('sleepLogs');
  const sorted = [...logs].sort((a,b) => b.date.localeCompare(a.date));
  renderSleepChart(sorted, target);
  const list = el('sleepLogList'); if(!list) return;
  list.innerHTML = '';
  if(!sorted.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">💤</div><p>Belum ada catatan tidur</p></div>';
    return;
  }
  sorted.slice(0,10).forEach(s => {
    const quality = '⭐'.repeat(s.quality||3);
    const item = document.createElement('div');
    item.className = 'sleep-log-item animate-in';
    item.innerHTML = `
      <div class="sleep-log-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" width="28" height="28"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg></div>
      <div class="sleep-log-info">
        <div class="sleep-log-dur">${s.duration.toFixed(1)} jam <span class="sleep-quality-stars">${quality}</span></div>
        <div class="sleep-log-times">${fmtShort(s.date+'T00:00:00')} · ${s.start} → ${s.end}</div>
      </div>
      <div class="sleep-log-actions">
        <button class="icon-btn" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="icon-btn" title="Hapus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>
      </div>
    `;
    const btns = qsa('.icon-btn', item);
    btns[0].addEventListener('click', () => openSleepModal(s));
    btns[1].addEventListener('click', () => confirm2('Hapus catatan tidur?', async () => { await DB.delete('sleepLogs', s.id); renderSleep(); showToast('Dihapus'); }));
    list.appendChild(item);
  });
}
function renderSleepChart(logs, target) {
  const wrap = el('sleepChart'); if(!wrap) return;
  wrap.innerHTML = '';
  const last7 = [];
  for(let i=6; i>=0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const log = logs.find(l => l.date===ds);
    last7.push({ date: ds, dur: log ? log.duration : 0, label: ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][d.getDay()] });
  }
  const maxDur = Math.max(...last7.map(l => l.dur), target, 1);
  const chart = document.createElement('div');
  chart.className = 'sleep-bar-chart';
  last7.forEach(day => {
    const pct = Math.min(100, (day.dur / maxDur * 100));
    const targetPct = Math.min(100, (target / maxDur * 100));
    const color = day.dur >= target ? '#43E97B' : day.dur > 0 ? '#FF6B6B' : '#E0E0E0';
    const item = document.createElement('div');
    item.className = 'sleep-bar-item';
    item.innerHTML = `
      <div class="sleep-bar-val" style="font-size:0.6rem;color:var(--text3)">${day.dur>0?day.dur.toFixed(1):''}</div>
      <div class="sleep-bar" style="height:${pct}%;background:${color};width:100%"></div>
      <div class="sleep-bar-label">${day.label}</div>
    `;
    chart.appendChild(item);
  });
  wrap.appendChild(chart);
}
function openSleepModal(s=null) {
  el('sleepEditId').value = s ? s.id : '';
  el('sleepDate').value = s ? s.date : today();
  el('sleepStart').value = s ? s.start : '22:00';
  el('sleepEnd').value = s ? s.end : '06:00';
  el('sleepQuality').value = s ? (s.quality||3) : 3;
  openModal('sleepModal');
}
async function saveSleep() {
  const date = el('sleepDate').value;
  const start = el('sleepStart').value;
  const end = el('sleepEnd').value;
  if(!date||!start||!end) { showToast('Isi semua field'); return; }
  const startH = parseInt(start.split(':')[0]), startM = parseInt(start.split(':')[1]);
  const endH = parseInt(end.split(':')[0]), endM = parseInt(end.split(':')[1]);
  let dur = (endH*60+endM - startH*60-startM) / 60;
  if(dur < 0) dur += 24;
  const id = el('sleepEditId').value || uid();
  await DB.put('sleepLogs', { id, date, start, end, duration: Math.round(dur*10)/10, quality: parseInt(el('sleepQuality').value)||3 });
  closeModal('sleepModal');
  renderSleep();
  showToast('Tidur dicatat 💤');
}

// ===== WATER =====
async function renderWater() {
  const logs = await DB.getAll('waterLogs');
  const todayLogs = logs.filter(w => w.date === today()).sort((a,b) => a.time.localeCompare(b.time));
  const wt = S.settings.waterTarget || 8;
  const wc = todayLogs.length;
  const pct = Math.min(100, Math.round(wc/wt*100));
  const wf = el('waterFill'); if(wf) wf.style.height = pct + '%';
  const wp = el('waterPercent'); if(wp) wp.textContent = pct + '%';
  const wCount = el('waterCount'); if(wCount) wCount.innerHTML = `${wc} <span>gelas</span>`;
  const wTxt = el('waterTargetText'); if(wTxt) wTxt.textContent = `Target: ${wt} gelas`;
  const wti = el('waterTargetInput'); if(wti) wti.value = wt;
  const cupsGrid = el('waterCupsGrid'); if(cupsGrid) {
    cupsGrid.innerHTML = '';
    for(let i=0; i<wt; i++) {
      const cup = document.createElement('div');
      cup.className = `water-cup ${i<wc?'filled':''}`;
      cup.innerHTML = `<svg viewBox="0 0 24 24" fill="${i<wc?'#44A8E0':'none'}" stroke="${i<wc?'#44A8E0':'var(--text3)'}" stroke-width="2" width="26" height="26"><path d="M8 2h8l1 8H7L8 2z"/><path d="M7 10c0 5 1 10 5 10s5-5 5-10"/></svg><small>Gelas ${i+1}</small>`;
      cup.addEventListener('click', async () => {
        if(i < wc) {
          const logToRemove = todayLogs[i];
          if(logToRemove) { await DB.delete('waterLogs', logToRemove.id); renderWater(); }
        } else {
          await addWater();
        }
      });
      cupsGrid.appendChild(cup);
    }
  }
  const wLog = el('waterLog'); if(wLog) {
    wLog.innerHTML = todayLogs.length ? todayLogs.map(l => `<div class="water-log-item"><span style="display:flex;align-items:center;gap:4px"><svg viewBox="0 0 24 24" fill="#44A8E0" stroke="#44A8E0" stroke-width="1" width="13" height="13"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg> ${l.time}</span><span>+1 gelas</span></div>`).join('') : '';
  }
}
async function addWater() {
  const wt = S.settings.waterTarget || 8;
  const logs = await DB.getAll('waterLogs');
  const todayLogs = logs.filter(w => w.date === today());
  if(todayLogs.length >= wt) { showToast('Target sudah tercapai! 🎉'); return; }
  const time = new Date().toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'});
  await DB.put('waterLogs', { id: uid(), date: today(), time });
  renderWater();
  const newCount = todayLogs.length + 1;
  if(newCount === wt) showToast('🎉 Target air minum tercapai!');
  else showToast('💧 Air ditambah');
}

// ===== GOALS =====
async function renderGoals() {
  const goals = await DB.getAll('goals');
  const milestones = await DB.getAll('milestones');
  const list = el('goalsList'); if(!list) return;
  list.innerHTML = '';
  if(!goals.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📚</div><p>Belum ada goals. Tambah tujuanmu!</p></div>';
    return;
  }
  const colors = ['#6C63FF','#FF6584','#43E97B','#F9CA24','#4ECDC4','#FF8C42'];
  goals.forEach((g, gi) => {
    const gMilestones = milestones.filter(m => m.goalId === g.id);
    const color = colors[gi % colors.length];
    const item = document.createElement('div');
    item.className = 'goal-item animate-in';
    const milestoneHtml = gMilestones.map(m => `
      <div class="milestone-item ${m.done?'done':''}" data-mid="${m.id}">
        <input type="checkbox" ${m.done?'checked':''} />
        <span>${escHtml(m.name)}</span>
        <span class="milestone-del" data-mid="${m.id}">✕</span>
      </div>
    `).join('');
    item.innerHTML = `
      <div class="goal-header">
        <div class="goal-icon-badge" style="background:${color}22">${g.icon||'🎯'}</div>
        <div class="goal-info">
          <div class="goal-title">${escHtml(g.title)}</div>
          ${g.desc?`<div class="goal-desc">${escHtml(g.desc)}</div>`:''}
        </div>
        <div class="goal-actions">
          <button class="icon-btn" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="icon-btn" title="Hapus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>
        </div>
      </div>
      <div class="goal-progress-row">
        <div class="goal-progress-bar"><div class="goal-progress-fill" style="width:${g.progress||0}%;background:${color}"></div></div>
        <div class="goal-progress-pct">${g.progress||0}%</div>
      </div>
      <div class="goal-meta">
        ${g.deadline?`<span class="goal-deadline">📅 ${fmtShort(g.deadline+'T00:00:00')}</span>`:''}
      </div>
      <div class="goal-milestones">
        <div class="milestone-list">${milestoneHtml}</div>
        <span class="add-milestone-btn" data-gid="${g.id}">+ Tambah Milestone</span>
      </div>
    `;
    const btns = qsa('.icon-btn', item);
    btns[0].addEventListener('click', () => openGoalModal(g));
    btns[1].addEventListener('click', () => confirm2('Hapus goal ini?', async () => {
      await DB.delete('goals', g.id);
      const gm = milestones.filter(m => m.goalId===g.id);
      for(const m of gm) await DB.delete('milestones', m.id);
      renderGoals(); showToast('Goal dihapus');
    }));
    qsa('.milestone-item input', item).forEach(cb => {
      cb.addEventListener('change', async () => {
        const mid = cb.closest('.milestone-item').dataset.mid;
        const m = milestones.find(mm => mm.id===mid);
        if(m) {
          m.done = cb.checked;
          await DB.put('milestones', m);
          // Auto-calculate goal progress from milestones
          const goalMilestones = milestones.filter(mm => mm.goalId === g.id);
          if(goalMilestones.length > 0) {
            const doneCount = goalMilestones.filter(mm => mm.id === mid ? cb.checked : mm.done).length;
            const newProgress = Math.round(doneCount / goalMilestones.length * 100);
            if(g.progress !== newProgress) {
              g.progress = newProgress;
              await DB.put('goals', g);
            }
          }
          renderGoals();
          showToast(cb.checked ? '✅ Milestone selesai! Progress diperbarui' : 'Milestone dibatalkan');
        }
      });
    });
    qsa('.milestone-del', item).forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const mid = btn.dataset.mid;
        await DB.delete('milestones', mid);
        // Recalculate after deletion
        const remaining = milestones.filter(mm => mm.goalId === g.id && mm.id !== mid);
        if(remaining.length > 0) {
          const doneCount = remaining.filter(mm => mm.done).length;
          g.progress = Math.round(doneCount / remaining.length * 100);
          await DB.put('goals', g);
        } else {
          // No milestones left — reset to 0 or keep as is
          // keep g.progress as is (manual)
        }
        renderGoals();
      });
    });
    qs('.add-milestone-btn', item).addEventListener('click', () => {
      el('milestoneGoalId').value = g.id;
      el('milestoneName').value = '';
      openModal('milestoneModal');
      setTimeout(() => el('milestoneName').focus(), 300);
    });
    list.appendChild(item);
  });
}
function openGoalModal(g=null) {
  el('goalEditId').value = g ? g.id : '';
  el('goalTitle').value = g ? g.title : '';
  el('goalDesc').value = g ? (g.desc||'') : '';
  el('goalProgress').value = g ? (g.progress||0) : 0;
  el('goalDeadline').value = g ? (g.deadline||'') : '';
  const icon = g ? (g.icon||'🎯') : '🎯';
  el('goalIcon').value = icon;
  qsa('.icon-opt', el('goalIconPicker')).forEach(b => b.classList.toggle('selected', b.dataset.icon===icon));
  el('goalModalTitle').textContent = g ? 'Edit Goal' : 'Tambah Goal';
  openModal('goalModal');
  setTimeout(() => el('goalTitle').focus(), 300);
}
async function saveGoal() {
  const title = el('goalTitle').value.trim();
  if(!title) { showToast('Judul tidak boleh kosong'); return; }
  const id = el('goalEditId').value || uid();
  const existing = await DB.get('goals', id) || {};
  await DB.put('goals', { ...existing, id, title, desc: el('goalDesc').value.trim(), progress: parseInt(el('goalProgress').value)||0, deadline: el('goalDeadline').value, icon: el('goalIcon').value, createdAt: existing.createdAt||today() });
  closeModal('goalModal');
  renderGoals();
  showToast('Goal disimpan 📚');
}
async function saveMilestone() {
  const name = el('milestoneName').value.trim();
  if(!name) { showToast('Nama milestone tidak boleh kosong'); return; }
  const goalId = el('milestoneGoalId').value;
  await DB.put('milestones', { id: uid(), goalId, name, done: false });
  // Recalculate goal progress
  const allMilestones = await DB.getAll('milestones');
  const goalMilestones = allMilestones.filter(m => m.goalId === goalId);
  if(goalMilestones.length > 0) {
    const goal = await DB.get('goals', goalId);
    if(goal) {
      const doneCount = goalMilestones.filter(m => m.done).length;
      goal.progress = Math.round(doneCount / goalMilestones.length * 100);
      await DB.put('goals', goal);
    }
  }
  closeModal('milestoneModal');
  renderGoals();
  showToast('Milestone ditambah ✅');
}

// ===== STATS =====
async function renderStats() {
  const todos = await DB.getAll('todos');
  const habits = await DB.getAll('habits');
  const hLogs = await DB.getAll('habitLogs');
  const journals = await DB.getAll('journals');
  const sleepLogs = await DB.getAll('sleepLogs');
  const waterLogs = await DB.getAll('waterLogs');
  const sholatLogs = await DB.getAll('sholatLogs');
  const doneTodos = todos.filter(t => t.done).length;
  const todayHabits = hLogs.filter(l => l.date===today()).length;
  const avgSleep = sleepLogs.length ? (sleepLogs.reduce((a,b)=>a+b.duration,0)/sleepLogs.length).toFixed(1) : 0;
  const todayWater = waterLogs.filter(w => w.date===today()).length;
  const ov = el('statsOverview'); if(!ov) return;
  ov.innerHTML = `
    <div class="stat-card"><div class="stat-card-val">${doneTodos}</div><div class="stat-card-lbl">Todo Selesai</div></div>
    <div class="stat-card"><div class="stat-card-val">${habits.length}</div><div class="stat-card-lbl">Total Habit</div></div>
    <div class="stat-card"><div class="stat-card-val">${journals.length}</div><div class="stat-card-lbl">Total Jurnal</div></div>
    <div class="stat-card"><div class="stat-card-val">${avgSleep}</div><div class="stat-card-lbl">Rata-rata Tidur (jam)</div></div>
  `;
  const charts = el('statsCharts'); if(!charts) return;
  charts.innerHTML = '';
  // Habit chart last 7 days
  const habitCard = document.createElement('div'); habitCard.className = 'chart-card';
  let habitChartHtml = '<div class="chart-title">Habit Selesai (7 hari)</div><div class="bar-chart">';
  for(let i=6; i>=0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const cnt = hLogs.filter(l => l.date===ds).length;
    const pct = habits.length ? Math.min(100, cnt/habits.length*100) : 0;
    const day = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][d.getDay()];
    habitChartHtml += `<div class="bar-item"><div class="bar-val">${cnt}</div><div class="bar-fill" style="height:${pct}%;background:var(--primary)"></div><div class="bar-lbl">${day}</div></div>`;
  }
  habitChartHtml += '</div>';
  habitCard.innerHTML = habitChartHtml;
  charts.appendChild(habitCard);
  // Sleep chart
  const sleepCard = document.createElement('div'); sleepCard.className = 'chart-card';
  let sleepHtml = '<div class="chart-title">Durasi Tidur (7 hari)</div><div class="bar-chart">';
  for(let i=6; i>=0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const log = sleepLogs.find(l => l.date===ds);
    const dur = log ? log.duration : 0;
    const pct = Math.min(100, (dur/10)*100);
    const day = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][d.getDay()];
    const color = dur >= (S.settings.sleepTarget||8) ? '#43E97B' : dur > 0 ? '#FF6B6B' : '#E0E0E0';
    sleepHtml += `<div class="bar-item"><div class="bar-val">${dur>0?dur:''}</div><div class="bar-fill" style="height:${pct}%;background:${color}"></div><div class="bar-lbl">${day}</div></div>`;
  }
  sleepHtml += '</div>';
  sleepCard.innerHTML = sleepHtml;
  charts.appendChild(sleepCard);
  // Sholat chart
  const sholatCard = document.createElement('div'); sholatCard.className = 'chart-card';
  let sholatHtml = '<div class="chart-title">Sholat (7 hari)</div><div class="bar-chart">';
  for(let i=6; i>=0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const log = sholatLogs.find(l => l.date===ds);
    const cnt = log ? Object.values(log.prayers||{}).filter(Boolean).length : 0;
    const pct = cnt/5*100;
    const day = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][d.getDay()];
    sholatHtml += `<div class="bar-item"><div class="bar-val">${cnt}/5</div><div class="bar-fill" style="height:${pct}%;background:#6C63FF"></div><div class="bar-lbl">${day}</div></div>`;
  }
  sholatHtml += '</div>';
  sholatCard.innerHTML = sholatHtml;
  charts.appendChild(sholatCard);
  // Mood distribution
  const moodCard = document.createElement('div'); moodCard.className = 'chart-card';
  const moodCounts = {happy:0,neutral:0,sad:0,excited:0,tired:0};
  journals.forEach(j => { if(j.mood && moodCounts[j.mood]!==undefined) moodCounts[j.mood]++; });
  const totalMood = Object.values(moodCounts).reduce((a,b)=>a+b,0);
  const moodEmoji = {happy:'😊',neutral:'😐',sad:'😔',excited:'🤩',tired:'😴'};
  let moodHtml = '<div class="chart-title">Distribusi Mood</div><div style="display:flex;flex-direction:column;gap:8px">';
  Object.entries(moodCounts).forEach(([m,c]) => {
    const pct = totalMood ? Math.round(c/totalMood*100) : 0;
    moodHtml += `<div style="display:flex;align-items:center;gap:8px"><span style="width:24px">${moodEmoji[m]}</span><div style="flex:1;background:var(--bg3);border-radius:4px;height:8px"><div style="width:${pct}%;height:100%;border-radius:4px;background:var(--primary)"></div></div><span style="font-size:0.78rem;color:var(--text3);min-width:30px">${c}x</span></div>`;
  });
  moodHtml += '</div>';
  moodCard.innerHTML = moodHtml;
  charts.appendChild(moodCard);
}

// ===== SETTINGS =====
async function renderSettings() {
  const nameInput = el('settingName');
  if(nameInput) { nameInput.value = S.settings.name; nameInput.addEventListener('change', () => { S.settings.name = nameInput.value.trim()||'Azhar'; saveSettings(); }); }
  const dm = el('darkModeToggle');
  if(dm) { dm.checked = S.settings.darkMode; }

  // Prayer reminder state
  const prayerEnabled = await KV.get('prayer_reminder_enabled', false);
  const prayerMinutes = await KV.get('prayer_reminder_minutes', 5);
  const prayerCoords  = await KV.get('prayer_coords', null);
  const prt = el('prayerReminderToggle'); if(prt) prt.checked = prayerEnabled;
  const prm = el('prayerReminderMinutes'); if(prm) prm.value = prayerMinutes;
  const locLabel = el('savedLocationLabel');
  if(locLabel) locLabel.textContent = prayerCoords
    ? `${prayerCoords.lat.toFixed(4)}°, ${prayerCoords.lng.toFixed(4)}°`
    : 'Belum ada';

  // Load notification state
  const notifEnabled = await KV.get('notif_enabled', false);
  const morningTime = await KV.get('notif_morning', '07:00');
  const eveningTime = await KV.get('notif_evening', '21:00');
  const notifToggle = el('notifToggle');
  if(notifToggle) notifToggle.checked = notifEnabled;
  const notifTimeSettings = el('notifTimeSettings');
  if(notifTimeSettings) notifTimeSettings.style.display = notifEnabled ? 'block' : 'none';
  const nMorning = el('notifMorning'); if(nMorning) nMorning.value = morningTime;
  const nEvening = el('notifEvening'); if(nEvening) nEvening.value = eveningTime;
}
function saveSettings() {
  KV.set('lifehub_settings', S.settings);
  applySettings();
}
function applySettings() {
  document.documentElement.setAttribute('data-theme', S.settings.darkMode ? 'dark' : '');
}
async function exportData() {
  const data = {};
  for(const store of DB._stores) { try { data[store] = await DB.getAll(store); } catch{} }
  data.settings = S.settings;
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`lifehub_backup_${today()}.json`; a.click();
  URL.revokeObjectURL(url);
  showToast('Data diekspor 📦');
}
async function importData(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if(data.settings) { S.settings = {...S.settings,...data.settings}; saveSettings(); }
    for(const store of DB._stores) {
      if(data[store] && Array.isArray(data[store])) {
        for(const item of data[store]) { try { await DB.put(store, item); } catch{} }
      }
    }
    showToast('Data diimpor ✅');
    navigateTo('dashboard');
  } catch(e) { showToast('Error: file tidak valid'); }
}

// ===== HTML ESCAPE =====
function escHtml(str) {
  if(!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== EVENT LISTENERS =====
function setupEvents() {
  // Menu
  el('menuBtn').addEventListener('click', openSidebar);
  el('sidebarClose').addEventListener('click', closeSidebar);
  el('sidebarOverlay').addEventListener('click', closeSidebar);
  // Nav
  qsa('.nav-item').forEach(n => n.addEventListener('click', e => { e.preventDefault(); navigateTo(n.dataset.page); }));
  qsa('.bnav-item').forEach(n => n.addEventListener('click', e => { e.preventDefault(); navigateTo(n.dataset.page); }));
  // Modal close
  el('modalBackdrop').addEventListener('click', closeAllModals);
  qsa('.modal-close').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.modal)));
  qsa('[data-modal]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.modal)));
  // Confirm
  el('confirmNo').addEventListener('click', () => closeModal('confirmModal'));
  el('confirmYes').addEventListener('click', () => { if(_confirmCb){_confirmCb();} closeModal('confirmModal'); });
  // Dashboard Mood
  el('dashMoodRow').addEventListener('click', async e => {
    const btn = e.target.closest('.mood-btn'); if(!btn) return;
    await KV.set('mood_'+today(), btn.dataset.mood);
    renderDashboard();
  });
  el('dashAddWater').addEventListener('click', async () => { await addWater(); renderDashboard(); });
  // TODO
  el('btnAddTodo').addEventListener('click', () => openTodoModal());
  el('btnSaveTodo').addEventListener('click', saveTodo);
  el('todoSearch').addEventListener('input', e => { S.todoSearch = e.target.value; renderTodos(); });
  qsa('.filter-btn[data-filter]').forEach(b => b.addEventListener('click', () => {
    qsa('.filter-btn[data-filter]').forEach(bb => bb.classList.remove('active'));
    b.classList.add('active'); S.todoFilter = b.dataset.filter; renderTodos();
  }));
  qsa('.filter-btn[data-priority]').forEach(b => b.addEventListener('click', () => {
    qsa('.filter-btn[data-priority]').forEach(bb => bb.classList.remove('active'));
    b.classList.add('active'); S.todoPriority = b.dataset.priority; renderTodos();
  }));
  // HABIT
  el('btnAddHabit').addEventListener('click', () => openHabitModal());
  el('btnSaveHabit').addEventListener('click', saveHabit);
  el('habitPrevDay').addEventListener('click', () => { const d=new Date(S.habitDate+'T12:00:00'); d.setDate(d.getDate()-1); S.habitDate=d.toISOString().slice(0,10); renderHabits(); });
  el('habitNextDay').addEventListener('click', () => { const d=new Date(S.habitDate+'T12:00:00'); d.setDate(d.getDate()+1); S.habitDate=d.toISOString().slice(0,10); renderHabits(); });
  el('habitIconPicker').addEventListener('click', e => {
    const btn = e.target.closest('.icon-opt'); if(!btn) return;
    qsa('.icon-opt', el('habitIconPicker')).forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected'); el('habitIcon').value = btn.dataset.icon;
  });
  // JOURNAL
  el('btnAddJournal').addEventListener('click', () => openJournalModal());
  el('btnSaveJournal').addEventListener('click', saveJournal);
  el('journalSearch').addEventListener('input', e => { S.journalSearch = e.target.value; renderJournal(); });
  el('journalPrevDay').addEventListener('click', () => {
    const d = new Date(S.journalDate+'T12:00:00'); d.setDate(d.getDate()-1);
    S.journalDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    S._journalManualNav = S.journalDate !== today(); // tandai manual jika bukan hari ini
    renderJournal();
  });
  el('journalNextDay').addEventListener('click', () => {
    if(S.journalDate >= today()) return;
    const d = new Date(S.journalDate+'T12:00:00'); d.setDate(d.getDate()+1);
    S.journalDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    S._journalManualNav = S.journalDate !== today();
    renderJournal();
  });
  document.getElementById('journalModal').addEventListener('click', e => {
    const btn = e.target.closest('.mood-btn'); if(!btn) return;
    qsa('#journalModal .mood-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected'); el('journalMood').value = btn.dataset.mood;
  });
  // SHOLAT
  el('sholatPrevDay').addEventListener('click', () => { const d=new Date(S.sholatDate+'T12:00:00'); d.setDate(d.getDate()-1); S.sholatDate=d.toISOString().slice(0,10); renderSholat(); });
  el('sholatNextDay').addEventListener('click', () => { const d=new Date(S.sholatDate+'T12:00:00'); d.setDate(d.getDate()+1); S.sholatDate=d.toISOString().slice(0,10); renderSholat(); });
  // SLEEP
  el('btnAddSleep').addEventListener('click', () => openSleepModal());
  el('btnSaveSleep').addEventListener('click', saveSleep);
  el('btnEditSleepTarget').addEventListener('click', () => {
    const newTarget = prompt('Target tidur (jam):', S.settings.sleepTarget||8);
    if(newTarget && !isNaN(newTarget)) { S.settings.sleepTarget = parseInt(newTarget); saveSettings(); renderSleep(); }
  });
  // Wake quality buttons (inside wakeModal)
  qsa('.wake-quality-btn').forEach(btn => {
    btn.addEventListener('click', () => endSleepSession(parseInt(btn.dataset.quality)));
  });
  const _btnSleepWarnOk = el('btnSleepWarnOk');
  if(_btnSleepWarnOk) _btnSleepWarnOk.addEventListener('click', () => closeModal('sleepWarnModal'));
  // WATER
  el('btnAddWaterMain').addEventListener('click', addWater);
  el('btnResetWater').addEventListener('click', async () => {
    confirm2('Reset air minum hari ini?', async () => {
      const logs = await DB.getAll('waterLogs');
      const todayLogs = logs.filter(w => w.date === today());
      for(const l of todayLogs) await DB.delete('waterLogs', l.id);
      renderWater(); showToast('Air direset');
    });
  });
  el('waterTargetInput').addEventListener('change', async e => {
    const val = parseInt(e.target.value);
    if(val && val > 0) { S.settings.waterTarget = val; saveSettings(); renderWater(); showToast('Target diperbarui'); }
  });
  // GOALS
  el('btnAddGoal').addEventListener('click', () => openGoalModal());
  el('btnSaveGoal').addEventListener('click', saveGoal);
  el('btnSaveMilestone').addEventListener('click', saveMilestone);
  el('goalIconPicker').addEventListener('click', e => {
    const btn = e.target.closest('.icon-opt'); if(!btn) return;
    qsa('.icon-opt', el('goalIconPicker')).forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected'); el('goalIcon').value = btn.dataset.icon;
  });
  // SETTINGS
  el('darkModeToggle').addEventListener('change', e => { S.settings.darkMode = e.target.checked; saveSettings(); });
  el('btnExport').addEventListener('click', exportData);
  el('btnImport').addEventListener('click', () => el('importFile').click());
  el('importFile').addEventListener('change', e => { if(e.target.files[0]) importData(e.target.files[0]); });
  el('btnReset').addEventListener('click', () => confirm2('Reset SEMUA data? Ini tidak bisa dibatalkan!', async () => {
    await DB.clearAll();
    S.settings = { name:'Azhar', darkMode:false, sleepTarget:8, waterTarget:8 };
    await KV.set('lifehub_settings', S.settings);
    showToast('Data direset'); navigateTo('dashboard');
  }));
  el('settingName').addEventListener('change', e => { S.settings.name = e.target.value.trim()||'Azhar'; saveSettings(); el('greetName').textContent = S.settings.name; });

  // NOTIFICATIONS
  const _notifToggle = el('notifToggle');
  if(_notifToggle) _notifToggle.addEventListener('change', async e => {
    if(e.target.checked) {
      const granted = await requestNotificationPermission();
      if(!granted) { e.target.checked = false; return; }
    }
    await KV.set('notif_enabled', e.target.checked);
    const _nts = el('notifTimeSettings');
    if(_nts) _nts.style.display = e.target.checked ? 'block' : 'none';
    if(e.target.checked) { await scheduleNotifications(); showToast('🔔 Notifikasi diaktifkan'); }
    else { _notifTimers.forEach(t => clearTimeout(t)); _notifTimers = []; showToast('🔕 Notifikasi dimatikan'); }
  });
  const _notifMorning = el('notifMorning');
  if(_notifMorning) _notifMorning.addEventListener('change', async e => {
    await KV.set('notif_morning', e.target.value);
    await scheduleNotifications();
    showToast('⏰ Jadwal pagi diperbarui ke ' + e.target.value);
  });
  const _notifEvening = el('notifEvening');
  if(_notifEvening) _notifEvening.addEventListener('change', async e => {
    await KV.set('notif_evening', e.target.value);
    await scheduleNotifications();
    showToast('🌙 Jadwal malam diperbarui ke ' + e.target.value);
  });
  const _btnTestNotif = el('btnTestNotif');
  if(_btnTestNotif) _btnTestNotif.addEventListener('click', async () => {
    const granted = await requestNotificationPermission();
    if(!granted) return;
    await showPushNotif('🔔 Test LifeHub', `Hei ${S.settings.name}! Notifikasi berfungsi dengan baik ✅`);
    showToast('Notifikasi test dikirim!');
  });

  // ACTIVITY LOG
  const _btnPDF = el('btnDownloadPDF');
  if(_btnPDF) _btnPDF.addEventListener('click', generatePDF);

  // PRAYER LOCATION & REMINDER
  const _btnGetLoc = el('btnGetLocation');
  if(_btnGetLoc) _btnGetLoc.addEventListener('click', getLocation);
  const _btnRefreshLoc = el('btnRefreshLocation');
  if(_btnRefreshLoc) _btnRefreshLoc.addEventListener('click', getLocation);
  const _prayerReminderToggle = el('prayerReminderToggle');
  if(_prayerReminderToggle) {
    _prayerReminderToggle.addEventListener('change', async e => {
      if(e.target.checked) {
        const granted = await requestNotificationPermission();
        if(!granted) { e.target.checked = false; showToast('Aktifkan izin notifikasi dulu'); return; }
      }
      await KV.set('prayer_reminder_enabled', e.target.checked);
      showToast(e.target.checked ? '🕌 Reminder sholat aktif' : 'Reminder sholat dimatikan');
    });
  }
  const _prayerReminderMin = el('prayerReminderMinutes');
  if(_prayerReminderMin) {
    _prayerReminderMin.addEventListener('change', async e => {
      await KV.set('prayer_reminder_minutes', parseInt(e.target.value));
      showToast('Pengaturan reminder disimpan');
    });
  }
}

// ===== PWA SERVICE WORKER =====
function registerSW() {
  if('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
}

// ===== INIT =====
async function init() {
  try { await DB.init(); } catch(e) { console.error('DB init failed', e); }
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
  updateClock();
  // Init prayer times after DB ready
  initPrayerTimes();
  setTimeout(() => {
    el('splash').classList.add('fade-out');
    el('app').classList.remove('hidden');
    setTimeout(() => { el('splash').style.display='none'; }, 500);
    navigateTo('dashboard');
  }, 1500);
  registerSW();
  setTimeout(() => scheduleNotifications(), 3000);
}
// ===== ACTIVITY LOG v2.0 =====
function getDateRange(rangeVal) {
  const end = today();
  if(rangeVal === 'all') return { start: '2000-01-01', end };
  const d = new Date(); d.setDate(d.getDate() - (parseInt(rangeVal)-1));
  return { start: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`, end };
}
function inRange(date, range) { return date >= range.start && date <= range.end; }
function daysBetween(a, b) {
  return Math.ceil((new Date(b+'T12:00:00') - new Date(a+'T12:00:00')) / 86400000) + 1;
}

async function renderActivity() {
  const range = getDateRange(S.activityRange);
  const totalDays = S.activityRange === 'all' ? null : parseInt(S.activityRange);

  // Load all data
  const [todos, habits, hLogs, journals, sleepLogs, waterLogs, sholatLogs, goals, milestones] = await Promise.all([
    DB.getAll('todos'), DB.getAll('habits'), DB.getAll('habitLogs'),
    DB.getAll('journals'), DB.getAll('sleepLogs'), DB.getAll('waterLogs'),
    DB.getAll('sholatLogs'), DB.getAll('goals'), DB.getAll('milestones')
  ]);

  // Filter by range
  const rTodos     = todos.filter(t => t.done && t.doneAt && inRange(t.doneAt, range));
  const rHLogs     = hLogs.filter(l => inRange(l.date, range));
  const rJournals  = journals.filter(j => inRange(j.date, range));
  const rSleep     = sleepLogs.filter(s => inRange(s.date, range));
  const rWater     = waterLogs.filter(w => inRange(w.date, range));
  const rSholat    = sholatLogs.filter(s => inRange(s.date, range));

  // Count active days (days with any activity)
  const activeDates = new Set([
    ...rTodos.map(t=>t.doneAt), ...rHLogs.map(l=>l.date),
    ...rJournals.map(j=>j.date), ...rSleep.map(s=>s.date),
    ...rSholat.map(s=>s.date)
  ]);
  const activeDays = activeDates.size;
  const periodDays = totalDays || daysBetween(range.start, range.end);

  // Sholat stats
  const totalSholatPossible = periodDays * 5;
  const totalSholatDone = rSholat.reduce((acc,s) => acc + Object.values(s.prayers||{}).filter(Boolean).length, 0);
  const sholatPct = totalSholatPossible ? Math.round(totalSholatDone/totalSholatPossible*100) : 0;

  // Habit stats per habit
  const habitStats = habits.map(h => {
    const doneLogs = rHLogs.filter(l => l.habitId === h.id);
    const possible = periodDays;
    const pct = possible ? Math.round(doneLogs.length/possible*100) : 0;
    return { ...h, done: doneLogs.length, possible, pct };
  }).sort((a,b) => b.done - a.done);

  // Sleep stats
  const avgSleep = rSleep.length ? (rSleep.reduce((a,b)=>a+b.duration,0)/rSleep.length).toFixed(1) : 0;
  const goodSleep = rSleep.filter(s=>s.duration>=(S.settings.sleepTarget||8)).length;

  // Water stats
  const waterDays = {};
  rWater.forEach(w => { waterDays[w.date] = (waterDays[w.date]||0)+1; });
  const avgWater = Object.values(waterDays).length ? (Object.values(waterDays).reduce((a,b)=>a+b,0)/Object.values(waterDays).length).toFixed(1) : 0;
  const waterTarget = S.settings.waterTarget||8;
  const waterGoalDays = Object.values(waterDays).filter(c=>c>=waterTarget).length;

  // Mood stats
  const moodCounts = {happy:0,neutral:0,sad:0,excited:0,tired:0};
  rJournals.forEach(j => { if(j.mood && moodCounts[j.mood]!==undefined) moodCounts[j.mood]++; });
  const moodEmoji = {happy:'😊',neutral:'😐',sad:'😔',excited:'🤩',tired:'😴'};
  const moodLabel = {happy:'Senang',neutral:'Biasa',sad:'Sedih',excited:'Semangat',tired:'Capek'};
  const topMood = Object.entries(moodCounts).sort((a,b)=>b[1]-a[1])[0];

  // Goals progress
  const goalStats = goals.map(g => {
    const gm = milestones.filter(m=>m.goalId===g.id);
    const pct = gm.length ? Math.round(gm.filter(m=>m.done).length/gm.length*100) : (g.progress||0);
    return {...g, pct, milestoneCount: gm.length, milestoneDone: gm.filter(m=>m.done).length};
  });

  // Render
  const container = el('activityContent'); if(!container) return;
  const rangeLabel = S.activityRange==='all' ? 'Semua Waktu' : `${S.activityRange} Hari Terakhir`;
  const dateLabel  = S.activityRange==='all' ? 'sejak awal' : `${fmt(range.start+'T12:00:00')} — ${fmt(range.end+'T12:00:00')}`;

  container.innerHTML = `
    <div class="activity-date-range">
      📅 <strong>${rangeLabel}</strong> · ${dateLabel} · ${activeDays} hari aktif dari ${periodDays} hari
    </div>

    <!-- Ringkasan Umum -->
    <div class="activity-summary-box">
      <div class="activity-summary-title">✨ Ringkasan Aktivitas</div>
      <div class="activity-summary-text">
        Selama ${periodDays} hari ke belakang, kamu aktif di <strong>${activeDays} hari</strong>.
        Berhasil menyelesaikan <strong>${rTodos.length} todo</strong>,
        melakukan sholat <strong>${totalSholatDone} kali</strong> dari ${totalSholatPossible} waktu (${sholatPct}%),
        dan menulis <strong>${rJournals.length} jurnal</strong>.
        ${topMood&&topMood[1]>0 ? `Mood terbanyak kamu adalah <strong>${moodLabel[topMood[0]]} ${moodEmoji[topMood[0]]}</strong>.` : ''}
      </div>
    </div>

    <!-- Todo -->
    <div class="activity-section">
      <div class="activity-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        Todo
      </div>
      <div class="activity-stat-grid">
        <div class="activity-stat-box"><div class="activity-stat-val">${rTodos.length}</div><div class="activity-stat-lbl">Tugas Selesai</div></div>
        <div class="activity-stat-box"><div class="activity-stat-val">${todos.filter(t=>!t.done&&!t.archived).length}</div><div class="activity-stat-lbl">Masih Pending</div></div>
        <div class="activity-stat-box"><div class="activity-stat-val">${todos.filter(t=>t.priority==='high'&&t.done&&t.doneAt&&inRange(t.doneAt,range)).length}</div><div class="activity-stat-lbl">High Priority Done</div></div>
        <div class="activity-stat-box"><div class="activity-stat-val">${todos.filter(t=>t.archived).length}</div><div class="activity-stat-lbl">Diarsipkan</div></div>
      </div>
      ${rTodos.slice(0,5).map(t=>`<div class="activity-list-item"><div class="activity-list-dot" style="background:${{high:'#FF6B6B',medium:'#F9CA24',low:'#43E97B'}[t.priority]||'#999'}"></div><span>${escHtml(t.title)} <span style="color:var(--text3);font-size:.72rem">(${fmtShort(t.doneAt+'T12:00:00')})</span></span></div>`).join('')}
      ${rTodos.length>5?`<p style="font-size:.75rem;color:var(--text3);margin-top:6px">...dan ${rTodos.length-5} lainnya</p>`:''}
    </div>

    <!-- Sholat -->
    <div class="activity-section">
      <div class="activity-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
        Sholat
      </div>
      <div class="activity-stat-grid">
        <div class="activity-stat-box"><div class="activity-stat-val">${totalSholatDone}</div><div class="activity-stat-lbl">Total Waktu Sholat</div></div>
        <div class="activity-stat-box"><div class="activity-stat-val">${sholatPct}%</div><div class="activity-stat-lbl">Kepatuhan</div></div>
      </div>
      ${['subuh','dzuhur','ashar','maghrib','isya'].map(p => {
        const doneCnt = rSholat.filter(s=>s.prayers&&s.prayers[p]).length;
        const pct2 = periodDays ? Math.round(doneCnt/periodDays*100) : 0;
        const pName = {subuh:'Subuh',dzuhur:'Dzuhur',ashar:'Ashar',maghrib:'Maghrib',isya:'Isya'}[p];
        return `<div class="activity-progress-row">
          <span class="activity-progress-label">${pName}</span>
          <div class="activity-progress-bar"><div class="activity-progress-fill" style="width:${pct2}%;background:#6C63FF"></div></div>
          <span class="activity-progress-pct">${doneCnt}/${periodDays}</span>
        </div>`;
      }).join('')}
    </div>

    <!-- Habit -->
    <div class="activity-section">
      <div class="activity-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        Habit Tracker
      </div>
      ${habitStats.length === 0 ? '<p class="activity-empty">Belum ada habit</p>' :
        habitStats.map(h => `<div class="activity-progress-row">
          <span class="activity-progress-label" style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.icon||'🔥'} ${escHtml(h.name)}</span>
          <div class="activity-progress-bar"><div class="activity-progress-fill" style="width:${h.pct}%;background:${h.color||'#6C63FF'}"></div></div>
          <span class="activity-progress-pct">${h.done}/${periodDays} (${h.pct}%)</span>
        </div>`).join('')
      }
    </div>

    <!-- Tidur -->
    <div class="activity-section">
      <div class="activity-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
        Tidur
      </div>
      <div class="activity-stat-grid">
        <div class="activity-stat-box"><div class="activity-stat-val">${avgSleep}</div><div class="activity-stat-lbl">Rata-rata (jam)</div></div>
        <div class="activity-stat-box"><div class="activity-stat-val">${rSleep.length}</div><div class="activity-stat-lbl">Hari Dicatat</div></div>
        <div class="activity-stat-box"><div class="activity-stat-val">${goodSleep}</div><div class="activity-stat-lbl">Tidur Cukup (≥${S.settings.sleepTarget||8}j)</div></div>
        <div class="activity-stat-box"><div class="activity-stat-val">${rSleep.length?Math.round(goodSleep/rSleep.length*100):0}%</div><div class="activity-stat-lbl">Konsistensi</div></div>
      </div>
    </div>

    <!-- Air Minum -->
    <div class="activity-section">
      <div class="activity-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>
        Air Minum
      </div>
      <div class="activity-stat-grid">
        <div class="activity-stat-box"><div class="activity-stat-val">${avgWater}</div><div class="activity-stat-lbl">Rata-rata Gelas/Hari</div></div>
        <div class="activity-stat-box"><div class="activity-stat-val">${rWater.length}</div><div class="activity-stat-lbl">Total Gelas Diminum</div></div>
        <div class="activity-stat-box"><div class="activity-stat-val">${waterGoalDays}</div><div class="activity-stat-lbl">Hari Capai Target</div></div>
        <div class="activity-stat-box"><div class="activity-stat-val">${Object.values(waterDays).length?Math.round(waterGoalDays/Object.values(waterDays).length*100):0}%</div><div class="activity-stat-lbl">Konsistensi</div></div>
      </div>
    </div>

    <!-- Jurnal & Mood -->
    <div class="activity-section">
      <div class="activity-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
        Jurnal & Mood
      </div>
      <div class="activity-stat-grid">
        <div class="activity-stat-box"><div class="activity-stat-val">${rJournals.length}</div><div class="activity-stat-lbl">Jurnal Ditulis</div></div>
        <div class="activity-stat-box"><div class="activity-stat-val">${periodDays?Math.round(rJournals.length/periodDays*100):0}%</div><div class="activity-stat-lbl">Konsistensi Nulis</div></div>
      </div>
      <div class="activity-mood-row">
        ${Object.entries(moodCounts).filter(([,c])=>c>0).sort((a,b)=>b[1]-a[1]).map(([m,c])=>`
          <div class="activity-mood-chip">${moodEmoji[m]} ${moodLabel[m]} <strong style="margin-left:3px">${c}x</strong></div>
        `).join('')}
      </div>
    </div>

    <!-- Goals -->
    <div class="activity-section">
      <div class="activity-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
        Goals
      </div>
      ${goalStats.length === 0 ? '<p class="activity-empty">Belum ada goals</p>' :
        goalStats.map(g => `<div class="activity-progress-row">
          <span class="activity-progress-label" style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.icon||'🎯'} ${escHtml(g.title)}</span>
          <div class="activity-progress-bar"><div class="activity-progress-fill" style="width:${g.pct}%;background:#6C63FF"></div></div>
          <span class="activity-progress-pct">${g.pct}%</span>
        </div>`).join('')
      }
    </div>
  `;

  // Setup range filter buttons
  qsa('.activity-filter-row .filter-btn').forEach(b => {
    b.classList.toggle('active', String(b.dataset.range) === String(S.activityRange));
    b.onclick = () => { S.activityRange = b.dataset.range === 'all' ? 'all' : parseInt(b.dataset.range); renderActivity(); };
  });
}

// ===== PDF GENERATOR =====
async function generatePDF() {
  const range    = getDateRange(S.activityRange);
  const rangeLabel = S.activityRange==='all' ? 'Semua Waktu' : `${S.activityRange} Hari Terakhir`;
  const name     = S.settings.name || 'Azhar';
  const periodDays = S.activityRange==='all' ? daysBetween(range.start, range.end) : parseInt(S.activityRange);

  const [todos, habits, hLogs, journals, sleepLogs, waterLogs, sholatLogs, goals, milestones] = await Promise.all([
    DB.getAll('todos'), DB.getAll('habits'), DB.getAll('habitLogs'),
    DB.getAll('journals'), DB.getAll('sleepLogs'), DB.getAll('waterLogs'),
    DB.getAll('sholatLogs'), DB.getAll('goals'), DB.getAll('milestones')
  ]);

  const rTodos   = todos.filter(t => t.done && t.doneAt && inRange(t.doneAt, range));
  const rHLogs   = hLogs.filter(l => inRange(l.date, range));
  const rJournals= journals.filter(j => inRange(j.date, range));
  const rSleep   = sleepLogs.filter(s => inRange(s.date, range));
  const rWater   = waterLogs.filter(w => inRange(w.date, range));
  const rSholat  = sholatLogs.filter(s => inRange(s.date, range));

  const totalSholatDone = rSholat.reduce((acc,s)=>acc+Object.values(s.prayers||{}).filter(Boolean).length,0);
  const totalSholatPossible = periodDays*5;
  const sholatPct = totalSholatPossible ? Math.round(totalSholatDone/totalSholatPossible*100) : 0;
  const avgSleep = rSleep.length ? (rSleep.reduce((a,b)=>a+b.duration,0)/rSleep.length).toFixed(1) : 0;
  const waterDays = {};
  rWater.forEach(w=>{ waterDays[w.date]=(waterDays[w.date]||0)+1; });
  const avgWater = Object.values(waterDays).length ? (Object.values(waterDays).reduce((a,b)=>a+b,0)/Object.values(waterDays).length).toFixed(1) : 0;
  const moodCounts = {happy:0,neutral:0,sad:0,excited:0,tired:0};
  rJournals.forEach(j=>{if(j.mood&&moodCounts[j.mood]!==undefined)moodCounts[j.mood]++;});
  const moodEmoji = {happy:'😊',neutral:'😐',sad:'😔',excited:'🤩',tired:'😴'};
  const moodLabel = {happy:'Senang',neutral:'Biasa',sad:'Sedih',excited:'Semangat',tired:'Capek'};
  const topMood  = Object.entries(moodCounts).sort((a,b)=>b[1]-a[1])[0];
  const habitStats = habits.map(h=>{
    const d=rHLogs.filter(l=>l.habitId===h.id).length;
    const pct=periodDays?Math.round(d/periodDays*100):0;
    return{...h,done:d,pct};
  }).sort((a,b)=>b.pct-a.pct);
  const goalStats = goals.map(g=>{
    const gm=milestones.filter(m=>m.goalId===g.id);
    const pct=gm.length?Math.round(gm.filter(m=>m.done).length/gm.length*100):(g.progress||0);
    return{...g,pct};
  });

  const progressBar = (pct,color='#6C63FF') =>
    `<div style="background:#eee;border-radius:4px;height:8px;overflow:hidden;margin:4px 0">
      <div style="width:${pct}%;height:100%;background:${color};border-radius:4px"></div>
    </div>`;

  const prayerNames = {subuh:'Subuh',dzuhur:'Dzuhur',ashar:'Ashar',maghrib:'Maghrib',isya:'Isya'};
  const sholatRows = Object.entries(prayerNames).map(([k,n])=>{
    const cnt = rSholat.filter(s=>s.prayers&&s.prayers[k]).length;
    const pct2= periodDays?Math.round(cnt/periodDays*100):0;
    return `<tr><td>${n}</td><td>${cnt}/${periodDays} hari</td><td>${pct2}%</td><td>${progressBar(pct2,'#6C63FF')}</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8"/>
<title>LifeHub — Log Aktivitas ${rangeLabel}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;color:#1a1a2e;background:#fff;font-size:13px;padding:0}
  .page{padding:36px 40px;max-width:800px;margin:0 auto}
  h1{font-size:24px;color:#6C63FF;margin-bottom:4px}
  .subtitle{color:#888;font-size:12px;margin-bottom:28px}
  .section{margin-bottom:24px;page-break-inside:avoid}
  .section-title{font-size:15px;font-weight:bold;color:#6C63FF;border-bottom:2px solid #6C63FF;padding-bottom:5px;margin-bottom:12px}
  .summary-box{background:#f0eeff;border-radius:8px;padding:14px 16px;margin-bottom:22px;line-height:1.7;font-size:13px}
  .stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}
  .stat-box{background:#f5f6ff;border-radius:8px;padding:10px 12px;text-align:center}
  .stat-val{font-size:22px;font-weight:bold;color:#6C63FF}
  .stat-lbl{font-size:10px;color:#888;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  td,th{padding:7px 10px;text-align:left;border-bottom:1px solid #eee}
  th{background:#f5f6ff;font-weight:bold;color:#333}
  .bar{background:#eee;border-radius:4px;height:8px;overflow:hidden}
  .bar-fill{height:100%;border-radius:4px;background:#6C63FF}
  .mood-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
  .mood-chip{background:#f5f6ff;border-radius:20px;padding:4px 12px;font-size:12px}
  .footer{text-align:center;color:#aaa;font-size:11px;margin-top:32px;padding-top:12px;border-top:1px solid #eee}
  @media print{body{padding:0}.page{padding:24px}}
</style>
</head>
<body>
<div class="page">
  <h1>📊 LifeHub — Log Aktivitas</h1>
  <div class="subtitle">
    Nama: <strong>${escHtml(name)}</strong> &nbsp;|&nbsp;
    Periode: <strong>${rangeLabel}</strong> (${fmt(range.start+'T12:00:00')} — ${fmt(range.end+'T12:00:00')}) &nbsp;|&nbsp;
    Dicetak: ${fmt(today()+'T12:00:00')}
  </div>

  <div class="summary-box">
    Selama <strong>${periodDays} hari</strong>, kamu berhasil menyelesaikan <strong>${rTodos.length} tugas</strong>,
    melaksanakan sholat <strong>${totalSholatDone} waktu</strong> dari ${totalSholatPossible} waktu yang ada (<strong>${sholatPct}%</strong>),
    dan menulis jurnal sebanyak <strong>${rJournals.length} kali</strong>.
    Rata-rata tidur <strong>${avgSleep} jam/malam</strong> dan minum <strong>${avgWater} gelas/hari</strong>.
    ${topMood&&topMood[1]>0?`Mood terbanyak: <strong>${moodLabel[topMood[0]]} ${moodEmoji[topMood[0]]}</strong>.`:''}
  </div>

  <div class="section">
    <div class="section-title">✅ Todo</div>
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-val">${rTodos.length}</div><div class="stat-lbl">Tugas Selesai</div></div>
      <div class="stat-box"><div class="stat-val">${rTodos.filter(t=>t.priority==='high').length}</div><div class="stat-lbl">High Priority</div></div>
      <div class="stat-box"><div class="stat-val">${rTodos.filter(t=>t.priority==='medium').length}</div><div class="stat-lbl">Medium Priority</div></div>
      <div class="stat-box"><div class="stat-val">${rTodos.filter(t=>t.priority==='low').length}</div><div class="stat-lbl">Low Priority</div></div>
    </div>
    ${rTodos.length>0?`<table><tr><th>Tugas</th><th>Prioritas</th><th>Selesai</th><th>Kategori</th></tr>
      ${rTodos.map(t=>`<tr><td>${escHtml(t.title)}</td><td>${{high:'🔴 High',medium:'🟡 Medium',low:'🟢 Low'}[t.priority]||'-'}</td><td>${fmtShort((t.doneAt||today())+'T12:00:00')}</td><td>${escHtml(t.category||'-')}</td></tr>`).join('')}
    </table>`:'<p style="color:#aaa;font-size:12px">Belum ada todo selesai di periode ini.</p>'}
  </div>

  <div class="section">
    <div class="section-title">🕌 Sholat</div>
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-val">${totalSholatDone}</div><div class="stat-lbl">Total Waktu Sholat</div></div>
      <div class="stat-box"><div class="stat-val">${sholatPct}%</div><div class="stat-lbl">Kepatuhan</div></div>
      <div class="stat-box"><div class="stat-val">${totalSholatPossible}</div><div class="stat-lbl">Total Waktu (Target)</div></div>
      <div class="stat-box"><div class="stat-val">${rSholat.filter(s=>Object.values(s.prayers||{}).filter(Boolean).length===5).length}</div><div class="stat-lbl">Hari Sempurna</div></div>
    </div>
    <table><tr><th>Waktu Sholat</th><th>Dilakukan</th><th>Persentase</th><th>Progress</th></tr>${sholatRows}</table>
  </div>

  <div class="section">
    <div class="section-title">🔥 Habit Tracker</div>
    ${habitStats.length===0?'<p style="color:#aaa;font-size:12px">Belum ada habit.</p>':
    `<table><tr><th>Habit</th><th>Dilakukan</th><th>Dari (Hari)</th><th>Persentase</th><th>Progress</th></tr>
      ${habitStats.map(h=>`<tr><td>${h.icon||'🔥'} ${escHtml(h.name)}</td><td>${h.done} kali</td><td>${periodDays} hari</td><td>${h.pct}%</td><td>${progressBar(h.pct,h.color||'#6C63FF')}</td></tr>`).join('')}
    </table>`}
  </div>

  <div class="section">
    <div class="section-title">💤 Tidur</div>
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-val">${avgSleep}</div><div class="stat-lbl">Rata-rata (jam)</div></div>
      <div class="stat-box"><div class="stat-val">${rSleep.length}</div><div class="stat-lbl">Hari Dicatat</div></div>
      <div class="stat-box"><div class="stat-val">${rSleep.filter(s=>s.duration>=(S.settings.sleepTarget||8)).length}</div><div class="stat-lbl">Tidur Cukup</div></div>
      <div class="stat-box"><div class="stat-val">${S.settings.sleepTarget||8}j</div><div class="stat-lbl">Target</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">💧 Air Minum</div>
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-val">${avgWater}</div><div class="stat-lbl">Rata-rata Gelas/Hari</div></div>
      <div class="stat-box"><div class="stat-val">${rWater.length}</div><div class="stat-lbl">Total Gelas</div></div>
      <div class="stat-box"><div class="stat-val">${Object.values(waterDays).filter(c=>c>=parseInt(S.settings.waterTarget||8)).length}</div><div class="stat-lbl">Hari Capai Target</div></div>
      <div class="stat-box"><div class="stat-val">${S.settings.waterTarget||8}</div><div class="stat-lbl">Target/Hari</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">📓 Jurnal & Mood</div>
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-val">${rJournals.length}</div><div class="stat-lbl">Jurnal Ditulis</div></div>
      <div class="stat-box"><div class="stat-val">${periodDays?Math.round(rJournals.length/periodDays*100):0}%</div><div class="stat-lbl">Konsistensi</div></div>
      ${topMood&&topMood[1]>0?`<div class="stat-box"><div class="stat-val">${moodEmoji[topMood[0]]}</div><div class="stat-lbl">Mood Terbanyak</div></div>`:''}
    </div>
    <div class="mood-chips">
      ${Object.entries(moodCounts).filter(([,c])=>c>0).sort((a,b)=>b[1]-a[1]).map(([m,c])=>`<div class="mood-chip">${moodEmoji[m]} ${moodLabel[m]}: <strong>${c}x</strong></div>`).join('')}
    </div>
  </div>

  ${goalStats.length>0?`<div class="section">
    <div class="section-title">📚 Goals</div>
    <table><tr><th>Goal</th><th>Progress</th><th>Milestone</th><th>Deadline</th></tr>
      ${goalStats.map(g=>`<tr><td>${g.icon||'🎯'} ${escHtml(g.title)}</td><td>${g.pct}%</td><td>${g.milestoneDone||0}/${g.milestoneCount||0}</td><td>${g.deadline?fmtShort(g.deadline+'T12:00:00'):'-'}</td></tr>`).join('')}
    </table>
  </div>`:''}

  <div class="footer">Digenerate oleh LifeHub v2.0 · ${new Date().toLocaleString('id-ID')}</div>
</div>
</body>
</html>`;

  // Open print dialog
  const win = window.open('', '_blank');
  if(!win) { showToast('Aktifkan popup di browser untuk download PDF'); return; }
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
  showToast('PDF siap! Pilih "Save as PDF" saat print 📄');
}

document.addEventListener('DOMContentLoaded', init);
