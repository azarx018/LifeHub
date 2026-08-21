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

  // ===== Dual-mode output =====
  // WEB/PWA: trik lama tetap dipakai (window.open + window.print, user pilih
  // "Save as PDF" di dialog print browser) — ini sudah jalan normal di
  // browser, TIDAK diubah.
  //
  // NATIVE (APK): window.open('', '_blank') & win.print() TIDAK didukung
  // WebView Android (gak ada popup, gak ada dialog print sistem). Jadi di
  // native, HTML report yang SAMA PERSIS di-render ke PDF beneran secara
  // lokal (pakai jsPDF + html2canvas, di-load sekali dari CDN saat
  // dibutuhkan), lalu file PDF-nya disimpan & langsung dibuka native Share
  // Sheet (lewat saveBinaryFile — sama seperti fileExport.js) supaya user
  // bisa pilih sendiri mau simpan/kirim ke mana.
  if (await isNativeApp()) {
    await renderHtmlToPdfNative(html, `LifeHub_${rangeLabel.replace(/\s+/g,'_')}_${today()}.pdf`);
    return;
  }

  const win = window.open('', '_blank');
  if(!win) { showToast('Aktifkan popup di browser untuk download PDF'); return; }
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
  showToast('PDF siap! Pilih "Save as PDF" saat print 📄');
}

// ===== Helper khusus native: render string HTML -> file PDF beneran =====

let _pdfLibsPromise = null;

// jsPDF + html2canvas di-load lazy dari CDN (cuma sekali, cuma kalau APK
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
        'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
        'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
        () => !!window.html2canvas
      );
      await loadWithFallback(
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js',
        'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
        () => !!window.jspdf
      );
    } catch (e) {
      _pdfLibsPromise = null; // reset supaya bisa di-retry, bukan gagal permanen
      throw e;
    }
  })();
  return _pdfLibsPromise;
}

async function renderHtmlToPdfNative(html, filename) {
  showToast('⏳ Menyiapkan PDF...', 2000);
  try {
    await loadPdfLibs();

    // Render HTML report di iframe tersembunyi (bukan div langsung di
    // document utama) supaya CSS report (yang punya `*{margin:0;padding:0}`
    // dkk) gak bentrok/ke-leak ke tampilan app LifeHub yang sedang aktif.
    const iframe = document.createElement('iframe');
    // NOTE (fix "PDF kosong/blank"): sebelumnya height iframe di-hardcode
    // '1px' cuma buat nyembunyiin secara visual (posisinya juga udah
    // di-geser ke left:-9999px, jadi height kecil sebenernya gak perlu).
    // Masalahnya: html2canvas kalau gak dikasih `windowHeight` eksplisit,
    // defaultnya ngambil dari `iframe.contentWindow.innerHeight` — yang
    // ikut ke-pengaruh CSS height iframe itu sendiri. Jadi height:1px bikin
    // html2canvas mikir "window" report ini cuma tinggi 1px, hasil capture-nya
    // ke-crop jadi nyaris kosong (docs resmi html2canvas juga bilang wajib
    // set windowWidth/windowHeight manual kalau elemennya di luar viewport
    // biasa: https://html2canvas.hertzen.com/faq). Fix: iframe di-resize ke
    // tinggi konten asli (scrollHeight) SEBELUM di-capture, dan windowHeight
    // di-set eksplisit juga ke html2canvas sebagai jaga-jaga ganda.
    iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:1px;border:0;overflow:hidden';
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();

    await new Promise(resolve => {
      if (iframe.contentDocument.readyState === 'complete') resolve();
      else iframe.onload = resolve;
    });

    // Ukur tinggi konten SEBENARNYA (bukan tinggi iframe yang sengaja di-1px-in),
    // lalu resize iframe-nya biar sesuai — supaya layout di dalam iframe
    // (dan window.innerHeight-nya) merepresentasikan konten asli, bukan 1px.
    const contentHeight = Math.max(
      iframe.contentDocument.body.scrollHeight,
      iframe.contentDocument.documentElement.scrollHeight,
      1
    );
    iframe.style.height = contentHeight + 'px';

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    await new Promise((resolve, reject) => {
      doc.html(iframe.contentDocument.body, {
        callback: () => resolve(),
        html2canvas: {
          scale: 0.75, useCORS: true,
          windowWidth: 800, windowHeight: contentHeight, // <- fix utama
          height: contentHeight
        },
        width: 595,        // lebar halaman A4 dalam pt, dikurangi margin
        windowWidth: 800,
        margin: [20, 20, 20, 20],
        x: 0, y: 0
      });
      // jsPDF .html() tidak selalu reject saat gagal — kasih timeout jaga-jaga.
      setTimeout(() => reject(new Error('Timeout render PDF')), 20000);
    });

    document.body.removeChild(iframe);

    const base64 = doc.output('datauristring').split(',')[1];
    const ok = await saveBinaryFile(filename, base64, 'application/pdf');
    if (ok) showToast('📄 PDF siap, pilih tempat menyimpan/kirim.', 3000);
  } catch (e) {
    console.error('renderHtmlToPdfNative gagal', e);
    showToast('❌ Gagal generate PDF: ' + (e.message || 'unknown error'));
  }
}
