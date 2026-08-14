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

1. Upload semua file ke repo GitHub kamu
2. Pergi ke **Settings > Pages**
3. Pilih **Source: Deploy from a branch**
4. Pilih branch `main` / `master`, folder `/ (root)`
5. Klik Save — tunggu 1-2 menit
6. Akses di `https://username.github.io/nama-repo/`

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

## Struktur Proyek (v6.0.0+)

Sejak v6.0.0, kode dipecah dari 1 file `app.js` raksasa jadi modul-modul kecil
per fitur, biar gampang di-maintain:

```
lifehub/
├── index.html
├── manifest.json
├── sw.js                      (service worker)
├── css/
│   ├── base.css                (design tokens, layout, shell)
│   ├── components.css          (button, card, modal, dll — dipakai lintas halaman)
│   └── pages/                  (1 file CSS per halaman)
└── js/
    ├── main.js                 (entry point — satu-satunya yang diload index.html)
    ├── legacy.js                (setupEvents — wiring tombol ke fitur)
    ├── core/                    (db, state, utils, router, modal, notifications, version)
    ├── charts/                  (donut chart, dipakai lintas fitur)
    ├── pdf/                     (generator laporan PDF)
    └── features/                (1 file per halaman: todo, habit, sholat, dst)
        └── game/                (Habit Quest RPG: engine, achievements, canvas)
```

**Versi app** ada di satu tempat: `js/core/version.js` (`APP_VERSION`). Ubah di
situ saja — otomatis kepakai di teks "Tentang", meta description, dan nama
cache service worker.

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
