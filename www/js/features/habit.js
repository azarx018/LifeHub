/* ===== HABIT (+ Habit Scheduling) ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { DB } from '../core/db.js';
import { S } from '../core/state.js';
import { uid, today, el, qs, qsa, fmt, escHtml, showToast, getMondayOfWeek, getWeekDays, prevDay, nextDay } from '../core/utils.js';
import { openModal, closeModal, confirm2 } from '../core/modal.js';
import { checkAchievements } from './game/achievements.js';

export async function renderHabits() {
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
    const streak = calcStreak(h.id, hLogs, h);
    const monday = getMondayOfWeek(S.habitDate);
    const weekDays = getWeekDays(monday);
    // Hanya hitung hari yang emang jatah (terjadwal) & udah ada habitnya (createdAt)
    const effectiveDays = weekDays.filter(ds => (!h.createdAt || ds >= h.createdAt) && isHabitScheduledOn(h, ds));
    const weekDone = effectiveDays.filter(ds => hLogs.some(l => l.habitId === h.id && l.date === ds)).length;
    const effectiveTarget = effectiveDays.length || 1;
    const pct = Math.round(weekDone / effectiveTarget * 100);
    const newHabitNote = h.createdAt && h.createdAt > monday ? ' · habit baru' : '';
    const weekLabel = `${weekDone}/${effectiveTarget} minggu ini${newHabitNote}`;
    const scheduleLabel = habitDays(h).length === 7 ? 'Setiap hari' : habitDays(h).slice().sort().map(d => DAY_NAMES_SHORT[d]).join(' · ');
    const item = document.createElement('div');
    item.className = 'habit-item animate-in';
    item.innerHTML = `
      <div class="habit-item-header">
        <div class="habit-icon-badge" style="background:${h.color||'#6C63FF'}22">${h.icon||'🔥'}</div>
        <div class="habit-info">
          <div class="habit-name">${escHtml(h.name)}</div>
          <div class="habit-streak">🔥 ${streak} beruntun · ${scheduleLabel}</div>
        </div>
        <button class="habit-check-btn ${done?'checked':''}" data-id="${h.id}">${done
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" width="16" height="16"><path d="M20 6L9 17l-5-5"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="9"/></svg>`
        }</button>
      </div>
      <div class="habit-progress-bar"><div class="habit-progress-fill" style="width:${Math.min(100,pct)}%;background:${h.color||'#6C63FF'}"></div></div>
      <div class="habit-stats-row">
        <span class="habit-stat">${weekLabel}</span>
        <span class="habit-stat">${pct}%</span>
        <div style="display:flex;gap:6px">
          <button class="icon-btn" style="width:26px;height:26px" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="icon-btn" style="width:26px;height:26px" title="Hapus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>
        </div>
      </div>
    `;
    const checkBtn = qs('.habit-check-btn', item);
    checkBtn.addEventListener('click', async () => {
      const willBeDone = !done;
      await toggleHabitLog(h.id, S.habitDate);
      if (willBeDone) {
        checkBtn.classList.add('pop-anim');
        setTimeout(() => renderHabits(), 420);
      } else {
        renderHabits();
      }
    });
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
export async function toggleHabitLog(habitId, date) {
  const hLogs = await DB.getAll('habitLogs');
  const existing = hLogs.find(l => l.habitId===habitId && l.date===date);
  if(existing) { await DB.delete('habitLogs', existing.id); }
  else { await DB.put('habitLogs', { id: uid(), habitId, date }); }
  checkAchievements();
}
// Streak sekarang sadar jadwal: hari yang bukan jatah habit (misal Selasa buat
// habit Senin/Rabu/Jumat) dilewatin aja (ngga dihitung, ngga mutusin streak).
// Streak cuma putus kalau hari YANG TERJADWAL kelewat tanpa dikerjain.
export function calcStreak(habitId, logs, habit) {
  const days = habitDays(habit);
  const doneDates = new Set(logs.filter(l => l.habitId===habitId).map(l => l.date));
  let streak = 0, cur = today();
  for (let i = 0; i < 730; i++) { // batas 2 tahun, jaga-jaga dari infinite loop
    if (!days.includes(dayOfWeek(cur))) { cur = prevDay(cur); continue; } // bukan jatah hari ini, skip
    if (doneDates.has(cur)) { streak++; cur = prevDay(cur); continue; }
    if (cur === today()) { cur = prevDay(cur); continue; } // hari ini belum berakhir, jangan putus dulu
    break; // hari terjadwal yang udah lewat & ngga dikerjain -> putus
  }
  return streak;
}
// getMondayOfWeek, getWeekDays, prevDay, nextDay dipindah ke core/utils.js
// (Sprint 2) karena dipakai lintas fitur, bukan cuma Habit.
function getLast7Days(habitId, logs) {
  // Gunakan Senin–Minggu minggu berjalan (bukan rolling 7 hari)
  const monday = getMondayOfWeek(today());
  const weekDays = getWeekDays(monday);
  return weekDays.map(ds => logs.some(l => l.habitId === habitId && l.date === ds));
}

// ===== HABIT SCHEDULING (hari spesifik per minggu) =====
const DAY_NAMES_SHORT = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
// Dipakai buat migrasi habit lama yang cuma punya `target` (angka) tapi belum
// punya `days` (array hari spesifik) — kasih pola default yang masuk akal.
const DEFAULT_DAY_PATTERNS = {
  1: [1],             // Senin
  2: [2,5],           // Selasa, Jumat
  3: [1,3,5],         // Senin, Rabu, Jumat
  4: [1,2,4,5],       // Senin, Selasa, Kamis, Jumat
  5: [1,2,3,4,5],     // Senin–Jumat
  6: [1,2,3,4,5,6],   // Senin–Sabtu
  7: [0,1,2,3,4,5,6], // Semua hari
};
function dayOfWeek(ds) { return new Date(ds + 'T12:00:00').getDay(); }
function habitDays(h) { return (h && Array.isArray(h.days) && h.days.length) ? h.days : [0,1,2,3,4,5,6]; }
export function isHabitScheduledOn(h, ds) { return habitDays(h).includes(dayOfWeek(ds)); }
// Hitung berapa hari dalam rentang [startDs, endDs] yang emang jatah/terjadwal
// buat habit ini — dipakai di Log Aktivitas biar "possible" ngga asal daysBetween.
export function countScheduledDaysInRange(h, startDs, endDs) {
  if (startDs > endDs) return 0;
  let count = 0, cur = startDs;
  for (let i = 0; i < 3660 && cur <= endDs; i++) { // batas ~10 tahun, jaga-jaga
    if (isHabitScheduledOn(h, cur)) count++;
    cur = nextDay(cur);
  }
  return count;
}
// Migrasi satu kali: habit lama (cuma ada `target`, belum ada `days`) dikasih
// pola hari default berdasarkan target-nya, lalu disimpan biar ngga diulang lagi.
export async function migrateHabitDays() {
  const habits = await DB.getAll('habits');
  let changed = false;
  for (const h of habits) {
    if (!Array.isArray(h.days)) {
      h.days = DEFAULT_DAY_PATTERNS[h.target || 7] || [0,1,2,3,4,5,6];
      h.target = h.days.length;
      await DB.put('habits', h);
      changed = true;
    }
  }
  return changed;
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
  // Juga build habitCreatedMap: habitId -> createdAt
  const habitCreatedMap = {};
  habits.forEach(h => { habitCreatedMap[h.id] = h.createdAt || '2000-01-01'; });

  const logMap = {};
  hLogs.forEach(l => {
    if(!logMap[l.date]) logMap[l.date] = new Set();
    logMap[l.date].add(l.habitId);
  });

  // Untuk tiap hari, hitung berapa habit yang emang JATAH hari itu (udah ada +
  // terjadwal di hari-of-week tsb) — bukan cuma "udah ada", biar habit 3x/minggu
  // ngga dianggap "gagal" di hari yang emang bukan jadwalnya.
  const activeHabitsOnDay = (ds) => habits.filter(h => (h.createdAt||'2000-01-01') <= ds && isHabitScheduledOn(h, ds)).length || 1;

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
      // Hanya hitung habit yang sudah ada di hari itu
      const activeOnDay = activeHabitsOnDay(ds);

      const cell = document.createElement('div');
      cell.className = 'streak-cell';

      const pct = cnt / activeOnDay;
      let level = 0;
      if(pct >= 0.01) level = 1;
      if(pct >= 0.5)  level = 2;
      if(pct >= 0.75) level = 3;
      if(pct >= 1.0)  level = 4;
      cell.classList.add('level-' + level);
      if(isToday) cell.classList.add('today');

      const tipText = `${cellDate.toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}: ${cnt}/${activeOnDay} habit`;
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

export function openHabitModal(h=null) {
  el('habitEditId').value = h ? h.id : '';
  el('habitName').value = h ? h.name : '';
  el('habitColor').value = h ? (h.color||'#6C63FF') : '#6C63FF';
  const icon = h ? (h.icon||'💧') : '💧';
  el('habitIcon').value = icon;
  qsa('.icon-opt', el('habitIconPicker')).forEach(b => b.classList.toggle('selected', b.dataset.icon===icon));
  const days = h ? habitDays(h) : [0,1,2,3,4,5,6]; // default habit baru: setiap hari
  qsa('.day-opt', el('habitDayPicker')).forEach(b => b.classList.toggle('selected', days.includes(parseInt(b.dataset.day))));
  el('habitModalTitle').textContent = h ? 'Edit Habit' : 'Tambah Habit';
  openModal('habitModal');
  setTimeout(() => el('habitName').focus(), 300);
}
export async function saveHabit() {
  const name = el('habitName').value.trim();
  if(!name) { showToast('Nama tidak boleh kosong'); return; }
  const selectedDays = qsa('.day-opt.selected', el('habitDayPicker')).map(b => parseInt(b.dataset.day));
  if(!selectedDays.length) { showToast('Pilih minimal 1 hari terjadwal'); return; }
  const id = el('habitEditId').value || uid();
  const existing = await DB.get('habits', id) || {};
  await DB.put('habits', { ...existing, id, name, icon: el('habitIcon').value, days: selectedDays, target: selectedDays.length, color: el('habitColor').value, createdAt: existing.createdAt||today() });
  closeModal('habitModal');
  renderHabits();
  showToast('Habit disimpan 🔥');
}
