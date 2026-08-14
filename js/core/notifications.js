/* ===== NOTIFICATIONS ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
import { S } from './state.js';
import { KV, showToast } from './utils.js';

let _notifTimers = [];

// Dipakai setupEvents() (legacy.js) saat toggle notifikasi dimatikan manual —
// _notifTimers sendiri sengaja privat (module-scoped), jadi diakses lewat fungsi ini.
export function clearNotificationTimers() {
  _notifTimers.forEach(t => clearTimeout(t));
  _notifTimers = [];
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) { showToast('Browser tidak mendukung notifikasi'); return false; }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') { showToast('Notifikasi diblokir. Aktifkan di pengaturan browser.'); return false; }
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

export async function showPushNotif(title, body) {
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, icon: './icon-192.png', badge: './icon-192.png', vibrate: [200, 100, 200] });
  } catch(e) {
    if (Notification.permission === 'granted') new Notification(title, { body, icon: './icon-192.png' });
  }
}

export async function scheduleNotifications() {
  clearNotificationTimers();
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const notifEnabled = await KV.get('notif_enabled', false);
  if (!notifEnabled) return;
  const morningTime = await KV.get('notif_morning', '07:00');
  const eveningTime = await KV.get('notif_evening', '21:00');
  const name = S.settings.name || 'Kamu';

  const scheduleAt = (timeStr, title, body) => {
    const [h, m] = timeStr.split(':').map(Number);
    const now2 = new Date();
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= now2) target.setDate(target.getDate() + 1);
    const delay = target - now2;
    const t = setTimeout(async () => {
      await showPushNotif(title, body);
      scheduleAt(timeStr, title, body); // reschedule for next day
    }, delay);
    _notifTimers.push(t);
  };

  scheduleAt(morningTime, '🌅 Selamat Pagi, LifeHub!', `Hei ${name}! Semangat hari ini. Cek habit & todo kamu yuk 💪`);
  scheduleAt(eveningTime, '🌙 Rekap Malam LifeHub', `Hai ${name}! Jangan lupa rekap aktivitas hari ini sebelum tidur 📋`);
}
