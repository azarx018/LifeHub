/* ===== DB WRAPPER (IndexedDB) ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
export const DB = {
  _db: null,
  _stores: ['todos','habits','habitLogs','journals','sleepLogs','goals','milestones','waterLogs','sholatLogs','settings'],
  init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('LifeHubDB', 4);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        this._stores.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, {keyPath:'id'}); });
      };
      req.onsuccess = e => { this._db = e.target.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  },
  getAll(store) {
    return new Promise((resolve, reject) => {
      if (!this._db) return resolve([]);
      try {
        const tx = this._db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch(e) { resolve([]); }
    });
  },
  put(store, item) {
    return new Promise((resolve, reject) => {
      if (!this._db) return reject('No DB');
      try {
        const tx = this._db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).put(item);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch(e) { reject(e); }
    });
  },
  delete(store, id) {
    return new Promise((resolve, reject) => {
      if (!this._db) return reject('No DB');
      try {
        const tx = this._db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch(e) { reject(e); }
    });
  },
  get(store, id) {
    return new Promise((resolve) => {
      if (!this._db) return resolve(null);
      try {
        const tx = this._db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch(e) { resolve(null); }
    });
  },
  async clearAll() {
    for (const s of this._stores) {
      if (!this._db) continue;
      try {
        const tx = this._db.transaction(s, 'readwrite');
        tx.objectStore(s).clear();
      } catch(e) {}
    }
  }
};
