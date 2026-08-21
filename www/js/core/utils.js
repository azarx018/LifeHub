/* ===== UTILS ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { DB } from './db.js';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
// Gunakan local date bukan UTC — fix timezone bug untuk WIB (UTC+7)
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
export const now = () => Date.now();

// Settings & KV store helper — semua pakai IndexedDB
export const KV = {
  async get(key, def = null) {
    const row = await DB.get('settings', key);
    return row ? row.value : def;
  },
  async set(key, value) {
    await DB.put('settings', { id: key, value });
  }
};
export const el = id => document.getElementById(id);
export const qs = (sel, ctx=document) => ctx.querySelector(sel);
export const qsa = (sel, ctx=document) => [...ctx.querySelectorAll(sel)];
export const fmt = d => { const dt = typeof d === 'string' ? new Date(d) : d; return isNaN(dt)?'':dt.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}); };
export const fmtShort = d => { const dt = typeof d === 'string' ? new Date(d) : d; return isNaN(dt)?'':dt.toLocaleDateString('id-ID',{day:'numeric',month:'short'}); };
export function showToast(msg, dur=2500) {
  const t = el('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}

// Pindah dari section "HABIT" (dulu ada di app.js v5.7 sekitar baris 1090) —
// digabung ke sini karena dipakai lintas fitur (Sholat, Activity Log, Habit),
// bukan cuma spesifik habit.
// Helper: dapat tanggal Senin minggu ini
export function getMondayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0=Min,1=Sen,...,6=Sab
  // Senin = hari 1, jika hari ini Minggu(0) mundur 6 hari, selain itu mundur (day-1)
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Dapat array 7 hari dalam minggu yang sama (Senin–Minggu)
export function getWeekDays(mondayStr) {
  const days = [];
  for(let i = 0; i < 7; i++) {
    const d = new Date(mondayStr + 'T12:00:00');
    d.setDate(d.getDate() + i);
    days.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  }
  return days;
}

export function prevDay(ds) {
  const d = new Date(ds + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function nextDay(ds) {
  const d = new Date(ds + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Pindah dari section "HTML ESCAPE" (baris 2408-2413 di app.js lama) —
// digabung ke sini karena sama-sama utility murni tanpa dependensi lain.
export function escHtml(str) {
  if(!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
