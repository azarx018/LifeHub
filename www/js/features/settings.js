/* ===== SETTINGS (+ Countdown Widget, Auto Backup) ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { DB } from '../core/db.js';
import { S } from '../core/state.js';
import { APP_VERSION } from '../core/version.js';
import { KV, uid, today, el, qs, qsa, fmtShort, showToast, escHtml } from '../core/utils.js';
import { confirm2 } from '../core/modal.js';
import { navigateTo } from '../core/router.js';
import { saveTextFile } from '../core/fileExport.js';
import { renderSettingsUpdateSection } from '../core/updatePopup.js';

// ===== COUNTDOWN WIDGET =====
// Data disimpen sebagai array {id, name, date} di KV (bukan store IndexedDB baru,
// biar ngga perlu bump versi schema DB).
function daysDiff(dateStr) {
  const a = new Date(today() + 'T00:00:00');
  const b = new Date(dateStr + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}
function daysElapsed(dateStr) { return -daysDiff(dateStr); } // hari sejak tanggal mulai (0 = hari pertama)
async function getCountdownTargets() {
  return await KV.get('countdown_targets', []);
}
async function saveCountdownTargets(list) {
  await KV.set('countdown_targets', list);
}
export async function addCountdownTarget() {
  const nameEl = el('countdownName'), dateEl = el('countdownDate');
  const name = nameEl.value.trim();
  const date = dateEl.value;
  if (!name || !date) { showToast('Isi nama & tanggal dulu ya'); return; }
  const typeBtn = qs('.day-opt.selected', el('countdownTypePicker'));
  const type = typeBtn ? typeBtn.dataset.type : 'countdown';
  const list = await getCountdownTargets();
  list.push({ id: uid(), name, date, type });
  await saveCountdownTargets(list);
  nameEl.value = ''; dateEl.value = '';
  renderCountdownSettings();
  renderDashboardCountdowns();
  showToast('Countdown ditambahkan 🎉');
}
async function deleteCountdownTarget(id) {
  const list = await getCountdownTargets();
  await saveCountdownTargets(list.filter(t => t.id !== id));
  renderCountdownSettings();
  renderDashboardCountdowns();
}
async function renderCountdownSettings() {
  const listEl = el('countdownList'); if (!listEl) return;
  const list = await getCountdownTargets();
  if (!list.length) {
    listEl.innerHTML = '<p style="font-size:.8rem;color:var(--text3);margin-bottom:8px">Belum ada target countdown</p>';
    return;
  }
  const sorted = [...list].sort((a, b) => daysDiff(a.date) - daysDiff(b.date));
  listEl.innerHTML = sorted.map(t => {
    let status;
    if (t.type === 'countup') {
      const elapsed = daysElapsed(t.date);
      status = elapsed < 0 ? 'belum mulai' : `hari ke-${elapsed + 1}`;
    } else {
      const d = daysDiff(t.date);
      status = d > 0 ? `${d} hari lagi` : d === 0 ? 'Hari ini! 🎉' : `${Math.abs(d)} hari lalu`;
    }
    return `
    <div class="settings-item">
      <label>${t.type === 'countup' ? '📈' : '⏳'} ${escHtml(t.name)} <small style="color:var(--text3)">(${fmtShort(t.date+'T12:00:00')} · ${status})</small></label>
      <button class="btn btn-outline btn-sm" data-del-countdown="${t.id}">🗑️</button>
    </div>`;
  }).join('');
  qsa('[data-del-countdown]', listEl).forEach(btn => {
    btn.addEventListener('click', () => confirm2('Hapus countdown ini?', async () => { await deleteCountdownTarget(btn.dataset.delCountdown); }));
  });
}
export async function renderDashboardCountdowns() {
  const wrap = el('dashCountdowns'); if (!wrap) return;
  const list = await getCountdownTargets();
  if (!list.length) {
    wrap.innerHTML = '<p style="font-size:.8rem;color:var(--text3)">Belum ada target. Tambahin di Settings ya!</p>';
    return;
  }
  const upcoming = list.filter(t => t.type==='countup' || daysDiff(t.date) >= 0).sort((a, b) => daysDiff(a.date) - daysDiff(b.date));
  const passed = list.filter(t => t.type!=='countup' && daysDiff(t.date) < 0);
  const showList = [...upcoming, ...passed].slice(0, 4); // max 4 biar ngga kepanjangan
  wrap.innerHTML = showList.map(t => {
    if (t.type === 'countup') {
      const elapsed = daysElapsed(t.date);
      const notStarted = elapsed < 0;
      const bigNum = notStarted ? '⏸️' : elapsed + 1;
      const subText = notStarted ? 'belum mulai' : 'hari berjalan';
      return `
      <div class="dash-countdown-item countup">
        <div class="dash-countdown-num">${bigNum}</div>
        <div class="dash-countdown-info">
          <div class="dash-countdown-name">${escHtml(t.name)}</div>
          <div class="dash-countdown-sub">${subText}</div>
        </div>
      </div>`;
    }
    const d = daysDiff(t.date);
    const isPast = d < 0;
    const bigNum = isPast ? '✅' : d === 0 ? '🎉' : d;
    const subText = isPast ? `${Math.abs(d)} hari lalu` : d === 0 ? 'Hari ini!' : 'hari lagi';
    return `
    <div class="dash-countdown-item ${isPast ? 'passed' : ''}">
      <div class="dash-countdown-num">${bigNum}</div>
      <div class="dash-countdown-info">
        <div class="dash-countdown-name">${escHtml(t.name)}</div>
        <div class="dash-countdown-sub">${subText}</div>
      </div>
    </div>`;
  }).join('');
}

export async function renderSettings() {
  renderCountdownSettings();
  const nameInput = el('settingName');
  if(nameInput) { nameInput.value = S.settings.name; nameInput.addEventListener('change', () => { S.settings.name = nameInput.value.trim()||'Azhar'; saveSettings(); }); }
  const dm = el('darkModeToggle');
  if(dm) { dm.checked = S.settings.darkMode; }

  // Prayer reminder state
  const prayerEnabled = await KV.get('prayer_reminder_enabled', false);
  const prayerMinutes = await KV.get('prayer_reminder_minutes', 5);
  const prayerCoords  = await KV.get('prayer_coords', null);
  const prt = el('prayerReminderToggle'); if(prt) prt.checked = prayerEnabled;
  const prm = el('prayerReminderMinutes'); if(prm) prm.value = prayerMinutes;
  const locLabel = el('savedLocationLabel');
  if(locLabel) locLabel.textContent = prayerCoords
    ? `${prayerCoords.lat.toFixed(4)}°, ${prayerCoords.lng.toFixed(4)}°`
    : 'Belum ada';

  // Load notification state
  const notifEnabled = await KV.get('notif_enabled', false);
  const morningTime = await KV.get('notif_morning', '07:00');
  const eveningTime = await KV.get('notif_evening', '21:00');
  const notifToggle = el('notifToggle');
  if(notifToggle) notifToggle.checked = notifEnabled;
  const notifTimeSettings = el('notifTimeSettings');
  if(notifTimeSettings) notifTimeSettings.style.display = notifEnabled ? 'block' : 'none';
  const nMorning = el('notifMorning'); if(nMorning) nMorning.value = morningTime;
  const nEvening = el('notifEvening'); if(nEvening) nEvening.value = eveningTime;

  // App Update — render pakai state cache terakhir (diisi runStartupUpdateCheck()
  // di main.js saat app dibuka). Tidak nge-hit GitHub API lagi di sini biar
  // buka halaman Settings tidak nambah request; user bisa tekan "Cek Update"
  // manual kalau mau paksa cek ulang.
  renderSettingsUpdateSection();
}
export function saveSettings() {
  KV.set('lifehub_settings', S.settings);
  applySettings();
}
export function applySettings() {
  document.documentElement.setAttribute('data-theme', S.settings.darkMode ? 'dark' : '');
}
export async function exportData() {
  const data = {};
  for(const store of DB._stores) { try { data[store] = await DB.getAll(store); } catch{} }
  // Fix v6.1.1: dulu ada `data.settings = S.settings` di sini, yang nimpa
  // array hasil DB.getAll('settings') — padahal store 'settings' itu juga
  // dipakai KV.set() buat nyimpen countdown_targets, notif_enabled, dst.
  // Akibatnya semua data KV (termasuk countdown/count-up) ke-skip pas export.
  // S.settings sendiri udah ikut kebawa otomatis lewat KV key 'lifehub_settings'
  // di dalam array data.settings di atas, jadi ga perlu ditimpa manual lagi.
  data._backupDate = today();
  data._version = APP_VERSION;
  const ok = await saveTextFile(`lifehub_backup_${today()}.json`, JSON.stringify(data, null, 2));
  if (ok) showToast('Data diekspor 📦');
}
export async function importData(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    for(const store of DB._stores) {
      if(data[store] && Array.isArray(data[store])) {
        for(const item of data[store]) { try { await DB.put(store, item); } catch{} }
      } else if (store === 'settings' && data.settings && !Array.isArray(data.settings)) {
        // Kompatibilitas file backup LAMA (sebelum fix v6.1.1) — dulu data.settings
        // isinya cuma {name,darkMode,...} (bukan array KV), jadi countdown_targets
        // dkk memang udah nggak ada di file lama itu. Tetep restore yg ada aja.
        S.settings = {...S.settings, ...data.settings}; saveSettings();
      }
    }
    // Sync S.settings dari KV yg baru diimpor (key 'lifehub_settings'), biar UI
    // (dark mode, nama, target tidur/air) langsung ke-update tanpa reload manual.
    S.settings = await KV.get('lifehub_settings', S.settings);
    applySettings();
    showToast('Data diimpor ✅');
    navigateTo('dashboard');
  } catch(e) { showToast('Error: file tidak valid'); }
}
