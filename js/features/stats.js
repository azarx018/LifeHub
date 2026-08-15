/* ===== STATS ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { DB } from '../core/db.js';
import { S } from '../core/state.js';
import { today, el, qsa, fmtShort } from '../core/utils.js';
import { isHabitScheduledOn } from './habit.js';
import { buildLineChartSVG } from '../charts/line.js';

// ===== TREND CHART (v6.1.0) =====
// Beda sama bar chart 7-hari di bawah: ini agregat PER MINGGU dalam rentang
// lebih panjang (8 minggu / 3 bulan), biar kelihatan ARAH tren-nya (naik/turun
// dari minggu ke minggu), bukan cuma snapshot minggu ini.
function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function weekDaysFrom(monday) {
  const days = [];
  for (let i = 0; i < 7; i++) days.push(shiftDate(monday, i));
  return days;
}
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return shiftDate(dateStr, diff);
}

const TREND_META = {
  habit:  { label: 'Habit',     color: '#6C63FF', suffix: '%', maxValue: 100 },
  sholat: { label: 'Sholat',    color: '#43E97B', suffix: '%', maxValue: 100 },
  sleep:  { label: 'Tidur',     color: '#4ECDC4', suffix: 'j', maxValue: null },
  water:  { label: 'Air Minum', color: '#44A8E0', suffix: ' gls', maxValue: null },
};

function computeTrendPoints(metric, weeksCount, { habits, hLogs, sholatLogs, sleepLogs, waterLogs }) {
  const mondayThisWeek = mondayOf(today());
  const points = [];
  for (let i = weeksCount - 1; i >= 0; i--) {
    const monday = shiftDate(mondayThisWeek, -7 * i);
    const days = weekDaysFrom(monday).filter(ds => ds <= today()); // buang hari yg belum kejalanin
    const label = fmtShort(monday + 'T12:00:00');
    let value = null;

    if (metric === 'habit') {
      let total = 0, done = 0;
      habits.forEach(h => {
        days.forEach(ds => {
          if (h.createdAt && h.createdAt > ds) return; // habit belum dibuat saat itu
          if (!isHabitScheduledOn(h, ds)) return;
          total++;
          if (hLogs.some(l => l.habitId === h.id && l.date === ds)) done++;
        });
      });
      value = total > 0 ? Math.round((done / total) * 100) : null;
    } else if (metric === 'sholat') {
      let possible = 0, done = 0;
      days.forEach(ds => {
        possible += 5;
        const log = sholatLogs.find(s => s.date === ds);
        if (log) done += Object.values(log.prayers || {}).filter(Boolean).length;
      });
      value = possible > 0 ? Math.round((done / possible) * 100) : null;
    } else if (metric === 'sleep') {
      const logs = sleepLogs.filter(s => days.includes(s.date));
      value = logs.length ? +(logs.reduce((a, b) => a + b.duration, 0) / logs.length).toFixed(1) : null;
    } else if (metric === 'water') {
      const perDay = {};
      waterLogs.filter(w => days.includes(w.date)).forEach(w => { perDay[w.date] = (perDay[w.date] || 0) + 1; });
      const vals = Object.values(perDay);
      value = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
    }
    points.push({ label, value });
  }
  return points;
}

export function renderTrendChart(data) {
  const wrap = el('trendChartWrap'); if (!wrap) return;
  const metric = S.trendMetric;
  const meta = TREND_META[metric];
  const rawPoints = computeTrendPoints(metric, S.trendWeeks, data);
  const hasAnyData = rawPoints.some(p => p.value !== null);

  if (!hasAnyData) {
    wrap.innerHTML = `<p style="font-size:.8rem;color:var(--text3);text-align:center;padding:20px 0">Belum ada data ${meta.label.toLowerCase()} di rentang ini.</p>`;
    return;
  }
  // null (belum ada catatan minggu itu) -> 0, biar garisnya tetap kebaca kontinu
  const points = rawPoints.map(p => ({ label: p.label, value: p.value === null ? 0 : p.value }));
  const target = metric === 'sleep' ? (S.settings.sleepTarget || 8)
    : metric === 'water' ? (S.settings.waterTarget || 8) : null;

  wrap.innerHTML = buildLineChartSVG(points, {
    color: meta.color,
    valueSuffix: meta.suffix,
    maxValue: meta.maxValue,
    target,
  });
}

export async function renderStats() {
  const todos = await DB.getAll('todos');
  const habits = await DB.getAll('habits');
  const hLogs = await DB.getAll('habitLogs');
  const journals = await DB.getAll('journals');
  const sleepLogs = await DB.getAll('sleepLogs');
  const waterLogs = await DB.getAll('waterLogs');
  const sholatLogs = await DB.getAll('sholatLogs');

  // Trend chart controls — sync UI ke S.trendMetric/S.trendWeeks, lalu gambar.
  // Listener di-attach di sini (bukan di legacy.js/setupEvents) karena elemennya
  // cuma relevan pas halaman Stats aktif, dan renderStats() selalu dipanggil
  // ulang tiap kali halaman ini dibuka — jadi aman di-re-bind tiap render.
  const trendMetricEl = el('trendMetric');
  if (trendMetricEl) {
    trendMetricEl.value = S.trendMetric;
    trendMetricEl.onchange = e => { S.trendMetric = e.target.value; renderTrendChart({ habits, hLogs, sholatLogs, sleepLogs, waterLogs }); };
  }
  qsa('.trend-range-row .filter-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.weeks) === S.trendWeeks);
    btn.onclick = () => {
      qsa('.trend-range-row .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.trendWeeks = parseInt(btn.dataset.weeks);
      renderTrendChart({ habits, hLogs, sholatLogs, sleepLogs, waterLogs });
    };
  });
  renderTrendChart({ habits, hLogs, sholatLogs, sleepLogs, waterLogs });
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
