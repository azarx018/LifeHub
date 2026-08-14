/* ===== STATS ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { DB } from '../core/db.js';
import { S } from '../core/state.js';
import { today, el } from '../core/utils.js';

export async function renderStats() {
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
