/* ===== DB DISPATCHER ===== */
// Sejak persiapan build Capacitor (Android APK), penyimpanan data LifeHub
// punya 2 implementasi:
//   - db.web.js    → IndexedDB (dipakai saat app dibuka di browser/PWA biasa)
//   - db.native.js → SQLite asli di storage HP (dipakai saat app jalan
//                    sebagai APK hasil build Capacitor)
//
// File ini otomatis milih salah satu berdasarkan platform saat runtime, dan
// membungkusnya di belakang interface yang PERSIS SAMA seperti sebelumnya
// (init, getAll, put, get, delete, clearAll, _stores). Artinya SEMUA file
// fitur (todo.js, habit.js, journal.js, dst) yang selama ini cuma manggil
// `DB.xxx(...)` TIDAK PERLU diubah sama sekali — baik saat app jalan sebagai
// web/PWA maupun sebagai APK native.
//
// CATATAN (v6.3.2): db.native.js sekarang SUDAH diperbaiki — sama seperti
// geo.js/fileExport.js/notifications.js, dia pakai `getPlugin('CapacitorSQLite')`
// (window.Capacitor.Plugins.CapacitorSQLite) langsung, bukan `import
// '@capacitor-community/sqlite'` (bare specifier yang gagal tanpa bundler).
// Lihat komentar di db.native.js untuk detail.
//
// import db.native.js di bawah TETAP dibungkus try/catch sebagai jaring
// pengaman: kalau karena alasan apa pun gagal (plugin belum ke-sync, dll),
// otomatis fallback ke db.web.js (IndexedDB) — yang terbukti tetap jalan
// normal di WebView Android — daripada app native gagal total buka data.

const _stores = ['todos','habits','habitLogs','journals','sleepLogs','goals','milestones','waterLogs','sholatLogs','settings'];

let _impl = null;

async function resolveImpl() {
  const { isNativeApp } = await import('./platform.js');
  const isNative = await isNativeApp();

  if (isNative) {
    try {
      const mod = await import('./db.native.js');
      return mod.DB;
    } catch (e) {
      console.error('db.native.js gagal dimuat, fallback ke IndexedDB (db.web.js)', e);
    }
  }

  const mod = await import('./db.web.js');
  return mod.DB;
}

// Beri tahu UI bahwa data berubah (v6.7). Dashboard memakainya untuk menyegarkan skor &
// daftar secara real-time tanpa tiap fitur harus ingat memanggilnya. Digabung (debounce)
// supaya banyak tulisan beruntun (impor data, todo berulang) hanya memicu satu kali.
const _WATCHED = new Set(['todos', 'habits', 'habitLogs', 'waterLogs', 'sholatLogs']);
let _notifyT = 0;
function notifyChanged(store) {
  if (typeof document === 'undefined' || !_WATCHED.has(store)) return;
  clearTimeout(_notifyT);
  _notifyT = setTimeout(() => document.dispatchEvent(new CustomEvent('lh:data-changed', { detail: { store } })), 60);
}

export const DB = {
  _stores,

  async init() {
    _impl = await resolveImpl();
    await _impl.init();
  },
  getAll(store) { return _impl.getAll(store); },
  put(store, item) { return Promise.resolve(_impl.put(store, item)).then(r => { notifyChanged(store); return r; }); },
  delete(store, id) { return Promise.resolve(_impl.delete(store, id)).then(r => { notifyChanged(store); return r; }); },
  get(store, id) { return _impl.get(store, id); },
  clearAll() { return Promise.resolve(_impl.clearAll()).then(r => { notifyChanged('todos'); return r; }); }
};
