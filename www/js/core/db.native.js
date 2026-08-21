/* ===== DB WRAPPER (SQLite via Capacitor) — mode NATIVE (APK) ===== */
// Dipakai HANYA saat app jalan sebagai APK Android hasil build Capacitor
// (Capacitor.isNativePlatform() === true). Menyimpan data ke file SQLite asli
// di storage HP (bukan lagi IndexedDB browser), lewat plugin
// @capacitor-community/sqlite.
//
// PENTING: method & tanda tangan (init, getAll, put, get, delete, clearAll)
// SENGAJA dibuat identik dengan db.web.js (versi IndexedDB), supaya semua
// file fitur (todo.js, habit.js, dst) yang cuma manggil lewat `DB.xxx()`
// TIDAK PERLU diubah sama sekali.
//
// Desain tabel: setiap "store" (dulu = IndexedDB object store) jadi 1 tabel
// SQLite dengan 2 kolom: `id` (PRIMARY KEY) dan `data` (JSON string berisi
// seluruh objek item). Ini sengaja dibuat generik/schemaless — bukan bikin
// kolom per-field — karena bentuk objek tiap fitur (todo, habit, journal,
// dst) beda-beda dan bisa berubah/nambah field seiring waktu tanpa perlu
// migration SQL setiap kali. Trade-off: query SQL lanjutan (WHERE per field)
// nggak bisa langsung, tapi filtering di JS (seperti sebelumnya) tetap jalan
// sama persis karena getAll() balikin array object biasa.
//
// Catatan keamanan: nama tabel (`store`) di semua query di bawah SELALU
// berasal dari array `_stores` yang di-hardcode di kode ini sendiri — bukan
// dari input user — jadi aman dipakai lewat template string tanpa risiko
// SQL injection. Yang di-parameterize (pakai `?`) hanya value (id, data).
//
// FIX (v6.3.2 — root cause sama seperti geo.js/fileExport.js/notifications.js):
// Versi sebelumnya pakai `import { CapacitorSQLite, SQLiteConnection } from
// '@capacitor-community/sqlite'` (bare specifier npm package). Project ini
// SENGAJA tanpa bundler, jadi import itu SELALU gagal di WebView APK —
// db.js otomatis nangkep errornya dan fallback ke db.web.js (IndexedDB),
// makanya data tetap kesimpen tapi bukan di SQLite asli seperti niatnya.
//
// FIX-nya: pakai `getPlugin('CapacitorSQLite')` (lihat platform.js), yaitu
// `window.Capacitor.Plugins.CapacitorSQLite` yang di-inject otomatis oleh
// runtime native Capacitor — SAMA PERSIS pola yang dipakai geo.js dkk, TIDAK
// butuh bundler. Ini BEDA dari class `SQLiteConnection`/`SQLiteDBConnection`
// di npm package (yang cuma pembungkus JS di atas plugin native ini) —
// method-method low-level yang mereka panggil (createConnection, open,
// execute, run, query, dst) sebenarnya adalah method plugin native ITU
// SENDIRI, jadi bisa dipanggil langsung tanpa wrapper class-nya sama sekali.
//
// CATATAN soal WASM/jeep-sqlite: itu HANYA dibutuhkan kalau plugin ini
// dipakai di browser murni (web/PWA) — di sana memang tidak ada SQLite asli,
// jadi butuh emulasi pakai sql.js (WASM) lewat komponen `<jeep-sqlite>`.
// Untuk APK native (yang dijalankan file ini), SQLite asli sudah tersedia
// dari OS Android lewat plugin native-nya langsung, jadi jeep-sqlite/WASM
// TIDAK relevan/TIDAK dipakai di sini. db.web.js (IndexedDB) tetap yang
// dipakai untuk mode browser/PWA biasa.
import { getPlugin } from './platform.js';

const DB_NAME = 'lifehub_db';

// Ambil ulang tiap panggilan (bukan disimpan sekali di top-level) supaya
// error-nya baru muncul saat benar-benar dipakai (di dalam init(), yang
// sudah dibungkus try/catch oleh db.js) — bukan langsung pas file ini
// di-import, yang bisa bikin fallback-nya db.js gak kepanggil dengan benar.
function sqlitePlugin() {
  return getPlugin('CapacitorSQLite');
}

export const DB = {
  _stores: ['todos','habits','habitLogs','journals','sleepLogs','goals','milestones','waterLogs','sholatLogs','settings'],
  _ready: false,

  async init() {
    const SQLite = sqlitePlugin();

    // Bikin koneksi. Kalau koneksi dengan nama ini udah ada (misal karena
    // hot-reload saat dev, atau init() kepanggil dobel), createConnection
    // bakal throw "connection already exists" — itu bukan error fatal,
    // tinggal lanjut ke open() aja (yang menurut dokumentasi plugin memang
    // SELALU re-open walau sudah kebuka).
    try {
      await SQLite.createConnection({
        database: DB_NAME,
        version: 1,
        encrypted: false,
        mode: 'no-encryption',
        readonly: false
      });
    } catch (e) {
      console.warn('SQLite.createConnection: koneksi kemungkinan sudah ada, lanjut ke open()', e);
    }

    await SQLite.open({ database: DB_NAME, readonly: false });
    this._ready = true;

    const createStatements = this._stores
      .map(s => `CREATE TABLE IF NOT EXISTS ${s} (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL);`)
      .join('\n');
    await SQLite.execute({ database: DB_NAME, statements: createStatements, transaction: true, readonly: false });
  },

  async getAll(store) {
    if (!this._ready) return [];
    try {
      const SQLite = sqlitePlugin();
      const res = await SQLite.query({ database: DB_NAME, statement: `SELECT data FROM ${store};`, values: [] });
      return (res.values || []).map(row => JSON.parse(row.data));
    } catch (e) {
      console.error(`DB.getAll(${store}) failed`, e);
      return [];
    }
  },

  async put(store, item) {
    if (!this._ready) throw new Error('No DB connection');
    if (!item || item.id == null) throw new Error('Item harus punya field `id`');
    const SQLite = sqlitePlugin();
    const json = JSON.stringify(item);
    await SQLite.run({
      database: DB_NAME,
      statement: `INSERT OR REPLACE INTO ${store} (id, data) VALUES (?, ?);`,
      values: [String(item.id), json],
      transaction: true
    });
    return item.id;
  },

  async delete(store, id) {
    if (!this._ready) throw new Error('No DB connection');
    const SQLite = sqlitePlugin();
    await SQLite.run({
      database: DB_NAME,
      statement: `DELETE FROM ${store} WHERE id = ?;`,
      values: [String(id)],
      transaction: true
    });
  },

  async get(store, id) {
    if (!this._ready) return null;
    try {
      const SQLite = sqlitePlugin();
      const res = await SQLite.query({ database: DB_NAME, statement: `SELECT data FROM ${store} WHERE id = ?;`, values: [String(id)] });
      const row = res.values && res.values[0];
      return row ? JSON.parse(row.data) : null;
    } catch (e) {
      console.error(`DB.get(${store}, ${id}) failed`, e);
      return null;
    }
  },

  async clearAll() {
    if (!this._ready) return;
    const SQLite = sqlitePlugin();
    for (const s of this._stores) {
      try {
        await SQLite.run({ database: DB_NAME, statement: `DELETE FROM ${s};`, values: [], transaction: true });
      } catch (e) {}
    }
  }
};
