/* ===== WEEKLY REVIEW ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { DB } from '../core/db.js';
import { KV, today, el, qsa, fmtShort, escHtml, getMondayOfWeek, getWeekDays } from '../core/utils.js';
import { openModal, closeModal } from '../core/modal.js';
import { isHabitScheduledOn } from './habit.js';

// ===== WEEKLY REVIEW =====
async function generateWeeklyReview(mondayStr) {
  // Load semua data
  const [todos, habits, hLogs, journals, sleepLogs, waterLogs, sholatLogs] = await Promise.all([
    DB.getAll('todos'), DB.getAll('habits'), DB.getAll('habitLogs'),
    DB.getAll('journals'), DB.getAll('sleepLogs'), DB.getAll('waterLogs'),
    DB.getAll('sholatLogs')
  ]);

  const weekDays = getWeekDays(mondayStr);
  const sunday = weekDays[6];

  // Filter data minggu ini
  const inWeek = d => d >= mondayStr && d <= sunday;
  const rTodos   = todos.filter(t => t.done && t.doneAt && inWeek(t.doneAt));
  const rHLogs   = hLogs.filter(l => inWeek(l.date));
  const rJournals= journals.filter(j => inWeek(j.date));
  const rSleep   = sleepLogs.filter(s => inWeek(s.date));
  const rWater   = waterLogs.filter(w => inWeek(w.date));
  const rSholat  = sholatLogs.filter(s => inWeek(s.date));

  // Habit stats — "possible" dihitung dari hari yang emang terjadwal buat habit
  // ini dalam seminggu (bukan hardcode 7), jadi habit 3x/minggu yang kekejar
  // penuh bakal kebaca 3/3 (100%), bukan 3/7 (43%).
  const habitStats = habits.map(h => {
    const effDays = weekDays.filter(d => (!h.createdAt || d >= h.createdAt) && isHabitScheduledOn(h, d));
    const done = effDays.filter(d => hLogs.some(l => l.habitId===h.id && l.date===d)).length;
    const possible = effDays.length || 1;
    return { ...h, done, possible, pct: Math.round(done/possible*100) };
  }).sort((a,b) => b.pct - a.pct);

  // Sholat
  const totalSholat = rSholat.reduce((acc,s) => acc + Object.values(s.prayers||{}).filter(Boolean).length, 0);

  // Sleep
  const avgSleep = rSleep.length ? (rSleep.reduce((a,b)=>a+b.duration,0)/rSleep.length).toFixed(1) : 0;

  // Water
  const waterDays = {};
  rWater.forEach(w => { waterDays[w.date] = (waterDays[w.date]||0)+1; });
  const avgWater = Object.values(waterDays).length
    ? (Object.values(waterDays).reduce((a,b)=>a+b,0)/Object.values(waterDays).length).toFixed(1) : 0;

  // Mood
  const moodCounts = {happy:0,neutral:0,sad:0,excited:0,tired:0};
  rJournals.forEach(j => { if(j.mood && moodCounts[j.mood]!==undefined) moodCounts[j.mood]++; });
  const topMood = Object.entries(moodCounts).filter(([,c])=>c>0).sort((a,b)=>b[1]-a[1])[0];

  // Best & worst habit (berdasarkan persentase, biar adil buat habit dengan target beda-beda)
  const bestHabit  = habitStats[0];
  const worstHabit = habitStats[habitStats.length-1];

  // Motivational message berdasarkan performa
  const totalHabitDone = rHLogs.length;
  const totalHabitPossible = habitStats.reduce((sum,h) => sum + h.possible, 0);
  const habitRate = totalHabitPossible ? totalHabitDone/totalHabitPossible : 0;
  const sholatRate = totalSholat/35;

  let message = '';
  if(habitRate >= 0.9 && sholatRate >= 0.9) {
    message = `Luar biasa Azhar! Minggu ini kamu hampir sempurna — habit ${Math.round(habitRate*100)}% dan sholat ${Math.round(sholatRate*100)}%. Pertahankan momentum ini! 🚀`;
  } else if(habitRate >= 0.7) {
    message = `Minggu yang bagus! ${Math.round(habitRate*100)}% habit terpenuhi. ${bestHabit ? `"${bestHabit.name}" jadi habit terkuat kamu minggu ini.` : ''} Terus konsisten! 💪`;
  } else if(habitRate >= 0.5) {
    message = `Lumayan Azhar! Sudah lebih dari setengah habit terpenuhi. ${worstHabit && worstHabit.done===0 ? `"${worstHabit.name}" perlu lebih diperhatiin minggu depan.` : 'Semangat tingkatin lagi!'} 🔥`;
  } else if(rTodos.length >= 5) {
    message = `Habit masih perlu ditingkatkan, tapi kamu berhasil selesaikan ${rTodos.length} todo minggu ini. Fokus satu habit dulu minggu depan, yang paling mudah! 💡`;
  } else {
    message = `Minggu ini mungkin berat, dan itu tidak apa-apa. Yang penting kamu masih tracking dan masih peduli. Mulai minggu depan dengan satu langkah kecil. ❤️`;
  }

  return {
    mondayStr, sunday, weekDays,
    todos: rTodos, habits: habitStats, journals: rJournals,
    sleep: { avg: avgSleep, days: rSleep.length },
    water: { avg: avgWater },
    sholat: { total: totalSholat, pct: Math.round(sholatRate*100) },
    topMood, moodCounts, message,
    habitRate, sholatRate,
    totalHabitDone, totalHabitPossible,
    bestHabit, worstHabit
  };
}

function renderWeeklyReviewModal(review) {
  const moodEmoji = {happy:'😊',neutral:'😐',sad:'😔',excited:'🤩',tired:'😴'};
  const moodLabel = {happy:'Senang',neutral:'Biasa',sad:'Sedih',excited:'Semangat',tired:'Capek'};
  const startFmt = fmtShort(review.mondayStr+'T12:00:00');
  const endFmt   = fmtShort(review.sunday+'T12:00:00');

  el('weeklyReviewTitle').textContent = '📊 Weekly Review';
  el('weeklyReviewRange').textContent = `${startFmt} — ${endFmt}`;

  const habitRows = review.habits.slice(0,6).map(h => `
    <div class="wr-habit-row">
      <span class="wr-habit-name">${h.icon||'🔥'} ${escHtml(h.name)}</span>
      <div class="wr-habit-bar">
        <div class="wr-habit-fill" style="width:${h.pct}%;background:${h.color||'var(--primary)'}"></div>
      </div>
      <span class="wr-habit-pct">${h.done}/${h.possible}</span>
    </div>`).join('');

  const moodChips = Object.entries(review.moodCounts)
    .filter(([,c])=>c>0).sort((a,b)=>b[1]-a[1])
    .map(([m,c])=>`<div class="wr-mood-chip">${moodEmoji[m]} ${moodLabel[m]} <strong style="margin-left:3px">${c}x</strong></div>`).join('');

  // Grade minggu ini
  const grade = review.habitRate >= 0.9 ? {label:'S', color:'#FFD700'} :
                review.habitRate >= 0.7 ? {label:'A', color:'#43E97B'} :
                review.habitRate >= 0.5 ? {label:'B', color:'#4ECDC4'} :
                review.habitRate >= 0.3 ? {label:'C', color:'#FF8C42'} :
                                          {label:'D', color:'#FF6B6B'};

  el('weeklyReviewBody').innerHTML = `
    <div class="wr-header">
      <div class="wr-week-label">${startFmt} — ${endFmt}</div>
      <div class="wr-title">Minggu yang ${review.habitRate>=0.7?'Produktif':'Penuh Pelajaran'} 🌟</div>
      <div class="wr-subtitle">Grade minggu ini: <strong style="font-size:1.1rem;color:${grade.color}">${grade.label}</strong></div>
    </div>

    <div class="wr-stats-grid">
      <div class="wr-stat-box">
        <div class="wr-stat-val">${review.totalHabitDone}</div>
        <div class="wr-stat-lbl">Habit Done</div>
        <div class="wr-stat-sub">dari ${review.totalHabitPossible} target</div>
      </div>
      <div class="wr-stat-box">
        <div class="wr-stat-val">${review.sholat.total}</div>
        <div class="wr-stat-lbl">Waktu Sholat</div>
        <div class="wr-stat-sub">${review.sholat.pct}% dari 35</div>
      </div>
      <div class="wr-stat-box">
        <div class="wr-stat-val">${review.todos.length}</div>
        <div class="wr-stat-lbl">Todo Selesai</div>
        <div class="wr-stat-sub">minggu ini</div>
      </div>
      <div class="wr-stat-box">
        <div class="wr-stat-val">${review.sleep.avg||'—'}</div>
        <div class="wr-stat-lbl">Rata-rata Tidur</div>
        <div class="wr-stat-sub">jam/malam</div>
      </div>
      <div class="wr-stat-box">
        <div class="wr-stat-val">${review.journals.length}</div>
        <div class="wr-stat-lbl">Jurnal Ditulis</div>
        <div class="wr-stat-sub">dari 7 hari</div>
      </div>
      <div class="wr-stat-box">
        <div class="wr-stat-val">${review.water.avg||'—'}</div>
        <div class="wr-stat-lbl">Rata-rata Air</div>
        <div class="wr-stat-sub">gelas/hari</div>
      </div>
    </div>

    <div class="wr-message-box">
      <div class="wr-message">${review.message}</div>
    </div>

    ${review.habits.length > 0 ? `
    <div class="wr-section">
      <div class="wr-section-title">🔥 Habit Tracker</div>
      ${habitRows}
      ${review.bestHabit ? `<p style="font-size:.75rem;color:var(--text3);margin-top:6px">⭐ Terbaik: <strong>${review.bestHabit.name}</strong> (${review.bestHabit.done}/${review.bestHabit.possible})</p>` : ''}
    </div>` : ''}

    ${moodChips ? `
    <div class="wr-section">
      <div class="wr-section-title">😊 Mood Minggu Ini</div>
      <div class="wr-mood-row">${moodChips}</div>
    </div>` : ''}

    ${review.todos.length > 0 ? `
    <div class="wr-section">
      <div class="wr-section-title">✅ Todo Selesai</div>
      ${review.todos.slice(0,5).map(t=>`
        <div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);font-size:.8rem;color:var(--text2)">
          <span style="color:${{high:'#FF6B6B',medium:'#F9CA24',low:'#43E97B'}[t.priority]||'#999'}">●</span>
          ${escHtml(t.title)}
        </div>`).join('')}
      ${review.todos.length>5?`<p style="font-size:.72rem;color:var(--text3);margin-top:5px">...dan ${review.todos.length-5} lainnya</p>`:''}
    </div>` : ''}
  `;
  openModal('weeklyReviewModal');
}

export async function showWeeklyReview(mondayStr) {
  const body = el('weeklyReviewBody');
  if(body) body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3)">Memuat...</div>';
  openModal('weeklyReviewModal');
  const review = await generateWeeklyReview(mondayStr);
  renderWeeklyReviewModal(review);
  // Simpan ke history
  await saveWeeklyReviewHistory(review);
}

async function saveWeeklyReviewHistory(review) {
  const history = await KV.get('weekly_review_history', []);
  const existing = history.findIndex(h => h.mondayStr === review.mondayStr);
  const entry = {
    mondayStr: review.mondayStr,
    sunday: review.sunday,
    grade: review.habitRate >= 0.9 ? 'S' : review.habitRate >= 0.7 ? 'A' : review.habitRate >= 0.5 ? 'B' : review.habitRate >= 0.3 ? 'C' : 'D',
    habitDone: review.totalHabitDone,
    habitTotal: review.totalHabitPossible,
    todoDone: review.todos.length,
    sholat: review.sholat.total,
    message: review.message,
    savedAt: today()
  };
  if(existing >= 0) history[existing] = entry;
  else history.unshift(entry);
  // Simpan max 12 minggu
  await KV.set('weekly_review_history', history.slice(0,12));
}

export async function showWeeklyHistory() {
  const history = await KV.get('weekly_review_history', []);
  const body = el('weeklyHistoryBody');
  if(!body) return;
  if(!history.length) {
    body.innerHTML = '<div class="empty-state"><p>Belum ada riwayat weekly review</p></div>';
  } else {
    const gradeColor = {S:'#FFD700',A:'#43E97B',B:'#4ECDC4',C:'#FF8C42',D:'#FF6B6B'};
    body.innerHTML = history.map(h => `
      <div class="wr-history-item" data-monday="${h.mondayStr}">
        <div class="wr-history-date">
          <span style="font-size:1rem;font-weight:700;color:${gradeColor[h.grade]||'var(--primary)'}">${h.grade}</span>
          &nbsp; ${fmtShort(h.mondayStr+'T12:00:00')} — ${fmtShort(h.sunday+'T12:00:00')}
        </div>
        <div class="wr-history-summary">
          🔥 ${h.habitDone}/${h.habitTotal} habit &nbsp;·&nbsp;
          🕌 ${h.sholat}/35 sholat &nbsp;·&nbsp;
          ✅ ${h.todoDone} todo
        </div>
      </div>`).join('');
    // Click to view detail
    qsa('.wr-history-item', body).forEach(item => {
      item.addEventListener('click', async () => {
        closeModal('weeklyHistoryModal');
        await showWeeklyReview(item.dataset.monday);
      });
    });
  }
  openModal('weeklyHistoryModal');
}

// Auto trigger setiap Minggu malam jam 20:00
export async function checkWeeklyReviewTrigger() {
  const now2 = new Date();
  const isSunday = now2.getDay() === 0;
  const isEvening = now2.getHours() === 20 && now2.getMinutes() < 5;
  if(!isSunday || !isEvening) return;
  const lastShown = await KV.get('last_weekly_review_shown', null);
  const thisMonday = getMondayOfWeek(today());
  // Pastikan belum ditampilkan minggu ini
  if(lastShown === thisMonday) return;
  await KV.set('last_weekly_review_shown', thisMonday);
  // Delay 2 detik biar tidak langsung muncul
  setTimeout(() => showWeeklyReview(thisMonday), 2000);
}
