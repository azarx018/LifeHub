/* ===== LEGACY (belum dipecah) ===== */
// File sementara hasil Sprint 1-5: berisi setupEvents() — wiring semua
// tombol/form ke fitur yang tersebar di js/features/*.js, js/features/game/,
// dan js/pdf/. Ini satu-satunya bagian besar app.js v5.7 yang belum
// dipecah lebih lanjut (Sprint 6+ bisa memisahkannya per-halaman kalau perlu).

import { DB } from './core/db.js';
import { S } from './core/state.js';
import { APP_VERSION } from './core/version.js';
import { KV, uid, today, now, el, qs, qsa, fmt, fmtShort, showToast, escHtml, getMondayOfWeek, getWeekDays, prevDay, nextDay } from './core/utils.js';
import { openModal, closeModal, closeAllModals, confirm2, getConfirmCb } from './core/modal.js';
import { navigateTo, openSidebar, closeSidebar } from './core/router.js';
import { requestNotificationPermission, showPushNotif, scheduleNotifications, clearNotificationTimers } from './core/notifications.js';
// ↓ Sprint 2: fitur yang sudah dipindah ke js/features/, dipakai lagi di
// sini cuma buat wiring tombol di setupEvents().
import { openTodoModal, saveTodo } from './features/todo.js';
import { openJournalModal, saveJournal } from './features/journal.js';
import { renderSholat } from './features/sholat.js';
import { renderWater, addWater } from './features/water.js';
import { renderGoals, openGoalModal, saveGoal, saveMilestone } from './features/goals.js';
import { renderActivity, getDateRange, inRange, daysBetween } from './features/activity.js';
// ↓ Sprint 3: fitur yang sudah dipindah ke js/features/.
import { renderDashboard } from './features/dashboard.js';
import { renderHabits, openHabitModal, saveHabit, calcStreak, isHabitScheduledOn, toggleHabitLog, countScheduledDaysInRange } from './features/habit.js';
import { renderSleep, openSleepModal, saveSleep, endSleepSession } from './features/sleep.js';
import { renderStats } from './features/stats.js';
import { renderSettings, saveSettings, exportData, importData, doAutoBackup } from './features/settings.js';
// ↓ Sprint 4: Habit Quest RPG (engine, achievements, canvas/UI) sudah
// dipindah ke js/features/game/.
import { renderGame, PIXEL } from './features/game/canvas.js';
import { checkAchievements } from './features/game/achievements.js';
// ↓ Sprint 5: Prayer Calculator, PDF Generator, Weekly Review sudah dipindah.
import { getLocation, initPrayerTimes, renderPrayerCountdown } from './features/prayer.js';
import { generatePDF } from './pdf/generator.js';
import { showWeeklyReview, showWeeklyHistory, checkWeeklyReviewTrigger } from './features/weeklyReview.js';


// ===== QUOTES ===== (pindah ke js/features/ — Sprint 3)

// ===== DONUT CHART ===== (pindah ke js/features/ — Sprint 3)

// ===== PRAYER TIME CALCULATOR ===== (pindah ke js/features/ — Sprint 5)

// ===== SLEEP SESSION ===== (pindah ke js/features/ — Sprint 3)

// ===== CLOCK ===== (pindah ke js/features/ — Sprint 3)

// ===== DASHBOARD ===== (pindah ke js/features/ — Sprint 3)

// ===== TODO ===== (pindah ke js/features/todo.js — Sprint 2)

// ===== HABIT ===== (pindah ke js/features/ — Sprint 3)

// ===== JOURNAL ===== (pindah ke js/features/journal.js — Sprint 2)

// ===== SHOLAT ===== (pindah ke js/features/sholat.js — Sprint 2)

// ===== SLEEP ===== (pindah ke js/features/ — Sprint 3)

// ===== WATER ===== (pindah ke js/features/water.js — Sprint 2)

// ===== GOALS ===== (pindah ke js/features/goals.js — Sprint 2)

// ===== STATS ===== (pindah ke js/features/ — Sprint 3)

// ===== SETTINGS ===== (pindah ke js/features/ — Sprint 3)

// ===== EVENT LISTENERS =====
export function setupEvents() {
  // Menu
  el('menuBtn').addEventListener('click', openSidebar);
  el('sidebarClose').addEventListener('click', closeSidebar);
  el('sidebarOverlay').addEventListener('click', closeSidebar);
  // Nav
  qsa('.nav-item').forEach(n => n.addEventListener('click', e => { e.preventDefault(); navigateTo(n.dataset.page); }));
  qsa('.bnav-item').forEach(n => n.addEventListener('click', e => { e.preventDefault(); navigateTo(n.dataset.page); }));
  // Modal close
  el('modalBackdrop').addEventListener('click', closeAllModals);
  qsa('.modal-close').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.modal)));
  qsa('[data-modal]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.modal)));
  // Confirm
  el('confirmNo').addEventListener('click', () => closeModal('confirmModal'));
  el('confirmYes').addEventListener('click', () => { const cb = getConfirmCb(); if(cb){cb();} closeModal('confirmModal'); });
  // Dashboard Mood
  el('dashMoodRow').addEventListener('click', async e => {
    const btn = e.target.closest('.mood-btn'); if(!btn) return;
    await KV.set('mood_'+today(), btn.dataset.mood);
    renderDashboard();
  });
  el('dashAddWater').addEventListener('click', async () => { await addWater(); renderDashboard(); });
  // TODO
  el('btnAddTodo').addEventListener('click', () => openTodoModal());
  el('btnSaveTodo').addEventListener('click', saveTodo);
  el('todoSearch').addEventListener('input', e => { S.todoSearch = e.target.value; renderTodos(); });
  qsa('.filter-btn[data-filter]').forEach(b => b.addEventListener('click', () => {
    qsa('.filter-btn[data-filter]').forEach(bb => bb.classList.remove('active'));
    b.classList.add('active'); S.todoFilter = b.dataset.filter; renderTodos();
  }));
  qsa('.filter-btn[data-priority]').forEach(b => b.addEventListener('click', () => {
    qsa('.filter-btn[data-priority]').forEach(bb => bb.classList.remove('active'));
    b.classList.add('active'); S.todoPriority = b.dataset.priority; renderTodos();
  }));
  // HABIT
  el('btnAddHabit').addEventListener('click', () => openHabitModal());
  el('btnSaveHabit').addEventListener('click', saveHabit);
  el('habitPrevDay').addEventListener('click', () => { const d=new Date(S.habitDate+'T12:00:00'); d.setDate(d.getDate()-1); S.habitDate=d.toISOString().slice(0,10); renderHabits(); });
  el('habitNextDay').addEventListener('click', () => { const d=new Date(S.habitDate+'T12:00:00'); d.setDate(d.getDate()+1); S.habitDate=d.toISOString().slice(0,10); renderHabits(); });
  el('habitIconPicker').addEventListener('click', e => {
    const btn = e.target.closest('.icon-opt'); if(!btn) return;
    qsa('.icon-opt', el('habitIconPicker')).forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected'); el('habitIcon').value = btn.dataset.icon;
  });
  el('habitDayPicker').addEventListener('click', e => {
    const btn = e.target.closest('.day-opt'); if(!btn) return;
    btn.classList.toggle('selected'); // multi-select, beda sama icon picker yang single-select
  });
  // JOURNAL
  el('btnAddJournal').addEventListener('click', () => openJournalModal());
  el('btnSaveJournal').addEventListener('click', saveJournal);
  el('journalSearch').addEventListener('input', e => { S.journalSearch = e.target.value; renderJournal(); });
  el('journalPrevDay').addEventListener('click', () => {
    const d = new Date(S.journalDate+'T12:00:00'); d.setDate(d.getDate()-1);
    S.journalDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    S._journalManualNav = S.journalDate !== today(); // tandai manual jika bukan hari ini
    renderJournal();
  });
  el('journalNextDay').addEventListener('click', () => {
    if(S.journalDate >= today()) return;
    const d = new Date(S.journalDate+'T12:00:00'); d.setDate(d.getDate()+1);
    S.journalDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    S._journalManualNav = S.journalDate !== today();
    renderJournal();
  });
  document.getElementById('journalModal').addEventListener('click', e => {
    const btn = e.target.closest('.mood-btn'); if(!btn) return;
    qsa('#journalModal .mood-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected'); el('journalMood').value = btn.dataset.mood;
  });
  // SHOLAT
  el('sholatPrevDay').addEventListener('click', () => { const d=new Date(S.sholatDate+'T12:00:00'); d.setDate(d.getDate()-1); S.sholatDate=d.toISOString().slice(0,10); renderSholat(); });
  el('sholatNextDay').addEventListener('click', () => { const d=new Date(S.sholatDate+'T12:00:00'); d.setDate(d.getDate()+1); S.sholatDate=d.toISOString().slice(0,10); renderSholat(); });
  // SLEEP
  el('btnAddSleep').addEventListener('click', () => openSleepModal());
  el('btnSaveSleep').addEventListener('click', saveSleep);
  el('btnEditSleepTarget').addEventListener('click', () => {
    const newTarget = prompt('Target tidur (jam):', S.settings.sleepTarget||8);
    if(newTarget && !isNaN(newTarget)) { S.settings.sleepTarget = parseInt(newTarget); saveSettings(); renderSleep(); }
  });
  // Wake quality buttons (inside wakeModal)
  qsa('.wake-quality-btn').forEach(btn => {
    btn.addEventListener('click', () => endSleepSession(parseInt(btn.dataset.quality)));
  });
  const _btnSleepWarnOk = el('btnSleepWarnOk');
  if(_btnSleepWarnOk) _btnSleepWarnOk.addEventListener('click', () => closeModal('sleepWarnModal'));
  // WATER
  el('btnAddWaterMain').addEventListener('click', addWater);
  el('btnResetWater').addEventListener('click', async () => {
    confirm2('Reset air minum hari ini?', async () => {
      const logs = await DB.getAll('waterLogs');
      const dayLogs = logs.filter(w => w.date === S.waterDate);
      for(const l of dayLogs) await DB.delete('waterLogs', l.id);
      renderWater(); showToast('Air direset');
    });
  });
  el('waterTargetInput').addEventListener('change', async e => {
    const val = parseInt(e.target.value);
    if(val && val > 0) { S.settings.waterTarget = val; saveSettings(); renderWater(); showToast('Target diperbarui'); }
  });
  el('waterPrevDay').addEventListener('click', () => {
    const d = new Date(S.waterDate+'T12:00:00'); d.setDate(d.getDate()-1);
    S.waterDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    renderWater();
  });
  el('waterNextDay').addEventListener('click', () => {
    if(S.waterDate >= today()) return;
    const d = new Date(S.waterDate+'T12:00:00'); d.setDate(d.getDate()+1);
    S.waterDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    renderWater();
  });
  // GOALS
  el('btnAddGoal').addEventListener('click', () => openGoalModal());
  el('btnSaveGoal').addEventListener('click', saveGoal);
  el('btnSaveMilestone').addEventListener('click', saveMilestone);
  el('goalIconPicker').addEventListener('click', e => {
    const btn = e.target.closest('.icon-opt'); if(!btn) return;
    qsa('.icon-opt', el('goalIconPicker')).forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected'); el('goalIcon').value = btn.dataset.icon;
  });
  // SETTINGS
  el('darkModeToggle').addEventListener('change', e => { S.settings.darkMode = e.target.checked; saveSettings(); });
  el('btnAddCountdown').addEventListener('click', addCountdownTarget);
  el('countdownTypePicker').addEventListener('click', e => {
    const btn = e.target.closest('.day-opt'); if(!btn) return;
    qsa('.day-opt', el('countdownTypePicker')).forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected'); // single-select, beda sama day-picker habit yang multi-select
  });
  el('btnExport').addEventListener('click', exportData);
  el('btnBackupNow').addEventListener('click', async () => {
    await doAutoBackup();
    renderSettings();
  });

  // WEEKLY REVIEW
  el('btnWeeklyReview').addEventListener('click', async () => {
    const monday = getMondayOfWeek(today());
    await showWeeklyReview(monday);
  });
  el('btnWeeklyReviewHistory').addEventListener('click', async () => {
    closeModal('weeklyReviewModal');
    await showWeeklyHistory();
  });
  el('btnImport').addEventListener('click', () => el('importFile').click());
  el('importFile').addEventListener('change', e => { if(e.target.files[0]) importData(e.target.files[0]); });
  el('btnReset').addEventListener('click', () => confirm2('Reset SEMUA data? Ini tidak bisa dibatalkan!', async () => {
    await DB.clearAll();
    S.settings = { name:'Azhar', darkMode:false, sleepTarget:8, waterTarget:8 };
    await KV.set('lifehub_settings', S.settings);
    showToast('Data direset'); navigateTo('dashboard');
  }));
  el('settingName').addEventListener('change', e => { S.settings.name = e.target.value.trim()||'Azhar'; saveSettings(); el('greetName').textContent = S.settings.name; });

  // NOTIFICATIONS
  const _notifToggle = el('notifToggle');
  if(_notifToggle) _notifToggle.addEventListener('change', async e => {
    if(e.target.checked) {
      const granted = await requestNotificationPermission();
      if(!granted) { e.target.checked = false; return; }
    }
    await KV.set('notif_enabled', e.target.checked);
    const _nts = el('notifTimeSettings');
    if(_nts) _nts.style.display = e.target.checked ? 'block' : 'none';
    if(e.target.checked) { await scheduleNotifications(); showToast('🔔 Notifikasi diaktifkan'); }
    else { clearNotificationTimers(); showToast('🔕 Notifikasi dimatikan'); }
  });
  const _notifMorning = el('notifMorning');
  if(_notifMorning) _notifMorning.addEventListener('change', async e => {
    await KV.set('notif_morning', e.target.value);
    await scheduleNotifications();
    showToast('⏰ Jadwal pagi diperbarui ke ' + e.target.value);
  });
  const _notifEvening = el('notifEvening');
  if(_notifEvening) _notifEvening.addEventListener('change', async e => {
    await KV.set('notif_evening', e.target.value);
    await scheduleNotifications();
    showToast('🌙 Jadwal malam diperbarui ke ' + e.target.value);
  });
  const _btnTestNotif = el('btnTestNotif');
  if(_btnTestNotif) _btnTestNotif.addEventListener('click', async () => {
    const granted = await requestNotificationPermission();
    if(!granted) return;
    await showPushNotif('🔔 Test LifeHub', `Hei ${S.settings.name}! Notifikasi berfungsi dengan baik ✅`);
    showToast('Notifikasi test dikirim!');
  });

  // ACTIVITY LOG
  const _btnPDF = el('btnDownloadPDF');
  if(_btnPDF) _btnPDF.addEventListener('click', generatePDF);

  el('activityPrevWeek').addEventListener('click', () => {
    S.activityWeekOffset--;
    renderActivity();
  });
  el('activityNextWeek').addEventListener('click', () => {
    if(S.activityWeekOffset >= 0) return;
    S.activityWeekOffset++;
    renderActivity();
  });

  // PRAYER LOCATION & REMINDER
  const _btnGetLoc = el('btnGetLocation');
  if(_btnGetLoc) _btnGetLoc.addEventListener('click', getLocation);
  const _btnRefreshLoc = el('btnRefreshLocation');
  if(_btnRefreshLoc) _btnRefreshLoc.addEventListener('click', getLocation);
  const _prayerReminderToggle = el('prayerReminderToggle');
  if(_prayerReminderToggle) {
    _prayerReminderToggle.addEventListener('change', async e => {
      if(e.target.checked) {
        const granted = await requestNotificationPermission();
        if(!granted) { e.target.checked = false; showToast('Aktifkan izin notifikasi dulu'); return; }
      }
      await KV.set('prayer_reminder_enabled', e.target.checked);
      showToast(e.target.checked ? '🕌 Reminder sholat aktif' : 'Reminder sholat dimatikan');
    });
  }
  const _prayerReminderMin = el('prayerReminderMinutes');
  if(_prayerReminderMin) {
    _prayerReminderMin.addEventListener('change', async e => {
      await KV.set('prayer_reminder_minutes', parseInt(e.target.value));
      showToast('Pengaturan reminder disimpan');
    });
  }
}

// ===== ACTIVITY LOG v2.0 ===== (pindah ke js/features/activity.js — Sprint 2)

// ===== PDF GENERATOR ===== (pindah ke js/features/ — Sprint 5)


// ===== HABIT QUEST RPG + ACHIEVEMENTS ===== (pindah ke js/features/game/ — Sprint 4)

// ===== WEEKLY REVIEW ===== (pindah ke js/features/ — Sprint 5)

// ===== PIXEL + window exposure ===== (pindah ke js/features/game/ — Sprint 4)


// Pause widget animasi pas app di-minimize/HP dikunci (hemat baterai),
// lanjut lagi otomatis pas dibuka kembali kalau posisinya di Dashboard.
document.addEventListener('visibilitychange', () => {
  if(document.hidden) {
    PIXEL.stop();
  } else if(S.currentPage === 'dashboard' && el('pixelCanvas') && !PIXEL.anim) {
    PIXEL.init();
  }
});
