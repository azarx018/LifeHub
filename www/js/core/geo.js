/* ===== GEOLOCATION HELPER ===== */
// Dual-mode: di APK native pakai @capacitor/geolocation (minta izin lokasi
// runtime Android asli). Di browser/PWA tetap pakai navigator.geolocation
// seperti sebelumnya.
import { isNativeApp, getPlugin } from './platform.js';

// Balikin { lat, lng } atau throw Error kalau gagal/ditolak.
export async function getCurrentCoords() {
  if (await isNativeApp()) {
    const Geolocation = getPlugin('Geolocation');
    const current = await Geolocation.checkPermissions();
    if (current.location !== 'granted' && current.coarseLocation !== 'granted') {
      const req = await Geolocation.requestPermissions();
      if (req.location !== 'granted' && req.coarseLocation !== 'granted') {
        throw new Error('Izin lokasi ditolak');
      }
    }
    const pos = await Geolocation.getCurrentPosition({ timeout: 10000 });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  }

  if (!navigator.geolocation) throw new Error('GPS tidak didukung browser ini');
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(new Error(err.message || 'Gagal mendapat lokasi')),
      { timeout: 10000 }
    );
  });
}
