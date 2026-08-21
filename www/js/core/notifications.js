/* ===== NOTIFICATIONS ===== */
// Dual-mode: di APK native (Capacitor) pakai @capacitor/local-notifications
// (notifikasi sistem Android asli, tetap jalan walau app di-kill — beda dari
// setTimeout JS yang mati kalau app ditutup). Di browser/PWA tetap pakai
// Notification API + service worker seperti sebelumnya.
//
// PENTING: nama & tanda tangan fungsi yang di-export (requestNotificationPermission,
// showPushNotif, scheduleNotifications, clearNotificationTimers) SENGAJA dijaga
// sama seperti sebelumnya, supaya legacy.js & main.js tidak perlu diubah.
import { S } from './state.js';
import { KV, showToast } from './utils.js';
import { isNativeApp, getPlugin } from './platform.js';

// ID notifikasi native tetap/fixed, biar bisa di-cancel & di-reschedule dengan
// aman tanpa numpuk duplikat tiap kali jadwal diganti user.
const NOTIF_ID_MORNING = 1001;
const NOTIF_ID_EVENING = 1002;

let _notifTimers = [];

// Dipakai setupEvents() (legacy.js) saat toggle notifikasi dimatikan manual —
// _notifTimers sendiri sengaja privat (module-scoped), jadi diakses lewat fungsi ini.
export function clearNotificationTimers() {
  _notifTimers.forEach(t => clearTimeout(t));
  _notifTimers = [];
  (async () => {
    if (await isNativeApp()) {
      try {
        const LocalNotifications = getPlugin('LocalNotifications');
        await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID_MORNING }, { id: NOTIF_ID_EVENING }] });
      } catch (e) { /* belum pernah dijadwalkan / plugin gagal, aman diabaikan */ }
    }
  })();
}

export async function requestNotificationPermission() {
  if (await isNativeApp()) {
    try {
      const LocalNotifications = getPlugin('LocalNotifications');
      const current = await LocalNotifications.checkPermissions();
      if (current.display === 'granted') return true;
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') showToast('Izin notifikasi ditolak. Aktifkan manual di Pengaturan HP.');
      return req.display === 'granted';
    } catch (e) { showToast('Gagal minta izin notifikasi'); return false; }
  }
  if (!('Notification' in window)) { showToast('Browser tidak mendukung notifikasi'); return false; }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') { showToast('Notifikasi diblokir. Aktifkan di pengaturan browser.'); return false; }
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

// Dipakai prayer.js (reminder sholat) buat cek izin tanpa langsung minta —
// hindari popup permintaan izin berulang kali tiap 30 detik.
export async function hasNotificationPermission() {
  if (await isNativeApp()) {
    try {
      const LocalNotifications = getPlugin('LocalNotifications');
      const perm = await LocalNotifications.checkPermissions();
      return perm.display === 'granted';
    } catch (e) { return false; }
  }
  return ('Notification' in window) && Notification.permission === 'granted';
}

export async function showPushNotif(title, body) {
  if (await isNativeApp()) {
    try {
      const LocalNotifications = getPlugin('LocalNotifications');
      await LocalNotifications.schedule({
        notifications: [{
          // ID acak buat notif sekali-tembak (test notif, reminder sholat) —
          // beda dari NOTIF_ID_MORNING/EVENING yang fixed karena itu recurring.
          id: Math.floor(Math.random() * 1000000) + 10000,
          title, body,
          schedule: { at: new Date(Date.now() + 300) }
        }]
      });
      return;
    } catch (e) { console.error('Native notif gagal', e); return; }
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, icon: './icon-192.png', badge: './icon-192.png', vibrate: [200, 100, 200] });
  } catch (e) {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: './icon-192.png' });
  }
}

export async function scheduleNotifications() {
  clearNotificationTimers();
  const notifEnabled = await KV.get('notif_enabled', false);
  if (!notifEnabled) return;
  const morningTime = await KV.get('notif_morning', '07:00');
  const eveningTime = await KV.get('notif_evening', '21:00');
  const name = S.settings.name || 'Kamu';

  if (await isNativeApp()) {
    try {
      const LocalNotifications = getPlugin('LocalNotifications');
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') return;
      const [mh, mm] = morningTime.split(':').map(Number);
      const [eh, em] = eveningTime.split(':').map(Number);
      // schedule.on {hour,minute} tanpa day/month = notifikasi berulang tiap
      // hari otomatis (native alarm, tetap jalan walau app ditutup).
      await LocalNotifications.schedule({
        notifications: [
          {
            id: NOTIF_ID_MORNING,
            title: '🌅 Selamat Pagi, LifeHub!',
            body: `Hei ${name}! Semangat hari ini. Cek habit & todo kamu yuk 💪`,
            schedule: { on: { hour: mh, minute: mm }, allowWhileIdle: true }
          },
          {
            id: NOTIF_ID_EVENING,
            title: '🌙 Rekap Malam LifeHub',
            body: `Hai ${name}! Jangan lupa rekap aktivitas hari ini sebelum tidur 📋`,
            schedule: { on: { hour: eh, minute: em }, allowWhileIdle: true }
          }
        ]
      });
    } catch (e) { console.error('scheduleNotifications (native) gagal', e); }
    return;
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') return;

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
