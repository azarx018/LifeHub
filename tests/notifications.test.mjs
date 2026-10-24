import test from 'node:test';
import assert from 'node:assert/strict';

// Tiruan lingkungan APK (Capacitor native) + sedikit stub DOM supaya modul bisa diimpor di Node.
const calls = [];
globalThis.window = {
  Capacitor: {
    isNativePlatform: () => true,
    Plugins: {
      LocalNotifications: {
        cancel: async a => calls.push(['cancel', a]),
        createChannel: async a => calls.push(['createChannel', a]),
        schedule: async a => calls.push(['schedule', a]),
        checkPermissions: async () => ({ display: 'granted' }),
        checkExactNotificationSetting: async () => ({ exact_alarm: 'granted' }),
      },
    },
  },
};
globalThis.document = { getElementById: () => null, querySelector: () => null, addEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { schedulePrayerNotifications, cancelPrayerNotifications, ensureExactAlarmAllowed } = await import('../www/js/core/notifications.js');

test('jadwal native: batalkan 70 slot lama, buat channel, jadwalkan dengan ID 3000+slot', async () => {
  calls.length = 0;
  const at = new Date(Date.now() + 3600e3);
  await schedulePrayerNotifications([{ slot: 0, at, title: 't', body: 'b' }, { slot: 12, at, title: 't2', body: 'b2' }]);
  const names = calls.map(c => c[0]);
  assert.deepEqual(names, ['cancel', 'createChannel', 'schedule']);
  assert.equal(calls[0][1].notifications.length, 70);
  assert.equal(calls[0][1].notifications[0].id, 3000);
  assert.equal(calls[0][1].notifications[69].id, 3069);
  assert.equal(calls[1][1].id, 'prayer');
  const sched = calls[2][1].notifications;
  assert.deepEqual(sched.map(n => n.id), [3000, 3012]);
  assert.ok(sched.every(n => n.channelId === 'prayer' && n.schedule.allowWhileIdle === true && n.schedule.at instanceof Date));
});

test('daftar kosong hanya membatalkan, tidak menjadwalkan', async () => {
  calls.length = 0;
  await schedulePrayerNotifications([]);
  assert.deepEqual(calls.map(c => c[0]), ['cancel']);
});

test('cancel menghapus semua slot sholat', async () => {
  calls.length = 0;
  await cancelPrayerNotifications();
  assert.equal(calls[0][0], 'cancel');
  assert.equal(calls[0][1].notifications.length, 70);
});

test('izin alarm presisi: true bila sudah diberikan', async () => {
  assert.equal(await ensureExactAlarmAllowed(), true);
});
