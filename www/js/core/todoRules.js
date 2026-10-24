/* ===== ATURAN TODO (murni, tanpa DOM — bisa dites di Node) =====
   Model per-hari (v6.6) + "Aktif selama" (span) + pengulangan (repeat) + terlewat. */

// Tanggal "pemilik" sebuah todo. Todo versi lama belum punya field `date`,
// jadi fallback ke tanggal dibuatnya (createdAt), lalu tanggal selesainya.
export function todoDateOf(t) {
  return t.date || t.createdAt || t.doneAt || '';
}

const MS_DAY = 86400000;
export function dayDiff(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / MS_DAY); }
export function addDays(ds, n) {
  const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- Aktif selama ----
// t.span = jumlah hari todo tampil sejak tanggal mulai (default 1 = hari itu saja).
// t.span = 0 -> tampil tiap hari sampai dicoret. Dihitung selesai di hari dicoret (doneAt).
export function todoSpanOf(t) {
  return (typeof t.span === 'number' && t.span >= 0) ? t.span : 1;
}
export function todoDayNo(t, ds) { return dayDiff(todoDateOf(t), ds) + 1; }
// Apakah todo tampil di tanggal ds?
// - span 1 (default/legacy): hanya di tanggal mulainya.
// - belum selesai: dari tanggal mulai sampai habis masa aktif (atau selamanya bila span 0).
// - sudah selesai: dari tanggal mulai sampai tanggal dicoret.
export function todoVisibleOn(t, ds) {
  const start = todoDateOf(t);
  if (!start || ds < start) return false;
  const span = todoSpanOf(t);
  if (span === 1) return ds === start;
  if (t.done) return ds <= (t.doneAt || start);
  return span === 0 || dayDiff(start, ds) < span;
}
// Apakah todo berstatus selesai di tanggal ds? (hari sebelum dicoret tampil belum selesai)
export function todoDoneOn(t, ds) {
  if (!t.done) return false;
  return todoSpanOf(t) === 1 ? true : ds >= (t.doneAt || todoDateOf(t));
}

// ---- Terlewat ----
// Terlewat = belum selesai, tidak diarsipkan, BUKAN todo berulang (itu boleh dilewati),
// dan masa aktifnya sudah habis sebelum hari ini. "Sampai selesai" tidak pernah terlewat.
export function todoEndDate(t) {
  const sp = todoSpanOf(t), start = todoDateOf(t);
  return (sp === 0 || !start) ? null : addDays(start, sp - 1);
}
export function isTodoMissed(t, todayStr) {
  if (t.done || t.archived || todoRepeatOf(t) !== 'none') return false;
  const end = todoEndDate(t);
  return end !== null && end < todayStr;
}

// ---- Pengulangan ----
// Tiap kemunculan adalah todo biasa (jadi statistik "selesai di hari dicoret" tetap benar).
// Kemunculan berikutnya dibuat otomatis (materializeRecurring) saat app/halaman dibuka.
export function todoRepeatOf(t) { return ['daily', 'weekdays', 'weekly'].includes(t.repeat) ? t.repeat : 'none'; }
export function repeatMatches(repeat, startDs, ds) {
  const dow = new Date(ds + 'T12:00:00').getDay();
  if (repeat === 'daily') return true;
  if (repeat === 'weekdays') return dow >= 1 && dow <= 5;
  if (repeat === 'weekly') return dow === new Date(startDs + 'T12:00:00').getDay();
  return false;
}
// Tanggal jatuh tempo terbaru setelah kemunculan terakhir dan <= hari ini (null = belum waktunya).
// Hari yang terlewat saat app tidak dibuka TIDAK dibuatkan satu-satu (hindari banjir todo).
export function nextDueDate(latest, todayStr) {
  const r = todoRepeatOf(latest), start = todoDateOf(latest);
  if (r === 'none' || !start) return null;
  let ds = todayStr;
  for (let i = 0; i < 366 && ds > start; i++, ds = addDays(ds, -1)) {
    if (repeatMatches(r, start, ds)) return ds;
  }
  return null;
}
export function materializeRecurring(todos, todayStr, newId) {
  const bySeries = new Map();
  for (const t of todos) {
    if (!t.seriesId) continue;
    const cur = bySeries.get(t.seriesId);
    if (!cur || todoDateOf(t) > todoDateOf(cur)) bySeries.set(t.seriesId, t);
  }
  const out = [];
  for (const latest of bySeries.values()) {
    const next = nextDueDate(latest, todayStr);
    if (!next) continue;
    out.push({
      ...latest, id: newId(), date: next, createdAt: next, span: 1, deadline: '',
      done: false, doneAt: null, archived: false,
      subtasks: (latest.subtasks || []).map(s => ({ ...s, done: false }))
    });
  }
  return out;
}

// ---- Subtugas ----
// Satu baris = satu subtugas. Status selesai dipertahankan untuk teks yang sama.
export function parseSubtasks(text, prev = []) {
  const doneByText = new Map((prev || []).map(s => [s.t, !!s.done]));
  return String(text || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 30)
    .map(t => ({ t, done: doneByText.get(t) || false }));
}
