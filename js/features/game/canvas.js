/* ===== HABIT QUEST RPG — UI & CANVAS ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
// Berisi renderGame/renderGameUI/drawGameCanvas (RPG battle screen) dan
// PIXEL (widget peliharaan piksel di Dashboard) — keduanya canvas-drawing-heavy
// jadi digabung 1 file sesuai rencana struktur awal.
import { S } from '../../core/state.js';
import { today, el, escHtml, showToast } from '../../core/utils.js';
import {
  GS, LEVEL_TITLES, BOSS_POOL, xpForLevel, totalXpForLevel,
  getWeeklyBoss, calcBossStats, loadGameState, syncStatsFromLifeHub, earnDailyXP
} from './engine.js';
import { checkAchievements, ACHIEVEMENT_LIST } from './achievements.js';

export async function renderGame() {
  await loadGameState();
  await syncStatsFromLifeHub();
  const xpGained = await earnDailyXP();
  if(xpGained > 0) showToast(`+${xpGained} XP dari aktivitas hari ini! ⚡`);
  await checkAchievements();
  renderGameUI();
}

export function renderGameUI() {
  const ui = el('gameUI'); if(!ui) return;
  const boss = GS.currentWeekBoss || getWeeklyBoss();
  const bossStats = calcBossStats(boss);
  const lv = GS.level;
  const title = LEVEL_TITLES[Math.min(lv-1, LEVEL_TITLES.length-1)];
  const xpNeeded = xpForLevel(lv);
  const xpCurrent = GS.xp - totalXpForLevel(lv);
  const xpPct = Math.min(100, Math.round(xpCurrent/xpNeeded*100));
  const isFreedomDay = GS.freedomDayUsed === today();

  // Draw pixel character on canvas
  drawGameCanvas();

  // Freedom Day banner
  const freedomHtml = isFreedomDay ? `
    <div class="game-freedom-banner">
      <div class="freedom-emoji">🎉</div>
      <div class="freedom-title">FREEDOM DAY!</div>
      <div class="freedom-desc">Kamu bebas hari ini! Semua habit otomatis tercatat. Selamat beristirahat, Azhar!</div>
    </div>` : '';

  // Streak penalty warning
  const penaltyHtml = GS.streakPenaltyDays>0 ? `
    <div style="background:rgba(255,107,107,.1);border:1px solid var(--danger);border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:.78rem;color:var(--danger)">
      ⚠️ Streak putus! Stat -20% selama <strong>${GS.streakPenaltyDays} hari</strong> lagi
    </div>` : '';

  // Stats
  const statMult = GS.streakBonus < 1 ? GS.streakBonus : GS.streakBonus;
  const strEff = Math.floor(GS.str * statMult);
  const agiEff = Math.floor(GS.agi * statMult);
  const intEff = Math.floor(GS.int * statMult);
  const spiEff = Math.floor(GS.spi * statMult);

  // Skills HTML
  const skillsHtml = GS.skills.length > 0 ? `
    <div style="margin-top:8px">
      <div style="font-size:.7rem;font-weight:700;color:var(--text3);margin-bottom:6px">SKILLS</div>
      <div class="game-skill-row">
        ${GS.skills.map(s=>`
          <button class="skill-btn" onclick="useSkill('${s.id}')"
            style="background:${s.color}22;color:${s.color};border-color:${s.color}55"
            ${(!GS.battleActive||s.cooldown>0)?'disabled':''}>
            ${s.emoji} ${s.name}${s.cooldown>0?` (${s.cooldown})`:''}
          </button>`).join('')}
      </div>
    </div>` : '';

  // Boss section
  const bossHpPct = GS.battleActive ? Math.round(GS.bossHp/GS.bossMaxHp*100) : 100;
  const bossHtml = `
    <div class="game-boss-card">
      <div class="game-boss-title">👹 Boss Minggu Ini</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:1.8rem">${boss.emoji}</span>
        <div>
          <div class="game-boss-name">${boss.name}</div>
          <div class="game-boss-desc">${boss.desc}</div>
        </div>
      </div>
      ${GS.battleActive ? `
        <div class="game-boss-hp-wrap">
          <div class="game-boss-hp-fill" style="width:${bossHpPct}%"></div>
        </div>
        <div class="game-boss-hp-text">${GS.bossHp} / ${GS.bossMaxHp} HP ${GS.bossEnrage?'🔥 ENRAGE!':''}</div>
        ${skillsHtml}
        <div class="game-actions" style="margin-top:10px">
          <button class="btn btn-primary" onclick="playerAttack()" style="flex:1">⚔️ Serang</button>
          ${GS.skills.find(s=>s.id==='heal') ? `
          <button class="btn btn-outline btn-sm" onclick="useSkill('heal')" ${GS.skills.find(s=>s.id==='heal').cooldown>0?'disabled':''}>💚 Heal${GS.skills.find(s=>s.id==='heal').cooldown>0?` (${GS.skills.find(s=>s.id==='heal').cooldown})`:''}</button>` : `
          <button class="btn btn-outline btn-sm" disabled title="Unlock di Level 5">🔒 Heal</button>`}
        </div>` : `
        <div style="font-size:.78rem;color:var(--text3);margin-bottom:10px">
          Skala: HP ${bossStats.hp} · Damage ~${bossStats.dmg}/turn
          ${GS.bossDefeated.includes(boss.id)?'<span style="color:var(--accent)"> ✓ Pernah dikalahkan</span>':''}
        </div>
        <button class="btn btn-primary" onclick="startBattle()" style="width:100%">
          ⚔️ Mulai Battle!
        </button>`}
    </div>`;

  // Battle log
  const logHtml = GS.battleLog.length > 0 ? `
    <div class="game-battle-log">
      ${GS.battleLog.map(l=>`<div class="battle-log-entry ${l.type}">[${l.time}] ${l.text}</div>`).join('')}
    </div>` : '';

  // Achievements list (pakai style .game-achievement yang sudah ada di style.css)
  const achievementsHtml = `
    <div style="margin-top:14px">
      <div style="font-size:.7rem;font-weight:700;color:var(--text3);margin-bottom:8px">ACHIEVEMENTS (${GS.achievementsUnlocked.length}/${ACHIEVEMENT_LIST.length})</div>
      ${ACHIEVEMENT_LIST.map(a => {
        const unlocked = GS.achievementsUnlocked.includes(a.id);
        return `
        <div class="game-achievement ${unlocked ? 'achievement-unlocked' : 'achievement-locked'}">
          <div class="achievement-icon">${unlocked ? a.emoji : '🔒'}</div>
          <div>
            <div class="achievement-name">${escHtml(a.name)}</div>
            <div class="achievement-desc">${escHtml(a.desc)}</div>
          </div>
        </div>`;
      }).join('')}
    </div>`;

  // Boss progress
  const defeatedCount = GS.bossDefeated.length;
  const totalBoss = BOSS_POOL.length - 1; // exclude demon
  const bossProgressHtml = `
    <div style="font-size:.72rem;color:var(--text3);margin-top:6px">
      Boss dikalahkan: ${defeatedCount}/${totalBoss} normal
      ${GS.bossDefeated.includes('demon')?'+ 👹 Weekly Demon ✓':''}
    </div>`;

  ui.innerHTML = `
    ${freedomHtml}
    ${penaltyHtml}
    <div class="game-level-badge">
      <div class="game-level-num">${lv}</div>
      <div class="game-level-info">
        <div class="game-level-title">${title}</div>
        <div class="game-level-xp">${xpCurrent} / ${xpNeeded} XP · Streak bonus: x${GS.streakBonus.toFixed(1)}</div>
        <div class="game-xp-bar"><div class="game-xp-fill" style="width:${xpPct}%"></div></div>
      </div>
    </div>

    <div class="game-stat-bar">
      <div style="font-size:.7rem;font-weight:700;color:var(--text3);margin-bottom:8px">STATS ${GS.streakBonus<1?'⚠️ DEBUFFED':GS.streakBonus>1?'⚡ BUFFED':''}</div>
      ${[['STR','#FF6B35',strEff,100],['AGI','#43E97B',agiEff,100],['INT','#4ECDC4',intEff,100],['SPI','#FFD700',spiEff,100]].map(([n,c,v,mx])=>`
        <div class="game-stat-row">
          <span class="game-stat-label">${n}</span>
          <div class="game-bar-wrap"><div class="game-bar-fill" style="width:${Math.min(100,v/mx*100)}%;background:${c}"></div></div>
          <span class="game-stat-val">${v}</span>
        </div>`).join('')}
      <div style="font-size:.72rem;color:var(--text3);margin-top:6px">
        HP: ${GS.hp}/${GS.maxHp} · XP hari ini: ${GS.lastXpDate===today()?'✓ Sudah':'Belum'}
      </div>
    </div>

    ${bossHtml}
    ${logHtml}
    ${bossProgressHtml}
    ${achievementsHtml}
  `;
}

function drawGameCanvas() {
  const canvas = el('gameCanvas'); if(!canvas) return;
  const W = canvas.clientWidth || 300;
  const H = Math.floor(W * 0.45);
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const S = Math.floor(W/40);

  // Background — dungeon style
  ctx.fillStyle='#0d0d1a'; ctx.fillRect(0,0,W,H);
  // Floor tiles
  for(let x=0;x<Math.ceil(W/S);x++) {
    const shade = x%2===0?'#1a1a2e':'#16162a';
    ctx.fillStyle=shade; ctx.fillRect(x*S,H-S*4,S,S*4);
  }
  // Torch effect
  const torchFlicker = Math.sin(Date.now()*0.005)*0.2+0.8;
  const torch = ctx.createRadialGradient(W*0.15,H*0.7,0,W*0.15,H*0.7,W*0.3);
  torch.addColorStop(0,`rgba(255,160,50,${torchFlicker*0.25})`);
  torch.addColorStop(1,'transparent');
  ctx.fillStyle=torch; ctx.fillRect(0,0,W,H);

  // Draw player character (Claude Pet RPG version)
  const lv = GS.level;
  const px2 = Math.floor(W*0.2), py2 = Math.floor(H*0.4);
  const petColor = lv>=40?'#FFD700':lv>=30?'#E8653A':lv>=20?'#FF8A5C':'#E8653A';
  const px = (x,y,c)=>{ ctx.fillStyle=c; ctx.fillRect(x,y,S,S); };

  // Aura effect for high levels
  if(lv>=20) {
    const auraColor = lv>=40?'rgba(255,215,0,0.2)':lv>=30?'rgba(232,101,58,0.2)':'rgba(108,99,255,0.15)';
    const aura=ctx.createRadialGradient(px2+S*3,py2+S*4,0,px2+S*3,py2+S*4,S*6);
    aura.addColorStop(0,auraColor); aura.addColorStop(1,'transparent');
    ctx.fillStyle=aura; ctx.fillRect(0,0,W,H);
  }

  // Body
  for(let i=0;i<7;i++) for(let j=0;j<6;j++) px(px2+i*S,py2+j*S,petColor);
  // Eyes
  ctx.fillStyle='#1A1A1A';
  ctx.fillRect(px2+S,py2+S,S,S); ctx.fillRect(px2+S*2,py2+S,S,S);
  ctx.fillRect(px2+S*4,py2+S,S,S); ctx.fillRect(px2+S*5,py2+S,S,S);
  // Eye shine
  ctx.fillStyle='#fff'; ctx.fillRect(px2+S,py2+S,Math.ceil(S*0.4),Math.ceil(S*0.4));
  ctx.fillRect(px2+S*4,py2+S,Math.ceil(S*0.4),Math.ceil(S*0.4));
  // Antenna
  ctx.fillStyle='#C0461C';
  ctx.fillRect(px2+S*3,py2-S*2,S,S*2);
  ctx.fillStyle=Math.floor(Date.now()/500)%2?'#FFD700':'#FF6B35';
  ctx.fillRect(px2+S*3,py2-S*3,S,S);
  // Armor/weapon based on level
  if(lv>=10) {
    ctx.fillStyle='#888'; // Shield
    ctx.fillRect(px2-S*2,py2+S,S,S*3);
  }
  if(lv>=15) {
    ctx.fillStyle='#FFD700'; // Sword
    ctx.fillRect(px2+S*8,py2,S,S*4);
    ctx.fillRect(px2+S*7,py2+S,S*3,S);
  }
  if(lv>=30) {
    ctx.fillStyle='rgba(255,215,0,0.6)'; // Crown
    for(let i=0;i<4;i++) ctx.fillRect(px2+S*(i*1.5),py2-S*4,S,S*(i%2===0?2:1.5));
  }

  // Legs
  ctx.fillStyle='#C0461C';
  ctx.fillRect(px2+S,py2+S*6,S,S*2); ctx.fillRect(px2+S*5,py2+S*6,S,S*2);
  ctx.fillRect(px2,py2+S*7,S*2,S); ctx.fillRect(px2+S*5,py2+S*7,S*2,S);

  // Boss preview on right side (if battle active)
  if(GS.battleActive && GS.currentWeekBoss) {
    const boss=GS.currentWeekBoss;
    const bx=Math.floor(W*0.65), by=Math.floor(H*0.35);
    const bossS=S*1.2|0;
    // Boss body (big scary)
    ctx.fillStyle=boss.color||'#FF4444';
    for(let i=0;i<8;i++) for(let j=0;j<8;j++) ctx.fillRect(bx+i*bossS,by+j*bossS,bossS,bossS);
    // Boss eyes (evil)
    ctx.fillStyle='#FF0000';
    ctx.fillRect(bx+bossS,by+bossS*2,bossS*2,bossS*2);
    ctx.fillRect(bx+bossS*5,by+bossS*2,bossS*2,bossS*2);
    // Boss emoji
    ctx.font=`${bossS*2}px sans-serif`;
    ctx.fillText(boss.emoji,bx+bossS*2,by-4);
    // VS text
    ctx.fillStyle='#FFD700'; ctx.font=`bold ${S*2}px 'Poppins',monospace`;
    ctx.textAlign='center'; ctx.fillText('VS!',W/2,H*0.5);
    // HP bar above boss
    const hpPct=GS.bossHp/GS.bossMaxHp;
    ctx.fillStyle='#333'; ctx.fillRect(bx,by-S*3,bossS*8,S);
    ctx.fillStyle=hpPct>0.5?'#43E97B':hpPct>0.25?'#FFD700':'#FF4444';
    ctx.fillRect(bx,by-S*3,Math.floor(bossS*8*hpPct),S);
  } else {
    // Idle — show dungeon
    ctx.fillStyle='rgba(255,255,255,0.05)';
    ctx.font=`${S}px monospace`;
    ctx.textAlign='right';
    ctx.fillText('Level '+GS.level,W-S,S*2);
  }
  ctx.textAlign='left';
}


export const PIXEL = {
  canvas: null, ctx: null,
  anim: null, sceneIndex: 0, frame: 0,
  rotateTimer: null,
  SCENES: ['pet', 'steve', 'nyan', 'aqua', 'bakso', 'goat'],
  SCENE_DURATION: 20000,

  init() {
    this.canvas = el('pixelCanvas');
    if(!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    if(this.rotateTimer) clearInterval(this.rotateTimer);
    if(this.anim) { cancelAnimationFrame(this.anim); this.anim = null; }
    this.sceneIndex = 0; this.frame = 0;
    this.startScene(0);
    this.rotateTimer = setInterval(() => {
      this.nextSceneWithFade();
    }, this.SCENE_DURATION);
  },

  resize() {
    if(!this.canvas) return;
    const card = this.canvas.parentElement;
    if(card) {
      this.canvas.width  = card.clientWidth  || 140;
      this.canvas.height = card.clientHeight || 90;
    }
  },

  nextSceneWithFade() {
    if(this.anim) { cancelAnimationFrame(this.anim); this.anim = null; }
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    let alpha = 0;
    const nextIdx = (this.sceneIndex + 1) % this.SCENES.length;
    const fade = () => {
      alpha = Math.min(1, alpha + 0.07);
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fillRect(0, 0, W, H);
      if(alpha < 1) { this.anim = requestAnimationFrame(fade); }
      else {
        this.anim = null;
        this.sceneIndex = nextIdx;
        this.frame = 0;
        this.startScene(nextIdx);
      }
    };
    this.anim = requestAnimationFrame(fade);
  },

  startScene(idx) {
    if(this.anim) { cancelAnimationFrame(this.anim); this.anim = null; }
    this.frame = 0;
    const name = this.SCENES[idx];
    const fn = {
      pet: ()=>this.runPet(),
      steve: ()=>this.runSteve(),
      nyan: ()=>this.runNyan(),
      aqua: ()=>this.runAqua(),
      bakso: ()=>this.runBakso(),
      goat: ()=>this.runGoat()
    }[name];
    if(fn) fn();
  },

  // Helper: fill pixel rect
  px(ctx, x, y, S, col) {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x)*S, Math.round(y)*S, S, S);
  },

  // ══ SCENE 1: Claude Pet ══
  runPet() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const S = Math.floor(Math.min(W,H)/22);
    const px = (x,y,c) => this.px(ctx,x,y,S,c);
    const CW = Math.floor(W/S), CH = Math.floor(H/S);

    // Pet state
    let state = 'idle'; // idle | walk | jump | sit | blink
    let stateTimer = 0; let petX = Math.floor(CW/2)-3; let petDir = 1;
    let jumpY = 0; let jumpVY = 0;
    const groundY = CH - 5;
    let blinkFrame = false;
    // Particles (heart, star)
    const particles = [];
    // Emotion bubble
    let bubble = ''; let bubbleTimer = 0;

    // Pick random next state
    const nextState = () => {
      const r = Math.random();
      if(r < 0.3) { state='walk'; stateTimer=40+Math.floor(Math.random()*60); if(Math.random()<0.5) petDir=1; else petDir=-1; }
      else if(r < 0.5) { state='jump'; jumpVY=-2.5; }
      else if(r < 0.7) { state='sit'; stateTimer=30+Math.floor(Math.random()*40); }
      else { state='idle'; stateTimer=20+Math.floor(Math.random()*30); }
      // Bubble
      const bubbles2 = ['♥','★','!','zzz','~'];
      if(Math.random()<0.4) { bubble=bubbles2[Math.floor(Math.random()*bubbles2.length)]; bubbleTimer=30; }
    };

    // Draw Claude Pet (orange pixel robot cat)
    // Based on official Claude Code mascot: square body, round head-like, antenna, stubby legs
    const drawPet = (bx, by, frame, st, dir2) => {
      const walkOff = (st==='walk' && Math.floor(frame/6)%2===1) ? -1 : 0;
      const sitOff  = st==='sit' ? 1 : 0;

      // Shadow
      ctx.fillStyle='rgba(0,0,0,0.15)';
      ctx.beginPath(); ctx.ellipse((bx+3.5)*S,(by+8+sitOff)*S,3*S,S*0.6,0,0,Math.PI*2); ctx.fill();

      // BODY — wide orange square
      const bodyColor = '#E8653A';
      const darkBody  = '#C0461C';
      const lightBody = '#FF8A5C';
      // Main body
      for(let i=0;i<7;i++) for(let j=0;j<6;j++) {
        let c = bodyColor;
        if(i===0||j===0) c=darkBody;
        if(i===6||j===5) c=lightBody;
        px(bx+i, by+j+walkOff+sitOff, c);
      }
      // Body top sheen
      for(let i=1;i<6;i++) px(bx+i, by+walkOff+sitOff, '#FF9A6C');

      // EYES — the iconic big dark eyes
      if(blinkFrame) {
        // Blink — just a line
        px(bx+1, by+2+walkOff+sitOff, '#1A1A1A'); px(bx+2, by+2+walkOff+sitOff, '#1A1A1A');
        px(bx+4, by+2+walkOff+sitOff, '#1A1A1A'); px(bx+5, by+2+walkOff+sitOff, '#1A1A1A');
      } else {
        // Left eye
        px(bx+1, by+1+walkOff+sitOff,'#1A1A1A'); px(bx+2, by+1+walkOff+sitOff,'#1A1A1A');
        px(bx+1, by+2+walkOff+sitOff,'#1A1A1A'); px(bx+2, by+2+walkOff+sitOff,'#1A1A1A');
        // Left eye shine
        px(bx+1, by+1+walkOff+sitOff,'#fff'); // top-left pixel white shine
        ctx.fillStyle='#fff'; ctx.fillRect((bx+1)*S,(by+1+walkOff+sitOff)*S,Math.ceil(S*0.5),Math.ceil(S*0.5));
        // Right eye
        px(bx+4, by+1+walkOff+sitOff,'#1A1A1A'); px(bx+5, by+1+walkOff+sitOff,'#1A1A1A');
        px(bx+4, by+2+walkOff+sitOff,'#1A1A1A'); px(bx+5, by+2+walkOff+sitOff,'#1A1A1A');
        ctx.fillStyle='#fff'; ctx.fillRect((bx+4)*S,(by+1+walkOff+sitOff)*S,Math.ceil(S*0.5),Math.ceil(S*0.5));
      }

      // ANTENNA on top
      px(bx+3, by-2+walkOff+sitOff, '#C0461C');
      px(bx+3, by-1+walkOff+sitOff, '#C0461C');
      // Antenna ball — blink orange/yellow
      const antCol = Math.floor(this.frame/8)%2===0?'#FFD700':'#FF6B35';
      px(bx+3, by-3+walkOff+sitOff, antCol);

      // MOUTH — small cute
      if(st==='sit') {
        // Happy face when sitting
        px(bx+2, by+4+sitOff,'#C0461C'); px(bx+3, by+4+sitOff,'#C0461C'); px(bx+4, by+4+sitOff,'#C0461C');
      } else {
        px(bx+3, by+4+walkOff,'#C0461C');
      }

      // LEGS
      if(st==='sit') {
        // Legs out front, cute sitting
        px(bx+1, by+6, '#C0461C'); px(bx+2, by+6,'#E8653A');
        px(bx+4, by+6, '#C0461C'); px(bx+5, by+6,'#E8653A');
        px(bx+0, by+7, '#C0461C'); px(bx+1, by+7,'#E8653A'); px(bx+2, by+7,'#E8653A');
        px(bx+4, by+7, '#E8653A'); px(bx+5, by+7,'#E8653A'); px(bx+6, by+7,'#C0461C');
      } else {
        const legOff = (st==='walk'&&Math.floor(frame/5)%2===0)?1:0;
        px(bx+1, by+6+walkOff,'#C0461C'); px(bx+1, by+7+walkOff-legOff,'#E8653A');
        px(bx+5, by+6+walkOff,'#C0461C'); px(bx+5, by+7+walkOff+legOff,'#E8653A');
        // Feet
        px(bx+0, by+8+walkOff-legOff,'#C0461C'); px(bx+1, by+8+walkOff-legOff,'#C0461C');
        px(bx+5, by+8+walkOff+legOff,'#C0461C'); px(bx+6, by+8+walkOff+legOff,'#C0461C');
      }

      // ARMS — little stubs
      if(dir2>0) {
        px(bx-1, by+2+walkOff+sitOff,'#C0461C'); px(bx-1, by+3+walkOff+sitOff,'#E8653A');
        px(bx+7, by+2+walkOff+sitOff,'#C0461C'); px(bx+7, by+3+walkOff+sitOff,'#E8653A');
      } else {
        px(bx-1, by+2+walkOff+sitOff,'#E8653A'); px(bx-1, by+3+walkOff+sitOff,'#C0461C');
        px(bx+7, by+2+walkOff+sitOff,'#E8653A'); px(bx+7, by+3+walkOff+sitOff,'#C0461C');
      }

      // Tail-like back detail
      px(bx+7, by+5+walkOff+sitOff,'#C0461C');
    };

    const drawBg = () => {
      // Soft gradient bg — matches Claude Code dark theme
      const grad = ctx.createLinearGradient(0,0,0,H);
      grad.addColorStop(0,'#1a0a2e');
      grad.addColorStop(1,'#0d0d1a');
      ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
      // Sparkle stars
      const starPositions=[[5,3],[15,8],[W-10,5],[W-20,12],[W/2,4],[8,H-15]];
      starPositions.forEach(([sx,sy],i)=>{
        const t=Math.sin(this.frame*0.08+i)*0.5+0.5;
        ctx.fillStyle=`rgba(255,200,100,${t*0.7})`;
        ctx.fillRect(sx,sy,2,2);
      });
      // Ground
      const gy = groundY * S;
      ctx.fillStyle='#2a1a4a'; ctx.fillRect(0,gy,W,H-gy);
      ctx.fillStyle='#3d2a5e';
      for(let i=0;i<Math.ceil(W/S)+1;i++) px(i,groundY,'#3d2a5e');
      // Claude Code watermark text
      ctx.fillStyle='rgba(232,101,58,0.15)';
      ctx.font=`bold ${S*1.5}px monospace`;
      ctx.fillText('Claude Code', S, H-S*2);
    };

    const tick = () => {
      ctx.clearRect(0,0,W,H);
      drawBg();

      stateTimer--;
      // Blink logic
      blinkFrame = (this.frame%80 < 3);

      // Particles
      for(let i=particles.length-1;i>=0;i--) {
        const p=particles[i];
        p.x+=p.vx; p.y+=p.vy; p.vy-=0.05; p.life--;
        ctx.globalAlpha=p.life/p.maxLife;
        ctx.fillStyle=p.color;
        ctx.font=`${S*2}px sans-serif`;
        ctx.fillText(p.text,p.x,p.y);
        ctx.globalAlpha=1;
        if(p.life<=0) particles.splice(i,1);
      }

      // State machine
      if(state==='idle') {
        drawPet(petX, groundY-8, this.frame, 'idle', petDir);
        if(stateTimer<=0) nextState();
      } else if(state==='walk') {
        petX += petDir * 0.5;
        if(petX<1) { petX=1; petDir=1; }
        if(petX>CW-9) { petX=CW-9; petDir=-1; }
        drawPet(petX, groundY-8, this.frame, 'walk', petDir);
        if(stateTimer<=0) nextState();
      } else if(state==='jump') {
        jumpY += jumpVY; jumpVY += 0.18;
        if(jumpY>=0) { jumpY=0; jumpVY=0; state='idle'; stateTimer=20;
          // Spawn hearts on land
          for(let i=0;i<3;i++) particles.push({x:petX*S+Math.random()*30,y:(groundY-8)*S,vx:(Math.random()-0.5)*1.5,vy:-1-Math.random(),life:25,maxLife:25,color:'#FF6584',text:'♥'});
        }
        drawPet(petX, groundY-8+Math.round(jumpY), this.frame, 'jump', petDir);
      } else if(state==='sit') {
        drawPet(petX, groundY-8, this.frame, 'sit', petDir);
        // Spawn zzzs when sitting
        if(stateTimer%25===0) particles.push({x:(petX+8)*S,y:(groundY-12)*S,vx:0.2,vy:-0.4,life:40,maxLife:40,color:'#88aaff',text:'z'});
        if(stateTimer<=0) nextState();
      }

      // Bubble
      if(bubbleTimer>0) {
        bubbleTimer--;
        const bx=(petX+8)*S, by=(groundY-13)*S;
        ctx.fillStyle='rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.roundRect(bx,by,S*5,S*3.5,S*0.8); ctx.fill();
        ctx.fillStyle='#E8653A';
        ctx.font=`bold ${S*2}px sans-serif`;
        ctx.fillText(bubble,bx+S*0.8,by+S*2.8);
      }

      // Spawn star particles occasionally
      if(this.frame%120===0) particles.push({x:(petX+3)*S,y:(groundY-10)*S,vx:(Math.random()-0.5),vy:-0.8-Math.random(),life:35,maxLife:35,color:'#FFD700',text:'★'});

      this.frame++;
      this.anim = requestAnimationFrame(tick);
    };
    tick();
  },

  // ══ SCENE 2: Minecraft Steve nebang pohon ══
  runSteve() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const S = 3;
    const gY = Math.floor(H/S)-4;
    const trees=[{x:6,hp:4,falling:false,angle:0},{x:22,hp:4,falling:false,angle:0}];
    let sx=4, dir=1, state='walk', chopIdx=-1, chopT=0, celebT=0;
    const chips=[];

    const drawBg=()=>{
      ctx.fillStyle='#87CEEB'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#FFD700'; ctx.fillRect((Math.floor(W/S)-7)*S,S,4*S,4*S);
      for(let x=0;x<Math.ceil(W/S);x++){
        ctx.fillStyle='#228B22'; ctx.fillRect(x*S,gY*S,S,S);
        ctx.fillStyle='#8B4513'; ctx.fillRect(x*S,(gY+1)*S,S,S*3);
      }
      // clouds
      [[2,2,6],[16,1,5]].forEach(([cx,cy,cw])=>{
        ctx.fillStyle='#fff';
        for(let i=0;i<cw;i++) for(let j=0;j<2;j++) ctx.fillRect((cx+i)*S,(cy+j)*S,S,S);
      });
    };

    const drawTree=(t)=>{
      if(t.hp<=0&&!t.falling) return;
      ctx.save();
      if(t.falling){ ctx.translate((t.x+1)*S,gY*S); ctx.rotate(t.angle); ctx.translate(-(t.x+1)*S,-gY*S); }
      const h=Math.max(1,t.hp)*2;
      ctx.fillStyle='#8B5A2B';
      ctx.fillRect(t.x*S,(gY-h)*S,S*2,h*S);
      if(t.hp>1){ ctx.fillStyle='#228B22'; for(let i=-1;i<4;i++) for(let j=0;j<3;j++) ctx.fillRect((t.x-1+i)*S,(gY-h-2+j)*S,S,S); }
      ctx.restore();
    };

    const drawSteve=(bx,wf,chopping)=>{
      const by=gY-11, x=Math.floor(bx);
      // head
      ctx.fillStyle='#FFCC99'; ctx.fillRect(x*S,by*S,4*S,4*S);
      ctx.fillStyle='#5C3317'; ctx.fillRect(x*S,by*S,4*S,S);
      ctx.fillStyle='#333'; ctx.fillRect((x+1)*S,(by+2)*S,S,S); ctx.fillRect((x+2)*S,(by+2)*S,S,S);
      // body
      ctx.fillStyle='#3264C8'; ctx.fillRect(x*S,(by+4)*S,4*S,5*S);
      // legs
      const ll=wf%2===0;
      ctx.fillStyle='#1E3C8C';
      ctx.fillRect((x+(ll?1:0))*S,(by+9)*S,S,3*S);
      ctx.fillRect((x+(ll?2:3))*S,(by+9)*S,S,3*S);
      ctx.fillStyle='#3C1E0A';
      ctx.fillRect((x+(ll?1:0))*S,(by+11)*S,S,S);
      ctx.fillRect((x+(ll?2:3))*S,(by+11)*S,S,S);
      // arm+axe
      if(chopping){
        const sw=Math.floor(this.frame/5)%2;
        ctx.fillStyle='#FFCC99'; ctx.fillRect((x+4)*S,(by+4+sw)*S,S,3*S);
        ctx.fillStyle='#888'; ctx.fillRect((x+5)*S,(by+3+sw)*S,2*S,2*S);
        ctx.fillStyle='#8B5A2B'; ctx.fillRect((x+5)*S,(by+5+sw)*S,S,2*S);
      } else {
        ctx.fillStyle='#FFCC99'; ctx.fillRect((x-1)*S,(by+5)*S,S,3*S);
      }
    };

    const tick=()=>{
      ctx.clearRect(0,0,W,H); drawBg();
      trees.forEach(t=>{ if(t.falling){t.angle+=0.06; if(t.angle>Math.PI/2){t.hp=0;t.falling=false;}} drawTree(t); });
      for(let i=chips.length-1;i>=0;i--){
        const p=chips[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=0.15; p.l--;
        ctx.fillStyle=`rgba(139,90,43,${p.l/15})`; ctx.fillRect(p.x,p.y,3,3);
        if(p.l<=0) chips.splice(i,1);
      }
      if(state==='walk'){
        sx+=dir*1.2; drawSteve(sx,Math.floor(this.frame/5),false);
        const near=trees.findIndex(t=>t.hp>0&&!t.falling&&Math.abs(sx-t.x)<8);
        if(near>=0){state='chop';chopIdx=near;chopT=0;}
        if(sx>W/S-6) dir=-1; if(sx<1) dir=1;
      } else if(state==='chop'){
        const t=trees[chopIdx]; drawSteve(sx,0,true); chopT++;
        if(chopT%18===0){
          t.hp--;
          for(let p=0;p<4;p++) chips.push({x:t.x*S+8,y:(gY-2)*S,vx:(Math.random()-0.5)*3,vy:-Math.random()*2.5,l:15});
          if(t.hp<=0){t.falling=true;state='celebrate';celebT=0;}
        }
        if(chopT>180&&t.hp>0) state='walk';
      } else {
        celebT++; const jmp=Math.abs(Math.sin(celebT*0.25))*3;
        ctx.save(); ctx.translate(0,-jmp); drawSteve(sx,0,false); ctx.restore();
        ctx.font='10px sans-serif'; ctx.fillText('⭐',(sx+5)*S,(gY-14)*S);
        if(celebT>70){
          state='walk';
          trees.forEach(t=>{if(t.hp<=0&&!t.falling){t.hp=4;t.angle=0;t.falling=false;}});
          // Fix: dulu Steve ngga digeser abis pohon respawn, jadi dia langsung
          // ke-detect "deket pohon" lagi dan chop pohon yang sama terus-menerus,
          // ngga pernah lanjut ke pohon kedua. Geser dulu biar keluar dari radius deteksi.
          sx += dir*9;
        }
      }
      this.frame++; this.anim=requestAnimationFrame(tick);
    };
    tick();
  },

  // ══ SCENE 3: Nyan Cat ══
  runNyan() {
    const ctx=this.ctx, W=this.canvas.width, H=this.canvas.height;
    let cx=-40; const trail=[];
    const RAINBOW=['#FF0000','#FF7700','#FFFF00','#00CC00','#0000FF','#8B00FF'];
    const tick=()=>{
      ctx.fillStyle='#0a0020'; ctx.fillRect(0,0,W,H);
      // stars
      [10,30,55,80,110,140,25,65,95,130].forEach((sx,i)=>{
        const sy=[8,18,5,28,12,22,35,14,26,7][i];
        ctx.fillStyle=`rgba(255,255,255,${(Math.sin(this.frame*0.08+i)*0.5+0.5)*0.8})`;
        ctx.fillRect(sx,sy,2,2);
      });
      // Rainbow trail
      const trailLen=RAINBOW.length;
      trail.forEach((t,ti)=>{
        RAINBOW.forEach((c,ri)=>{
          ctx.fillStyle=c; ctx.globalAlpha=(ti/trail.length)*0.8;
          ctx.fillRect(t.x-ri*2, t.y+(ri-trailLen/2)*3, 5, 3);
        });
      });
      ctx.globalAlpha=1;
      if(trail.length===0||cx-trail[trail.length-1]?.x>5){trail.push({x:cx,y:H/2}); if(trail.length>20) trail.shift();}
      // Body(pop-tart)
      const bx=cx, by=H/2-10;
      ctx.fillStyle='#CCC'; for(let i=0;i<14;i++) for(let j=0;j<9;j++) ctx.fillRect(bx+i*2,by+j*2,2,2);
      ctx.fillStyle='#FF69B4'; [[2,1],[3,1],[5,1],[7,1],[9,1],[11,1],[2,3],[4,3],[6,3],[8,3],[10,3],[2,5],[3,5],[5,5],[7,5],[9,5],[11,5]].forEach(([i,j])=>ctx.fillRect(bx+i*2,by+j*2,2,2));
      // Cat head
      ctx.fillStyle='#888'; for(let i=0;i<7;i++) for(let j=0;j<6;j++) ctx.fillRect(bx+14*2+i*2,by+j*2,2,2);
      ctx.fillRect(bx+14*2,by-2,2,2); ctx.fillRect(bx+20*2,by-2,2,2);
      ctx.fillStyle='#000'; ctx.fillRect(bx+16*2,by+2,4,2);
      // Legs animated
      const ll=Math.floor(this.frame/4)%2;
      ctx.fillStyle='#888';
      [2,7].forEach(lx=>{ ctx.fillRect(bx+lx*2,by+9*2,4,ll?4:6); ctx.fillRect(bx+lx*2,by+9*2+(ll?4:6),4,2); });
      // Rainbow tail
      ctx.fillStyle='#888'; ctx.fillRect(bx-4,by+3*2,4,4);
      cx+=2; if(cx>W+50){cx=-50;trail.length=0;}
      this.frame++; this.anim=requestAnimationFrame(tick);
    };
    tick();
  },

  // ══ SCENE 4: Aquarium + Shark ══
  runAqua() {
    const ctx=this.ctx, W=this.canvas.width, H=this.canvas.height;
    const fishes=[
      {x:20,y:H*0.3,dx:0.7,color:'#FF6B35',sy:2,wig:0},
      {x:80,y:H*0.6,dx:-0.5,color:'#4ECDC4',sy:1.5,wig:1},
      {x:50,y:H*0.5,dx:0.9,color:'#FFE66D',sy:1,wig:2},
      {x:110,y:H*0.4,dx:-0.6,color:'#A8E6CF',sy:1.8,wig:1.5},
    ];
    const shark={x:-50,y:H*0.4,dx:0.8};
    const bubbles=Array.from({length:7},(_,i)=>({x:15+i*22,y:H-5,sp:0.4+i%3*0.15}));
    const S=2;

    const drawFish=(f)=>{
      const x=Math.floor(f.x),y=Math.floor(f.y),fl=f.dx<0,sc=f.sy;
      const tail=Math.sin(this.frame*0.15+f.wig)>0;
      ctx.fillStyle=f.color;
      for(let i=0;i<6;i++) for(let j=0;j<4;j++){
        if((i===0||(i===5))&&(j===0||j===3)) continue;
        ctx.fillRect((fl?x+(5-i)*S*sc:x+i*S*sc),y+j*S*sc,S*sc,S*sc);
      }
      const tx=fl?x+7*S*sc:x-2*S*sc;
      if(tail){ctx.fillRect(tx,y,S*sc,S*sc);ctx.fillRect(tx,y+3*S*sc,S*sc,S*sc);}
      else ctx.fillRect(tx,y+S*sc,S*sc,2*S*sc);
      ctx.fillStyle='#000'; ctx.fillRect(fl?x+S*sc:x+4*S*sc,y+S*sc,S*sc,S*sc);
    };

    const drawShark=(s)=>{
      const x=Math.floor(s.x),y=Math.floor(s.y),sc=2.5,fl=s.dx<0;
      ctx.fillStyle='#708090';
      for(let i=1;i<13;i++) for(let j=2;j<7;j++) ctx.fillRect((fl?x+(13-i)*sc:x+i*sc),y+j*sc,sc,sc);
      ctx.fillStyle='#E8E8E8';
      for(let i=2;i<12;i++){ctx.fillRect((fl?x+(13-i)*sc:x+i*sc),y+5*sc,sc,sc);ctx.fillRect((fl?x+(13-i)*sc:x+i*sc),y+6*sc,sc,sc);}
      ctx.fillStyle='#607080';
      for(let j=0;j<3;j++) for(let i=0;i<3-j;i++) ctx.fillRect((fl?x+(9+j-i)*sc:x+(5+j+i)*sc),y+j*sc,sc,sc);
      ctx.fillStyle='#000'; ctx.fillRect((fl?x+10*sc:x+2*sc),y+2*sc,sc,sc);
      ctx.fillStyle='#fff';
      for(let t=0;t<3;t++) ctx.fillRect((fl?x-t*sc:x+11*sc+t*sc),y+3*sc,sc,sc);
    };

    const tick=()=>{
      const grad=ctx.createLinearGradient(0,0,0,H);
      grad.addColorStop(0,'#0077be'); grad.addColorStop(1,'#003d6b');
      ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#c2a46e'; ctx.fillRect(0,H-7,W,7);
      [12,35,65,95,125].forEach(wx=>{
        ctx.fillStyle='#2d8a2d';
        const wh=8+Math.sin(this.frame*0.05+wx)*3|0;
        for(let i=0;i<wh;i++) ctx.fillRect(wx+(Math.sin(i*0.5+this.frame*0.04)*2|0),H-7-i,3,1);
      });
      bubbles.forEach(b=>{
        b.y-=b.sp; if(b.y<0) b.y=H-5;
        ctx.strokeStyle=`rgba(255,255,255,0.4)`; ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(b.x+Math.sin(this.frame*0.02+b.x)*2,b.y,2,0,Math.PI*2); ctx.stroke();
      });
      const sharkMid=shark.x+15;
      fishes.forEach(f=>{
        const near=Math.abs(f.x-sharkMid)<45;
        if(near) f.dx=f.x<sharkMid?-2:2;
        else if(Math.abs(f.dx)>1) f.dx=f.dx>0?Math.max(f.dx-0.04,0.6):Math.min(f.dx+0.04,-0.5);
        drawFish(f);
        f.x+=f.dx; f.y+=Math.sin(this.frame*0.03+f.wig)*0.3;
        if(f.x>W+20) f.x=-20; if(f.x<-20) f.x=W+20;
        f.y=Math.max(10,Math.min(H-18,f.y));
      });
      shark.x+=shark.dx; shark.y+=Math.sin(this.frame*0.02)*0.4;
      if(shark.x>W+60) shark.x=-60;
      drawShark(shark);
      if(Math.abs(sharkMid-W/2)<30&&shark.y<H*0.35){
        ctx.fillStyle='rgba(255,0,0,0.5)'; ctx.font='8px sans-serif'; ctx.fillText('!',sharkMid,shark.y-8);
      }
      this.frame++; this.anim=requestAnimationFrame(tick);
    };
    tick();
  },

  // ══ SCENE 5: Beli Bakso ══
  runBakso() {
    const ctx=this.ctx, W=this.canvas.width, H=this.canvas.height;
    const gY=H-12;
    let buyX=W+10, state='walk', stateT=0;
    const cartX=W*0.55;

    const drawPerson=(x,shirt,action)=>{
      const bx=Math.round(x);
      ctx.fillStyle='#FFCC99'; ctx.fillRect(bx,gY-28,10,10);
      ctx.fillStyle='#5C3317'; ctx.fillRect(bx,gY-28,10,3);
      ctx.fillStyle=shirt; ctx.fillRect(bx,gY-18,10,12);
      ctx.fillStyle='#1E3C8C'; ctx.fillRect(bx,gY-6,5,8); ctx.fillRect(bx+5,gY-6,5,8);
      const lw=Math.floor(this.frame/8)%2;
      if(action==='walk'){
        ctx.fillStyle='#333';
        ctx.fillRect(bx+(lw?1:0),gY+2,4,3); ctx.fillRect(bx+(lw?5:6),gY+2,4,3);
      } else {
        ctx.fillStyle='#333'; ctx.fillRect(bx+1,gY+2,4,3); ctx.fillRect(bx+6,gY+2,4,3);
      }
      if(action==='eat'){
        ctx.fillStyle='#FFCC99'; ctx.fillRect(bx-4,gY-14,4,8);
        ctx.fillStyle='#fff'; ctx.fillRect(bx-7,gY-16,8,5);
        ctx.fillStyle='#F4A460'; ctx.fillRect(bx-6,gY-14,6,3);
        ctx.fillStyle='#8B0000'; ctx.fillRect(bx-5,gY-15,2,2);
      }
    };
    const drawCart=(cx)=>{
      ctx.fillStyle='#333'; ctx.beginPath(); ctx.arc(cx+8,gY+3,5,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx+24,gY+3,5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#8B4513'; ctx.fillRect(cx,gY-12,30,15);
      ctx.fillStyle='#CC0000'; ctx.fillRect(cx-2,gY-14,34,3);
      ctx.fillStyle='#CC0000'; ctx.fillRect(cx+13,gY-22,4,9);
      ctx.fillRect(cx-3,gY-25,36,3);
      ctx.fillStyle='rgba(255,255,255,0.6)';
      if(Math.floor(this.frame/15)%2===0) ctx.fillRect(cx+14,gY-18,2,5);
      ctx.fillStyle='#fff'; ctx.font='bold 6px sans-serif'; ctx.fillText('BAKSO',cx+3,gY-3);
    };

    const tick=()=>{
      ctx.fillStyle='#87CEEB'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#888'; ctx.fillRect(0,H-12,W,12);
      ctx.fillStyle='#AAA'; ctx.fillRect(0,H-16,W,4);
      ctx.fillStyle='#FFD700';
      for(let i=0;i<W;i+=20) ctx.fillRect(i+this.frame%20,H-8,10,2);
      drawCart(cartX);
      drawPerson(cartX+8,'#4ECDC4','stand');
      stateT++;
      if(state==='walk'){
        buyX-=1.5; drawPerson(buyX,'#FF6584','walk');
        if(buyX<=cartX-28){state='order';stateT=0;}
      } else if(state==='order'){
        drawPerson(buyX,'#FF6584','stand');
        if(stateT<90){ctx.fillStyle='#fff';ctx.fillRect(buyX-25,H-55,55,16);ctx.fillStyle='#333';ctx.font='6px sans-serif';ctx.fillText('1 porsi kak!',buyX-22,H-44);}
        if(stateT>110){state='eat';stateT=0;}
      } else {
        drawPerson(buyX,'#FF6584','eat');
        if(stateT%25===0){ctx.font='12px sans-serif';ctx.fillText('😋',buyX-5,H-50);}
        if(stateT>160){state='walk';buyX=W+10;stateT=0;}
      }
      this.frame++; this.anim=requestAnimationFrame(tick);
    };
    tick();
  },

  // ══ SCENE 7: Kambing Kacamata ══
  runGoat() {
    const ctx=this.ctx, W=this.canvas.width, H=this.canvas.height;
    const S=2, gY=H-14;
    let hue=0, bob=0, bobD=1;

    const drawGoat=(bx,by)=>{
      const px=(x,y,c)=>{ctx.fillStyle=c;ctx.fillRect((bx+x)*S,(by+y)*S,S,S);};
      // body
      for(let i=0;i<10;i++) for(let j=0;j<6;j++) px(i,j,'#F0F0E8');
      // head
      for(let i=1;i<8;i++) for(let j=-5;j<0;j++) px(i,j,'#F0F0E8');
      // snout
      for(let i=2;i<6;i++) for(let j=-2;j<0;j++) px(i,j,'#FFD5C0');
      px(3,-2,'#333'); px(4,-2,'#333');
      // horns
      px(2,-7,'#C8A882'); px(1,-8,'#C8A882'); px(1,-9,'#C8A882');
      px(5,-7,'#C8A882'); px(6,-8,'#C8A882'); px(6,-9,'#C8A882');
      // SUNGLASSES 😎
      for(let i=1;i<4;i++) for(let j=0;j<2;j++) px(i,-4+j,'#111');
      for(let i=4;i<7;i++) for(let j=0;j<2;j++) px(i,-4+j,'#111');
      px(4,-3,'#555'); px(0,-3,'#555'); px(7,-3,'#555');
      ctx.fillStyle='rgba(255,255,255,0.35)';
      ctx.fillRect((bx+1)*S,(by-4)*S,S,S); ctx.fillRect((bx+4)*S,(by-4)*S,S,S);
      // beard
      px(3,1,'#DDD'); px(4,1,'#DDD'); px(3,2,'#DDD');
      // legs
      const lw=Math.floor(this.frame/7)%2;
      [[1,0],[3,0],[6,0],[8,0]].forEach(([lx],i)=>{
        const off=(i%2===0&&lw)?1:0;
        ctx.fillStyle='#E0E0D8'; ctx.fillRect((bx+lx)*S,(by+6+off)*S,S*2,S*4);
        ctx.fillStyle='#333'; ctx.fillRect((bx+lx)*S,(by+9+off)*S,S*2,S);
      });
      // tail
      px(10,2,'#F0F0E8'); px(10,1,'#F0F0E8');
      // ear
      px(1,-3,'#FFD5C0'); px(7,-3,'#FFD5C0');
    };

    const tick=()=>{
      hue=(hue+0.6)%360;
      const g=ctx.createLinearGradient(0,0,W,H);
      g.addColorStop(0,`hsl(${hue},60%,35%)`); g.addColorStop(1,`hsl(${(hue+120)%360},60%,30%)`);
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
      // disco floor
      for(let i=0;i<Math.ceil(W/14);i++){
        ctx.fillStyle=`hsl(${(hue+i*40)%360},75%,45%)`; ctx.fillRect(i*14,gY,7,H-gY);
        ctx.fillStyle=`hsl(${(hue+i*40+20)%360},65%,35%)`; ctx.fillRect(i*14+7,gY,7,H-gY);
      }
      // sparkles
      ['✦','✧','✦'].forEach((s,i)=>{
        ctx.fillStyle=`rgba(255,255,255,${(Math.sin(this.frame*0.15+i)*0.5+0.5)*0.8})`;
        ctx.font='9px sans-serif'; ctx.fillText(s,[W*0.1,W*0.5,W*0.85][i],[10,18,8][i]);
      });
      bob+=bobD*0.12; if(bob>1.2||bob<0) bobD*=-1;
      drawGoat(Math.floor(W/S/2)-5, Math.floor(gY/S)-9+Math.round(bob));
      ctx.save(); ctx.font=`bold ${S*3}px sans-serif`; ctx.textAlign='center';
      ctx.fillStyle=`hsl(${(hue+180)%360},100%,75%)`; ctx.shadowColor='#fff'; ctx.shadowBlur=4;
      ctx.fillText('😎 SWAG',W/2,gY-4); ctx.restore();
      this.frame++; this.anim=requestAnimationFrame(tick);
    };
    tick();
  },

  stop() {
    if(this.anim) cancelAnimationFrame(this.anim);
    if(this.rotateTimer) clearInterval(this.rotateTimer);
    this.anim=null;
    this.rotateTimer=null;
  }
};
