/* ===== PLATFORM DETECTION HELPER ===== */
// Helper kecil dipakai bareng oleh notifications.js, geo.js, fileExport.js,
// pdf/generator.js, dan settings.js (backup file) buat tau app lagi jalan
// sebagai APK Capacitor (native) atau web/PWA biasa.
//
// PENTING (root cause bug v6.3.0 — lokasi/export/PDF gak jalan di APK):
// Versi sebelumnya pakai `await import('@capacitor/core')` (bare specifier).
// Project ini SENGAJA tanpa bundler (lihat README: "Tanpa framework, tanpa
// build tool"), dan `npx cap sync` cuma nyalin folder www/ apa adanya —
// TIDAK menjalankan webpack/vite/rollup. Browser/WebView tidak bisa resolve
// nama paket npm seperti '@capacitor/core' tanpa bundler atau import map,
// jadi import itu SELALU gagal — termasuk di dalam APK asli — dan otomatis
// jatuh ke catch → isNativeApp() selalu return false, padahal appnya
// beneran jalan sebagai APK native. Efeknya: semua cabang kode "native"
// (Geolocation, Filesystem, LocalNotifications) gak pernah kepanggil sama
// sekali, yang jalan cuma fallback web-nya — yang gak cocok buat WebView.
//
// FIX: pakai `window.Capacitor` langsung. Ini BEDA dari `import
// '@capacitor/core'` — window.Capacitor di-inject otomatis oleh runtime
// native Capacitor (native-bridge.js) SEBELUM index.html/JS kita jalan,
// dan ini TIDAK butuh bundler sama sekali (native side, bukan web bundle).
// Di browser/PWA biasa, window.Capacitor memang tidak ada → otomatis
// dianggap mode web, sama seperti perilaku lama. Plugin native juga otomatis
// tersedia lewat `window.Capacitor.Plugins.<NamaPlugin>` tanpa perlu
// `import` npm package plugin-nya sama sekali (lihat getPlugin() di bawah).

let _cached = null;

export async function isNativeApp() {
  if (_cached !== null) return _cached;
  try {
    _cached = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  } catch (e) {
    _cached = false;
  }
  return _cached;
}

// Ambil plugin native lewat window.Capacitor.Plugins (TANPA import npm
// package). Throw kalau plugin belum terdaftar (misal lupa `npx cap sync`
// setelah nambah dependency baru di package.json) — dibiarkan throw supaya
// caller bisa nangkep & kasih pesan yang jelas, bukan gagal diam-diam.
export function getPlugin(name) {
  const plugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name];
  if (!plugin) throw new Error(`Plugin native "${name}" tidak ditemukan — pastikan sudah "npx cap sync android" setelah install dependency-nya.`);
  return plugin;
}
