/* ===== TODO (per hari) ===== */
// Sejak v6.6.0 todo bersifat PER HARI — sama seperti Habit & Sholat: tiap todo
// "milik" satu tanggal (field `date`), halaman Todo menampilkan todo untuk
// tanggal yang lagi dipilih (S.todoDate), dan otomatis pindah ke hari baru
// pas tanggal berganti (lihat updateClock() di dashboard.js). Todo hari-hari
// sebelumnya TETAP tersimpan — tinggal geser tanggal pakai tombol ‹ ›.
import { DB } from '../core/db.js';
import { S } from '../core/state.js';
import { uid, today, el, qs, qsa, fmt, fmtShort, showToast, escHtml } from '../core/utils.js';
import { openModal, closeModal, confirm2 } from '../core/modal.js';

import { todoDateOf, todoSpanOf, todoVisibleOn, todoDoneOn, todoDayNo, todoRepeatOf, isTodoMissed, materializeRecurring, parseSubtasks } from '../core/todoRules.js';
export { todoDateOf, todoSpanOf, todoVisibleOn, todoDoneOn, todoDayNo };

// Buat kemunculan berikutnya untuk todo berulang. Dijaga 1x per hari (kecuali force).
let _recurDay = '';
export async function ensureRecurringTodos(force = false) {
  const day = today();
  if (!force && _recurDay === day) return 0;
  _recurDay = day;
  const all = await DB.getAll('todos');
  const created = materializeRecurring(all, day, uid);
  for (const nt of created) await DB.put('todos', nt);
  return created.length;
}

function syncTodoSpanUI() {
  const sel = el('todoSpan'), cu = el('todoSpanCustom'), hint = el('todoSpanHint');
  if(!sel || !cu || !hint) return;
  const rep = el('todoRepeat') ? el('todoRepeat').value : 'none';
  if (rep !== 'none') { sel.value = '1'; sel.disabled = true; cu.style.display = 'none'; hint.textContent = 'Todo berulang muncul di hari yang sesuai, jadi "Aktif selama" tidak dipakai.'; return; }
  sel.disabled = false;
  const v = sel.value;
  cu.style.display = v === 'custom' ? '' : 'none';
  hint.textContent = v === '1' ? 'Hanya muncul di tanggal ini.'
    : v === '0' ? 'Muncul setiap hari sampai kamu coret. Dihitung selesai di hari kamu mencoretnya.'
    : v === 'custom' ? 'Isi jumlah hari aktif (2–365).'
    : `Muncul setiap hari selama ${v} hari, atau sampai kamu coret.`;
}
// Migrasi satu kali: todo lama (belum punya `date`) dikasih `date` = tanggal
// dibuatnya, lalu disimpan biar ngga diulang lagi. Data lama tidak dihapus/diubah
// selain nambah field `date`.
export async function migrateTodoDates() {
  const todos = await DB.getAll('todos');
  let changed = false;
  for (const t of todos) {
    if (!t.date) {
      t.date = todoDateOf(t) || today();
      await DB.put('todos', t);
      changed = true;
    }
  }
  return changed;
}

export async function renderTodos() {
  await ensureRecurringTodos();
  const allTodos = await DB.getAll('todos');
  S.todos = allTodos;
  // Cuma todo milik tanggal yang lagi dipilih. (S.todoDate dibaca SETELAH await
  // di atas, jadi kalau user geser tanggal cepat-cepat, render terakhir selalu
  // konsisten dengan tanggal yang tampil.)
  const missedAll = allTodos.filter(t => isTodoMissed(t, today()));
  // Daftar terlewat sudah kosong (semua dipindah/dicoret) -> otomatis kembali ke tampilan normal
  if(S.todoFilter === 'missed' && !missedAll.length) { S.todoFilter = 'all'; setStatusFilterActive('all'); }
  const inMissed = S.todoFilter === 'missed';
  const todos = inMissed ? [...missedAll].sort((a, b) => todoDateOf(b).localeCompare(todoDateOf(a))) : allTodos.filter(t => todoVisibleOn(t, S.todoDate));
  renderMissedBar(missedAll.length, inMissed);
  const dateEl = el('todoCurrentDate');
  if(dateEl) dateEl.textContent = fmt(S.todoDate + 'T00:00:00') + (S.todoDate === today() ? ' · Hari ini' : '');
  let filtered = todos.filter(t => {
    if(inMissed) return true;
    if(S.todoFilter === 'all' && !t.archived) return true;
    if(S.todoFilter === 'pending') return !todoDoneOn(t, S.todoDate) && !t.archived;
    if(S.todoFilter === 'done') return todoDoneOn(t, S.todoDate) && !t.archived;
    if(S.todoFilter === 'archived') return t.archived;
    return false;
  });
  if(S.todoPriority !== 'all') filtered = filtered.filter(t => t.priority === S.todoPriority);
  if(S.todoSearch) filtered = filtered.filter(t => t.title.toLowerCase().includes(S.todoSearch.toLowerCase()) || (t.note||'').toLowerCase().includes(S.todoSearch.toLowerCase()));
  const allActive = todos.filter(t => !t.archived);
  const done = allActive.filter(t => todoDoneOn(t, S.todoDate)).length;
  const total = allActive.length;
  const pf = el('todoProgressFill'); const pl = el('todoProgressLabel');
  if(pf) pf.style.width = total ? (done/total*100)+'%' : '0%';
  if(pl) pl.textContent = inMissed ? `${total} todo terlewat` : `${done} dari ${total} selesai`;
  const list = el('todoList'); if(!list) return;
  list.innerHTML = '';
  if(!filtered.length) {
    const emptyMsg = todos.length
      ? 'Tidak ada todo di sini'
      : (S.todoDate === today() ? 'Belum ada todo hari ini. Tambah todo pertamamu!' : 'Tidak ada todo di tanggal ini');
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><p>${emptyMsg}</p></div>`;
    return;
  }
  const sorted = [...filtered].sort((a,b) => {
    const pOrder = {high:0,medium:1,low:2};
    if(todoDoneOn(a, S.todoDate) !== todoDoneOn(b, S.todoDate)) return todoDoneOn(a, S.todoDate) ? 1 : -1;
    return (pOrder[a.priority]||1) - (pOrder[b.priority]||1);
  });
  sorted.forEach(t => {
    const item = document.createElement('div');
    const dn = todoDoneOn(t, S.todoDate);
    const virt = t.done && !dn; // sudah dicoret di hari lain; hari ini cuma riwayat
    const sp = todoSpanOf(t);
    const spanTxt = inMissed ? '' : sp === 0 ? `Hari ke-${todoDayNo(t, S.todoDate)} · sampai selesai` : sp > 1 ? `Hari ${todoDayNo(t, S.todoDate)}/${sp}` : '';
    const repTxt = {daily:'Setiap hari', weekdays:'Hari kerja', weekly:'Setiap minggu'}[todoRepeatOf(t)] || '';
    const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
    const subsDone = subs.filter(s => s.done).length;
    const subsHtml = subs.length ? `<div class="todo-subs">${subs.map((s, i) => `<label class="todo-sub ${s.done?'done':''}"><input type="checkbox" data-sub="${i}" ${s.done?'checked':''} ${virt?'disabled':''}/><span>${escHtml(s.t)}</span></label>`).join('')}</div>` : '';
    const missedHtml = inMissed ? `<span class="todo-badge badge-date">Sejak ${fmtShort(todoDateOf(t)+'T00:00:00')}</span><button class="btn-link move-today">Pindah ke hari ini</button>` : '';
    item.className = `todo-item animate-in ${dn?'done-item':''} ${virt?'virtual':''}`;
    const deadlineTxt = t.deadline ? `📅 ${fmtShort(t.deadline+'T00:00:00')}` : '';
    item.innerHTML = `
      <input type="checkbox" class="todo-check" ${dn?'checked':''} ${virt?'disabled':''} />
      <div class="todo-body">
        <div class="todo-text">${escHtml(t.title)}</div>
        <div class="todo-meta">
          <span class="todo-badge badge-${t.priority||'low'}">${{high:'Tinggi',medium:'Sedang',low:'Rendah'}[t.priority]||'Rendah'}</span>
          ${t.category?`<span class="todo-badge badge-cat">${escHtml(t.category)}</span>`:''}
          ${deadlineTxt?`<span class="todo-badge badge-date">${deadlineTxt}</span>`:''}
          ${spanTxt?`<span class="todo-badge badge-span">${spanTxt}</span>`:''}
          ${repTxt?`<span class="todo-badge badge-span">Berulang · ${repTxt}</span>`:''}
          ${subs.length?`<span class="todo-badge badge-span">${subsDone}/${subs.length} subtugas</span>`:''}
          ${missedHtml}
        </div>
        ${subsHtml}
      </div>
      <div class="todo-actions">
        <button class="icon-btn" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="icon-btn" title="${t.archived?'Pulihkan':'Arsip'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg></button>
        <button class="icon-btn" title="Hapus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
      </div>
    `;
    const cb = qs('.todo-check', item);
    cb.addEventListener('change', async () => {
      const willBeDone = cb.checked;
      t.done = willBeDone;
      // Todo multi-hari dicoret saat melihat tanggal lampau -> dihitung selesai di tanggal itu
      t.doneAt = t.done ? ((todoSpanOf(t) !== 1 && !inMissed && S.todoDate < today()) ? S.todoDate : today()) : null;
      await DB.put('todos', t);
      if (willBeDone) {
        // Kasih delight kecil pas selesai (ala TickTick) sebelum list di-refresh
        cb.classList.add('pop-anim');
        item.classList.add('just-completed');
        setTimeout(() => renderTodos(), 420);
      } else {
        renderTodos();
      }
    });
    const btns = qsa('.icon-btn', item);
    btns[0].addEventListener('click', () => openTodoModal(t));
    // v6.7: ketuk judul/isi todo = edit (tombol edit disembunyikan lewat CSS)
    qs('.todo-body', item).addEventListener('click', () => openTodoModal(t));
    // Subtugas: centang tidak membuka modal edit
    const subsBox = qs('.todo-subs', item);
    if(subsBox) {
      subsBox.addEventListener('click', e => e.stopPropagation());
      qsa('.todo-sub input', item).forEach(inp => inp.addEventListener('change', async () => {
        t.subtasks[+inp.dataset.sub].done = inp.checked; await DB.put('todos', t); renderTodos();
      }));
    }
    const mv = qs('.move-today', item);
    if(mv) mv.addEventListener('click', async e => {
      e.stopPropagation(); t.date = today(); t.span = 1; await DB.put('todos', t);
      showToast('Dipindah ke hari ini'); renderTodos();
    });
    btns[1].addEventListener('click', async () => {
      t.archived = !t.archived; await DB.put('todos', t); renderTodos();
      showToast(t.archived ? 'Diarsipkan' : 'Dipulihkan');
    });
    btns[2].addEventListener('click', () => {
      // Hapus todo berulang = hentikan pengulangannya (kalau tidak, kemunculan lama akan dibuatkan lagi).
      const series = (t.seriesId && todoRepeatOf(t) !== 'none');
      confirm2(series ? 'Todo ini berulang. Menghapusnya akan menghentikan pengulangan. Lanjut?' : 'Hapus todo ini?', async () => {
        if(series) for(const o of allTodos.filter(x => x.seriesId === t.seriesId && todoRepeatOf(x) !== 'none')) { o.repeat = 'none'; await DB.put('todos', o); }
        await DB.delete('todos', t.id); renderTodos(); showToast(series ? 'Pengulangan dihentikan' : 'Todo dihapus');
      });
    });
    list.appendChild(item);
  });
}
function renderMissedBar(n, inMissed) {
  const bar = el('todoMissedBar'); if(!bar) return;
  if(inMissed) {
    bar.hidden = false;
    bar.innerHTML = '<span>Menampilkan todo yang terlewat</span><button class="btn-link" id="btnMissedClose">Kembali</button>';
    el('btnMissedClose').onclick = () => { S.todoFilter = 'all'; setStatusFilterActive('all'); renderTodos(); };
  } else if(n > 0) {
    bar.hidden = false;
    bar.innerHTML = `<span>${n} todo terlewat</span><button class="btn-link" id="btnMissedOpen">Lihat</button>`;
    el('btnMissedOpen').onclick = () => { S.todoFilter = 'missed'; setStatusFilterActive(null); renderTodos(); };
  } else bar.hidden = true;
}
function setStatusFilterActive(f) {
  qsa('#todoStatusFilter .filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === f));
}
export function openTodoModal(t=null) {
  el('todoEditId').value = t ? t.id : '';
  el('todoTitle').value = t ? t.title : '';
  el('todoNote').value = t ? (t.note||'') : '';
  el('todoPriority').value = t ? (t.priority||'medium') : 'medium';
  el('todoCategory').value = t ? (t.category||'') : '';
  el('todoDeadline').value = t ? (t.deadline||'') : '';
  const spNow = t ? todoSpanOf(t) : 1;
  const spSel = el('todoSpan'), spCu = el('todoSpanCustom');
  if(['1','2','3','5','7','14','0'].includes(String(spNow))) { spSel.value = String(spNow); spCu.value = ''; }
  else { spSel.value = 'custom'; spCu.value = spNow; }
  el('todoRepeat').value = t ? todoRepeatOf(t) : 'none';
  el('todoSubtasks').value = t && Array.isArray(t.subtasks) ? t.subtasks.map(s => s.t).join('\n') : '';
  el('todoRepeat').onchange = syncTodoSpanUI;
  spSel.onchange = syncTodoSpanUI; syncTodoSpanUI();
  el('todoModalTitle').textContent = t ? 'Edit Todo' : 'Tambah Todo';
  openModal('todoModal');
  setTimeout(() => el('todoTitle').focus(), 300);
}
export async function saveTodo() {
  const title = el('todoTitle').value.trim();
  if(!title) { showToast('Judul tidak boleh kosong'); return; }
  const id = el('todoEditId').value || uid();
  const existing = await DB.get('todos', id) || {};
  // Todo baru -> masuk ke tanggal yang lagi dibuka di halaman Todo (S.todoDate).
  // Todo yang diedit -> tetap di tanggalnya semula.
  const date = (existing.id && todoDateOf(existing)) || S.todoDate;
  let span = el('todoSpan').value === 'custom' ? Math.round(parseInt(el('todoSpanCustom').value, 10) || 1) : parseInt(el('todoSpan').value, 10);
  span = isNaN(span) ? 1 : Math.max(0, Math.min(365, span));
  const repeat = el('todoRepeat').value;
  if (repeat !== 'none') span = 1;
  const seriesId = existing.seriesId || (repeat !== 'none' ? id : undefined);
  const subtasks = parseSubtasks(el('todoSubtasks').value, existing.subtasks);
  await DB.put('todos', { ...existing, id, span, repeat, seriesId, subtasks, title, note: el('todoNote').value.trim(), priority: el('todoPriority').value, category: el('todoCategory').value.trim(), deadline: el('todoDeadline').value, done: existing.done||false, archived: existing.archived||false, createdAt: existing.createdAt||today(), date });
  closeModal('todoModal');
  renderTodos();
  showToast('Todo disimpan ✅');
}

