/* ===== PRAYER CALC (murni, tanpa DOM — bisa dites di Node) =====
   Metode: Kemenag RI — Subuh -20°, Isya -18°, ihtiyath +2 menit (Terbit -2), dibulatkan
   ke atas. Sebelum v6.7 memakai MWL 18°/17° yang meleset sampai ±6 menit dari jadwal
   resmi Indonesia. Dicek terhadap data resmi Bimas Islam Kemenag (Tasikmalaya 6 Apr 2026
   dan Majalengka 3 Jun 2026): selisih <= 2 menit. Ini hitungan dari koordinat GPS, bukan
   data resmi per kabupaten/kota (Kemenag memakai titik acuan kota), jadi tetap anggap
   perkiraan dan cocokkan dengan jadwal masjid/Bimas Islam setempat. */

export const PRAYER_KEYS = ['subuh','dzuhur','ashar','maghrib','isya'];
export const PRAYER_NAMES = {subuh:'Subuh',dzuhur:'Dzuhur',ashar:'Ashar',maghrib:'Maghrib',isya:'Isya'};

export const PT = {
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

  calculate(lat, lng, date, tzHours) {
    const jd = this.julianDate(date.getFullYear(), date.getMonth()+1, date.getDate());
    const tz = (typeof tzHours === 'number') ? tzHours : date.getTimezoneOffset() / -60;
    const times = {
      subuh:   this.sunAngleTime(20, 5/24, jd, lat, 'ccw'),   // Kemenag RI: -20°
      terbit:  this.sunAngleTime(0.833, 6/24, jd, lat, 'ccw'),
      dzuhur:  this.midDay(12/24, jd),
      ashar:   this.asrTime(1, 13/24, jd, lat),
      maghrib: this.sunAngleTime(0.833, 18/24, jd, lat, 'cw'),
      isya:    this.sunAngleTime(18, 18/24, jd, lat, 'cw'),   // Kemenag RI: -18°
    };
    const result = {};
    Object.entries(times).forEach(([k, v]) => {
      if (Number.isNaN(v)) { result[k] = '--:--'; return; }
      const mins = this.fixHour(v + tz - lng/15) * 60;
      // Dibulatkan KE ATAS + 2 menit ihtiyath (aturan Kemenag), jangan sampai waktu masuk
      // diumumkan terlalu awal. Terbit sebaliknya: dimundurkan.
      const total = (k === 'terbit') ? Math.floor(mins) - 2 : Math.ceil(mins) + 2;
      const w = ((total % 1440) + 1440) % 1440;
      result[k] = `${String(Math.floor(w/60)).padStart(2,'0')}:${String(w%60).padStart(2,'0')}`;
    });
    return result;
  },

  toMinutes(timeStr) {
    const [h,m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }
};

// Label zona waktu dari selisih jam: +7 WIB, +8 WITA, +9 WIT.
export function tzLabelFromHours(h) {
  if (h === 7) return 'WIB';
  if (h === 8) return 'WITA';
  if (h === 9) return 'WIT';
  return 'UTC' + (h >= 0 ? '+' : '') + h;
}
export function tzLabel(date) { return tzLabelFromHours(-date.getTimezoneOffset() / 60); }

// Susun daftar notifikasi reminder sholat untuk beberapa hari ke depan.
// days: [{ date: Date, times: {subuh:'HH:MM', ...} }]. Hasil: [{ slot, at, title, body }]
// slot = indeks hari * 10 + indeks sholat (dipakai sebagai ID notifikasi native).
export function buildPrayerSchedule(days, minutesBefore, nowMs) {
  const items = [];
  days.forEach((day, di) => {
    PRAYER_KEYS.forEach((k, ki) => {
      const t = day.times[k];
      if (!t || t.indexOf(':') < 0 || t.indexOf('-') >= 0) return;
      const [h, m] = t.split(':').map(Number);
      const at = new Date(day.date);
      at.setHours(h, m, 0, 0);
      at.setMinutes(at.getMinutes() - minutesBefore);
      if (at.getTime() <= nowMs + 5000) return;
      items.push({
        slot: di * 10 + ki,
        at,
        title: minutesBefore === 0 ? '🕌 Waktu Sholat' : '🕌 Reminder Sholat',
        body: minutesBefore === 0
          ? `Waktunya sholat ${PRAYER_NAMES[k]} (${t})`
          : `Sholat ${PRAYER_NAMES[k]} dalam ${minutesBefore} menit (${t})`
      });
    });
  });
  return items;
}
