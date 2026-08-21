/* ===== GOALS ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { DB } from '../core/db.js';
import { uid, today, el, qs, qsa, fmtShort, showToast, escHtml } from '../core/utils.js';
import { openModal, closeModal, confirm2 } from '../core/modal.js';

export async function renderGoals() {
  const goals = await DB.getAll('goals');
  const milestones = await DB.getAll('milestones');
  const list = el('goalsList'); if(!list) return;
  list.innerHTML = '';
  if(!goals.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📚</div><p>Belum ada goals. Tambah tujuanmu!</p></div>';
    return;
  }
  const colors = ['#6C63FF','#FF6584','#43E97B','#F9CA24','#4ECDC4','#FF8C42'];
  goals.forEach((g, gi) => {
    const gMilestones = milestones.filter(m => m.goalId === g.id);
    const color = colors[gi % colors.length];
    const item = document.createElement('div');
    item.className = 'goal-item animate-in';
    const milestoneHtml = gMilestones.map(m => `
      <div class="milestone-item ${m.done?'done':''}" data-mid="${m.id}">
        <input type="checkbox" ${m.done?'checked':''} />
        <span>${escHtml(m.name)}</span>
        <span class="milestone-del" data-mid="${m.id}">✕</span>
      </div>
    `).join('');
    item.innerHTML = `
      <div class="goal-header">
        <div class="goal-icon-badge" style="background:${color}22">${g.icon||'🎯'}</div>
        <div class="goal-info">
          <div class="goal-title">${escHtml(g.title)}</div>
          ${g.desc?`<div class="goal-desc">${escHtml(g.desc)}</div>`:''}
        </div>
        <div class="goal-actions">
          <button class="icon-btn" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="icon-btn" title="Hapus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>
        </div>
      </div>
      <div class="goal-progress-row">
        <div class="goal-progress-bar"><div class="goal-progress-fill" style="width:${g.progress||0}%;background:${color}"></div></div>
        <div class="goal-progress-pct">${g.progress||0}%</div>
      </div>
      <div class="goal-meta">
        ${g.deadline?`<span class="goal-deadline">📅 ${fmtShort(g.deadline+'T00:00:00')}</span>`:''}
      </div>
      <div class="goal-milestones">
        <div class="milestone-list">${milestoneHtml}</div>
        <span class="add-milestone-btn" data-gid="${g.id}">+ Tambah Milestone</span>
      </div>
    `;
    const btns = qsa('.icon-btn', item);
    btns[0].addEventListener('click', () => openGoalModal(g));
    btns[1].addEventListener('click', () => confirm2('Hapus goal ini?', async () => {
      await DB.delete('goals', g.id);
      const gm = milestones.filter(m => m.goalId===g.id);
      for(const m of gm) await DB.delete('milestones', m.id);
      renderGoals(); showToast('Goal dihapus');
    }));
    qsa('.milestone-item input', item).forEach(cb => {
      cb.addEventListener('change', async () => {
        const mid = cb.closest('.milestone-item').dataset.mid;
        const m = milestones.find(mm => mm.id===mid);
        if(m) {
          m.done = cb.checked;
          await DB.put('milestones', m);
          // Auto-calculate goal progress from milestones
          const goalMilestones = milestones.filter(mm => mm.goalId === g.id);
          if(goalMilestones.length > 0) {
            const doneCount = goalMilestones.filter(mm => mm.id === mid ? cb.checked : mm.done).length;
            const newProgress = Math.round(doneCount / goalMilestones.length * 100);
            if(g.progress !== newProgress) {
              g.progress = newProgress;
              await DB.put('goals', g);
            }
          }
          renderGoals();
          showToast(cb.checked ? '✅ Milestone selesai! Progress diperbarui' : 'Milestone dibatalkan');
        }
      });
    });
    qsa('.milestone-del', item).forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const mid = btn.dataset.mid;
        await DB.delete('milestones', mid);
        // Recalculate after deletion
        const remaining = milestones.filter(mm => mm.goalId === g.id && mm.id !== mid);
        if(remaining.length > 0) {
          const doneCount = remaining.filter(mm => mm.done).length;
          g.progress = Math.round(doneCount / remaining.length * 100);
          await DB.put('goals', g);
        } else {
          // No milestones left — reset to 0 or keep as is
          // keep g.progress as is (manual)
        }
        renderGoals();
      });
    });
    qs('.add-milestone-btn', item).addEventListener('click', () => {
      el('milestoneGoalId').value = g.id;
      el('milestoneName').value = '';
      openModal('milestoneModal');
      setTimeout(() => el('milestoneName').focus(), 300);
    });
    list.appendChild(item);
  });
}
export function openGoalModal(g=null) {
  el('goalEditId').value = g ? g.id : '';
  el('goalTitle').value = g ? g.title : '';
  el('goalDesc').value = g ? (g.desc||'') : '';
  el('goalProgress').value = g ? (g.progress||0) : 0;
  el('goalDeadline').value = g ? (g.deadline||'') : '';
  const icon = g ? (g.icon||'🎯') : '🎯';
  el('goalIcon').value = icon;
  qsa('.icon-opt', el('goalIconPicker')).forEach(b => b.classList.toggle('selected', b.dataset.icon===icon));
  el('goalModalTitle').textContent = g ? 'Edit Goal' : 'Tambah Goal';
  openModal('goalModal');
  setTimeout(() => el('goalTitle').focus(), 300);
}
export async function saveGoal() {
  const title = el('goalTitle').value.trim();
  if(!title) { showToast('Judul tidak boleh kosong'); return; }
  const id = el('goalEditId').value || uid();
  const existing = await DB.get('goals', id) || {};
  await DB.put('goals', { ...existing, id, title, desc: el('goalDesc').value.trim(), progress: parseInt(el('goalProgress').value)||0, deadline: el('goalDeadline').value, icon: el('goalIcon').value, createdAt: existing.createdAt||today() });
  closeModal('goalModal');
  renderGoals();
  showToast('Goal disimpan 📚');
}
export async function saveMilestone() {
  const name = el('milestoneName').value.trim();
  if(!name) { showToast('Nama milestone tidak boleh kosong'); return; }
  const goalId = el('milestoneGoalId').value;
  await DB.put('milestones', { id: uid(), goalId, name, done: false });
  // Recalculate goal progress
  const allMilestones = await DB.getAll('milestones');
  const goalMilestones = allMilestones.filter(m => m.goalId === goalId);
  if(goalMilestones.length > 0) {
    const goal = await DB.get('goals', goalId);
    if(goal) {
      const doneCount = goalMilestones.filter(m => m.done).length;
      goal.progress = Math.round(doneCount / goalMilestones.length * 100);
      await DB.put('goals', goal);
    }
  }
  closeModal('milestoneModal');
  renderGoals();
  showToast('Milestone ditambah ✅');
}

