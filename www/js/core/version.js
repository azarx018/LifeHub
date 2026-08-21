/* ===== VERSION ===== */
// Satu-satunya tempat versi app didefinisikan secara MANUAL adalah
// package.json ("version"). File ini di-generate otomatis oleh
// scripts/sync-version.js — JANGAN edit APP_VERSION di sini secara manual,
// perubahan akan hilang tertimpa saat "npm run version:sync" berikutnya.
// Dipakai oleh:
// - state.js / main.js (APP_VERSION di teks "Tentang" & meta description)
// - sw.js (nama cache, lewat dynamic import)
// - core/updateChecker.js (perbandingan versi terpasang vs GitHub Release terbaru)
export const APP_VERSION = '6.4.0';
