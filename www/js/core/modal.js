/* ===== MODAL & CONFIRM ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { el, qsa } from './utils.js';

export function openModal(id) {
  el('modalBackdrop').classList.add('visible');
  el(id).classList.add('open');
}
export function closeModal(id) {
  el(id).classList.remove('open');
  const anyOpen = qsa('.modal.open').length > 0;
  if(!anyOpen) el('modalBackdrop').classList.remove('visible');
}
export function closeAllModals() {
  qsa('.modal').forEach(m => m.classList.remove('open'));
  el('modalBackdrop').classList.remove('visible');
}

let _confirmCb = null;
export function confirm2(text, cb) {
  el('confirmText').textContent = text;
  _confirmCb = cb;
  openModal('confirmModal');
}
// Dipakai oleh setupEvents() (di legacy.js) saat tombol "Ya, Lanjutkan" diklik.
export function getConfirmCb() { return _confirmCb; }
