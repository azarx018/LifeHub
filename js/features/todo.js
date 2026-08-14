/* ===== TODO ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { DB } from '../core/db.js';
import { S } from '../core/state.js';
import { uid, today, el, qs, qsa, fmtShort, showToast, escHtml } from '../core/utils.js';
import { openModal, closeModal, confirm2 } from '../core/modal.js';

export async function renderTodos() {
  const todos = await DB.getAll('todos');
  S.todos = todos;
  let filtered = todos.filter(t => {
    if(S.todoFilter === 'all' && !t.archived) return true;
    if(S.todoFilter === 'pending') return !t.done && !t.archived;
    if(S.todoFilter === 'done') return t.done && !t.archived;
    if(S.todoFilter === 'archived') return t.archived;
    return false;
  });
  if(S.todoPriority !== 'all') filtered = filtered.filter(t => t.priority === S.todoPriority);
  if(S.todoSearch) filtered = filtered.filter(t => t.title.toLowerCase().includes(S.todoSearch.toLowerCase()) || (t.note||'').toLowerCase().includes(S.todoSearch.toLowerCase()));
  const allActive = todos.filter(t => !t.archived);
  const done = allActive.filter(t => t.done).length;
  const total = allActive.length;
  const pf = el('todoProgressFill'); const pl = el('todoProgressLabel');
  if(pf) pf.style.width = total ? (done/total*100)+'%' : '0%';
  if(pl) pl.textContent = `${done} dari ${total} selesai`;
  const list = el('todoList'); if(!list) return;
  list.innerHTML = '';
  if(!filtered.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>Tidak ada todo di sini</p></div>';
    return;
  }
  const sorted = [...filtered].sort((a,b) => {
    const pOrder = {high:0,medium:1,low:2};
    if(a.done !== b.done) return a.done ? 1 : -1;
    return (pOrder[a.priority]||1) - (pOrder[b.priority]||1);
  });
  sorted.forEach(t => {
    const item = document.createElement('div');
    item.className = `todo-item animate-in ${t.done?'done-item':''}`;
    const deadlineTxt = t.deadline ? `📅 ${fmtShort(t.deadline+'T00:00:00')}` : '';
    item.innerHTML = `
      <input type="checkbox" class="todo-check" ${t.done?'checked':''} />
      <div class="todo-body">
        <div class="todo-text">${escHtml(t.title)}</div>
        <div class="todo-meta">
          <span class="todo-badge badge-${t.priority||'low'}">${{high:'🔴 High',medium:'🟡 Medium',low:'🟢 Low'}[t.priority]||'Low'}</span>
          ${t.category?`<span class="todo-badge badge-cat">🏷️ ${escHtml(t.category)}</span>`:''}
          ${deadlineTxt?`<span class="todo-badge badge-date">${deadlineTxt}</span>`:''}
        </div>
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
      t.done = willBeDone; t.doneAt = t.done ? today() : null;
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
    btns[1].addEventListener('click', async () => {
      t.archived = !t.archived; await DB.put('todos', t); renderTodos();
      showToast(t.archived ? 'Diarsipkan' : 'Dipulihkan');
    });
    btns[2].addEventListener('click', () => confirm2('Hapus todo ini?', async () => { await DB.delete('todos', t.id); renderTodos(); showToast('Todo dihapus'); }));
    list.appendChild(item);
  });
}
export function openTodoModal(t=null) {
  el('todoEditId').value = t ? t.id : '';
  el('todoTitle').value = t ? t.title : '';
  el('todoNote').value = t ? (t.note||'') : '';
  el('todoPriority').value = t ? (t.priority||'medium') : 'medium';
  el('todoCategory').value = t ? (t.category||'') : '';
  el('todoDeadline').value = t ? (t.deadline||'') : '';
  el('todoModalTitle').textContent = t ? 'Edit Todo' : 'Tambah Todo';
  openModal('todoModal');
  setTimeout(() => el('todoTitle').focus(), 300);
}
export async function saveTodo() {
  const title = el('todoTitle').value.trim();
  if(!title) { showToast('Judul tidak boleh kosong'); return; }
  const id = el('todoEditId').value || uid();
  const existing = await DB.get('todos', id) || {};
  await DB.put('todos', { ...existing, id, title, note: el('todoNote').value.trim(), priority: el('todoPriority').value, category: el('todoCategory').value.trim(), deadline: el('todoDeadline').value, done: existing.done||false, archived: existing.archived||false, createdAt: existing.createdAt||today() });
  closeModal('todoModal');
  renderTodos();
  showToast('Todo disimpan ✅');
}

