/* ===== PDF GENERATOR ===== */
// Logika pembuatan HTML report di bawah TIDAK berubah dari app.js v5.7 —
// yang berubah cuma langkah TERAKHIR (dari "buka print dialog" jadi
// dual-mode web/native — lihat komentar di bagian bawah file).
import { DB } from '../core/db.js';
import { S } from '../core/state.js';
import { today, fmt, fmtShort, escHtml, showToast } from '../core/utils.js';
import { getDateRange, inRange, daysBetween } from '../features/activity.js';
import { countScheduledDaysInRange } from '../features/habit.js';
import { isNativeApp } from '../core/platform.js';
import { saveBinaryFile } from '../core/fileExport.js';

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

  const prayerNames = {subuh:'Subuh',dzuhur:'Dzuhur',ashar:'Ashar',maghrib:'Maghrib',isya:'Isya'};

  // ===== NATIVE (APK): render PDF langsung lewat jsPDF (teks vektor asli) =====
  // Cabang ini dipisah SEBELUM bangun string `html` di bawah — karena native
  // dan web sekarang pakai renderer yang beda total (lihat komentar panjang
  // di renderReportNative), jadi gak perlu bangun HTML yang gak dipakai.
  if (await isNativeApp()) {
    const moodBreakdown = Object.entries(moodCounts).filter(([,c])=>c>0).sort((a,b)=>b[1]-a[1])
      .map(([m,c])=>`${moodEmoji[m]} ${moodLabel[m]}: ${c}x`);
    const stats = {
      name, rangeLabel,
      startFmt: fmt(range.start+'T12:00:00'), endFmt: fmt(range.end+'T12:00:00'),
      printedFmt: fmt(today()+'T12:00:00'),
      generatedAt: new Date().toLocaleString('id-ID'),
      summaryText: `Selama ${periodDays} hari, kamu berhasil menyelesaikan ${rTodos.length} tugas, `
        + `melaksanakan sholat ${totalSholatDone} waktu dari ${totalSholatPossible} waktu yang ada (${sholatPct}%), `
        + `dan menulis jurnal sebanyak ${rJournals.length} kali. Rata-rata tidur ${avgSleep} jam/malam dan minum `
        + `${avgWater} gelas/hari.` + (topMood&&topMood[1]>0 ? ` Mood terbanyak: ${moodLabel[topMood[0]]} ${moodEmoji[topMood[0]]}.` : ''),
      todo: {
        total: rTodos.length,
        high: rTodos.filter(t=>t.priority==='high').length,
        medium: rTodos.filter(t=>t.priority==='medium').length,
        low: rTodos.filter(t=>t.priority==='low').length,
        rows: rTodos.map(t=>[t.title, {high:'High',medium:'Medium',low:'Low'}[t.priority]||'-', fmtShort((t.doneAt||today())+'T12:00:00'), t.category||'-'])
      },
      sholat: {
        totalDone: totalSholatDone, totalPossible: totalSholatPossible, pct: sholatPct,
        perfectDays: rSholat.filter(s=>Object.values(s.prayers||{}).filter(Boolean).length===5).length,
        rows: Object.entries(prayerNames).map(([k,n])=>{
          const cnt = rSholat.filter(s=>s.prayers&&s.prayers[k]).length;
          const pct2 = periodDays?Math.round(cnt/periodDays*100):0;
          return [n, `${cnt}/${periodDays} hari`, `${pct2}%`];
        })
      },
      habits: habitStats.map(h=>({ name: h.name, isNew: h.isNew, done: h.done, possible: h.possible, pct: h.pct })),
      sleep: {
        avg: avgSleep, days: rSleep.length,
        enough: rSleep.filter(s=>s.duration>=(S.settings.sleepTarget||8)).length,
        target: S.settings.sleepTarget||8
      },
      water: {
        avg: avgWater, total: rWater.length,
        hitTarget: Object.values(waterDays).filter(c=>c>=parseInt(S.settings.waterTarget||8)).length,
        target: S.settings.waterTarget||8
      },
      journal: {
        count: rJournals.length,
        consistency: periodDays?Math.round(rJournals.length/periodDays*100):0,
        topMoodEmoji: topMood&&topMood[1]>0 ? moodEmoji[topMood[0]] : null,
        moodBreakdown
      },
      goals: goalStats.map(g=>({ title: g.title, pct: g.pct, milestoneDone: g.milestoneDone, milestoneCount: g.milestoneCount, deadline: g.deadline?fmtShort(g.deadline+'T12:00:00'):null }))
    };
    await renderReportNative(stats, `LifeHub_${rangeLabel.replace(/\s+/g,'_')}_${today()}.pdf`);
    return;
  }

  const progressBar = (pct,color='#6C63FF') =>
    `<div style="background:#eee;border-radius:4px;height:8px;overflow:hidden;margin:4px 0">
      <div style="width:${pct}%;height:100%;background:${color};border-radius:4px"></div>
    </div>`;

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

  // ===== WEB/PWA: trik lama tetap dipakai =====
  // window.open + window.print, user pilih "Save as PDF" di dialog print
  // browser — ini sudah jalan normal di browser, TIDAK diubah.
  const win = window.open('', '_blank');
  if(!win) { showToast('Aktifkan popup di browser untuk download PDF'); return; }
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
  showToast('PDF siap! Pilih "Save as PDF" saat print 📄');
}

// ===== Native (APK): generate PDF langsung lewat jsPDF, TANPA html2canvas =====
//
// RIWAYAT: versi sebelumnya render HTML report ke iframe tersembunyi lalu
// screenshot pakai html2canvas (`doc.html()`). Setelah diperbaiki soal
// windowHeight (lihat log.md v6.3.2), hasilnya MASIH kosong/blank di WebView
// Android — cuma keluar warna solid tanpa teks/tabel. html2canvas memang
// dikenal rapuh di WebView (font loading, canvas security, layout timing
// yang beda dari Chrome desktop) dan gak bisa didiagnosis lebih jauh tanpa
// akses langsung ke device untuk debug.
//
// FIX ARSITEKTURAL: skip html2canvas SEPENUHNYA. PDF sekarang digambar
// LANGSUNG pakai jsPDF API (doc.text, doc.rect, dst) + plugin jsPDF-AutoTable
// buat semua tabel — bukan screenshot dari HTML. Konsekuensinya:
//   - Jauh lebih reliable di WebView (murni vector drawing, gak bergantung
//     canvas rendering/font loading yang tricky).
//   - Hasil PDF lebih ringan & teksnya bisa di-select/di-copy (bukan gambar).
//   - Konsekuensi lain: layout PDF native jadi TIDAK 100% identik pixel-by-
//     pixel dengan versi web (yang masih html2print based) — tapi kontennya
//     (semua angka/tabel/section) sama persis, cuma cara gambarnya beda.

let _pdfLibsPromise = null;

// jsPDF + jsPDF-AutoTable di-load lazy dari CDN (cuma sekali, cuma kalau APK
// beneran generate PDF) — bukan di index.html, biar gak nambah beban load
// tiap buka app. Konsekuensinya: generate PDF pertama kali butuh koneksi
// internet buat ambil kedua library ini (browser/WebView otomatis cache
// setelahnya, jadi generate berikutnya tetap bisa offline).
//
// Dicoba dari cdnjs dulu, kalau itu gagal (misal jaringan user gak bisa
// nyampe ke cdnjs.cloudflare.com), fallback otomatis ke jsDelivr — beda
// provider/CDN, jadi kalau salah satu diblokir/lemot di jaringan tertentu,
// yang satunya kemungkinan masih bisa diakses.
//
// PENTING: kalau gagal (misal HP lagi offline sama sekali), _pdfLibsPromise
// di-reset balik ke null sebelum throw — supaya percobaan generate PDF
// BERIKUTNYA (misal setelah user pindah ke wifi) beneran nyoba fetch ulang,
// bukan langsung gagal lagi karena promise yang gagal sebelumnya ke-cache
// terus sampai app di-restart.
function loadPdfLibs() {
  if (_pdfLibsPromise) return _pdfLibsPromise;
  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(`Gagal load ${src}`));
    document.head.appendChild(s);
  });
  const loadWithFallback = async (cdnjsUrl, jsdelivrUrl, alreadyLoadedCheck) => {
    if (alreadyLoadedCheck()) return;
    try {
      await loadScript(cdnjsUrl);
    } catch (e1) {
      console.warn(`CDN utama gagal (${cdnjsUrl}), coba fallback...`, e1);
      try {
        await loadScript(jsdelivrUrl);
      } catch (e2) {
        throw new Error(`Gagal load library PDF dari cdnjs maupun jsDelivr. Cek koneksi internet lalu coba lagi. (${e2.message})`);
      }
    }
  };
  _pdfLibsPromise = (async () => {
    try {
      await loadWithFallback(
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js',
        'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
        () => !!window.jspdf
      );
      await loadWithFallback(
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
        'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
        () => !!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable)
      );
    } catch (e) {
      _pdfLibsPromise = null; // reset supaya bisa di-retry, bukan gagal permanen
      throw e;
    }
  })();
  return _pdfLibsPromise;
}

async function renderReportNative(stats, filename) {
  showToast('⏳ Menyiapkan PDF...', 2000);
  try {
    await loadPdfLibs();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');

    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const MARGIN = 40;
    const USABLE_W = PAGE_W - MARGIN * 2;
    const PURPLE = [108, 99, 255];
    const PURPLE_BG = [240, 238, 255];
    const BOX_BG = [245, 246, 255];
    const GRAY = [136, 136, 136];
    const DARK = [26, 26, 46];

    let y = MARGIN;

    function ensureSpace(h) {
      if (y + h > PAGE_H - MARGIN) { doc.addPage(); y = MARGIN; }
    }

    function sectionTitle(emoji, title) {
      ensureSpace(28);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...PURPLE);
      doc.text(`${emoji} ${title}`, MARGIN, y);
      doc.setDrawColor(...PURPLE); doc.setLineWidth(1.2);
      doc.line(MARGIN, y + 4, PAGE_W - MARGIN, y + 4);
      y += 20;
    }

    function statGrid(items) {
      const boxH = 40, gap = 8;
      ensureSpace(boxH + 14);
      const boxW = (USABLE_W - gap * (items.length - 1)) / items.length;
      items.forEach((it, i) => {
        const bx = MARGIN + i * (boxW + gap);
        doc.setFillColor(...BOX_BG);
        doc.roundedRect(bx, y, boxW, boxH, 4, 4, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...PURPLE);
        doc.text(String(it.val), bx + boxW / 2, y + 18, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
        doc.text(it.label, bx + boxW / 2, y + 30, { align: 'center', maxWidth: boxW - 8 });
      });
      y += boxH + 14;
    }

    function emptyNote(text) {
      ensureSpace(18);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...GRAY);
      doc.text(text, MARGIN, y);
      y += 20;
    }

    function table(head, body) {
      doc.autoTable({
        head: [head], body, startY: y,
        margin: { left: MARGIN, right: MARGIN },
        styles: { font: 'helvetica', fontSize: 8.5, textColor: DARK, cellPadding: 5 },
        headStyles: { fillColor: BOX_BG, textColor: [51, 51, 51], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [252, 252, 255] },
        theme: 'grid'
      });
      y = doc.lastAutoTable.finalY + 16;
    }

    // ===== Header =====
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...PURPLE);
    doc.text('LifeHub — Log Aktivitas', MARGIN, y);
    y += 18;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY);
    doc.text(
      `Nama: ${stats.name}   |   Periode: ${stats.rangeLabel} (${stats.startFmt} — ${stats.endFmt})   |   Dicetak: ${stats.printedFmt}`,
      MARGIN, y, { maxWidth: USABLE_W }
    );
    y += 26;

    // ===== Summary box =====
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    const summaryLines = doc.splitTextToSize(stats.summaryText, USABLE_W - 24);
    const summaryH = summaryLines.length * 13 + 20;
    ensureSpace(summaryH);
    doc.setFillColor(...PURPLE_BG);
    doc.roundedRect(MARGIN, y, USABLE_W, summaryH, 6, 6, 'F');
    doc.setTextColor(...DARK);
    doc.text(summaryLines, MARGIN + 12, y + 18);
    y += summaryH + 20;

    // ===== Todo =====
    sectionTitle('✅', 'Todo');
    statGrid([
      { val: stats.todo.total, label: 'Tugas Selesai' },
      { val: stats.todo.high, label: 'High Priority' },
      { val: stats.todo.medium, label: 'Medium Priority' },
      { val: stats.todo.low, label: 'Low Priority' }
    ]);
    if (stats.todo.rows.length) table(['Tugas', 'Prioritas', 'Selesai', 'Kategori'], stats.todo.rows);
    else emptyNote('Belum ada todo selesai di periode ini.');

    // ===== Sholat =====
    sectionTitle('🕌', 'Sholat');
    statGrid([
      { val: stats.sholat.totalDone, label: 'Total Waktu Sholat' },
      { val: stats.sholat.pct + '%', label: 'Kepatuhan' },
      { val: stats.sholat.totalPossible, label: 'Total Waktu (Target)' },
      { val: stats.sholat.perfectDays, label: 'Hari Sempurna' }
    ]);
    table(['Waktu Sholat', 'Dilakukan', 'Persentase'], stats.sholat.rows);

    // ===== Habit =====
    sectionTitle('🔥', 'Habit Tracker');
    if (stats.habits.length) {
      table(['Habit', 'Dilakukan', 'Dari (Hari)', 'Persentase'], stats.habits.map(h => [
        h.name + (h.isNew ? ' (baru)' : ''), `${h.done} kali`, `${h.possible} hari`, `${h.pct}%`
      ]));
    } else emptyNote('Belum ada habit.');

    // ===== Tidur =====
    sectionTitle('💤', 'Tidur');
    statGrid([
      { val: stats.sleep.avg, label: 'Rata-rata (jam)' },
      { val: stats.sleep.days, label: 'Hari Dicatat' },
      { val: stats.sleep.enough, label: 'Tidur Cukup' },
      { val: stats.sleep.target + 'j', label: 'Target' }
    ]);

    // ===== Air Minum =====
    sectionTitle('💧', 'Air Minum');
    statGrid([
      { val: stats.water.avg, label: 'Rata-rata Gelas/Hari' },
      { val: stats.water.total, label: 'Total Gelas' },
      { val: stats.water.hitTarget, label: 'Hari Capai Target' },
      { val: stats.water.target, label: 'Target/Hari' }
    ]);

    // ===== Jurnal & Mood =====
    sectionTitle('📓', 'Jurnal & Mood');
    const journalItems = [
      { val: stats.journal.count, label: 'Jurnal Ditulis' },
      { val: stats.journal.consistency + '%', label: 'Konsistensi' }
    ];
    if (stats.journal.topMoodEmoji) journalItems.push({ val: stats.journal.topMoodEmoji, label: 'Mood Terbanyak' });
    statGrid(journalItems);
    if (stats.journal.moodBreakdown.length) {
      ensureSpace(16);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...DARK);
      doc.text(stats.journal.moodBreakdown.join('    '), MARGIN, y);
      y += 20;
    }

    // ===== Goals =====
    if (stats.goals.length) {
      sectionTitle('📚', 'Goals');
      table(['Goal', 'Progress', 'Milestone', 'Deadline'], stats.goals.map(g => [
        g.title, `${g.pct}%`, `${g.milestoneDone || 0}/${g.milestoneCount || 0}`, g.deadline || '-'
      ]));
    }

    // ===== Footer di semua halaman =====
    const pageCount = doc.internal.getNumberOfPages();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.text(`Digenerate oleh LifeHub · ${stats.generatedAt}`, PAGE_W / 2, PAGE_H - 20, { align: 'center' });
    }

    const base64 = doc.output('datauristring').split(',')[1];
    const ok = await saveBinaryFile(filename, base64, 'application/pdf');
    if (ok) showToast('📄 PDF siap, pilih tempat menyimpan/kirim.', 3000);
  } catch (e) {
    console.error('renderReportNative gagal', e);
    showToast('❌ Gagal generate PDF: ' + (e.message || 'unknown error'));
  }
}
