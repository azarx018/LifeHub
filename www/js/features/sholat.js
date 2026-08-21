/* ===== SHOLAT ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { DB } from '../core/db.js';
import { S } from '../core/state.js';
import { uid, today, el, qs, qsa, fmt, showToast, getMondayOfWeek, getWeekDays } from '../core/utils.js';
import { checkAchievements } from './game/achievements.js';

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

export async function renderSholat() {
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
      checkAchievements();
    });
    list.appendChild(item);
  });
  renderSholatWeek(sholatLogs);
}
function renderSholatWeek(sholatLogs) {
  const grid = el('sholatWeekGrid'); if(!grid) return;
  grid.innerHTML = '';
  const dayNames = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  // Pakai Senin–Minggu minggu berjalan
  const monday = getMondayOfWeek(today());
  const weekDays = getWeekDays(monday);
  weekDays.forEach(ds => {
    const d = new Date(ds + 'T12:00:00');
    const dayLog = sholatLogs.find(s => s.date === ds);
    const isToday = ds === today();
    const isFuture = ds > today();
    const col = document.createElement('div');
    col.className = 'sholat-week-col';
    col.innerHTML = `<div class="sholat-week-day" style="${isToday?'color:var(--primary);font-weight:700':''}">${dayNames[d.getDay()]}</div>`;
    PRAYERS.forEach(p => {
      const done = dayLog && dayLog.prayers[p.key];
      const dot = document.createElement('div');
      dot.className = `sholat-week-dot ${done?'done':''}${isFuture?' future-dot':''}`;
      dot.title = p.name;
      dot.textContent = done ? '✓' : '';
      col.appendChild(dot);
    });
    grid.appendChild(col);
  });
}

