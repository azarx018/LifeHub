# LifeHub 🏠

**Personal Life Management App** — PWA yang bisa diinstall di HP kamu!

## Fitur
- 🏠 Dashboard real-time (pagi/siang/malam)
- ✅ Todo Manager
- 🔥 Habit Tracker
- 📓 Journal Harian
- 🕌 Sholat Tracker
- 💤 Sleep Tracker
- 🚰 Water Tracker
- 📚 Goals & Milestones
- 📊 Statistik
- ⚙️ Pengaturan (Dark Mode, Backup/Restore)

## Deploy ke GitHub Pages

> Sejak persiapan build APK, source web pindah ke folder `www/` (lihat
> struktur proyek di bawah). Untuk GitHub Pages, arahkan ke folder itu:

1. Upload semua file (termasuk folder `www/`) ke repo GitHub kamu
2. Pergi ke **Settings > Pages**
3. Pilih **Source: Deploy from a branch**
4. Pilih branch `main` / `master`, folder **`/www`** (bukan `/ (root)` lagi)
5. Klik Save — tunggu 1-2 menit
6. Akses di `https://username.github.io/nama-repo/`

## Build APK Android

Lihat `PANDUAN_SETUP_ANDROID.md` — panduan lengkap build APK lewat GitHub
Actions, tanpa perlu PC/Android Studio.

## Install sebagai App (PWA)

### Android (Chrome):
- Buka website di Chrome
- Ketuk ikon **⋮** (titik tiga)
- Pilih **"Tambahkan ke Layar Utama"**

### iOS (Safari):
- Buka di Safari
- Ketuk ikon **Share** (kotak panah ke atas)
- Pilih **"Add to Home Screen"**

## Teknologi
- HTML5 + CSS3 + Vanilla JavaScript (ES Modules)
- IndexedDB (penyimpanan lokal)
- PWA (offline-ready)
- Tanpa framework, tanpa build tool, tanpa server

## Struktur Proyek (v6.0.0+, layout Capacitor sejak persiapan APK)

Sejak v6.0.0, kode dipecah dari 1 file `app.js` raksasa jadi modul-modul kecil
per fitur, biar gampang di-maintain. Sejak persiapan build Android (Capacitor),
seluruh source web dipindah ke folder `www/` (layout standar Capacitor —
lihat `PANDUAN_SETUP_ANDROID.md` untuk detail migrasi ke APK):

```
lifehub/
├── package.json                (dependency Capacitor)
├── capacitor.config.json       (config app: appId, webDir, dst)
├── .github/workflows/          (build APK otomatis via GitHub Actions)
├── PANDUAN_SETUP_ANDROID.md    (cara build APK tanpa PC)
└── www/                        (webDir — semua source PWA, tetap jalan sbg web/PWA biasa)
    ├── index.html
    ├── manifest.json
    ├── sw.js                    (service worker — otomatis di-skip saat jalan sbg APK native)
    ├── css/
    │   ├── base.css             (design tokens, layout, shell)
    │   ├── components.css       (button, card, modal, dll — dipakai lintas halaman)
    │   └── pages/               (1 file CSS per halaman)
    └── js/
        ├── main.js               (entry point — satu-satunya yang diload index.html)
        ├── legacy.js             (setupEvents — wiring tombol ke fitur)
        ├── core/
        │   ├── db.js             (dispatcher: pilih db.web.js/db.native.js otomatis)
        │   ├── db.web.js         (IndexedDB — mode browser/PWA)
        │   ├── db.native.js      (SQLite via Capacitor — mode APK Android)
        │   └── state, utils, router, modal, notifications, version
        ├── charts/                (donut chart, dipakai lintas fitur)
        ├── pdf/                   (generator laporan PDF)
        └── features/              (1 file per halaman: todo, habit, sholat, dst)
            └── game/               (Habit Quest RPG: engine, achievements, canvas)
```

**Catatan penting:** semua file di `features/` mengakses database HANYA lewat
`DB.getAll()/put()/get()/delete()/clearAll()` — tidak pernah menyentuh
IndexedDB/SQLite secara langsung. Karena itu, baik dibuka sebagai web/PWA
biasa maupun sebagai APK Android, kode fitur-fitur ini persis sama, tidak
perlu diubah.

**Versi app** — single source of truth-nya `package.json` (`"version"`).
Ubah di situ saja, lalu jalankan `npm run version:sync` — otomatis nyalin
ke `www/js/core/version.js` (`APP_VERSION`, dipakai teks "Tentang", meta
description, nama cache service worker, dan update checker) dan ke
`android/app/build.gradle` (`versionName`/`versionCode`). **Jangan** edit
`APP_VERSION` di `version.js` langsung — bakal ketimpa lagi pas sync
berikutnya (workflow CI selalu jalanin `version:sync` otomatis tiap build).

**Skema versi:** mengikuti [Semantic Versioning](https://semver.org/) —
`MAJOR.MINOR.PATCH`. Naikkan PATCH untuk bug fix kecil, MINOR untuk fitur
baru, MAJOR untuk perubahan besar/breaking.

> **Catatan kompatibilitas:** `sw.js` didaftarkan sebagai ES module
> (`{type:'module'}`) supaya bisa `import` versi langsung dari
> `core/version.js`. Ini didukung penuh di Chrome/Edge/Safari terbaru, tapi
> **Firefox desktop belum mendukung module service worker**.

## Data
Semua data tersimpan **lokal di perangkatmu** — tidak ada server, tidak ada akun.
Gunakan fitur **Export/Import** di Pengaturan untuk backup data.
