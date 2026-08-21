# LifeHub — Log Perubahan

Log ini mencatat semua perubahan sejak project mulai dimigrasikan dari
PWA murni (IndexedDB, browser-only) menjadi APK Android native berbasis
Capacitor. Format: versi terbaru di paling atas.

---

## v6.4.0 — Release signing permanen + GitHub Release & in-app update checker

Implementasi dari 2 spec: `LifeHub_Android_Signing_GitHub_Actions_Keystore_Spec.md`
dan `LifeHub_GitHub_Release_APK_Update_Spec.md`.

### 🔐 Release signing permanen (GitHub Actions)
**File baru**: `scripts/apply-release-signing.js`
**File diubah**: `.github/workflows/build-android.yml`, `.gitignore`

Sebelumnya CI cuma build **debug APK** (`assembleDebug`, ditandatangani
`keystore/debug.keystore` yang di-commit — cukup buat testing/sideload,
BUKAN identity signing produksi). Sekarang CI build **release APK**
(`assembleRelease`), ditandatangani satu keystore release permanen
(`lifehub-release.jks`, alias `lifehub`) yang:
- **Tidak pernah masuk Git** — cuma ada sebagai GitHub Secret
  (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`).
- Di-decode ulang ke `$RUNNER_TEMP` tiap run CI, disuntik ke
  `android/app/build.gradle` (yang ephemeral, sama seperti alasan
  `sync-version.js`) lewat `scripts/apply-release-signing.js`, lalu
  dihapus lagi di step Cleanup (`if: always()`).
- Diverifikasi sebelum publish: SHA-256 sertifikat APK hasil build
  dibandingkan dengan SHA-256 sertifikat keystore — kalau tidak cocok,
  workflow berhenti (`exit 1`), **tidak** lanjut ke publish.

Keystore & password TIDAK PERNAH dicetak ke log — GitHub Actions
otomatis mask value yang direferensikan dari `secrets.*`.

⚠️ Keystore asli (`lifehub-release.jks`) + kredensialnya diserahkan ke
Azar secara terpisah (di luar repo), dengan instruksi backup aman +
cara isi ke GitHub Secrets. Tidak dicatat di sini sesuai aturan spec
("jangan mencatat password/Base64 keystore/private key di log.md").

Step debug-keystore-untuk-CI (`cp keystore/debug.keystore
~/.android/debug.keystore`) dihapus dari workflow karena CI sudah tidak
pernah `assembleDebug` lagi — file `keystore/debug.keystore` tetap ada
di repo untuk kebutuhan development lokal, cuma tidak dipakai CI lagi.

### ✨ GitHub Release otomatis
**File diubah**: `.github/workflows/build-android.yml`

Tiap run CI sekarang: build APK release → rename jadi
`LifeHub-<version>.apk` → buat GitHub Release dengan tag `v<version>`
(pakai `softprops/action-gh-release`) → upload APK sebagai release asset.
Isi release notes diambil otomatis dari section `## v<version>` yang
relevan di `log.md` ini.

### ✨ In-app update checker (cek GitHub Release, popup, download+install)
**File baru**: `www/js/core/updateChecker.js`, `www/js/core/updatePopup.js`,
`www/css/pages/update.css`
**File diubah**: `main.js`, `features/settings.js`, `index.html`,
`package.json` (+dependency `@capawesome-team/capacitor-file-opener`)

- Saat app dibuka, cek `https://api.github.com/repos/azarx018/LifeHub/releases/latest`
  (non-blocking, throttle 6 jam, graceful kalau offline/GitHub gagal —
  tidak pernah crash/menghalangi startup).
- Perbandingan versi pakai semantic version comparison (bukan string
  compare) lewat `compareSemver()`.
- Kalau ada versi lebih baru: popup "Ada versi baru nih 🚀" dengan
  pilihan `Tidak` / `Iya, Update`. `Tidak` cuma nutup popup untuk versi
  itu (disimpan di KV `update_dismissed_version`) — update tetap
  kelihatan lewat Settings → App Update → `Update Now`, sesuai spec
  (tidak pernah dianggap "ditolak permanen").
- `Iya, Update`/`Update Now`: download APK (progress bar), tulis ke
  `Directory.Cache` lewat `@capacitor/filesystem`, lalu buka dengan
  Android Package Installer lewat plugin `FileOpener`
  (`application/vnd.android.package-archive`). Konfirmasi instalasi
  tetap 100% di tangan Android/user — tidak ada bypass mekanisme
  keamanan apapun.
- Cleanup: APK temporary (`lifehub-update.apk` di cache, nama tetap jadi
  gampang di-cleanup) dihapus di app startup berikutnya
  (`cleanupTempApk()`), juga dihapus langsung kalau download/proses
  gagal di tengah jalan.
- **Fix mismatch versi**: `package.json` (`6.3.1`) sempat beda dengan
  `www/js/core/version.js` (`6.3.2`) — dua sumber kebenaran yang bisa
  out-of-sync. `scripts/sync-version.js` sekarang JUGA nulis ulang
  `version.js` dari `package.json` (1 arah, sama seperti build.gradle),
  jadi cuma ada 1 tempat ganti versi secara manual.

### 🔧 Permission & FileProvider tambahan (Android, disuntik CI)
**File diubah**: `.github/workflows/build-android.yml`

Ditambahkan step baru (pola sama seperti permission lokasi yang sudah
ada): suntik `REQUEST_INSTALL_PACKAGES` ke `AndroidManifest.xml` +
tulis `res/xml/file_paths.xml` — keduanya dibutuhkan plugin FileOpener
untuk bisa membuka APK hasil download lewat Package Installer Android
(target SDK 26+). Disuntik ulang tiap run karena `android/` ephemeral.

### Testing yang sudah dilakukan
- `scripts/apply-release-signing.js` ditest terpisah terhadap simulasi
  `build.gradle` khas template Capacitor 8 (Groovy): berhasil menyuntik
  `signingConfigs.release` + `signingConfig signingConfigs.release` di
  `buildTypes.release` dengan benar, dan idempotent (run kedua di-skip,
  tidak dobel suntik).
- Workflow YAML divalidasi valid secara syntax (`yaml.safe_load`).
- **Belum sempat** dites end-to-end di GitHub Actions runner sungguhan
  (build APK release + create GitHub Release beneran) — perlu dicoba
  jalan sekali di repo `azarx018/LifeHub` setelah 4 GitHub Secrets
  (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`)
  diisi, untuk pastikan tidak ada typo/asumsi struktur `build.gradle`
  yang meleset dari template Capacitor 8 sungguhan.
- **Belum dites** end-to-end popup update + download + install APK di
  device Android fisik (butuh 2 build APK berurutan dengan versi
  berbeda, keduanya ditandatangani key yang sama, untuk verifikasi
  Android benar-benar menerima update-nya).

### 🐛 Fix: false-positive "signing mismatch" di step verifikasi
Ditemukan pas run pertama di GitHub Actions: step "Verifikasi APK
ditandatangani dengan release key yang benar" salah nyimpulin APK TIDAK
cocok dengan keystore, padahal aslinya SAMA — cuma beda FORMAT string:
`keytool` nulis SHA-256 pakai colon+uppercase (`A1:BA:84:...`), sementara
`apksigner --print-certs` nulis tanpa colon+lowercase (`a1ba84...`).
Perbandingan string apa adanya (`!=`) jadi selalu nganggep beda walau
value-nya identik. Fix: normalisasi kedua nilai (`tr -d ':' | tr
'[:upper:]' '[:lower:]'`) sebelum dibandingkan.

### Testing tambahan
- Normalisasi format SHA-256 ditest manual dengan value asli dari run CI
  yang gagal (`A1:BA:84:BF:F3:74:7B:CC:AF:5A:C8:D7:AF:C0:9C:83:6A:66:25:
  08:00:36:FD:4E:88:5E:B1:88:92:2F:F7:7D` vs
  `a1ba84bff3747bccaf5ac8d7afc09c836a6625080036fd4e885eb188922ff77d`) —
  setelah normalisasi terbukti identik, fix dikonfirmasi benar.

---

## v6.3.2 — PDF fix, icon native, version sync system

### 🐛 Fix: PDF hasil generate kosong/blank di APK
**File**: `www/js/pdf/generator.js`

Akar masalah: fungsi `renderHtmlToPdfNative()` merender report ke iframe
tersembunyi yang di-`height:1px` (dimaksudkan cuma buat nyembunyiin
secara visual, iframe-nya sendiri sudah digeser ke `left:-9999px`).
Masalahnya, `html2canvas` — kalau tidak dikasih `windowHeight` eksplisit —
default-nya ngambil dari `iframe.contentWindow.innerHeight`, yang ikut
kepengaruh CSS height iframe itu sendiri. Akibatnya html2canvas mikir
"window" report cuma tinggi 1px, dan hasil capture-nya ke-crop jadi
nyaris kosong. Ini gotcha yang didokumentasikan resmi di FAQ html2canvas.

**Fix**: sebelum di-capture, iframe di-resize ke tinggi konten asli
(`scrollHeight`) dan `windowHeight`/`height` di-set eksplisit ke opsi
html2canvas sebagai jaga-jaga ganda.

### ✨ Icon app native di Android
**File baru**: `assets/icon.png` (disalin dari `www/icon-512.png`)
**File diubah**: `package.json` (+ devDependency `@capacitor/assets`,
+ script `assets:generate`)

Sebelumnya APK selalu pakai icon default bawaan Capacitor (biru khas)
karena belum ada sumber icon buat native project. Sekarang icon PWA yang
sudah ada dipakai sebagai source, digenerate ke semua ukuran/density
mipmap Android (termasuk adaptive icon) lewat `@capacitor/assets`.

⚠️ Perlu ditambahkan manual ke `.github/workflows/build-android.yml`
(step setelah `npx cap add android`, sebelum `gradlew assembleDebug`):
```yaml
- name: Generate app icons
  run: npx capacitor-assets generate --android
```

### ✨ Version Sync System
**File baru**: `scripts/sync-version.js`
**File diubah**: `package.json` (+ script `version:sync`)

`package.json` (`"version"`) jadi single source of truth versi app.
`npm run version:sync` otomatis nyalin versi itu ke
`android/app/build.gradle` (atau `.kts`) — baik `versionName` maupun
`versionCode`.

**Temuan penting yang menentukan desain**: folder `android/` di project
ini **ephemeral** — di-`.gitignore`, di-generate ulang dari nol tiap CI
run lewat `npx cap add android`. Artinya strategi umum "baca versionCode
lama dari build.gradle, +1" **tidak bisa dipakai** di sini, karena tidak
ada state yang bertahan antar build.

**Solusi**: `versionCode` dihitung deterministik dari semver:
```
versionCode = major*10000 + minor*100 + patch
6.3.1 → 60301   |   6.3.2 → 60302   |   7.0.0 → 70000
```
Idempoten (aman dijalankan berkali-kali, hasil sama persis), monoton
selama semver naik wajar, tanpa perlu file metadata tambahan. Divalidasi
ketat: script gagal jelas kalau `minor`/`patch` ≥ 100 (mencegah collision
antar-major, misal `6.100.0` yang bisa nabrak `7.0.0`).

Replace `versionName`/`versionCode` di `build.gradle` di-scope ketat ke
blok `defaultConfig { ... }` lewat brace-matching (bukan regex bebas ke
seluruh file) — `dependencies`, `signingConfigs`, `buildTypes`, dll tidak
tersentuh sama sekali. Mendukung baik sintaks Groovy (`build.gradle`)
maupun Kotlin DSL (`build.gradle.kts`), auto-terdeteksi.

⚠️ Perlu ditambahkan manual ke `.github/workflows/build-android.yml`
(step setelah `npx cap add android`, sebelum build):
```yaml
- name: Sync version to Android
  run: npm run version:sync
```

**Workflow rilis:**
```bash
npm version 6.3.2 --no-git-tag-version   # update package.json
npm run version:sync                      # sync ke Android
npm run android:sync                      # sync Capacitor
```

---

## v6.3.1 — Fix root cause: fitur native gak jalan sama sekali di APK

### 🐛 Fix kritis: `import('@capacitor/core')` gagal senyap di WebView
**File diubah**: `www/js/core/platform.js`, `db.native.js`,
`notifications.js`, `geo.js`, `fileExport.js`

Root cause bug v6.3.0 ("Browser tidak mendukung notifikasi" muncul
padahal APK asli, lokasi gak jalan, export gak bisa disimpan): kode
sebelumnya deteksi platform native pakai
`await import('@capacitor/core')` — bare npm specifier. Project ini
sengaja tanpa bundler (vanilla JS, no build tool), dan `npx cap sync`
cuma nyalin folder `www/` apa adanya, tidak menjalankan
webpack/vite/rollup. Browser/WebView **tidak bisa** resolve nama paket
npm tanpa bundler atau import map — import itu selalu gagal, ketangkep
`try/catch`, dan diam-diam fallback ke `isNativeApp() === false`,
walaupun app beneran jalan sebagai APK native. Semua cabang kode native
(Geolocation, LocalNotifications, Filesystem) jadi tidak pernah
terpanggil.

**Fix**: ganti total ke `window.Capacitor` — global yang di-inject
otomatis oleh native runtime Capacitor (`native-bridge.js`) SEBELUM
`index.html`/JS kita jalan, dan ini **tidak butuh bundler sama sekali**
(native-side injection, bukan web module resolution). Plugin native juga
diakses lewat `window.Capacitor.Plugins.<NamaPlugin>` langsung (helper
baru `getPlugin()` di `platform.js`), bukan `import` npm package
plugin-nya.

### 🐛 Fix: export/backup gagal di Android 11+
**File diubah**: `www/js/core/fileExport.js`

Sebelumnya tulis file ke `Directory.Documents`, yang menurut dokumentasi
resmi `@capacitor/filesystem` sendiri **tidak accessible di Android 11
atau lebih baru** (scoped storage) — `writeFile` gagal diam-diam di HP
modern.

**Fix**: tulis ke `Directory.Cache` (private, selalu bisa diakses tanpa
izin apapun di semua versi Android), lalu langsung buka native Share
Sheet lewat `@capacitor/share` — user pilih sendiri mau simpan/kirim ke
mana (Files, Drive, WhatsApp, dst), bukan berharap file "nongol" di
folder Documents yang sebenarnya sudah diblokir sistem.

**Dependency baru**: `@capacitor/share` ditambahkan ke `package.json`.

---

## v6.3.0 — Notifikasi, lokasi, backup jadi native; auto-backup dihapus

### ✨ Notifikasi native
**File baru/rewrite**: `www/js/core/notifications.js`

Dual-mode: di APK pakai `@capacitor/local-notifications` (alarm sistem
Android asli — tetap jalan walau app di-kill, beda dari `setTimeout` JS
yang mati kalau app ditutup). Di browser/PWA tetap Notification API +
service worker seperti sebelumnya. Interface fungsi
(`requestNotificationPermission`, `showPushNotif`, `scheduleNotifications`,
`clearNotificationTimers`) dijaga identik supaya `legacy.js`/`main.js`
tidak perlu diubah.

### ✨ Lokasi native (waktu sholat)
**File baru**: `www/js/core/geo.js`
**File diubah**: `www/js/features/prayer.js`

`getLocation()` sekarang lewat helper `getCurrentCoords()` yang
dual-mode: `@capacitor/geolocation` di native, `navigator.geolocation`
di web.

Sekalian dibenerin: `checkPrayerReminder()` sebelumnya bypass
abstraction dan manggil `new Notification(...)` langsung (cuma jalan di
browser) — sekarang lewat `showPushNotif()`/`hasNotificationPermission()`
dari `notifications.js`, jadi otomatis native-aware juga.

### ✨ Export/Import data native-aware
**File baru**: `www/js/core/fileExport.js`
**File diubah**: `www/js/features/settings.js`

`exportData()` di APK native nulis file lewat `@capacitor/filesystem`
(bukan trik `<a download>` + blob URL yang cuma jalan di browser, karena
WebView Android tidak punya folder "Downloads" browser). Import tetap
pakai `<input type="file">` biasa — sudah didukung otomatis oleh WebView
Capacitor tanpa perlu plugin tambahan.

### 🗑️ Fitur Auto Backup harian dihapus
**File diubah**: `settings.js`, `main.js`, `legacy.js`, `index.html`

Dihapus total: `checkAutoBackup()`, `doAutoBackup()`,
`getLastBackupInfo()`, tombol "Backup Sekarang", label status auto
backup, key KV `last_auto_backup`. Alasan: sejak data disimpan di SQLite
storage HP (bukan lagi IndexedDB browser yang gampang kehapus via
"clear cache"), risiko kehilangan data otomatis sudah jauh lebih kecil.
Backup manual tetap ada lewat tombol **Export Data**.

### 🔧 Helper baru
**File baru**: `www/js/core/platform.js` — `isNativeApp()`, dipakai
bareng oleh `notifications.js`, `geo.js`, `fileExport.js`, `db.js`,
`main.js` biar deteksi platform tidak duplikat di banyak file.

**Dependency baru**: `@capacitor/geolocation`, `@capacitor/local-notifications`,
`@capacitor/filesystem` ditambahkan ke `package.json`.

---

## v6.2.0 — Migrasi awal: PWA → Capacitor (database ke SQLite)

Titik awal migrasi dari LifeHub versi PWA murni (IndexedDB, browser-only)
menuju APK Android native dengan Capacitor.

### 🔧 Database: dual-mode IndexedDB / SQLite
**File baru**: `www/js/core/db.web.js` (isi asli `db.js`, IndexedDB —
dipakai di mode browser/PWA), `www/js/core/db.native.js` (SQLite lewat
`@capacitor-community/sqlite`, dipakai di mode APK)
**File diubah**: `www/js/core/db.js` — jadi **dispatcher**, otomatis
milih implementasi berdasarkan platform saat runtime.

Desain tabel SQLite: tiap "store" (dulu = IndexedDB object store) jadi 1
tabel dengan 2 kolom (`id` PRIMARY KEY, `data` JSON string) — generik/
schemaless, karena bentuk objek tiap fitur beda-beda dan bisa berubah
tanpa perlu migration SQL berulang.

Interface publik (`init`, `getAll`, `put`, `get`, `delete`, `clearAll`,
`_stores`) dijaga identik ke 3 implementasi — hasil audit: **semua 16
file fitur (todo.js, habit.js, dst) mengakses DB hanya lewat interface
ini, tidak pernah langsung ke IndexedDB/SQLite**, jadi tidak ada satupun
file fitur yang perlu diubah untuk migrasi ini.

### 🔧 Restrukturisasi folder
Semua source web (`index.html`, `css/`, `js/`, `manifest.json`, `sw.js`,
icon) dipindah ke `www/` — layout standar Capacitor (`webDir`).

### 🔧 Service worker di-skip di native
**File diubah**: `www/js/main.js`

`registerSW()` sekarang cek platform dulu — service worker (fitur
offline-caching PWA) di-skip kalau app jalan sebagai APK native, karena
tidak relevan (file sudah lokal di HP) dan berisiko bentrok.

### ✨ File konfigurasi Capacitor baru
- `package.json` — dependency `@capacitor/android`, `@capacitor/core`,
  `@capacitor-community/sqlite`, devDependency `@capacitor/cli`
- `capacitor.config.json` — `appId: com.azrlifehub.app`, `appName: LifeHub`,
  `webDir: www`
- `.github/workflows/build-android.yml` — build APK otomatis di GitHub
  Actions (cloud), karena project dikerjakan tanpa PC/laptop — install
  Node, Java, Android SDK, `npm install`, `npx cap add android`,
  `npx cap sync android`, `gradlew assembleDebug`, upload APK sebagai
  artifact
- `.gitignore` — exclude `node_modules/`, `android/` build artifacts,
  keystore, dll
- `PANDUAN_SETUP_ANDROID.md` — panduan lengkap build APK dari HP tanpa
  PC/Android Studio

---

## Catatan arsitektur yang berlaku di semua versi di atas

- **Tanpa bundler** (vanilla JS, no build tool) — konsekuensinya: semua
  akses plugin native HARUS lewat `window.Capacitor.Plugins.<Nama>`
  (global inject dari native runtime), TIDAK BOLEH `import '@capacitor/...'`
  (bare specifier, gagal senyap tanpa bundler).
- **`android/` folder ephemeral** — di-`.gitignore`, digenerate ulang
  tiap CI run. Konsekuensinya: mekanisme apapun yang butuh "state lama"
  di file itu (misal versionCode incremental) tidak akan bekerja; harus
  deterministik dari sumber yang benar-benar persisten (`package.json`).
- **Interface DB/notifikasi/lokasi/export dijaga identik** antara mode
  web dan native di setiap perubahan, supaya file fitur (`features/*.js`)
  tidak pernah perlu ikut diubah.
