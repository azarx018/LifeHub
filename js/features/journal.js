/* ===== JOURNAL ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { DB } from '../core/db.js';
import { S } from '../core/state.js';
import { uid, today, el, qs, qsa, fmt, fmtShort, showToast, escHtml } from '../core/utils.js';
import { openModal, closeModal, confirm2 } from '../core/modal.js';

export async function renderJournal() {
  const journals = await DB.getAll('journals');
  S.journals = journals;

  // Update nav date display
  const dateEl = el('journalCurrentDate');
  const isToday2 = S.journalDate === today();
  if(dateEl) dateEl.textContent = isToday2 ? 'Hari Ini' : fmt(S.journalDate + 'T00:00:00');

  // Disable next button if already at today
  const nextBtn = el('journalNextDay');
  if(nextBtn) nextBtn.style.opacity = isToday2 ? '0.3' : '1';

  // Filter: if search active → show all matching, else show selected date
  const search = S.journalSearch.toLowerCase();
  let filtered;
  if(search) {
    filtered = journals.filter(j =>
      (j.title||'').toLowerCase().includes(search) ||
      (j.content||'').toLowerCase().includes(search)
    ).sort((a,b) => b.date.localeCompare(a.date));
  } else {
    filtered = journals
      .filter(j => j.date === S.journalDate)
      .sort((a,b) => b.date.localeCompare(a.date));
  }

  renderJournalCalendar(journals);

  const list = el('journalList'); if(!list) return;
  list.innerHTML = '';

  if(!filtered.length) {
    const emptyMsg = search ? 'Jurnal tidak ditemukan' : `Belum ada jurnal untuk ${isToday2 ? 'hari ini' : fmt(S.journalDate+'T00:00:00')}`;
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg></div>
      <p>${emptyMsg}</p>
    </div>`;
    return;
  }

  const moodEmoji = {happy:'😊',neutral:'😐',sad:'😔',excited:'🤩',tired:'😴'};
  filtered.forEach(j => {
    const item = document.createElement('div');
    item.className = 'journal-item animate-in';
    const tags = (j.tags||[]).map(t => `<span class="tag-badge">#${escHtml(t)}</span>`).join('');
    item.innerHTML = `
      <div class="journal-item-header">
        <div class="journal-item-title">${escHtml(j.title||'Tanpa Judul')}</div>
        <div class="journal-item-meta">
          ${j.mood?`<span class="journal-mood">${moodEmoji[j.mood]||''}</span>`:''}
          <span class="journal-date">${fmtShort(j.date+'T00:00:00')}</span>
        </div>
      </div>
      <div class="journal-preview">${escHtml(j.content||'')}</div>
      ${tags?`<div class="journal-tags">${tags}</div>`:''}
    `;
    item.addEventListener('click', () => openJournalView(j));
    list.appendChild(item);
  });
}
function renderJournalCalendar(journals) {
  const cal = el('journalCalendar'); if(!cal) return;
  cal.innerHTML = '';
  const days = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  days.forEach(d => { const h = document.createElement('div'); h.className='jcal-header'; h.textContent=d; cal.appendChild(h); });

  // Show month of currently selected date
  const selDate = new Date(S.journalDate + 'T12:00:00');
  const year = selDate.getFullYear();
  const month = selDate.getMonth();
  const first = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();

  for(let i=0; i<first; i++) { const e = document.createElement('div'); e.className='jcal-day empty'; cal.appendChild(e); }
  for(let d=1; d<=daysInMonth; d++) {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const hasEntry = journals.some(j => j.date === ds);
    const isToday3 = ds === today();
    const isSelected = ds === S.journalDate;
    const div = document.createElement('div');
    div.className = `jcal-day${hasEntry?' has-entry':''}${isToday3?' today':''}${isSelected&&!isToday3?' selected':''}`;
    div.textContent = d;
    div.addEventListener('click', () => {
      S.journalDate = ds;
      renderJournal();
    });
    cal.appendChild(div);
  }
}
export function openJournalView(j) {
  el('journalViewTitle').textContent = j.title || 'Jurnal';
  const moodEmoji = {happy:'😊',neutral:'😐',sad:'😔',excited:'🤩',tired:'😴'};
  const tags = (j.tags||[]).map(t => `<span class="tag-badge">#${escHtml(t)}</span>`).join(' ');
  el('journalViewBody').innerHTML = `
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px">
      <span style="font-size:0.85rem;color:var(--text3)">${fmt(j.date+'T00:00:00')}</span>
      ${j.mood?`<span style="font-size:1.3rem">${moodEmoji[j.mood]}</span>`:''}
    </div>
    <p style="font-size:0.9rem;line-height:1.7;white-space:pre-wrap;color:var(--text)">${escHtml(j.content||'')}</p>
    ${tags?`<div class="journal-tags" style="margin-top:12px">${tags}</div>`:''}
  `;
  el('btnDeleteJournal').onclick = () => confirm2('Hapus jurnal ini?', async () => { await DB.delete('journals', j.id); closeModal('journalViewModal'); renderJournal(); showToast('Jurnal dihapus'); });
  el('btnEditJournalFromView').onclick = () => { closeModal('journalViewModal'); openJournalModal(j); };
  openModal('journalViewModal');
}
export function openJournalModal(j=null) {
  el('journalEditId').value = j ? j.id : '';
  el('journalTitle').value = j ? (j.title||'') : '';
  el('journalContent').value = j ? (j.content||'') : '';
  el('journalTags').value = j ? (j.tags||[]).join(', ') : '';
  el('journalMood').value = j ? (j.mood||'') : '';
  const moodBtns = qsa('#journalModal .mood-btn');
  moodBtns.forEach(b => b.classList.toggle('selected', b.dataset.mood === (j ? j.mood : '')));
  el('journalModalTitle').textContent = j ? 'Edit Jurnal' : `Tulis Jurnal — ${S.journalDate === today() ? 'Hari Ini' : fmtShort(S.journalDate+'T00:00:00')}`;
  // Store selected date so save uses correct date
  el('journalEditId')._journalDate = j ? j.date : S.journalDate;
  openModal('journalModal');
  setTimeout(() => el('journalContent').focus(), 300);
}
export async function saveJournal() {
  const content = el('journalContent').value.trim();
  if(!content) { showToast('Isi jurnal tidak boleh kosong'); return; }
  const id = el('journalEditId').value || uid();
  const saveDate = el('journalEditId')._journalDate || S.journalDate || today();
  const existing = await DB.get('journals', id) || {};
  const rawTags = el('journalTags').value;
  const tags = rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : [];
  await DB.put('journals', {
    ...existing, id,
    title: el('journalTitle').value.trim()||'Tanpa Judul',
    content, mood: el('journalMood').value||'', tags,
    date: existing.date || saveDate,
    updatedAt: today()
  });
  closeModal('journalModal');
  renderJournal();
  showToast('Jurnal disimpan 📓');
}

