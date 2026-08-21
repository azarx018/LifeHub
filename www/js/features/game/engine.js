/* ===== HABIT QUEST RPG v3.1 — ENGINE ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
// State, leveling, stat sync, dan battle actions (attack/skill/boss turn).
// UI rendering (renderGame/renderGameUI/drawGameCanvas) ada di ./canvas.js.
import { DB } from '../../core/db.js';
import { S } from '../../core/state.js';
import { KV, uid, today, prevDay, getMondayOfWeek, getWeekDays, showToast } from '../../core/utils.js';
import { calcStreak, isHabitScheduledOn } from '../habit.js';
import { checkAchievements } from './achievements.js';
// renderGameUI ada di canvas.js — circular import ini aman karena semua
// pemanggilan terjadi di dalam function body (battle actions), bukan top-level.
import { renderGameUI } from './canvas.js';

const MAX_LEVEL = 50;
const FREEDOM_LEVEL = 50; // level max = Freedom Day

export const LEVEL_TITLES = [
  'Pemula','Pemula','Pemula','Pemula','Pemula',
  'Petualang','Petualang','Petualang','Petualang','Petualang',
  'Pejuang','Pejuang','Pejuang','Pejuang','Pejuang',
  'Ksatria','Ksatria','Ksatria','Ksatria','Ksatria',
  'Pahlawan','Pahlawan','Pahlawan','Pahlawan','Pahlawan',
  'Master','Master','Master','Master','Master',
  'Grandmaster','Grandmaster','Grandmaster','Grandmaster','Grandmaster',
  'Legenda','Legenda','Legenda','Legenda','Legenda',
  'Mitos','Mitos','Mitos','Mitos','Mitos',
  'Dewa','Dewa','Dewa','Dewa','Dewa',
];

export const BOSS_POOL = [
  {id:'laziness',   name:'Lord of Laziness',     emoji:'😴', color:'#7B68EE', desc:'Setiap turn ada 30% chance serangan kamu gagal total.',     gimmick:'skip',    baseHp:300, baseDmg:25},
  {id:'distraction',name:'Distraction King',      emoji:'📱', color:'#FF6B35', desc:'HP sangat tinggi, serangan random antara 10-60 damage.',   gimmick:'random',  baseHp:500, baseDmg:35},
  {id:'insomnia',   name:'Insomnia Witch',         emoji:'🌙', color:'#4A90D9', desc:'Mengurangi AGI kamu -40%, speed serangan melambat.',       gimmick:'slow',    baseHp:350, baseDmg:30},
  {id:'junkfood',   name:'Junk Lord',              emoji:'🍔', color:'#8BC34A', desc:'Regen 15 HP setiap turn, harus diselesaikan cepat!',       gimmick:'regen',   baseHp:400, baseDmg:20},
  {id:'rage',       name:'Rage Dragon',            emoji:'🐉', color:'#FF4444', desc:'Setiap turn damage naik +5, makin lama makin mematikan.', gimmick:'enrage',  baseHp:280, baseDmg:15},
  {id:'overthink',  name:'Overthink Specter',      emoji:'🧠', color:'#9C27B0', desc:'Skill kamu ada 40% chance backfire dan kena diri sendiri.',gimmick:'backfire',baseHp:320, baseDmg:28},
  {id:'procrastin', name:'Procrastination Golem',  emoji:'⏰', color:'#795548', desc:'HP & defence sangat tinggi, tapi damage rendah.',          gimmick:'tank',    baseHp:800, baseDmg:12},
  {id:'demon',      name:'Weekly Demon',            emoji:'👹', color:'#E91E63', desc:'BOSS AKHIR — Semua gimmick aktif sekaligus. GL HF!',       gimmick:'all',     baseHp:1200,baseDmg:40},
];

// Hitung XP needed per level (makin tinggi makin banyak)
export const xpForLevel = lv => Math.floor(100 * Math.pow(1.15, lv - 1));
export const totalXpForLevel = lv => { let t=0; for(let i=1;i<lv;i++) t+=xpForLevel(i); return t; };

// Game state
export let GS = {
  level:1, xp:0, hp:100, maxHp:100,
  str:10, agi:10, int:10, spi:10,
  streakBonus:1.0, streakPenaltyDays:0,
  bossDefeated:[], currentWeekBoss:null, bossHp:0, bossMaxHp:0, bossEnrage:false,
  bossDmgMult:1, turnCount:0, battleActive:false,
  battleLog:[], freedomDayUsed:null,
  allBossesDefeated:false, skills:[],
  lastXpDate:null, achievementsUnlocked:[],
};

export async function loadGameState() {
  const saved = await KV.get('habit_quest_state', null);
  if(saved) GS = {...GS, ...saved};
}
export async function saveGameState() {
  await KV.set('habit_quest_state', GS);
}

// Hitung stats dari data LifeHub
export async function syncStatsFromLifeHub() {
  const [habits, hLogs, journals, sleepLogs, sholatLogs] = await Promise.all([
    DB.getAll('habits'), DB.getAll('habitLogs'), DB.getAll('journals'),
    DB.getAll('sleepLogs'), DB.getAll('sholatLogs')
  ]);

  // Streak bonus/penalty
  let maxStreak = 0;
  let hasDeadStreak = false;
  habits.forEach(h => {
    const streak = calcStreak(h.id, hLogs, h);
    maxStreak = Math.max(maxStreak, streak);
    // Cek streak mati (kemarin tidak done, hari sebelumnya done) — cuma valid
    // kalau kemarin emang jatah hari terjadwal habit ini, bukan "hari libur"-nya.
    const yday = prevDay(today());
    const dayB4 = prevDay(yday);
    const ydayScheduled = isHabitScheduledOn(h, yday);
    const doneYday  = hLogs.some(l=>l.habitId===h.id&&l.date===yday);
    const doneDayB4 = hLogs.some(l=>l.habitId===h.id&&l.date===dayB4);
    if(ydayScheduled && !doneYday && doneDayB4) hasDeadStreak = true;
  });

  if(maxStreak >= 30)      GS.streakBonus = 1.5;
  else if(maxStreak >= 14) GS.streakBonus = 1.25;
  else if(maxStreak >= 7)  GS.streakBonus = 1.1;
  else                     GS.streakBonus = 1.0;

  if(hasDeadStreak && GS.streakPenaltyDays <= 0) {
    GS.streakPenaltyDays = maxStreak >= 30 ? 5 : 3;
    addBattleLog('⚠️ Streak habit putus! Stat drop -20% selama '+GS.streakPenaltyDays+' hari!', 'warning');
  }
  if(GS.streakPenaltyDays > 0) {
    GS.streakBonus = Math.min(GS.streakBonus, 0.8);
  }

  // Hitung base stats dari habit logs 7 hari
  const monday = getMondayOfWeek(today());
  const weekDays = getWeekDays(monday);
  const weekLogs = hLogs.filter(l => weekDays.includes(l.date));

  // STR — dari habit fisik (workout, olahraga, dll)
  const physicalHabits = habits.filter(h => /workout|olahraga|gym|fitness|push|pull|squat|lari|jalan/i.test(h.name));
  const physDone = physicalHabits.length ? weekLogs.filter(l=>physicalHabits.some(h=>h.id===l.habitId)).length : weekLogs.length;
  GS.str = Math.floor(10 + physDone * 2 + GS.level * 1.5);

  // AGI — dari tidur
  const weekSleep = sleepLogs.filter(s=>weekDays.includes(s.date));
  const goodSleepDays = weekSleep.filter(s=>s.duration>=(GS.sleepTarget||8)).length;
  GS.agi = Math.floor(10 + goodSleepDays * 5 + GS.level * 1.2);

  // INT — dari jurnal & habit belajar
  const studyHabits = habits.filter(h=>/belajar|baca|read|study|nulis|journal/i.test(h.name));
  const journalThisWeek = journals.filter(j=>weekDays.includes(j.date)).length;
  GS.int = Math.floor(10 + journalThisWeek * 6 + studyHabits.length * 2 + GS.level * 1.2);

  // SPI — dari sholat
  const weekSholat = sholatLogs.filter(s=>weekDays.includes(s.date));
  const sholatDone = weekSholat.reduce((acc,s)=>acc+Object.values(s.prayers||{}).filter(Boolean).length,0);
  GS.spi = Math.floor(10 + sholatDone * 3 + GS.level * 1.5);

  // Max HP dari level + stats
  GS.maxHp = Math.floor(100 + GS.level * 15 + GS.str * 2);
  if(GS.hp > GS.maxHp) GS.hp = GS.maxHp;

  // Streak penalty countdown
  if(GS.streakPenaltyDays > 0 && GS.lastXpDate !== today()) {
    GS.streakPenaltyDays--;
  }

  await saveGameState();
}

// XP dari aktivitas hari ini
export async function earnDailyXP() {
  if(GS.lastXpDate === today()) return 0; // sudah dapat XP hari ini
  const [habits, hLogs, journals, sleepLogs, sholatLogs, waterLogs] = await Promise.all([
    DB.getAll('habits'), DB.getAll('habitLogs'), DB.getAll('journals'),
    DB.getAll('sleepLogs'), DB.getAll('sholatLogs'), DB.getAll('waterLogs')
  ]);

  let xpGained = 0; const reasons = [];

  // Habit done hari ini
  const todayHLogs = hLogs.filter(l=>l.date===today());
  if(todayHLogs.length>0) { const x=todayHLogs.length*10; xpGained+=x; reasons.push(`+${x} XP dari ${todayHLogs.length} habit`); }

  // Sholat hari ini
  const todaySholat = sholatLogs.find(s=>s.date===today());
  const sholatCount = todaySholat ? Object.values(todaySholat.prayers||{}).filter(Boolean).length : 0;
  if(sholatCount>0) { const x=sholatCount*15; xpGained+=x; reasons.push(`+${x} XP dari ${sholatCount} sholat`); }

  // Jurnal hari ini
  const todayJournal = journals.filter(j=>j.date===today()).length;
  if(todayJournal>0) { xpGained+=20; reasons.push('+20 XP dari jurnal'); }

  // Tidur cukup
  const yday = prevDay(today());
  const lastSleep = sleepLogs.find(s=>s.date===yday||s.date===today());
  if(lastSleep && lastSleep.duration>=(GS.sleepTarget||8)) { xpGained+=25; reasons.push('+25 XP tidur cukup'); }

  // Air minum target
  const wTarget = GS.waterTarget||8;
  const waterToday = waterLogs.filter(w=>w.date===today()).length;
  if(waterToday>=wTarget) { xpGained+=15; reasons.push('+15 XP target air'); }

  // Streak bonus
  if(GS.streakBonus > 1.0) {
    const bonus = Math.floor(xpGained * (GS.streakBonus - 1));
    xpGained += bonus;
    reasons.push(`+${bonus} XP streak bonus (x${GS.streakBonus})`);
  }

  // Streak penalty
  if(GS.streakPenaltyDays > 0) {
    const penalty = Math.floor(xpGained * 0.5);
    xpGained -= penalty;
    reasons.push(`-${penalty} XP streak penalty (${GS.streakPenaltyDays} hari lagi)`);
  }

  if(xpGained > 0) {
    GS.xp += xpGained;
    GS.lastXpDate = today();
    // Check level up
    await checkLevelUp();
    await saveGameState();
    reasons.forEach(r => addBattleLog(r, 'system'));
  }
  return xpGained;
}

export async function checkLevelUp() {
  let leveled = false;
  while(GS.level < MAX_LEVEL) {
    const needed = xpForLevel(GS.level);
    const currentLevelXp = GS.xp - totalXpForLevel(GS.level);
    if(currentLevelXp >= needed) {
      GS.level++;
      GS.hp = GS.maxHp; // full heal on level up
      leveled = true;
      addBattleLog(`🎉 LEVEL UP! Sekarang Level ${GS.level} — ${LEVEL_TITLES[GS.level-1]}!`, 'system');
      // Unlock skills
      checkSkillUnlocks();
      // Check freedom day
      if(GS.level >= MAX_LEVEL) {
        await triggerFreedomDay();
      }
    } else break;
  }
  return leveled;
}


export function checkSkillUnlocks() {
  const skillTree = [
    {level:5,  id:'heal',     name:'Healing Light', emoji:'💚', desc:'Pulihkan 30% HP', cost:0, color:'#43E97B'},
    {level:10, id:'smite',    name:'Holy Smite',    emoji:'✨', desc:'+50% damage sekali', cost:0, color:'#FFD700'},
    {level:15, id:'shield',   name:'Faith Shield',  emoji:'🛡️', desc:'Kurangi damage 50% 1 turn', cost:0, color:'#4ECDC4'},
    {level:20, id:'streak',   name:'Streak Burst',  emoji:'🔥', desc:'Damage = streak hari x5', cost:0, color:'#FF6B35'},
    {level:25, id:'prayer',   name:'Divine Prayer', emoji:'🤲', desc:'Boss skip 1 turn', cost:0, color:'#9C27B0'},
    {level:30, id:'thunder',  name:'Thunder Strike', emoji:'⚡', desc:'Damage x3, cooldown 3 turn', cost:0, color:'#6C63FF'},
    {level:40, id:'ultima',   name:'ULTIMA',        emoji:'💫', desc:'Damage masif = Level x20', cost:0, color:'#FF6584'},
  ];
  skillTree.forEach(skill => {
    if(GS.level >= skill.level && !GS.skills.find(s=>s.id===skill.id)) {
      GS.skills.push({...skill, cooldown:0});
      addBattleLog(`🔓 Skill baru unlocked: ${skill.emoji} ${skill.name}!`, 'system');
    }
  });
}

export async function triggerFreedomDay() {
  if(GS.freedomDayUsed === today()) return;
  GS.freedomDayUsed = today();
  GS.allBossesDefeated = true;
  await saveGameState();
  showToast('🎉 FREEDOM DAY! Kamu bebas hari ini!', 5000);
  // Mark semua habit done hari ini otomatis
  const habits = await DB.getAll('habits');
  const hLogs  = await DB.getAll('habitLogs');
  for(const h of habits) {
    if(!hLogs.some(l=>l.habitId===h.id&&l.date===today())) {
      await DB.put('habitLogs', {id:uid(), habitId:h.id, date:today(), freedomDay:true});
    }
  }
}

// Get weekly boss
export function getWeeklyBoss() {
  const monday = getMondayOfWeek(today());
  // Seed dari tanggal — biar consistent dalam 1 minggu
  const seed = monday.split('-').reduce((a,b)=>parseInt(a)+parseInt(b),0);
  // Cek apakah semua boss biasa sudah dikalahkan → spawn Weekly Demon
  const normalBosses = BOSS_POOL.slice(0,-1);
  const allNormalDefeated = normalBosses.every(b=>GS.bossDefeated.includes(b.id));
  if(allNormalDefeated) return BOSS_POOL[BOSS_POOL.length-1]; // Weekly Demon
  // Random dari yang belum dikalahkan
  const available = normalBosses.filter(b=>!GS.bossDefeated.includes(b.id));
  return available[seed % available.length];
}

export function calcBossStats(boss) {
  // Scale HP & damage berdasarkan level player + minggu ke berapa
  const weekNum = GS.bossDefeated.length + 1;
  const scaleMult = 1 + (weekNum-1)*0.25 + (GS.level/10)*0.3;
  return {
    hp:   Math.floor(boss.baseHp  * scaleMult),
    maxHp:Math.floor(boss.baseHp  * scaleMult),
    dmg:  Math.floor(boss.baseDmg * scaleMult),
  };
}

function addBattleLog(text, type='normal') {
  GS.battleLog.unshift({text, type, time: new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})});
  if(GS.battleLog.length > 20) GS.battleLog.pop();
}

function calcPlayerDamage() {
  const base = Math.floor((GS.str + GS.agi) / 2) + GS.level * 2;
  const variance = Math.floor(Math.random() * base * 0.3);
  return Math.floor((base + variance) * GS.streakBonus);
}

function calcBossDamage(bossDmg) {
  const variance = Math.floor(Math.random() * bossDmg * 0.4);
  return bossDmg + variance;
}

// ── BATTLE ACTIONS ──
export async function playerAttack() {
  if(!GS.battleActive) return;
  const boss = GS.currentWeekBoss;
  let dmg = calcPlayerDamage();
  let logText = '';

  // Gimmick checks
  if(boss.gimmick==='skip' && Math.random()<0.3) {
    addBattleLog('😴 Lord of Laziness membuatmu malas! Serangan GAGAL!', 'boss');
    await bossTurn(); return;
  }
  if(boss.gimmick==='backfire' && Math.random()<0.4) {
    const selfDmg = Math.floor(dmg*0.6);
    GS.hp = Math.max(1, GS.hp-selfDmg);
    addBattleLog(`🧠 Skill backfire! Kamu kena ${selfDmg} damage sendiri!`, 'boss');
    await bossTurn(); return;
  }
  if(boss.gimmick==='tank') dmg = Math.floor(dmg*0.5);

  GS.bossHp = Math.max(0, GS.bossHp - dmg);
  addBattleLog(`⚔️ Kamu menyerang ${boss.name}! -${dmg} HP`, 'player');

  if(GS.bossHp <= 0) { await bossDefeated(); return; }
  await bossTurn();
}

async function bossTurn() {
  const boss = GS.currentWeekBoss;
  GS.turnCount++;

  // Enrage check (>10 turns)
  if(GS.turnCount > 10 && !GS.bossEnrage) {
    GS.bossEnrage = true;
    GS.bossDmgMult = 2;
    addBattleLog(`😡 ${boss.name} ENRAGE! Damage x2!`, 'warning');
  }

  // Gimmick: regen
  if(boss.gimmick==='regen'||boss.gimmick==='all') {
    const regen = 15;
    GS.bossHp = Math.min(GS.bossMaxHp, GS.bossHp+regen);
    addBattleLog(`🍔 ${boss.name} regen +${regen} HP!`, 'boss');
  }
  // Gimmick: enrage per turn
  if(boss.gimmick==='enrage'||boss.gimmick==='all') {
    GS.bossDmgMult += 0.1;
  }

  const bossDmgBase = calcBossDamage(boss.baseDmg);
  let finalDmg = Math.floor(bossDmgBase * GS.bossDmgMult * (boss.gimmick==='random'? 0.5+Math.random()*2 : 1));

  // Shield check
  if(GS._shieldActive) { finalDmg = Math.floor(finalDmg*0.5); GS._shieldActive=false; addBattleLog('🛡️ Faith Shield menyerap setengah damage!', 'system'); }
  // Prayer check (boss skip)
  if(GS._prayerActive) { GS._prayerActive=false; addBattleLog('🤲 Divine Prayer! Boss skip 1 turn!', 'system'); await saveGameState(); renderGameUI(); return; }

  GS.hp = Math.max(0, GS.hp - finalDmg);
  addBattleLog(`💥 ${boss.name} menyerang! -${finalDmg} HP`, 'boss');

  if(GS.hp <= 0) {
    GS.hp = 0; GS.battleActive = false;
    addBattleLog(`💀 Kamu dikalahkan ${boss.name}! Latih lagi habitmu!`, 'warning');
    // Penalty: XP -10%
    GS.xp = Math.floor(GS.xp * 0.9);
    addBattleLog('📉 XP berkurang 10% karena kalah!', 'warning');
  }
  await saveGameState();
  renderGameUI();
}

export async function useSkill(skillId) {
  if(!GS.battleActive) return;
  const skill = GS.skills.find(s=>s.id===skillId);
  if(!skill || skill.cooldown>0) return;

  const boss = GS.currentWeekBoss;
  let logText='';

  if(skillId==='heal') {
    const healAmt=Math.floor(GS.maxHp*0.3);
    GS.hp=Math.min(GS.maxHp,GS.hp+healAmt);
    logText=`💚 Healing Light! +${healAmt} HP`;
    skill.cooldown=3;
  } else if(skillId==='smite') {
    const dmg=Math.floor(calcPlayerDamage()*1.5);
    GS.bossHp=Math.max(0,GS.bossHp-dmg);
    logText=`✨ Holy Smite! -${dmg} HP boss!`;
    skill.cooldown=4;
  } else if(skillId==='shield') {
    GS._shieldActive=true;
    logText=`🛡️ Faith Shield aktif! Turn berikutnya damage -50%`;
    skill.cooldown=5;
  } else if(skillId==='streak') {
    const habits=await DB.getAll('habits');
    const hLogs=await DB.getAll('habitLogs');
    let maxStreak=0;
    habits.forEach(h=>{ maxStreak=Math.max(maxStreak,calcStreak(h.id,hLogs,h)); });
    const dmg=maxStreak*5;
    GS.bossHp=Math.max(0,GS.bossHp-dmg);
    logText=`🔥 Streak Burst! Streak ${maxStreak} hari = -${dmg} HP boss!`;
    skill.cooldown=5;
  } else if(skillId==='prayer') {
    GS._prayerActive=true;
    logText=`🤲 Divine Prayer! Boss akan skip 1 turn!`;
    skill.cooldown=6;
  } else if(skillId==='thunder') {
    const dmg=calcPlayerDamage()*3;
    GS.bossHp=Math.max(0,GS.bossHp-dmg);
    logText=`⚡ Thunder Strike! -${dmg} HP boss!`;
    skill.cooldown=3;
  } else if(skillId==='ultima') {
    const dmg=GS.level*20;
    GS.bossHp=Math.max(0,GS.bossHp-dmg);
    logText=`💫 ULTIMA! Level ${GS.level} x20 = -${dmg} HP boss!`;
    skill.cooldown=8;
  }

  addBattleLog(logText,'player');
  if(GS.bossHp<=0) { await bossDefeated(); return; }
  await bossTurn();
}

async function bossDefeated() {
  const boss = GS.currentWeekBoss;
  GS.battleActive = false;
  GS.bossDefeated.push(boss.id);
  GS.turnCount = 0; GS.bossEnrage = false; GS.bossDmgMult = 1;

  // XP reward
  const xpReward = Math.floor(boss.baseHp * 2 + GS.level * 10);
  GS.xp += xpReward;
  addBattleLog(`🎊 ${boss.name} DIKALAHKAN! +${xpReward} XP!`, 'system');
  addBattleLog(`HP dipulihkan penuh!`, 'system');
  GS.hp = GS.maxHp;

  // Skill cooldown reduction
  GS.skills.forEach(s=>{ if(s.cooldown>0) s.cooldown--; });

  await checkLevelUp();

  // Cek apakah semua boss dikalahkan
  const allNormal = BOSS_POOL.slice(0,-1).every(b=>GS.bossDefeated.includes(b.id));
  if(allNormal) {
    addBattleLog('🔓 Semua boss normal dikalahkan! Weekly Demon akan datang!', 'system');
  }
  // Cek Weekly Demon dikalahkan = Freedom Day
  if(boss.id==='demon') {
    addBattleLog('👑 WEEKLY DEMON DIKALAHKAN! FREEDOM DAY UNLOCKED!', 'system');
    await triggerFreedomDay();
  }

  await saveGameState();
  renderGameUI();
  checkAchievements();
}

export async function startBattle() {
  const boss = getWeeklyBoss();
  const stats = calcBossStats(boss);
  GS.currentWeekBoss = boss;
  GS.bossHp = stats.hp;
  GS.bossMaxHp = stats.maxHp;
  GS.battleActive = true;
  GS.turnCount = 0;
  GS.bossEnrage = false;
  GS.bossDmgMult = 1;
  GS._shieldActive = false;
  GS._prayerActive = false;
  // Reduce skill cooldowns
  GS.skills.forEach(s=>{ if(s.cooldown>0) s.cooldown--; });
  addBattleLog(`⚔️ Battle dimulai! ${boss.emoji} ${boss.name} muncul!`, 'system');
  addBattleLog(`${boss.desc}`, 'warning');
  await saveGameState();
  renderGameUI();
}

// Expose ke global scope — dipanggil dari onclick="" di HTML string (renderGameUI, canvas.js)
window.playerAttack = playerAttack;
window.useSkill     = useSkill;
window.startBattle  = startBattle;

