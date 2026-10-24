import test from 'node:test';
import assert from 'node:assert/strict';
import { PT, buildPrayerSchedule, tzLabelFromHours } from '../www/js/core/prayerCalc.js';

const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

// Data resmi Bimas Islam Kemenag (dikutip media): selisih per waktu <= 2 menit,
// dan tidak bias ke satu arah (rata-rata dalam +-1 menit).
const OFFICIAL = [
  { nama: 'Tasikmalaya 6 Apr 2026', lat: -7.3274, lng: 108.2207, date: new Date(2026, 3, 6, 12),
    ref: { subuh: '04:35', dzuhur: '11:54', ashar: '15:10', maghrib: '17:53', isya: '19:02' } },
  { nama: 'Majalengka 3 Jun 2026', lat: -6.8364, lng: 108.2274, date: new Date(2026, 5, 3, 12),
    ref: { subuh: '04:32', dzuhur: '11:48', ashar: '15:09', maghrib: '17:41', isya: '18:54' } },
];

test('jadwal cocok dengan data resmi Kemenag (selisih <= 2 menit, tanpa bias searah)', () => {
  const diffs = [];
  for (const c of OFFICIAL) {
    const got = PT.calculate(c.lat, c.lng, c.date, 7);
    for (const k of Object.keys(c.ref)) {
      const d = toMin(got[k]) - toMin(c.ref[k]);
      assert.ok(Math.abs(d) <= 2, `${c.nama} ${k}: hitung ${got[k]} vs resmi ${c.ref[k]} (selisih ${d})`);
      diffs.push(d);
    }
  }
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  assert.ok(Math.abs(mean) <= 1, `rata-rata selisih ${mean.toFixed(2)} menit`);
});

test('urutan waktu sholat masuk akal', () => {
  const t = PT.calculate(-6.2, 106.8, new Date(2026, 9, 24, 12), 7);
  const order = ['subuh', 'terbit', 'dzuhur', 'ashar', 'maghrib', 'isya'].map(k => toMin(t[k]));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('label zona waktu Indonesia', () => {
  assert.equal(tzLabelFromHours(7), 'WIB');
  assert.equal(tzLabelFromHours(8), 'WITA');
  assert.equal(tzLabelFromHours(9), 'WIT');
  assert.equal(tzLabelFromHours(-5), 'UTC-5');
});

const times = { subuh: '04:30', dzuhur: '12:00', ashar: '15:15', maghrib: '18:00', isya: '19:15' };

test('jadwal reminder: N menit sebelum, lewati yang sudah lewat, slot unik', () => {
  const d0 = new Date(2026, 9, 24); const d1 = new Date(2026, 9, 25);
  const now = new Date(2026, 9, 24, 13, 0).getTime();
  const items = buildPrayerSchedule([{ date: d0, times }, { date: d1, times }], 5, now);
  assert.equal(items.length, 3 + 5);               // hari ini tinggal Ashar, Maghrib, Isya
  const ashar = items.find(i => i.slot === 2);
  assert.equal(ashar.at.getHours() * 60 + ashar.at.getMinutes(), 15 * 60 + 10);
  assert.match(ashar.body, /Ashar dalam 5 menit \(15:15\)/);
  assert.equal(new Set(items.map(i => i.slot)).size, items.length);
  assert.ok(items.every(i => i.slot >= 0 && i.slot < 70));
});

test('reminder "tepat waktu" (0 menit) menghasilkan notifikasi pas waktu masuk', () => {
  const d0 = new Date(2026, 9, 24);
  const items = buildPrayerSchedule([{ date: d0, times }], 0, new Date(2026, 9, 24, 11, 0).getTime());
  assert.equal(items.length, 4);
  assert.equal(items[0].title, '🕌 Waktu Sholat');
  assert.match(items[0].body, /Waktunya sholat Dzuhur \(12:00\)/);
});
