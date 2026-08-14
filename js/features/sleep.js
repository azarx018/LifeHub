/* ===== SLEEP (+ Sleep Session) ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { DB } from '../core/db.js';
import { S } from '../core/state.js';
import { KV, uid, today, el, qs, qsa, fmtShort, showToast } from '../core/utils.js';
import { openModal, closeModal, confirm2 } from '../core/modal.js';
// renderDashboard masih tinggal di legacy.js sampai Sprint 3 lanjutan
// memindahkan Dashboard ke js/features/dashboard.js.
import { checkAchievements } from './game/achievements.js';
// renderDashboard ada di dashboard.js (Sprint 3) — circular import ini aman
// karena dashboard.js juga import balik dari sleep.js (renderDashboardSleepBtn),
// dan semua pemanggilan terjadi di dalam function body, bukan top-level.
import { renderDashboard } from './dashboard.js';

let _sleepElapsedTimer = null;

async function startSleepSession() {
  const now2 = new Date();
  const session = {
    startTime: now2.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}),
    startDate: `${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,'0')}-${String(now2.getDate()).padStart(2,'0')}`,
    timestamp: now2.getTime()
  };
  S.sleepSession = session;
  await KV.set('sleep_active_session', session);
  showToast('😴 Selamat tidur! Waktu tidur dicatat.');
  renderSleepSessionCard();
  renderDashboardSleepBtn();
}

async function cancelSleepSession() {
  S.sleepSession = null;
  await KV.set('sleep_active_session', null);
  if (_sleepElapsedTimer) { clearInterval(_sleepElapsedTimer); _sleepElapsedTimer = null; }
  showToast('Sesi tidur dibatalkan');
  renderSleepSessionCard();
  renderDashboardSleepBtn();
}

function openWakeModal() {
  if (!S.sleepSession) return;
  const now2 = new Date();
  const elapsed = (now2.getTime() - S.sleepSession.timestamp) / 3600000;
  const h = Math.floor(elapsed);
  const m = Math.round((elapsed - h) * 60);
  const durStr = h > 0 ? `${h} jam ${m > 0 ? m + ' menit' : ''}` : `${m} menit`;
  const wdd = el('wakeDurationDisplay');
  if (wdd) wdd.innerHTML = `
    <div class="wake-dur-big">⏱ ${durStr}</div>
    <div class="wake-dur-sub">Tidur: ${S.sleepSession.startTime} · ${fmtShort(S.sleepSession.startDate + 'T00:00:00')}</div>
  `;
  openModal('wakeModal');
}

export async function endSleepSession(quality) {
  if (!S.sleepSession) return;
  closeModal('wakeModal');

  const now2 = new Date();
  const endTime = now2.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
  const endDate = `${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,'0')}-${String(now2.getDate()).padStart(2,'0')}`;
  const elapsed = (now2.getTime() - S.sleepSession.timestamp) / 3600000;
  const duration = Math.max(0.1, Math.round(elapsed * 10) / 10);

  await DB.put('sleepLogs', {
    id: uid(),
    date: endDate,
    start: S.sleepSession.startTime,
    end: endTime,
    startDate: S.sleepSession.startDate,
    duration,
    quality
  });

  S.sleepSession = null;
  await KV.set('sleep_active_session', null);
  if (_sleepElapsedTimer) { clearInterval(_sleepElapsedTimer); _sleepElapsedTimer = null; }

  showToast('☀️ Selamat pagi! Catatan tidur disimpan.');
  renderSleepSessionCard();
  renderDashboardSleepBtn();
  if (S.currentPage === 'sleep') renderSleep();
  if (S.currentPage === 'dashboard') renderDashboard();

  // Sleep warning check
  const target = S.settings.sleepTarget || 8;
  if (duration < target) {
    const lack = (target - duration).toFixed(1);
    const warnBody = el('sleepWarnBody');
    if (warnBody) {
      warnBody.innerHTML = `
        <div class="sleep-warn-stat">
          <div class="sleep-warn-stat-item">
            <div class="swsi-val" style="color:#FF6B6B">${duration.toFixed(1)}<span class="swsi-unit">jam</span></div>
            <div class="swsi-lbl">Tidur kamu</div>
          </div>
          <div class="sleep-warn-vs">vs</div>
          <div class="sleep-warn-stat-item">
            <div class="swsi-val" style="color:#43E97B">${target}<span class="swsi-unit">jam</span></div>
            <div class="swsi-lbl">Target</div>
          </div>
        </div>
        <div class="sleep-warn-lack">Kurang <strong>${lack} jam</strong> dari target tidurmu!</div>
        <div class="sleep-warn-effects">
          <div class="sleep-warn-effect-title">Dampak kurang tidur:</div>
          <div class="sleep-warn-effect">😵 Fokus & konsentrasi menurun drastis</div>
          <div class="sleep-warn-effect">🧠 Fungsi memori & kognitif terganggu</div>
          <div class="sleep-warn-effect">😤 Mudah emosi & rentan stres</div>
          <div class="sleep-warn-effect">💪 Pemulihan otot tidak optimal</div>
          <div class="sleep-warn-effect">🦠 Sistem imun melemah</div>
        </div>
        <div class="sleep-warn-tip">💡 <strong>Tips:</strong> Coba tidur lebih awal malam ini dan hindari layar 30 menit sebelum tidur.</div>
      `;
    }
    setTimeout(() => openModal('sleepWarnModal'), 600);
  }
}

function renderSleepSessionCard() {
  const card = el('sleepSessionCard');
  if (!card) return;
  if (_sleepElapsedTimer) { clearInterval(_sleepElapsedTimer); _sleepElapsedTimer = null; }

  if (S.sleepSession) {
    const updateElapsed = () => {
      const now2 = new Date();
      const elapsed = (now2.getTime() - S.sleepSession.timestamp) / 3600000;
      const h = Math.floor(elapsed); const m = Math.round((elapsed - h) * 60);
      const durEl = card.querySelector('.sleep-sess-elapsed');
      if (durEl) durEl.textContent = h > 0 ? `${h} jam ${m} menit` : `${m} menit`;
    };
    card.innerHTML = `
      <div class="sleep-sess-active">
        <div class="sleep-sess-pulse">💤</div>
        <div class="sleep-sess-info">
          <div class="sleep-sess-status">Sedang Tidur...</div>
          <div class="sleep-sess-since">Mulai: <strong>${S.sleepSession.startTime}</strong> · ${fmtShort(S.sleepSession.startDate + 'T00:00:00')}</div>
          <div class="sleep-sess-dur">⏱ <span class="sleep-sess-elapsed">menghitung...</span></div>
        </div>
      </div>
      <div class="sleep-sess-actions">
        <button class="btn btn-primary btn-wake-big" id="btnWakePage">☀️ Aku Sudah Bangun</button>
        <button class="btn btn-outline btn-sm" id="btnCancelSleepPage">Batalkan Sesi</button>
      </div>`;
    qs('#btnWakePage', card).addEventListener('click', openWakeModal);
    qs('#btnCancelSleepPage', card).addEventListener('click', () => confirm2('Batalkan sesi tidur ini?', cancelSleepSession));
    updateElapsed();
    _sleepElapsedTimer = setInterval(updateElapsed, 30000);
  } else {
    card.innerHTML = `
      <div class="sleep-sess-idle">
        <div class="sleep-sess-idle-icon">🌙</div>
        <div class="sleep-sess-idle-text">Belum mulai tidur? Tekan tombol di bawah saat mau tidur.</div>
        <button class="btn btn-primary btn-sleep-big" id="btnStartSleepPage">🌙 Mulai Tidur Sekarang</button>
      </div>`;
    qs('#btnStartSleepPage', card).addEventListener('click', startSleepSession);
  }
}

export function renderDashboardSleepBtn() {
  const btn = el('dashSleepBtn');
  if (!btn) return;
  if (S.sleepSession) {
    const now2 = new Date();
    const elapsed = (now2.getTime() - S.sleepSession.timestamp) / 3600000;
    const h = Math.floor(elapsed); const m = Math.round((elapsed - h) * 60);
    const durStr = h > 0 ? `${h}j ${m}m` : `${m}m`;
    btn.innerHTML = `☀️ Bangun <span class="dash-sleep-elapsed">${durStr}</span>`;
    btn.className = 'btn btn-sm btn-wake-dash';
    btn.onclick = openWakeModal;
  } else {
    btn.innerHTML = '🌙 Mulai Tidur';
    btn.className = 'btn btn-sm btn-sleep-dash';
    btn.onclick = startSleepSession;
  }
}

export async function renderSleep() {
  const target = S.settings.sleepTarget || 8;
  const tDisp = el('sleepTargetDisplay'); if(tDisp) tDisp.textContent = `${target} jam`;
  renderSleepSessionCard();
  const logs = await DB.getAll('sleepLogs');
  const sorted = [...logs].sort((a,b) => b.date.localeCompare(a.date));
  renderSleepChart(sorted, target);
  const list = el('sleepLogList'); if(!list) return;
  list.innerHTML = '';
  if(!sorted.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">💤</div><p>Belum ada catatan tidur</p></div>';
    return;
  }
  sorted.slice(0,10).forEach(s => {
    const quality = '⭐'.repeat(s.quality||3);
    const item = document.createElement('div');
    item.className = 'sleep-log-item animate-in';
    item.innerHTML = `
      <div class="sleep-log-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" width="28" height="28"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg></div>
      <div class="sleep-log-info">
        <div class="sleep-log-dur">${s.duration.toFixed(1)} jam <span class="sleep-quality-stars">${quality}</span></div>
        <div class="sleep-log-times">${fmtShort(s.date+'T00:00:00')} · ${s.start} → ${s.end}</div>
      </div>
      <div class="sleep-log-actions">
        <button class="icon-btn" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="icon-btn" title="Hapus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>
      </div>
    `;
    const btns = qsa('.icon-btn', item);
    btns[0].addEventListener('click', () => openSleepModal(s));
    btns[1].addEventListener('click', () => confirm2('Hapus catatan tidur?', async () => { await DB.delete('sleepLogs', s.id); renderSleep(); showToast('Dihapus'); }));
    list.appendChild(item);
  });
}
function renderSleepChart(logs, target) {
  const wrap = el('sleepChart'); if(!wrap) return;
  wrap.innerHTML = '';
  const last7 = [];
  for(let i=6; i>=0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const log = logs.find(l => l.date===ds);
    last7.push({ date: ds, dur: log ? log.duration : 0, label: ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][d.getDay()] });
  }
  const maxDur = Math.max(...last7.map(l => l.dur), target, 1);
  const chart = document.createElement('div');
  chart.className = 'sleep-bar-chart';
  last7.forEach(day => {
    const pct = Math.min(100, (day.dur / maxDur * 100));
    const targetPct = Math.min(100, (target / maxDur * 100));
    const color = day.dur >= target ? '#43E97B' : day.dur > 0 ? '#FF6B6B' : '#E0E0E0';
    const item = document.createElement('div');
    item.className = 'sleep-bar-item';
    item.innerHTML = `
      <div class="sleep-bar-val" style="font-size:0.6rem;color:var(--text3)">${day.dur>0?day.dur.toFixed(1):''}</div>
      <div class="sleep-bar" style="height:${pct}%;background:${color};width:100%"></div>
      <div class="sleep-bar-label">${day.label}</div>
    `;
    chart.appendChild(item);
  });
  wrap.appendChild(chart);
}
export function openSleepModal(s=null) {
  el('sleepEditId').value = s ? s.id : '';
  el('sleepDate').value = s ? s.date : today();
  el('sleepStart').value = s ? s.start : '22:00';
  el('sleepEnd').value = s ? s.end : '06:00';
  el('sleepQuality').value = s ? (s.quality||3) : 3;
  openModal('sleepModal');
}
export async function saveSleep() {
  const date = el('sleepDate').value;
  const start = el('sleepStart').value;
  const end = el('sleepEnd').value;
  if(!date||!start||!end) { showToast('Isi semua field'); return; }
  const startH = parseInt(start.split(':')[0]), startM = parseInt(start.split(':')[1]);
  const endH = parseInt(end.split(':')[0]), endM = parseInt(end.split(':')[1]);
  let dur = (endH*60+endM - startH*60-startM) / 60;
  if(dur < 0) dur += 24;
  const id = el('sleepEditId').value || uid();
  await DB.put('sleepLogs', { id, date, start, end, duration: Math.round(dur*10)/10, quality: parseInt(el('sleepQuality').value)||3 });
  closeModal('sleepModal');
  renderSleep();
  showToast('Tidur dicatat 💤');
  checkAchievements();
}

