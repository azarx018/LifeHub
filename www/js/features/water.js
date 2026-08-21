/* ===== WATER ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { DB } from '../core/db.js';
import { S } from '../core/state.js';
import { uid, today, el, fmtShort, showToast } from '../core/utils.js';
import { checkAchievements } from './game/achievements.js';

export async function renderWater() {
  const logs = await DB.getAll('waterLogs');
  const isToday2 = S.waterDate === today();

  // Update nav
  const dateEl = el('waterCurrentDate');
  if(dateEl) dateEl.textContent = isToday2 ? 'Hari Ini' : fmtShort(S.waterDate+'T12:00:00');
  const nextBtn = el('waterNextDay');
  if(nextBtn) nextBtn.style.opacity = isToday2 ? '0.3' : '1';

  const dateLogs = logs.filter(w => w.date === S.waterDate).sort((a,b) => a.time.localeCompare(b.time));
  const wt = S.settings.waterTarget || 8;
  const wc = dateLogs.length;
  const pct = Math.min(100, Math.round(wc/wt*100));
  const wf = el('waterFill'); if(wf) wf.style.height = pct + '%';
  const wp = el('waterPercent'); if(wp) wp.textContent = pct + '%';
  const wCount = el('waterCount'); if(wCount) wCount.innerHTML = `${wc} <span>gelas</span>`;
  const wTxt = el('waterTargetText'); if(wTxt) wTxt.textContent = `Target: ${wt} gelas`;
  const wti = el('waterTargetInput'); if(wti) wti.value = wt;

  // Sembunyikan tombol tambah/reset kalau bukan hari ini
  const addBtn = el('btnAddWaterMain');
  const resetBtn = el('btnResetWater');
  if(addBtn)   addBtn.style.display   = isToday2 ? '' : 'none';
  if(resetBtn) resetBtn.style.display = isToday2 ? '' : 'none';

  const cupsGrid = el('waterCupsGrid');
  if(cupsGrid) {
    cupsGrid.innerHTML = '';
    for(let i=0; i<wt; i++) {
      const cup = document.createElement('div');
      cup.className = `water-cup ${i<wc?'filled':''}`;
      cup.innerHTML = `<svg viewBox="0 0 24 24" fill="${i<wc?'#44A8E0':'none'}" stroke="${i<wc?'#44A8E0':'var(--text3)'}" stroke-width="2" width="26" height="26"><path d="M8 2h8l1 8H7L8 2z"/><path d="M7 10c0 5 1 10 5 10s5-5 5-10"/></svg><small>Gelas ${i+1}</small>`;
      if(isToday2) {
        cup.addEventListener('click', async () => {
          if(i < wc) {
            const logToRemove = dateLogs[i];
            if(logToRemove) { await DB.delete('waterLogs', logToRemove.id); renderWater(); }
          } else {
            await addWater();
          }
        });
      }
      cupsGrid.appendChild(cup);
    }
  }
  const wLog = el('waterLog');
  if(wLog) {
    if(dateLogs.length) {
      wLog.innerHTML = dateLogs.map(l => `
        <div class="water-log-item">
          <span style="display:flex;align-items:center;gap:4px">
            <svg viewBox="0 0 24 24" fill="#44A8E0" stroke="#44A8E0" stroke-width="1" width="13" height="13"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>
            ${l.time}
          </span>
          <span>+1 gelas</span>
        </div>`).join('');
    } else {
      wLog.innerHTML = `<p style="font-size:.8rem;color:var(--text3);text-align:center;padding:12px 0">Tidak ada catatan air minum${isToday2?'':" di hari ini"}</p>`;
    }
  }
}

export async function addWater() {
  if(S.waterDate !== today()) return; // hanya bisa tambah di hari ini
  const wt = S.settings.waterTarget || 8;
  const logs = await DB.getAll('waterLogs');
  const todayLogs = logs.filter(w => w.date === today());
  if(todayLogs.length >= wt) { showToast('Target sudah tercapai! 🎉'); return; }
  const time = new Date().toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'});
  await DB.put('waterLogs', { id: uid(), date: today(), time });
  renderWater();
  const newCount = todayLogs.length + 1;
  if(newCount === wt) showToast('🎉 Target air minum tercapai!');
  else showToast('💧 Air ditambah');
  checkAchievements();
}

