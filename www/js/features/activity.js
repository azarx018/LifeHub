/* ===== ACTIVITY LOG v2.0 ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { DB } from '../core/db.js';
import { S } from '../core/state.js';
import { today, el, qs, qsa, fmt, fmtShort, escHtml, getMondayOfWeek } from '../core/utils.js';
// countScheduledDaysInRange sekarang di js/features/habit.js (Sprint 3).
import { countScheduledDaysInRange } from './habit.js';

export function getDateRange(rangeVal, weekOffset) {
  weekOffset = weekOffset || 0;
  const end = today();
  if(rangeVal === 'all') return { start: '2000-01-01', end };
  if(rangeVal === 7 || rangeVal === '7') {
    // Senin–Minggu minggu berjalan, offset dalam minggu
    const monday = getMondayOfWeek(end);
    const mondayDate = new Date(monday + 'T12:00:00');
    mondayDate.setDate(mondayDate.getDate() + (weekOffset * 7));
    const sundayDate = new Date(mondayDate);
    sundayDate.setDate(sundayDate.getDate() + 6);
    const localStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    // Jangan lewati hari ini untuk end date
    const endDate = localStr(sundayDate) > end ? end : localStr(sundayDate);
    return { start: localStr(mondayDate), end: endDate };
  }
  const d = new Date(); d.setHours(12,0,0,0);
  d.setDate(d.getDate() - (parseInt(rangeVal)-1));
  return { start: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`, end };
}
export function inRange(date, range) { return date >= range.start && date <= range.end; }
export function daysBetween(a, b) {
  return Math.ceil((new Date(b+'T12:00:00') - new Date(a+'T12:00:00')) / 86400000) + 1;
}

export async function renderActivity() {
  const range = getDateRange(S.activityRange, S.activityWeekOffset);
  const isWeekly = S.activityRange === 7 || S.activityRange === '7';
  const totalDays = S.activityRange === 'all' ? null : parseInt(S.activityRange);

  // Update week nav UI
  const weekNav = el('activityWeekNav');
  const weekLabel = el('activityWeekLabel');
  const prevBtn = el('activityPrevWeek');
  const nextBtn = el('activityNextWeek');
  if(weekNav) weekNav.classList.toggle('visible', isWeekly);
  if(isWeekly && weekLabel) {
    const startFmt = fmtShort(range.start + 'T12:00:00');
    const endFmt   = fmtShort(range.end   + 'T12:00:00');
    weekLabel.textContent = S.activityWeekOffset === 0
      ? `Minggu Ini (${startFmt} – ${endFmt})`
      : S.activityWeekOffset === -1
        ? `Minggu Lalu (${startFmt} – ${endFmt})`
        : `${Math.abs(S.activityWeekOffset)} Minggu Lalu (${startFmt} – ${endFmt})`;
  }
  if(nextBtn) nextBtn.disabled = !isWeekly || S.activityWeekOffset >= 0;

  // Label range untuk tampilan
  const rangeLabel = S.activityRange === 'all' ? 'Semua Waktu'
    : isWeekly
      ? (S.activityWeekOffset === 0 ? 'Minggu Ini'
        : S.activityWeekOffset === -1 ? 'Minggu Lalu'
        : `${Math.abs(S.activityWeekOffset)} Minggu Lalu`)
    : `${S.activityRange} Hari Terakhir`;
  const isWeeklyPDF = isWeekly;

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
  // periodDays: weekly selalu 7, lainnya dari range atau totalDays
  const periodDays = isWeekly ? 7 : (totalDays || daysBetween(range.start, range.end));

  // Sholat stats
  const totalSholatPossible = periodDays * 5;
  const totalSholatDone = rSholat.reduce((acc,s) => acc + Object.values(s.prayers||{}).filter(Boolean).length, 0);
  const sholatPct = totalSholatPossible ? Math.round(totalSholatDone/totalSholatPossible*100) : 0;

  // Habit stats per habit
  const habitStats = habits.map(h => {
    const doneLogs = rHLogs.filter(l => l.habitId === h.id);
    // Hitung hari efektif: sejak habit dibuat, dalam range yang dipilih, DAN
    // cuma hari yang emang terjadwal buat habit ini (bukan semua hari kalender).
    const habitStart = h.createdAt && h.createdAt > range.start ? h.createdAt : range.start;
    const possible = Math.max(1, countScheduledDaysInRange(h, habitStart, range.end));
    const pct = possible ? Math.round(doneLogs.length/possible*100) : 0;
    const isNew = h.createdAt && h.createdAt > range.start;
    return { ...h, done: doneLogs.length, possible, pct, isNew };
  }).sort((a,b) => b.pct - a.pct);

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
  const weeklyNote = isWeekly && S.activityWeekOffset === 0 ? ' · reset tiap Senin' : '';
  const periodLabel = isWeekly
    ? `${fmtShort(range.start+'T12:00:00')} – ${fmtShort(range.end+'T12:00:00')}`
    : S.activityRange === 'all' ? 'sejak awal'
    : `${fmtShort(range.start+'T12:00:00')} – ${fmtShort(range.end+'T12:00:00')}`;
  const summaryIntro = isWeekly
    ? (S.activityWeekOffset === 0 ? 'Minggu ini' : S.activityWeekOffset === -1 ? 'Minggu lalu' : `${Math.abs(S.activityWeekOffset)} minggu lalu`)
    : `Selama ${periodDays} hari ke belakang`;

  container.innerHTML = `
    <div class="activity-date-range">
      📅 <strong>${rangeLabel}</strong> · ${periodLabel}${weeklyNote} · ${activeDays} hari aktif dari ${periodDays} hari
    </div>

    <!-- Ringkasan Umum -->
    <div class="activity-summary-box">
      <div class="activity-summary-title">✨ Ringkasan Aktivitas</div>
      <div class="activity-summary-text">
        ${summaryIntro}, kamu aktif di <strong>${activeDays} hari</strong>.
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
          <span class="activity-progress-label" style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.icon||'🔥'} ${escHtml(h.name)}${h.isNew?'<span style="font-size:.6rem;background:var(--primary);color:white;padding:1px 4px;border-radius:4px;margin-left:3px">baru</span>':''}</span>
          <div class="activity-progress-bar"><div class="activity-progress-fill" style="width:${h.pct}%;background:${h.color||'#6C63FF'}"></div></div>
          <span class="activity-progress-pct">${h.done}/${h.possible} (${h.pct}%)</span>
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
    b.onclick = () => {
      S.activityRange = b.dataset.range === 'all' ? 'all' : parseInt(b.dataset.range);
      S.activityWeekOffset = 0; // reset ke minggu ini saat ganti filter
      renderActivity();
    };
  });
}

