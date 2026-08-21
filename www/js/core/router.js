/* ===== NAVIGATION ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
//
// CATATAN SEMENTARA (Sprint 1): fungsi render* per halaman & PIXEL (game
// widget) masih hidup di js/legacy.js sampai Sprint 2-4 memindahkannya ke
// js/features/*.js masing-masing. Saat itu terjadi, satu-satunya yang perlu
// diubah adalah baris import di bawah — badan navigateTo() tidak perlu disentuh.
import { S } from './state.js';
import { el, qs, qsa } from './utils.js';
import { today } from './utils.js';
// ↓ Sudah dipindah ke js/features/ (Sprint 2)
import { renderTodos } from '../features/todo.js';
import { renderJournal } from '../features/journal.js';
import { renderSholat } from '../features/sholat.js';
import { renderWater } from '../features/water.js';
import { renderGoals } from '../features/goals.js';
import { renderActivity } from '../features/activity.js';
// ↓ Sudah dipindah ke js/features/ (Sprint 3)
import { renderDashboard } from '../features/dashboard.js';
import { renderHabits } from '../features/habit.js';
import { renderSleep } from '../features/sleep.js';
import { renderStats } from '../features/stats.js';
import { renderSettings } from '../features/settings.js';
// ↓ Sudah dipindah ke js/features/game/ (Sprint 4)
import { renderGame, PIXEL } from '../features/game/canvas.js';

export function navigateTo(page) {
  const prevPage = S.currentPage;
  qsa('.page').forEach(p => p.classList.remove('active'));
  const pg = el('page-' + page);
  if(pg) { void pg.offsetWidth; pg.classList.add('active'); } // reflow paksa biar animasi enter selalu retrigger
  qsa('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  qsa('.bnav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  const titles = { dashboard:'Dashboard', todo:'Todo', habit:'Habit Tracker', journal:'Journal', sholat:'Sholat', sleep:'Sleep Tracker', water:'Water Tracker', goals:'Goals', stats:'Statistik', activity:'Log Aktivitas', game:'⚔️ Habit Quest', settings:'Pengaturan' };
  const tb = el('topbarTitle'); if(tb) tb.textContent = titles[page] || page;
  S.currentPage = page;
  closeSidebar();
  // Widget animasi pixel cuma perlu jalan pas di Dashboard — matiin kalau pindah
  // halaman lain biar ngga makan CPU/baterai di background terus-terusan.
  if(prevPage === 'dashboard' && page !== 'dashboard') PIXEL.stop();
  switch(page) {
    case 'dashboard':
      renderDashboard();
      setTimeout(() => { if(el('pixelCanvas') && !PIXEL.anim) PIXEL.init(); }, 100);
      break;
    case 'todo': renderTodos(); break;
    case 'habit': renderHabits(); break;
    case 'journal':
      // Kalau journalDate sudah tidak sama dengan today (misal timezone shift), sync ulang
      if(S.journalDate !== today() && !S._journalManualNav) S.journalDate = today();
      renderJournal();
      break;
    case 'sholat': renderSholat(); break;
    case 'sleep': renderSleep(); break;
    case 'water': renderWater(); break;
    case 'goals': renderGoals(); break;
    case 'stats': renderStats(); break;
    case 'activity': renderActivity(); break;
    case 'game': renderGame(); break;
    case 'settings': renderSettings(); break;
  }
}
export function openSidebar() {
  el('sidebar').classList.add('open');
  el('sidebarOverlay').classList.add('visible');
}
export function closeSidebar() {
  el('sidebar').classList.remove('open');
  el('sidebarOverlay').classList.remove('visible');
}
