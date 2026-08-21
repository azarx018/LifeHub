/* ===== UPDATE CHECKER (GitHub Release) ===== */
// Spec: LifeHub_GitHub_Release_APK_Update_Spec.md
//
// Sumber resmi update: GitHub Releases repo azarx018/LifeHub. Modul ini:
// - Cek rilis terbaru (dengan throttle, tidak nge-hit API tiap buka app)
// - Bandingkan versi pakai semantic version comparison (bukan string compare)
// - Simpan state (currentVersion/latestVersion/updateAvailable/lastCheck) ke KV
// - Download APK + buka installer Android (lewat plugin native FileOpener),
//   dengan progress callback buat popup
// - Bersihin APK temporary yang ketinggalan
//
// TIDAK PERNAH bypass mekanisme instalasi Android — cuma sampai tahap
// "buka file APK dengan aplikasi default" (= Android Package Installer),
// konfirmasi instalasi tetap 100% di tangan user & Android.
import { isNativeApp, getPlugin } from './platform.js';
import { APP_VERSION } from './version.js';
import { KV } from './utils.js';

const GITHUB_REPO = 'azarx018/LifeHub';
const GITHUB_LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

// Jangan hit GitHub API tiap kali app dibuka kalau baru aja dicek — cukup
// sekali per interval ini, kecuali user minta cek manual (force=true).
const CHECK_THROTTLE_MS = 6 * 60 * 60 * 1000; // 6 jam

const KV_KEY_STATE = 'update_check_state';
const KV_KEY_DISMISSED_VERSION = 'update_dismissed_version';

// File APK sementara SELALU pakai nama tetap (bukan per-versi) — jadi
// setiap percobaan download baru otomatis menimpa file lama, dan cleanup
// cuma perlu tau 1 nama file, bukan enumerasi banyak file APK lama.
const TEMP_APK_FILENAME = 'lifehub-update.apk';
const DIRECTORY_CACHE = 'CACHE'; // = Directory.Cache (@capacitor/filesystem)

// ===== SEMVER COMPARE =====
// Parse "x.y.z" -> [x,y,z]. Return null kalau format tidak valid (dianggap
// tidak sebanding, biar tidak salah nge-trigger update dari data GitHub yang
// tidak terduga, mis. tag "latest-beta").
function parseSemver(v) {
  if (typeof v !== 'string') return null;
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// Return 1 kalau a > b, -1 kalau a < b, 0 kalau sama. Null kalau salah satu
// tidak valid (caller harus anggap "tidak ada update" dalam kasus ini).
export function compareSemver(a, b) {
  const pa = parseSemver(a), pb = parseSemver(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

// ===== STATE (KV) =====
// State lokal ini CUMA cache untuk UI/throttle — bukan sumber kebenaran.
// Tiap kali checkForUpdate() beneran manggil GitHub (bukan pakai cache),
// hasil barunya menimpa state ini.
async function getState() {
  return await KV.get(KV_KEY_STATE, {
    currentVersion: APP_VERSION,
    latestVersion: null,
    updateAvailable: false,
    lastUpdateCheck: null,
    downloadUrl: null,
    changelog: null,
  });
}
async function setState(patch) {
  const state = await getState();
  const next = { ...state, ...patch };
  await KV.set(KV_KEY_STATE, next);
  return next;
}

// ===== CHECK FOR UPDATE =====
// force=true -> abaikan throttle (dipakai tombol "Cek update" manual di Settings).
// Selalu graceful: kalau GitHub gagal diakses / offline, TIDAK throw ke
// caller sebagai error fatal — return state lama apa adanya supaya app
// tetap jalan normal (lihat spec bagian "Offline behavior").
export async function checkForUpdate({ force = false } = {}) {
  const state = await getState();

  if (!force && state.lastUpdateCheck) {
    const elapsed = Date.now() - new Date(state.lastUpdateCheck).getTime();
    if (elapsed < CHECK_THROTTLE_MS) {
      return state; // masih dalam window throttle, pakai cache
    }
  }

  let release;
  try {
    const res = await fetch(GITHUB_LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub API status ${res.status}`);
    release = await res.json();
  } catch (e) {
    // Silently ignore sesuai spec — update check gagal TIDAK BOLEH
    // menghalangi/meng-crash-kan app. lastUpdateCheck sengaja TIDAK
    // diupdate supaya percobaan berikutnya (mis. koneksi sudah balik)
    // tidak keblok throttle window yang sama.
    console.warn('checkForUpdate: gagal ambil GitHub release', e);
    return state;
  }

  const latestVersion = (release.tag_name || '').replace(/^v/, '');
  const asset = Array.isArray(release.assets)
    ? release.assets.find(a => /\.apk$/i.test(a.name || ''))
    : null;

  const cmp = compareSemver(latestVersion, APP_VERSION);
  const updateAvailable = cmp === 1 && !!asset;

  return await setState({
    currentVersion: APP_VERSION,
    latestVersion: parseSemver(latestVersion) ? latestVersion : state.latestVersion,
    updateAvailable,
    lastUpdateCheck: new Date().toISOString(),
    downloadUrl: asset ? asset.browser_download_url : null,
    changelog: typeof release.body === 'string' ? release.body : null,
  });
}

// ===== "TIDAK" / DISMISS UNTUK SESI INI =====
// Spec: "Tidak" tidak boleh menghilangkan update, cuma nutup popup — update
// tetap kelihatan lewat Settings. Kita simpen versi yang di-dismiss supaya
// popup tidak muncul BERULANG-ULANG tiap route untuk versi yang sama;
// begitu ada versi lebih baru lagi, popup boleh muncul lagi.
export async function dismissUpdatePopup(version) {
  await KV.set(KV_KEY_DISMISSED_VERSION, version);
}
export async function isDismissed(version) {
  const dismissed = await KV.get(KV_KEY_DISMISSED_VERSION, null);
  return dismissed === version;
}

// Baca ReadableStream chunk demi chunk sambil lapor progress, lalu gabung
// jadi 1 Uint8Array. Dipisah dari downloadAndInstallUpdate() biar gampang
// di-skip pas response.body tidak tersedia (lihat komentar fallback di atas).
async function readStreamWithProgress(body, contentLength, onProgress) {
  const reader = body.getReader();
  const chunks = [];
  let received = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onProgress) onProgress(contentLength ? received / contentLength : null);
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
  return merged;
}

// ===== DOWNLOAD + INSTALL =====
// onProgress(fraction 0..1 | null) - null kalau Content-Length tidak
// diketahui (progress indeterminate).
export async function downloadAndInstallUpdate(downloadUrl, onProgress) {
  if (!(await isNativeApp())) {
    // Di mode web/PWA, tidak ada Android package installer — cukup buka
    // link download di tab baru, biar user unduh manual.
    window.open(downloadUrl, '_blank');
    return;
  }
  if (!downloadUrl) throw new Error('URL APK tidak tersedia.');

  // PENTING (root cause "Update gagal: Failed to fetch"): downloadUrl
  // (browser_download_url dari GitHub Release) me-redirect ke
  // objects.githubusercontent.com, yang TIDAK mengirim header
  // Access-Control-Allow-Origin. fetch() biasa dari WebView (origin
  // https://localhost) dianggap cross-origin dan diblokir CORS -> browser
  // cuma kasih pesan generik "Failed to fetch", padahal server GitHub-nya
  // sendiri baik-baik saja. Fix: aktifkan CapacitorHttp di
  // capacitor.config.json ({ plugins: { CapacitorHttp: { enabled: true } } }),
  // yang mem-patch window.fetch di Android supaya request jalan lewat native
  // HTTP client (bukan WebView) — tidak kena CORS sama sekali, sama seperti
  // curl. Fetch ke api.github.com (checkForUpdate di atas) sebelumnya
  // "kebetulan" tetap jalan karena GitHub API memang kirim
  // Access-Control-Allow-Origin: *, makanya gagalnya baru kelihatan pas
  // tahap download APK, bukan pas cek update.
  let res;
  try {
    res = await fetch(downloadUrl);
  } catch (e) {
    // Tangkap di sini biar pesan ke user jelas ini soal network/CORS,
    // bukan cuma "Failed to fetch" mentah dari browser.
    throw new Error(`Gagal menghubungi server download (${e && e.message ? e.message : 'network error'})`);
  }
  if (!res.ok) throw new Error(`Download gagal (status ${res.status})`);

  const contentLength = Number(res.headers.get('content-length')) || 0;
  const merged = res.body
    ? await readStreamWithProgress(res.body, contentLength, onProgress)
    // Fallback: sebagian implementasi native-fetch (mis. CapacitorHttp)
    // tidak mengekspos ReadableStream di response.body — di kondisi ini
    // tetap lanjut download-nya, cuma progress bar jadi indeterminate
    // (bukan per-persen) karena tidak ada chunk untuk dilaporkan.
    : new Uint8Array(await res.arrayBuffer());
  if (!res.body && onProgress) onProgress(null);

  // Gabungkan -> base64 (Filesystem.writeFile butuh base64 untuk data biner).
  let binaryStr = '';
  const CHUNK = 0x8000; // hindari call stack overflow dari String.fromCharCode(...arr) untuk file besar
  for (let i = 0; i < merged.length; i += CHUNK) {
    binaryStr += String.fromCharCode.apply(null, merged.subarray(i, i + CHUNK));
  }
  const base64Data = btoa(binaryStr);

  const Filesystem = getPlugin('Filesystem');
  await Filesystem.writeFile({
    path: TEMP_APK_FILENAME,
    data: base64Data,
    directory: DIRECTORY_CACHE,
    recursive: true,
  });
  const { uri } = await Filesystem.getUri({ path: TEMP_APK_FILENAME, directory: DIRECTORY_CACHE });

  // Buka APK dengan aplikasi default (= Android Package Installer untuk
  // mimeType APK). Android TETAP minta konfirmasi user di sini — kita tidak
  // melakukan bypass apapun terhadap dialog instalasi Android.
  const FileOpener = getPlugin('FileOpener');
  await FileOpener.openFile({
    path: uri,
    mimeType: 'application/vnd.android.package-archive',
  });

  // Catatan cleanup: file APK ini SENGAJA tidak langsung dihapus di sini —
  // Android package installer masih butuh baca file itu setelah intent
  // "open" ini dikembalikan (prosesnya async, di luar kontrol JS kita).
  // Cleanup dilakukan oleh cleanupTempApk() saat app dibuka lagi (lihat di
  // bawah) — di titik itu proses instalasi/pembatalan pasti sudah selesai.
}

// ===== CLEANUP =====
// Dipanggil sekali tiap app startup (main.js). Menghapus APK temporary sisa
// percobaan update sebelumnya (baik yang berhasil, dibatalkan, maupun gagal
// di tengah jalan) supaya tidak menumpuk di storage.
export async function cleanupTempApk() {
  if (!(await isNativeApp())) return;
  try {
    const Filesystem = getPlugin('Filesystem');
    await Filesystem.deleteFile({ path: TEMP_APK_FILENAME, directory: DIRECTORY_CACHE });
  } catch (e) {
    // Wajar kalau file memang tidak ada (belum pernah ada percobaan update) —
    // Filesystem.deleteFile throw kalau path tidak ditemukan, bukan error
    // yang perlu dilaporkan ke user.
  }
}
