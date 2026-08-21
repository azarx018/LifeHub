# Panduan Setup LifeHub → APK Android (tanpa PC)

Project ini sudah disiapkan supaya bisa di-build jadi APK lewat **GitHub
Actions** (build di cloud, bukan di device kamu). Kamu cuma perlu HP +
akun GitHub.

## Apa yang sudah disiapkan di sini

- `www/` — semua source PWA kamu (index.html, css, js, dst) dipindah ke sini.
  Ini standar struktur project Capacitor: `webDir` di `capacitor.config.json`
  nunjuk ke folder ini.
- `js/core/db.js` (di dalam `www/`) — sekarang jadi **dispatcher otomatis**:
  - Di browser/PWA biasa → tetap pakai IndexedDB (`db.web.js`), TIDAK ADA
    yang berubah dari sebelumnya.
  - Di APK Capacitor (native) → otomatis pakai SQLite asli di storage HP
    (`db.native.js`).
  - **16 file fitur (todo.js, habit.js, dst) tidak diubah sama sekali** —
    sudah dicek, semuanya cuma manggil `DB.getAll/put/get/delete/clearAll`,
    jadi otomatis kompatibel dengan kedua mode.
- `package.json` — daftar dependency Capacitor (v8, versi terbaru).
- `capacitor.config.json` — konfigurasi app (appId: `com.lifehub.app`,
  webDir: `www`).
- `.github/workflows/build-android.yml` — workflow yang otomatis build APK
  tiap kali kamu push ke branch `main`, atau bisa dipicu manual.

## Langkah-langkah (semua bisa dari HP)

### 1. Bikin repo GitHub
- Buka github.com, bikin akun kalau belum ada.
- Bikin repo baru, nama bebas (misal `lifehub`), **boleh public atau
  private** (kalau private, jatah menit GitHub Actions gratis lebih
  terbatas per bulan, tapi build sesekali masih cukup).

### 2. Upload isi folder project ini ke repo
Cara paling gampang dari HP: pakai app **GitHub** (resmi) atau buka
github.com lewat browser HP kamu, lalu:
- Di halaman repo kosong, ada opsi "uploading an existing file" — upload
  semua isi zip yang aku siapkan (jaga struktur foldernya, jangan di-flatten).
- Pastikan file `.github/workflows/build-android.yml` ikut ke-upload (kadang
  file yang diawali titik nggak kelihatan — upload folder `.github` dengan
  drag semua sekaligus, atau pakai app GitHub yang lebih gampang untuk ini
  dibanding browser).

> Kalau upload lewat browser HP kerasa ribet karena banyak file & subfolder,
> cara alternatif: install app **Working Copy (iOS)** atau **Termux + git
> (Android)** buat clone-push, atau minta bantuan aku bikinin skrip `git`
> yang tinggal kamu jalanin sekali kalau nanti sempat pinjam device dengan
> terminal.

### 3. Isi GitHub Secrets (WAJIB sebelum build pertama — release signing)
Sejak v6.4.0, workflow build APK butuh 4 GitHub Secrets supaya bisa
menandatangani APK release dengan key LifeHub yang permanen (lihat
`log.md` v6.4.0 & `LifeHub_Android_Signing_GitHub_Actions_Keystore_Spec.md`
untuk alasan lengkapnya). Tanpa ini, build akan gagal di step "Decode
release keystore".

Dari HP:
- Buka repo kamu di github.com → **Settings** (tab paling kanan, kadang
  perlu geser/scroll tab kalau layar HP sempit) → sidebar kiri **Secrets
  and variables** → **Actions** → tab **Secrets** → **New repository
  secret**.
- Tambahkan 4 secret ini satu-satu (nama HARUS persis sama, huruf besar):
  - `KEYSTORE_BASE64` — isi dari file `.jks` release yang sudah di-encode
    base64 (file terpisah yang dikirim khusus ke kamu, BUKAN bagian dari
    zip project ini — jangan pernah commit file `.jks` ke repo).
  - `KEYSTORE_PASSWORD`
  - `KEY_ALIAS`
  - `KEY_PASSWORD`
- Setelah ke-4 nya tersimpan, baru lanjut ke langkah "Jalankan build" di
  bawah.

⚠️ **Backup file `.jks` aslinya sendiri** di tempat aman (Google Drive
pribadi, password manager, dll) — GitHub Secret BUKAN backup, cuma tempat
CI baca kredensial saat build. Kalau file itu hilang tanpa backup, APK
LifeHub versi berikutnya tidak akan bisa lagi meng-update APK yang sudah
terpasang di HP kamu (harus install ulang dari awal, dan data lokal HP
tetap aman karena disimpan terpisah dari APK, tapi tetap merepotkan).

### 4. Jalankan build
- Setelah semua file ke-upload ke branch `main` (dan Secrets di atas
  sudah diisi), buka tab **Actions** di repo kamu.
- Kalau belum jalan otomatis, klik workflow **"Build & Release Android
  APK"** → tombol **"Run workflow"**.
- Tunggu beberapa menit (build Android di cloud biasanya 3–8 menit).

### 5. Download APK
- Setelah build selesai (centang hijau ✅), APK otomatis muncul di tab
  **Releases** repo kamu (release baru dengan tag `v<versi>`) — ini
  sumber resmi yang juga dipakai fitur update checker di dalam app.
- Alternatif: klik run yang selesai itu → scroll ke bagian **Artifacts**
  → download `lifehub-apk`.
- Transfer/download file itu ke HP kamu (kalau build dari HP browser,
  biasanya otomatis ke folder Download).

### 6. Install APK di HP
- Buka file `LifeHub-<version>.apk` yang sudah kamu download (misalnya
  `LifeHub-6.4.0.apk`).
- Android akan minta izin "Install dari sumber tidak dikenal" — izinkan
  khusus untuk file ini (aman, karena kamu sendiri yang build).
- Install & buka LifeHub versi APK-nya.

### 7. Pindahin data lama (dari versi PWA)
- Di app LifeHub versi lama (web/PWA) yang masih ada datanya: buka
  **Pengaturan → Export Data** → dapat file `lifehub_backup_....json`.
- Buka LifeHub versi APK baru → **Pengaturan → Import Data** → pilih file
  JSON tadi.
- Fitur import ini sudah generic (baca semua store lewat `DB.put`), jadi
  otomatis jalan ke SQLite tanpa perlu diubah.

## Yang PERLU kamu tahu / putuskan

- **v6.3.0**: notifikasi, lokasi (waktu sholat), dan export/import data sekarang
  full native — pakai `@capacitor/local-notifications`, `@capacitor/geolocation`,
  dan `@capacitor/filesystem`. Semuanya otomatis fallback ke Web API kalau
  dibuka sebagai PWA/browser biasa (nggak ada yang rusak di versi web).
  - **Export Data** di APK: file `lifehub_backup_....json` disimpan ke folder
    **Documents** app (bisa diakses lewat File Manager HP, biasanya di
    `Android/data/com.azrlifehub.app/files/Documents/`).
  - **Import Data**: tetap pakai file picker biasa (`<input type="file">`),
    ini didukung otomatis oleh WebView Capacitor tanpa perlu plugin tambahan.
  - **Notifikasi pagi/malam** sekarang pakai alarm native Android — tetap
    jalan walau app di-kill/nggak dibuka (beda dari versi web yang
    notifikasinya berhenti kalau tab/app ditutup).
  - **Fitur Auto Backup harian sudah dihapus** (baik tombol "Backup Sekarang"
    maupun jadwal otomatis tiap hari) — karena data sekarang disimpan di
    SQLite storage HP yang jauh lebih tahan lama dibanding IndexedDB browser,
    risiko "kehapus otomatis" udah jauh lebih kecil. Backup manual masih ada
    lewat tombol **Export Data**.
- **`appId`** di `capacitor.config.json` — ini ID unik app kamu. Kalau nanti
  mau publish ke Play Store, ID ini **tidak bisa diganti setelah publish
  pertama**.
- Build dari workflow ini adalah **APK release** yang sudah ditandatangani
  pakai release keystore permanen LifeHub (bukan APK debug lagi) — tiap
  APK baru otomatis bisa meng-update APK lama yang sudah terinstall,
  selama key-nya sama (lihat `log.md` v6.4.0 & `.github/workflows/build-android.yml`
  untuk detail). Keystore-nya sendiri **tidak ada di repo** — disimpan
  sebagai GitHub Secrets (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`,
  `KEY_ALIAS`, `KEY_PASSWORD`), dan backup file `.jks` aslinya harus kamu
  simpan sendiri di tempat aman (di luar chat AI manapun, di luar Git).
  Kalau keystore ini sampai hilang tanpa backup, versi APK berikutnya
  TIDAK BISA lagi meng-update APK yang sudah terpasang di HP.
- Tiap push ke `main` otomatis bikin **GitHub Release** baru (tag
  `v<version>`) dengan APK-nya sebagai asset — ini yang jadi sumber
  update checker di dalam app (Settings → App Update).
- Kalau `npm install` di GitHub Actions gagal karena versi paket berubah
  (npm registry terus update), kabari aku — aku bisa sesuaikan versi di
  `package.json`.
