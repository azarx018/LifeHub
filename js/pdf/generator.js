/* ===== PDF GENERATOR ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { DB } from '../core/db.js';
import { S } from '../core/state.js';
import { today, fmt, fmtShort, escHtml, showToast } from '../core/utils.js';
import { getDateRange, inRange, daysBetween } from '../features/activity.js';
import { countScheduledDaysInRange } from '../features/habit.js';

export async function generatePDF() {
  const range    = getDateRange(S.activityRange, S.activityWeekOffset);
  const isWeeklyPDF = S.activityRange === 7 || S.activityRange === '7';
  const weekOffsetLabel = S.activityWeekOffset === 0 ? 'Minggu Ini'
    : S.activityWeekOffset === -1 ? 'Minggu Lalu'
    : `${Math.abs(S.activityWeekOffset)} Minggu Lalu`;
  const rangeLabel = S.activityRange === 'all' ? 'Semua Waktu'
    : isWeeklyPDF ? `${weekOffsetLabel} (${fmtShort(range.start+'T12:00:00')} – ${fmtShort(range.end+'T12:00:00')})`
    : `${S.activityRange} Hari Terakhir`;
  const name     = S.settings.name || 'Azhar';
  const periodDays = isWeeklyPDF ? 7 : (S.activityRange === 'all' ? daysBetween(range.start, range.end) : parseInt(S.activityRange));

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
    const habitStart = h.createdAt && h.createdAt > range.start ? h.createdAt : range.start;
    const possible = Math.max(1, countScheduledDaysInRange(h, habitStart, range.end));
    const pct=Math.round(d/possible*100);
    const isNew = h.createdAt && h.createdAt > range.start;
    return{...h,done:d,possible,pct,isNew};
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
      ${habitStats.map(h=>`<tr><td>${h.icon||'🔥'} ${escHtml(h.name)}${h.isNew?' <em style="color:#6C63FF;font-size:10px">(habit baru)</em>':''}</td><td>${h.done} kali</td><td>${h.possible} hari</td><td>${h.pct}%</td><td>${progressBar(h.pct,h.color||'#6C63FF')}</td></tr>`).join('')}
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
