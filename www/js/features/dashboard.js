/* ===== DASHBOARD (+ Clock, Greeting, Sky Background, Quotes) ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { DB } from '../core/db.js';
import { S } from '../core/state.js';
import { KV, uid, today, prevDay, el, qs, qsa, escHtml } from '../core/utils.js';
import { isHabitScheduledOn, toggleHabitLog, renderHabits } from './habit.js';
import { renderDashboardSleepBtn } from './sleep.js';
import { renderDashboardCountdowns } from './settings.js';
import { renderSholat } from './sholat.js';
import { renderJournal } from './journal.js';
import { buildDonutSVG } from '../charts/donut.js';
// renderSholat: dashboard punya widget sholat SENDIRI (renderDashboardSholat,
// bukan reuse features/sholat.js — jadi tidak diimport dari sana.
import { checkAchievements } from './game/achievements.js';
import { renderPrayerCountdown } from './prayer.js';

// ===== QUOTES =====
const QUOTES = [
  {text:"Jangan hitung harinya, jadikan setiap hari berarti.", author:"Muhammad Ali"},
  {text:"Sukses adalah jumlah usaha-usaha kecil yang diulang hari demi hari.", author:"Robert Collier"},
  {text:"Cara terbaik untuk memulai adalah dengan berhenti bicara dan mulai bekerja.", author:"Walt Disney"},
  {text:"Kebiasaan kecil yang konsisten menciptakan hasil yang luar biasa.", author:"James Clear"},
  {text:"Disiplin adalah jembatan antara tujuan dan pencapaian.", author:"Jim Rohn"},
  {text:"Dua hal yang membentuk hidupmu: kesabaranmu saat tidak punya apa-apa, dan sikapmu saat punya segalanya.", author:"Ali bin Abi Thalib"},
  {text:"Jika kamu tidak bisa terbang, berlarilah. Jika tidak bisa berlari, berjalanlah. Jika tidak bisa berjalan, merangkaklah. Tapi teruslah bergerak maju.", author:"Martin Luther King Jr."},
  {text:"Hidup adalah apa yang terjadi ketika kamu sibuk membuat rencana lain.", author:"John Lennon"},
  {text:"Dua puluh tahun dari sekarang kamu akan lebih kecewa oleh hal-hal yang tidak kamu lakukan daripada yang kamu lakukan.", author:"Mark Twain"},
  {text:"Bukan kurangnya waktu yang jadi masalah, tapi kurangnya arah.", author:"Zig Ziglar"},
  {text:"Kamu tidak perlu menjadi hebat untuk memulai, tapi kamu harus memulai untuk menjadi hebat.", author:"Zig Ziglar"},
  {text:"Setiap jiwa bertanggung jawab atas apa yang dikerjakannya.", author:"Al-Qur'an (74:38)"},
  {text:"Orang yang berhasil adalah orang yang bangkit lebih banyak dari berapa kali ia jatuh.", author:"Vince Lombardi"},
  {text:"Impian tanpa tujuan hanyalah mimpi. Tujuan tanpa rencana hanyalah keinginan.", author:"Antoine de Saint-Exupéry"},
  {text:"Tidak ada yang menghentikan orang yang punya sikap benar untuk mencapai tujuannya.", author:"Thomas A. Edison"},
  {text:"Hari terbaik dalam hidupmu adalah hari kamu mengambil tanggung jawab penuh atas hidupmu.", author:"Brian Tracy"},
  {text:"Bersemangatlah dalam beribadah, dan bersabarlah dalam setiap cobaan.", author:"Imam Syafi'i"},
  {text:"Jangan pernah menyerah pada sesuatu yang tidak bisa kamu jalani sehari tanpa memikirkannya.", author:"Winston Churchill"},
  {text:"Kesuksesan biasanya datang pada mereka yang terlalu sibuk untuk mencarinya.", author:"Henry David Thoreau"},
  {text:"Jadikan setiap detail sempurna dan batasi jumlah detailnya.", author:"Jack Dorsey"},
  {text:"Waktu adalah sumber daya yang paling berharga karena ia tak bisa diulang.", author:"Harvey MacKay"},
  {text:"Ilmu tanpa amal seperti pohon tanpa buah.", author:"Imam Al-Ghazali"},
  {text:"Tidaklah seseorang meninggalkan sesuatu karena Allah, kecuali Allah ganti dengan yang lebih baik.", author:"Hadis Riwayat Ahmad"},
  {text:"Setiap hari lakukan sesuatu yang membuat masa depanmu berterima kasih.", author:"Sean Patrick Flanery"},
  {text:"Pikiran adalah awal dari segala sesuatu yang pernah ada.", author:"Napoleon Hill"},
  {text:"Bangun pagi, bekerja keras, temukan minyak.", author:"J. Paul Getty"},
  {text:"Kualitas bukan kebetulan; ia selalu merupakan hasil dari usaha yang sungguh-sungguh.", author:"John Ruskin"},
  {text:"Jangan biarkan kemarin mengambil terlalu banyak dari hari ini.", author:"Will Rogers"},
  {text:"Kegagalan adalah bumbu yang memberi kesuksesan rasa sesungguhnya.", author:"Truman Capote"},
  {text:"Seorang pemenang hanyalah seorang pemimpi yang tidak pernah menyerah.", author:"Nelson Mandela"},
];


// ===== CLOCK =====
let _lastDate = today();
export function updateClock() {
  const clockEl = el('liveClock'); if(!clockEl) return;
  const now2 = new Date();
  const h = now2.getHours().toString().padStart(2,'0');
  const m = now2.getMinutes().toString().padStart(2,'0');
  const s = now2.getSeconds().toString().padStart(2,'0');
  clockEl.textContent = `${h}:${m}:${s}`;

  // Auto-refresh saat hari berganti (midnight fix)
  const currentDate = `${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,"0")}-${String(now2.getDate()).padStart(2,"0")}`;
  if(currentDate !== _lastDate) {
    _lastDate = currentDate;
    // Reset date-scoped states ke hari baru
    S.habitDate   = currentDate;
    S.sholatDate  = currentDate;
    S.journalDate = currentDate;
    S.waterDate   = currentDate;
    S._journalManualNav = false; // reset manual nav flag saat hari berganti
    updateSkyBackground();
    if(S.currentPage === 'dashboard') renderDashboard();
    else if(S.currentPage === 'habit')  renderHabits();
    else if(S.currentPage === 'sholat') renderSholat();
    else if(S.currentPage === 'journal') renderJournal();
  }

  updateGreeting();
}
function updateGreeting() {
  const h = new Date().getHours();
  let greet = 'Selamat Pagi';
  if (h >= 11 && h < 15) greet = 'Selamat Siang';
  else if (h >= 15 && h < 18) greet = 'Selamat Sore';
  else if (h >= 18) greet = 'Selamat Malam';
  const gt = el('greetText'); if(gt) gt.textContent = greet;
  const gn = el('greetName'); if(gn) gn.textContent = S.settings.name;
  const gd = el('greetDate'); if(gd) {
    const opts = {weekday:'long',year:'numeric',month:'long',day:'numeric'};
    gd.textContent = new Date().toLocaleDateString('id-ID', opts);
  }
}




export function updateSkyBackground() {
  const h = new Date().getHours();
  const dashHero = el('dashHero');
  if (!dashHero) return;

  let heroBg;
  let showStars = false;

  if (h >= 4 && h < 6) {
    heroBg = 'linear-gradient(135deg,#2c1654 0%,#8B4CA8 50%,#FF8C42 100%)';
  } else if (h >= 6 && h < 10) {
    heroBg = 'linear-gradient(135deg,#FF8C42 0%,#FFD700 40%,#6C63FF 100%)';
  } else if (h >= 10 && h < 14) {
    heroBg = 'linear-gradient(135deg,#1565C0 0%,#1E90FF 60%,#6C63FF 100%)';
  } else if (h >= 14 && h < 17) {
    heroBg = 'linear-gradient(135deg,#6C63FF 0%,#1E90FF 60%,#4ECDC4 100%)';
  } else if (h >= 17 && h < 19) {
    heroBg = 'linear-gradient(135deg,#c0392b 0%,#e67e22 40%,#f39c12 100%)';
  } else if (h >= 19 && h < 21) {
    heroBg = 'linear-gradient(135deg,#1a0a2e 0%,#2d1b69 60%,#6C63FF 100%)';
    showStars = true;
  } else {
    heroBg = 'linear-gradient(135deg,#0a0015 0%,#1a0a3e 50%,#0d1b4d 100%)';
    showStars = true;
  }

  dashHero.style.background = heroBg;

  // Inject / update celestial element inside hero
  let cel = dashHero.querySelector('.hero-celestial');
  if (!cel) {
    cel = document.createElement('div');
    cel.className = 'hero-celestial';
    // Position: top-right corner, above the clock text area
    cel.style.cssText = 'position:absolute;right:14px;top:10px;width:42px;height:42px;border-radius:50%;z-index:2;transition:all 1s ease;pointer-events:none;';
    dashHero.appendChild(cel);
  }
  if (showStars) {
    cel.style.background = 'radial-gradient(circle,#FFFFF0,#E8D5B7)';
    cel.style.boxShadow = '0 0 18px rgba(255,255,180,.6)';
    // Add stars to hero
    let starsWrap = dashHero.querySelector('.hero-stars');
    if (!starsWrap) {
      starsWrap = document.createElement('div');
      starsWrap.className = 'hero-stars';
      starsWrap.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden;border-radius:inherit;';
      dashHero.appendChild(starsWrap);
      generateStars(starsWrap);
    }
    starsWrap.style.opacity = '1';
  } else {
    if (h >= 17 && h < 19) {
      cel.style.background = 'radial-gradient(circle,#FFE44D,#FF8C00)';
      cel.style.boxShadow = '0 0 22px rgba(255,140,0,.8)';
    } else {
      cel.style.background = 'radial-gradient(circle,#FFE44D,#FFD700)';
      cel.style.boxShadow = '0 0 26px rgba(255,220,0,.7)';
    }
    const starsWrap = dashHero.querySelector('.hero-stars');
    if (starsWrap) starsWrap.style.opacity = '0';
  }
}
function generateStars(container) {
  for (let i = 0; i < 25; i++) {
    const star = document.createElement('div');
    const size = Math.random() * 2 + 1;
    star.className = 'star';
    star.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*80}%;top:${Math.random()*100}%;--d:${(Math.random()*2+1).toFixed(1)}s;--del:${(Math.random()*2).toFixed(1)}s`;
    container.appendChild(star);
  }
}

// ===== DASHBOARD =====
// ===== POLA & INSIGHT =====
// Nge-scan data terakhir buat cari pola sederhana (bukan AI, cuma aturan/threshold biasa).
// Tiap insight punya syarat data minimum biar ngga nge-judge dari sample yang kekecilan.
// Data (habits, hLogs, sleepLogs, waterLogs, moodRows) dikirim dari renderDashboard()
// biar ngga baca ulang IndexedDB yang sama dua kali dalam satu render.
async function computeInsights({ habits, hLogs, sleepLogs, waterLogs, moodRows }) {
  const moodScore = { excited:5, happy:4, neutral:3, tired:2, sad:1 };
  const sleepTarget = S.settings.sleepTarget || 8;
  const insights = [];

  const days7 = []; { let d = today(); for(let i=0;i<7;i++){ days7.push(d); d = prevDay(d); } }
  const days14 = []; { let d = today(); for(let i=0;i<14;i++){ days14.push(d); d = prevDay(d); } }

  // 1. Tidur di bawah target beberapa hari terakhir
  const recentSleep = sleepLogs.filter(s => days7.includes(s.date));
  if (recentSleep.length >= 3) {
    const belowCount = recentSleep.filter(s => s.duration < sleepTarget).length;
    if (belowCount >= Math.ceil(recentSleep.length * 0.6)) {
      const avgDur = recentSleep.reduce((a,s) => a + s.duration, 0) / recentSleep.length;
      insights.push({ emoji:'😴', text:`Tidur kamu di bawah target ${belowCount} dari ${recentSleep.length} hari terakhir — rata-rata ${avgDur.toFixed(1)} jam` });
    }
  }

  // 2. Korelasi mood turun di hari tidur kurang
  if (recentSleep.length >= 3 && moodRows.length >= 3) {
    const pairs = recentSleep
      .map(s => { const m = moodRows.find(r => r.id === 'mood_'+s.date); return m ? { duration: s.duration, mood: moodScore[m.value] || 3 } : null; })
      .filter(Boolean);
    const lowSleepMoods = pairs.filter(p => p.duration < sleepTarget).map(p => p.mood);
    const goodSleepMoods = pairs.filter(p => p.duration >= sleepTarget).map(p => p.mood);
    if (lowSleepMoods.length >= 2 && goodSleepMoods.length >= 2) {
      const avgLow = lowSleepMoods.reduce((a,b) => a+b, 0) / lowSleepMoods.length;
      const avgGood = goodSleepMoods.reduce((a,b) => a+b, 0) / goodSleepMoods.length;
      if (avgGood - avgLow >= 1) {
        insights.push({ emoji:'😔', text:'Mood kamu cenderung lebih rendah di hari-hari tidurnya kurang dari target' });
      }
    }
  }

  // 3. Habit paling sering keskip di hari tertentu
  if (habits.length > 0) {
    const dayNames = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const missByWeekday = new Array(7).fill(0);
    const totalByWeekday = new Array(7).fill(0);
    days14.forEach(ds => {
      const wd = new Date(ds+'T12:00:00').getDay();
      habits.forEach(h => {
        totalByWeekday[wd]++;
        if (!hLogs.some(l => l.habitId===h.id && l.date===ds)) missByWeekday[wd]++;
      });
    });
    let worstWd = -1, worstRate = 0;
    for (let wd=0; wd<7; wd++) {
      if (totalByWeekday[wd] >= 4) {
        const rate = missByWeekday[wd] / totalByWeekday[wd];
        if (rate > worstRate) { worstRate = rate; worstWd = wd; }
      }
    }
    if (worstWd >= 0 && worstRate >= 0.5) {
      insights.push({ emoji:'🔥', text:`Habit kamu paling sering keskip di hari ${dayNames[worstWd]}` });
    }
  }

  // 4. Minum air: hari kerja vs weekend
  const recentWater14 = waterLogs.filter(w => days14.includes(w.date));
  if (recentWater14.length >= 6) {
    const byDate = {};
    recentWater14.forEach(w => { byDate[w.date] = (byDate[w.date]||0) + 1; });
    const weekdayCounts = [], weekendCounts = [];
    Object.entries(byDate).forEach(([ds, c]) => {
      const wd = new Date(ds+'T12:00:00').getDay();
      (wd===0||wd===6 ? weekendCounts : weekdayCounts).push(c);
    });
    if (weekdayCounts.length >= 2 && weekendCounts.length >= 2) {
      const avgWd = weekdayCounts.reduce((a,b)=>a+b,0) / weekdayCounts.length;
      const avgWe = weekendCounts.reduce((a,b)=>a+b,0) / weekendCounts.length;
      if (avgWd - avgWe >= 1.5) insights.push({ emoji:'💧', text:'Minum air kamu lebih rajin di hari kerja dibanding weekend' });
      else if (avgWe - avgWd >= 1.5) insights.push({ emoji:'💧', text:'Minum air kamu lebih rajin di weekend dibanding hari kerja' });
    }
  }

  return insights.slice(0, 3); // max 3 biar ngga penuh
}

// Widget Sholat di Dashboard — dipisah jadi fungsi sendiri biar toggle 1 doa
// ngga perlu rebuild SELURUH dashboard (dulu manggil renderDashboard() penuh
// tiap toggle, jadinya kerasa "jedag-jedug" karena semua section ke-rebuild).
// Widget Habit di Dashboard — sama kayak Sholat, dipisah biar toggle 1 habit
// ngga rebuild seluruh dashboard.
async function renderDashboardHabits(habits, hLogs) {
  if (!habits) habits = await DB.getAll('habits');
  if (!hLogs) hLogs = await DB.getAll('habitLogs');
  const dhEl = el('dashHabits');
  if(!dhEl) return;
  dhEl.innerHTML = '';
  if(!habits.length) { dhEl.innerHTML = '<p style="font-size:0.8rem;color:var(--text3)">Belum ada habit</p>'; }
  // Prioritasin habit yang emang jatahnya hari ini, biar habit "libur" ngga
  // ngisi slot & nutupin habit yang justru harus dikerjain hari ini.
  const sortedHabits = [...habits].sort((a,b) => (isHabitScheduledOn(b, today())?1:0) - (isHabitScheduledOn(a, today())?1:0));
  sortedHabits.slice(0,4).forEach(h => {
    const done = hLogs.some(l => l.habitId===h.id && l.date===today());
    const scheduledToday = isHabitScheduledOn(h, today());
    const row = document.createElement('div');
    row.className = 'dash-habit-row' + (scheduledToday ? '' : ' off-day');
    row.innerHTML = `<input type="checkbox" class="dash-check" ${done?'checked':''} /><span>${h.icon||'🔥'} ${escHtml(h.name)}</span>${scheduledToday ? '' : '<small class="off-day-label">libur hari ini</small>'}`;
    const cb = qs('input', row);
    cb.addEventListener('change', async () => {
      const willBeDone = cb.checked;
      await toggleHabitLog(h.id, today());
      if (willBeDone) { cb.classList.add('pop-anim'); setTimeout(() => renderDashboardHabits(), 420); }
      else { renderDashboardHabits(); }
    });
    dhEl.appendChild(row);
  });
}

async function renderDashboardSholat(sholatLogs) {
  if (!sholatLogs) sholatLogs = await DB.getAll('sholatLogs');
  const todaySholat = sholatLogs.find(s => s.date === today()) || { date: today(), prayers: {} };
  const PRAYERS_DASH = [{key:'subuh',name:'Subuh'},{key:'dzuhur',name:'Dzuhur'},{key:'ashar',name:'Ashar'},{key:'maghrib',name:'Maghrib'},{key:'isya',name:'Isya'}];
  const dsEl = el('dashSholat');
  if(!dsEl) return;
  dsEl.innerHTML = '';
  PRAYERS_DASH.forEach(p => {
    const done = todaySholat.prayers[p.key];
    const item = document.createElement('div');
    item.className = `dash-sholat-item ${done?'done':''}`;
    item.innerHTML = `
      <svg class="dash-sholat-check" viewBox="0 0 24 24" fill="none" stroke="${done?'#43E97B':'currentColor'}" stroke-width="2.5" width="16" height="16">
        ${done
          ? '<path d="M20 6L9 17l-5-5"/>'
          : '<rect x="3" y="3" width="18" height="18" rx="3"/>'}
      </svg>
      <small>${p.name}</small>`;
    item.addEventListener('click', async () => {
      todaySholat.prayers[p.key] = !todaySholat.prayers[p.key];
      if(!todaySholat.id) todaySholat.id = uid();
      await DB.put('sholatLogs', todaySholat);
      renderDashboardSholat(); // refresh widget ini
      renderPrayerCountdown(); // sekalian widget WAKTU SHOLAT biar ngga ketinggalan info (checkmark stale)
      checkAchievements();
    });
    dsEl.appendChild(item);
  });
}

export async function renderDashboard() {
  updateGreeting();
  updateSkyBackground();

  // Satu batch fetch buat semua data yang dipakai di seluruh fungsi ini —
  // sebelumnya beberapa store (habits, habitLogs, waterLogs) kebaca dobel:
  // sekali lewat computeInsights(), sekali lagi lewat body dashboard sendiri.
  const [habits, hLogs, sleepLogs, waterLogs, todos, sholatLogs, journals, settingsRows] = await Promise.all([
    DB.getAll('habits'), DB.getAll('habitLogs'), DB.getAll('sleepLogs'), DB.getAll('waterLogs'),
    DB.getAll('todos'), DB.getAll('sholatLogs'), DB.getAll('journals'), DB.getAll('settings')
  ]);
  const moodRows = settingsRows.filter(r => r.id.startsWith('mood_'));

  // Pola & Insight
  const diEl = el('dashInsights');
  if (diEl) {
    const insights = await computeInsights({ habits, hLogs, sleepLogs, waterLogs, moodRows });
    if (!insights.length) {
      diEl.innerHTML = '<p style="font-size:.8rem;color:var(--text3)">Belum cukup data buat nemuin pola. Terus catat aktivitas kamu ya!</p>';
    } else {
      diEl.innerHTML = insights.map(i => `
        <div class="dash-insight-row">
          <span class="dash-insight-emoji">${i.emoji}</span>
          <span class="dash-insight-text">${escHtml(i.text)}</span>
        </div>`).join('');
    }
  }
  renderDashboardCountdowns();
  // Quote
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(),0,0)) / 86400000);
  const q = QUOTES[dayOfYear % QUOTES.length];
  const dq = el('dashQuote'); const dqa = el('dashQuoteAuthor');
  if(dq) dq.textContent = `"${q.text}"`;
  if(dqa) dqa.textContent = `— ${q.author}`;

  // Mood
  const todayMoodKey = 'mood_' + today();
  const savedMoodRow = settingsRows.find(r => r.id === todayMoodKey);
  const savedMood = savedMoodRow ? savedMoodRow.value : null;
  const moodMap = {happy:'😊 Senang',neutral:'😐 Biasa',sad:'😔 Sedih',excited:'🤩 Semangat',tired:'😴 Capek'};
  const dmr = el('dashMoodRow'); const dmt = el('dashMoodText');
  if(dmr) {
    qsa('.mood-btn', dmr).forEach(b => {
      b.classList.toggle('selected', b.dataset.mood === savedMood);
    });
  }
  if(dmt) dmt.textContent = savedMood ? moodMap[savedMood] : 'Pilih mood kamu';

  // Water
  const todayWater = waterLogs.filter(w => w.date === today());
  const wt = S.settings.waterTarget || 8;
  const wc = todayWater.length;
  const wp = Math.min(100, Math.round(wc/wt*100));
  const dwf = el('dashWaterFill'); const dwt = el('dashWaterText');
  if(dwf) dwf.style.width = wp + '%';
  if(dwt) dwt.textContent = `${wc} / ${wt} gelas`;

  // Habits
  renderDashboardHabits(habits, hLogs);


  // Todos — prioritas High→Medium→Low, belum selesai duluan
  const pOrder = {high:0, medium:1, low:2};
  const pendingTodos = todos
    .filter(t => !t.done && !t.archived)
    .sort((a,b) => (pOrder[a.priority]??1) - (pOrder[b.priority]??1));
  const doneTodayTodos = todos
    .filter(t => t.done && !t.archived && t.doneAt === today())
    .sort((a,b) => (pOrder[a.priority]??1) - (pOrder[b.priority]??1));
  // Tampilkan: pending dulu (sort priority), lalu yang done hari ini, max 5
  const showTodos = [...pendingTodos, ...doneTodayTodos].slice(0,5);
  const dtEl = el('dashTodos');
  if(dtEl) {
    dtEl.innerHTML = '';
    if(!showTodos.length) {
      dtEl.innerHTML = '<p style="font-size:0.8rem;color:var(--text3)">Tidak ada todo aktif 🎉</p>';
    } else {
      const priorityDot = {high:'🔴',medium:'🟡',low:'🟢'};
      showTodos.forEach(t => {
        const row = document.createElement('div');
        row.className = 'dash-todo-row';
        row.innerHTML = `
          <input type="checkbox" ${t.done?'checked':''}/>
          <span style="font-size:.78rem;${t.done?'text-decoration:line-through;color:var(--text3)':''}">${priorityDot[t.priority]||'⚪'} ${escHtml(t.title)}</span>
        `;
        const cb = qs('input', row);
        cb.addEventListener('change', async () => {
          t.done = cb.checked;
          t.doneAt = t.done ? today() : null;
          await DB.put('todos', t);
          renderDashboard();
        });
        dtEl.appendChild(row);
      });
    }
  }

  // Sholat
  renderDashboardSholat(sholatLogs);

  // Sleep
  const lastSleep = sleepLogs.filter(s => s.date <= today()).sort((a,b) => b.date.localeCompare(a.date))[0];
  const dsh = el('dashSleepHours');
  if(dsh) dsh.textContent = lastSleep ? lastSleep.duration.toFixed(1) : '—';
  renderDashboardSleepBtn();

  // Stats
  const doneTodos = todos.filter(t => t.done).length;
  const doneHabits = hLogs.filter(l => l.date === today()).length;
  const sGrid = el('dashStatsGrid');
  if(sGrid) {
    sGrid.innerHTML = `
      <div class="stats-mini-item"><div class="stats-mini-val">${doneTodos}</div><div class="stats-mini-lbl">Todo Selesai</div></div>
      <div class="stats-mini-item"><div class="stats-mini-val">${doneHabits}</div><div class="stats-mini-lbl">Habit Hari Ini</div></div>
      <div class="stats-mini-item"><div class="stats-mini-val">${habits.length}</div><div class="stats-mini-lbl">Total Habit</div></div>
      <div class="stats-mini-item"><div class="stats-mini-val">${journals.length}</div><div class="stats-mini-lbl">Jurnal</div></div>
    `;
  }

  // Donut Chart
  const donutCard = el('dashDonutCard');
  if(donutCard) {
    const todaySholatForDonut = sholatLogs.find(s => s.date === today()) || { prayers: {} };
    const sholatDone = Object.values(todaySholatForDonut.prayers || {}).filter(Boolean).length;
    const todoActive = todos.filter(t => !t.archived);
    const segments = [
      { label: 'Todo',   value: todoActive.filter(t => t.done).length, total: todoActive.length,  color: '#6C63FF' },
      { label: 'Habit',  value: doneHabits,  total: habits.length,                               color: '#FF6584' },
      { label: 'Sholat', value: sholatDone,  total: 5,                                           color: '#43E97B' },
      { label: 'Air',    value: wc,           total: wt,                                          color: '#44A8E0' },
    ];
    const { svg } = buildDonutSVG(segments);
    const legendHtml = segments.map(s => `
      <div class="donut-legend-item">
        <span class="donut-legend-dot" style="background:${s.color}"></span>
        <span class="donut-legend-label">${s.label}</span>
        <span class="donut-legend-val">${s.value}/${s.total}</span>
      </div>
    `).join('');
    donutCard.innerHTML = `
      <div class="card-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21.21 15.89A10 10 0 118 2.83"/><path d="M22 12A10 10 0 0012 2v10z"/></svg> Progress Hari Ini</div>
      <div class="donut-wrap">
        <div class="donut-svg-wrap">${svg}</div>
        <div class="donut-legend">${legendHtml}</div>
      </div>
    `;
  }

  // Prayer countdown card
  renderPrayerCountdown();
}

