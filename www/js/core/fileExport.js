/* ===== FILE EXPORT HELPER ===== */
// Dual-mode: di APK native, trik `<a download>` + blob URL TIDAK jalan (WebView
// nggak punya folder "Downloads" browser). Jadi di native, file ditulis
// lewat @capacitor/filesystem lalu langsung dibuka native Share Sheet
// (@capacitor/share) supaya user bisa pilih sendiri mau simpan ke mana
// (Files, Drive, WhatsApp, dst). Di browser/PWA tetap pakai trik lama
// (download link), karena itu cara normal browser download file.
//
// Kenapa BUKAN Directory.Documents: sejak Android 11 (API 30), folder
// Documents publik itu KENA scoped storage — plugin Filesystem sendiri
// dokumentasinya bilang "not accessible on Android 11 or newer" — jadi
// writeFile ke situ gagal diam-diam di HP modern. Solusinya nulis ke
// Directory.Cache (private, selalu bisa diakses tanpa izin apapun di semua
// versi Android) lalu di-share, bukan coba akses storage publik langsung.
//
// Kenapa bukan `import('@capacitor/filesystem')`/`import('@capacitor/share')`:
// lihat catatan panjang di platform.js — bare import npm package gak bisa
// di-resolve tanpa bundler. Plugin diakses lewat window.Capacitor.Plugins
// (di-inject otomatis oleh native runtime, gak butuh bundler).
import { isNativeApp, getPlugin } from './platform.js';
import { showToast } from './utils.js';

const DIRECTORY_CACHE = 'CACHE'; // = Directory.Cache (nilai enum resmi @capacitor/filesystem)
const ENCODING_UTF8 = 'utf8';    // = Encoding.UTF8

// Simpan string (biasanya hasil JSON.stringify) ke sebuah file.
// Return true kalau berhasil, false kalau gagal (toast error sudah ditampilkan).
export async function saveTextFile(filename, text, mimeType = 'application/json') {
  if (await isNativeApp()) {
    try {
      const Filesystem = getPlugin('Filesystem');
      await Filesystem.writeFile({
        path: filename,
        data: text,
        directory: DIRECTORY_CACHE,
        encoding: ENCODING_UTF8,
        recursive: true
      });
      const { uri } = await Filesystem.getUri({ path: filename, directory: DIRECTORY_CACHE });
      try {
        const Share = getPlugin('Share');
        await Share.share({ title: filename, url: uri, dialogTitle: `Simpan ${filename}` });
      } catch (shareErr) {
        // Plugin Share belum ke-sync / gagal dibuka — file tetap tersimpan,
        // cuma user gak langsung dapet dialog "simpan ke mana".
        console.error('Share gagal', shareErr);
        showToast(`💾 File dibuat (${filename}), tapi gagal buka dialog share.`, 3500);
        return true;
      }
      return true;
    } catch (e) {
      console.error('saveTextFile (native) gagal', e);
      showToast('❌ Gagal simpan file: ' + (e.message || 'unknown error'));
      return false;
    }
  }

  try {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
    return true;
  } catch (e) {
    console.error('saveTextFile (web) gagal', e);
    showToast('❌ Gagal export file');
    return false;
  }
}

// Sama seperti saveTextFile, tapi buat data biner (dipakai PDF generator).
// `base64Data` = konten file yang SUDAH dalam bentuk base64 (tanpa prefix
// "data:...;base64,"). Di web, dikonversi balik ke Blob buat trik <a download>.
export async function saveBinaryFile(filename, base64Data, mimeType = 'application/pdf') {
  if (await isNativeApp()) {
    try {
      const Filesystem = getPlugin('Filesystem');
      await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: DIRECTORY_CACHE,
        recursive: true
        // catatan: TANPA `encoding` di sini artinya ditulis sebagai data
        // biner base64 apa adanya (bukan teks UTF-8) — ini yang benar untuk
        // file PDF/gambar, sesuai API Filesystem plugin.
      });
      const { uri } = await Filesystem.getUri({ path: filename, directory: DIRECTORY_CACHE });
      try {
        const Share = getPlugin('Share');
        await Share.share({ title: filename, url: uri, dialogTitle: `Simpan ${filename}` });
      } catch (shareErr) {
        console.error('Share gagal', shareErr);
        showToast(`💾 File dibuat (${filename}), tapi gagal buka dialog share.`, 3500);
        return true;
      }
      return true;
    } catch (e) {
      console.error('saveBinaryFile (native) gagal', e);
      showToast('❌ Gagal simpan file: ' + (e.message || 'unknown error'));
      return false;
    }
  }

  try {
    const byteChars = atob(base64Data);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
    return true;
  } catch (e) {
    console.error('saveBinaryFile (web) gagal', e);
    showToast('❌ Gagal export file');
    return false;
  }
}
