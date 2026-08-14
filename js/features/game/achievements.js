/* ===== ACHIEVEMENTS ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { DB } from '../../core/db.js';
import { S } from '../../core/state.js';
import { today, prevDay, showToast } from '../../core/utils.js';
import { calcStreak } from '../habit.js';
import { GS, loadGameState, saveGameState } from './engine.js';

export const ACHIEVEMENT_LIST = [
  { id:'streak7',      emoji:'🏆', name:'7 Hari Beruntun',         desc:'Streak habit 7 hari berturut-turut',       color:'#FFD700' },
  { id:'sleepTarget5', emoji:'🌙', name:'Night Owl → Early Bird',  desc:'5x tidur sesuai target',                    color:'#4A90D9' },
  { id:'istiqomah7',   emoji:'🕌', name:'Istiqomah',               desc:'Sholat lengkap 5 waktu, 7 hari beruntun',   color:'#43E97B' },
  { id:'hidrasi30',    emoji:'💧', name:'Hidrasi Master',          desc:'Target air minum tercapai 30 hari',         color:'#00BCD4' },
  { id:'bossSlayer3',  emoji:'⚔️', name:'Boss Slayer',             desc:'Kalahkan 3 boss',                           color:'#FF6B35' },
];

// Wrapper serialisasi: kalau checkAchievements() dipanggil lagi sebelum panggilan
// sebelumnya selesai (misal toggle 2 habit hampir bersamaan), antrian ini mastiin
// tiap panggilan nunggu giliran, jadi ngga ada 2 proses load/save GS yang overlap
// dan berpotensi saling menimpa (race condition).
let _achievementCheckChain = Promise.resolve();
export function checkAchievements() {
  _achievementCheckChain = _achievementCheckChain.then(() => _checkAchievementsImpl()).catch(e => console.error('checkAchievements error:', e));
  return _achievementCheckChain;
}
async function _checkAchievementsImpl() {
  // Pastikan GS terisi state terbaru dari DB, bukan default kosong —
  // penting karena fungsi ini bisa dipanggil dari halaman selain Game
  // (misal Habit, Sleep, Sholat, Water) yang belum pernah trigger loadGameState().
  await loadGameState();
  const [habits, hLogs, sleepLogs, sholatLogs, waterLogs] = await Promise.all([
    DB.getAll('habits'), DB.getAll('habitLogs'), DB.getAll('sleepLogs'),
    DB.getAll('sholatLogs'), DB.getAll('waterLogs')
  ]);

  const newlyUnlocked = [];
  const unlock = id => {
    if (!GS.achievementsUnlocked.includes(id)) {
      GS.achievementsUnlocked.push(id);
      newlyUnlocked.push(id);
    }
  };

  // 1. Streak habit 7 hari berturut-turut (habit manapun)
  const maxStreak = habits.reduce((m, h) => Math.max(m, calcStreak(h.id, hLogs, h)), 0);
  if (maxStreak >= 7) unlock('streak7');

  // 2. Tidur sesuai target minimal 5x (tidak harus beruntun)
  const sleepTarget = S.settings.sleepTarget || 8;
  const sleepHits = sleepLogs.filter(s => s.duration >= sleepTarget).length;
  if (sleepHits >= 5) unlock('sleepTarget5');

  // 3. Sholat lengkap (5 waktu) 7 hari berturut-turut, dihitung mundur dari hari ini
  let istiqomahStreak = 0, cur = today();
  for (let i = 0; i < 400; i++) {
    const log = sholatLogs.find(s => s.date === cur);
    const complete = log && Object.values(log.prayers || {}).filter(Boolean).length >= 5;
    if (complete) { istiqomahStreak++; cur = prevDay(cur); } else break;
  }
  if (istiqomahStreak >= 7) unlock('istiqomah7');

  // 4. Target air minum tercapai di 30 hari berbeda (tidak harus beruntun)
  const waterTarget = S.settings.waterTarget || 8;
  const waterByDate = {};
  waterLogs.forEach(w => { waterByDate[w.date] = (waterByDate[w.date] || 0) + 1; });
  const hidrasiDays = Object.values(waterByDate).filter(c => c >= waterTarget).length;
  if (hidrasiDays >= 30) unlock('hidrasi30');

  // 5. Kalahkan minimal 3 boss
  if (GS.bossDefeated.length >= 3) unlock('bossSlayer3');

  if (newlyUnlocked.length > 0) {
    await saveGameState();
    newlyUnlocked.forEach(id => {
      const a = ACHIEVEMENT_LIST.find(x => x.id === id);
      if (a) showToast(`🏅 Achievement unlocked: ${a.emoji} ${a.name}!`, 3500);
    });
  }
  return newlyUnlocked;
}

