#!/usr/bin/env node
/* ===== VERSION SYNC ===== */
// npm run version:sync
//
// package.json ("version") = SINGLE SOURCE OF TRUTH untuk versi app.
// Script ini nyalin versi itu ke android/app/build.gradle (atau .kts) —
// TANPA pernah nulis balik ke package.json (arah sinkronisasi 1 arah).
//
// ===== KENAPA versionCode DIHITUNG, BUKAN DIBACA-LALU-DI-+1 =====
// Project ini nge-generate folder android/ dari nol tiap kali CI (GitHub
// Actions) jalan — `npx cap add android` dipanggil setiap run karena
// android/ sengaja di-.gitignore (lihat PANDUAN_SETUP_ANDROID.md & workflow).
// Konsekuensinya: android/app/build.gradle TIDAK PERNAH persisten antar
// build — dia selalu lahir ulang dengan versionCode 1 / versionName "1.0"
// bawaan template Capacitor. Artinya strategi "baca versionCode lama, +1"
// TIDAK BISA dipakai di sini — tidak ada "versionCode lama" yang beneran
// nyambung antar release, cuma ilusi state yang di-reset tiap run.
//
// Solusinya: turunkan versionCode secara DETERMINISTIK dari semver di
// package.json, pakai formula:
//
//     versionCode = major*10000 + minor*100 + patch
//
// Sifatnya:
//   - Idempoten — jalanin berkali-kali dgn package.json version yang sama
//     -> hasil SAMA PERSIS tiap kali (aman di-run ulang, sesuai requirement).
//   - Monoton — selama semver naik wajar (6.3.1 < 6.3.2 < 6.4.0 < 7.0.0),
//     versionCode ikut naik juga (60301 < 60302 < 60400 < 70000).
//   - Gak butuh file metadata terpisah buat nyimpen "versionCode terakhir",
//     karena satu-satunya source of truth yang beneran persisten di repo
//     ini cuma package.json itu sendiri — nambah file state lain justru
//     nambah 1 sumber kebenaran baru yang bisa out-of-sync, padahal
//     tujuannya package.json udah cukup sebagai single source of truth.
//
// RISIKO COLLISION (kenapa ada validasi ketat di bawah):
// Formula ini AMAN selama minor < 100 DAN patch < 100. Kalau salah satu
// tembus 100, terjadi "carry" yang bisa nabrak range major berikutnya —
// misal 6.100.0 -> 6*10000 + 100*100 + 0 = 70000, PERSIS SAMA dengan
// 7.0.0 -> 70000. Collision. Makanya script ini GAGAL KERAS (bukan diam-diam
// lanjut) kalau minor/patch >= 100, dengan pesan jelas gimana cara benerinnya.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');
const ANDROID_DIR = path.join(ROOT, 'android');
const GRADLE_GROOVY = path.join(ANDROID_DIR, 'app', 'build.gradle');
const GRADLE_KTS = path.join(ANDROID_DIR, 'app', 'build.gradle.kts');

// Batas aman per komponen semver supaya formula gak collision (lihat komentar
// panjang di atas). 100 dipilih karena itu titik di mana "carry" ke slot
// berikutnya (ratusan) mulai nabrak alokasi major*10000.
const MAX_MINOR_PATCH = 99;
// Hard limit resmi Android Play Store untuk versionCode (Int32 positif,
// dan Play Console sendiri membatasi maksimum 2100000000). Dicek juga di
// sini sebagai jaring pengaman terakhir kalau major-nya kebesaran.
const ANDROID_VERSION_CODE_MAX = 2100000000;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function readPackageVersion() {
  if (!fs.existsSync(PKG_PATH)) fail(`package.json tidak ditemukan di ${PKG_PATH}`);
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  } catch (e) {
    fail(`Gagal parse package.json: ${e.message}`);
  }
  if (!pkg.version || typeof pkg.version !== 'string') {
    fail(`package.json tidak punya field "version" yang valid.`);
  }
  return pkg.version;
}

// Validasi ketat "x.y.z" — tiga angka non-negatif dipisah titik. Sengaja
// TIDAK menerima suffix pre-release (mis. "6.3.2-beta.1") karena urutan
// pre-release itu ambigu buat formula versionCode yang simpel ini; kalau
// nanti perlu, ini titik yang tepat buat extend, bukan sekarang (YAGNI).
function parseSemver(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!m) {
    fail(
      `Versi "${version}" di package.json bukan format semver "x.y.z" yang valid.\n` +
      `  Contoh yang benar: "6.3.2". Pre-release/build tag (mis. "-beta") belum didukung script ini.`
    );
  }
  const [, major, minor, patch] = m.map(Number);
  return { major, minor, patch };
}

function computeVersionCode({ major, minor, patch }) {
  if (minor > MAX_MINOR_PATCH) {
    fail(
      `minor version (${minor}) sudah >= 100 — formula versionCode (major*10000 + minor*100 + patch) ` +
      `bakal collision/nabrak range major berikutnya.\n` +
      `  Solusi: naikkan ke major berikutnya (mis. jadi "${major + 1}.0.${patch}") daripada terus nambah minor.`
    );
  }
  if (patch > MAX_MINOR_PATCH) {
    fail(
      `patch version (${patch}) sudah >= 100 — formula versionCode (major*10000 + minor*100 + patch) ` +
      `bakal collision/nabrak range minor berikutnya.\n` +
      `  Solusi: naikkan minor version (mis. jadi "${major}.${minor + 1}.0") daripada terus nambah patch.`
    );
  }
  const code = major * 10000 + minor * 100 + patch;
  if (code <= 0) fail(`versionCode hasil hitung tidak valid (${code}).`);
  if (code > ANDROID_VERSION_CODE_MAX) {
    fail(
      `versionCode hasil hitung (${code}) melebihi batas maksimum Android/Play Store ` +
      `(${ANDROID_VERSION_CODE_MAX}). major version (${major}) kemungkinan sudah kebesaran.`
    );
  }
  return code;
}

function detectGradleFile() {
  if (!fs.existsSync(ANDROID_DIR)) {
    fail(
      `Folder android/ tidak ditemukan di ${ANDROID_DIR}.\n` +
      `  Project Android belum di-generate. Jalankan "npx cap add android" dulu ` +
      `(di CI, ini harus jadi step SEBELUM "npm run version:sync" — lihat workflow).`
    );
  }
  const groovyExists = fs.existsSync(GRADLE_GROOVY);
  const ktsExists = fs.existsSync(GRADLE_KTS);
  if (groovyExists && ktsExists) {
    fail(
      `Ditemukan DUA file build.gradle (build.gradle DAN build.gradle.kts) di android/app/.\n` +
      `  Ini situasi tidak normal untuk project Capacitor standar — cek manual dulu, ` +
      `script ini sengaja berhenti daripada menebak salah satu.`
    );
  }
  if (groovyExists) return { file: GRADLE_GROOVY, kind: 'groovy' };
  if (ktsExists) return { file: GRADLE_KTS, kind: 'kts' };
  fail(
    `android/app/build.gradle maupun build.gradle.kts tidak ditemukan.\n` +
    `  Struktur project Android tidak dikenali — pastikan "npx cap add android" ` +
    `sudah selesai jalan dengan benar sebelum script ini dipanggil.`
  );
}

// Cari isi blok `defaultConfig { ... }` lewat brace-counting (bukan regex
// global ke seluruh file), supaya replace versionName/versionCode di bawah
// SELALU scoped ke blok ini aja — gak mungkin kesenggol baris lain manapun
// di file (signingConfigs, buildTypes, dependencies, dll tetap utuh).
function extractDefaultConfigBlock(content) {
  const startMatch = /defaultConfig\s*\{/.exec(content);
  if (!startMatch) {
    fail(`Tidak menemukan blok "defaultConfig { ... }" di build.gradle. File mungkin sudah dimodifikasi di luar struktur standar Capacitor.`);
  }
  const braceOpenIdx = startMatch.index + startMatch[0].length - 1; // posisi '{'
  let depth = 0;
  let endIdx = -1;
  for (let i = braceOpenIdx; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) { endIdx = i; break; }
    }
  }
  if (endIdx === -1) {
    fail(`Blok "defaultConfig { ... }" di build.gradle tidak punya kurung tutup yang seimbang — file kemungkinan corrupt/tidak valid.`);
  }
  return {
    blockStart: braceOpenIdx + 1,
    blockEnd: endIdx,
    blockText: content.slice(braceOpenIdx + 1, endIdx)
  };
}

// Replace SATU baris versionName/versionCode di dalam teks blok defaultConfig
// (bukan global ke seluruh file). `kind` menentukan sintaks yang dicari:
// Groovy: `versionCode 1` / `versionName "1.0"` (tanpa "=")
// Kotlin (.kts): `versionCode = 1` / `versionName = "1.0"` (pakai "=")
function replaceInBlock(blockText, kind, versionCode, versionName) {
  const patterns = kind === 'kts'
    ? {
        code: /(^\s*versionCode\s*=\s*)\d+(\s*)$/m,
        name: /(^\s*versionName\s*=\s*)"[^"]*"(\s*)$/m
      }
    : {
        code: /(^\s*versionCode\s+)\d+(\s*)$/m,
        name: /(^\s*versionName\s+)"[^"]*"(\s*)$/m
      };

  if (!patterns.code.test(blockText)) {
    fail(
      `Tidak menemukan baris "versionCode" di dalam blok defaultConfig (sintaks ${kind === 'kts' ? 'Kotlin DSL' : 'Groovy'}).\n` +
      `  File mungkin punya format yang tidak standar — script ini sengaja tidak melakukan ` +
      `broad replacement untuk menghindari salah ubah konfigurasi Gradle lain.`
    );
  }
  if (!patterns.name.test(blockText)) {
    fail(
      `Tidak menemukan baris "versionName" di dalam blok defaultConfig (sintaks ${kind === 'kts' ? 'Kotlin DSL' : 'Groovy'}).\n` +
      `  File mungkin punya format yang tidak standar — script ini sengaja tidak melakukan ` +
      `broad replacement untuk menghindari salah ubah konfigurasi Gradle lain.`
    );
  }

  let out = blockText.replace(patterns.code, `$1${versionCode}$2`);
  out = out.replace(patterns.name, `$1"${versionName}"$2`);
  return out;
}

// ===== www/js/core/version.js =====
// Sebelum ini, APP_VERSION di www/js/core/version.js di-set MANUAL terpisah
// dari package.json — dua sumber kebenaran yang gampang out-of-sync (ini yang
// beneran kejadian: package.json sempat "6.3.1" sementara version.js sudah
// "6.3.2"). Sekarang package.json tetap satu-satunya sumber; file ini di-
// generate ulang (1 arah, sama seperti build.gradle) supaya app ("Tentang",
// meta description, sw.js cache name) selalu baca versi yang sama persis
// dengan yang dipublish ke GitHub Release.
const APP_VERSION_FILE = path.join(ROOT, 'www', 'js', 'core', 'version.js');

function writeAppVersionFile(pkgVersion) {
  if (!fs.existsSync(path.dirname(APP_VERSION_FILE))) {
    fail(`Folder ${path.relative(ROOT, path.dirname(APP_VERSION_FILE))} tidak ditemukan — struktur project www/ tidak dikenali.`);
  }
  const content =
`/* ===== VERSION ===== */
// Satu-satunya tempat versi app didefinisikan secara MANUAL adalah
// package.json ("version"). File ini di-generate otomatis oleh
// scripts/sync-version.js — JANGAN edit APP_VERSION di sini secara manual,
// perubahan akan hilang tertimpa saat "npm run version:sync" berikutnya.
// Dipakai oleh:
// - state.js / main.js (APP_VERSION di teks "Tentang" & meta description)
// - sw.js (nama cache, lewat dynamic import)
// - core/updateChecker.js (perbandingan versi terpasang vs GitHub Release terbaru)
export const APP_VERSION = '${pkgVersion}';
`;
  const original = fs.existsSync(APP_VERSION_FILE) ? fs.readFileSync(APP_VERSION_FILE, 'utf8') : null;
  if (content !== original) {
    fs.writeFileSync(APP_VERSION_FILE, content, 'utf8');
  }
}

function main() {
  const wwwOnly = process.argv.includes('--www-only');
  const pkgVersion = readPackageVersion();

  if (wwwOnly) {
    // Dipakai workflow deploy-pages.yml — di situ folder android/ memang
    // sengaja TIDAK di-generate (workflow Pages cuma butuh www/, gak perlu
    // build Android sama sekali), jadi bagian sync ke build.gradle di-skip.
    writeAppVersionFile(pkgVersion);
    console.log(`✓ Package version: ${pkgVersion}`);
    console.log(`✓ www/js/core/version.js synced (--www-only, android/ dilewati)`);
    return;
  }

  const semver = parseSemver(pkgVersion);
  const versionCode = computeVersionCode(semver);

  const { file: gradleFile, kind } = detectGradleFile();
  const original = fs.readFileSync(gradleFile, 'utf8');
  const { blockStart, blockEnd, blockText } = extractDefaultConfigBlock(original);
  const newBlockText = replaceInBlock(blockText, kind, versionCode, pkgVersion);

  const newContent = original.slice(0, blockStart) + newBlockText + original.slice(blockEnd);

  // Idempotent no-op guard: kalau isinya sama persis, gak perlu nulis ulang
  // file (hindari "touch" file yang gak perlu, mis. ganggu file mtime di CI cache).
  if (newContent !== original) {
    fs.writeFileSync(gradleFile, newContent, 'utf8');
  }

  writeAppVersionFile(pkgVersion);

  console.log(`✓ Package version: ${pkgVersion}`);
  console.log(`✓ Android versionName: ${pkgVersion}`);
  console.log(`✓ Android versionCode: ${versionCode}`);
  console.log(`✓ www/js/core/version.js synced`);
  console.log(`✓ Version sync completed`);
  console.log(`  (${path.relative(ROOT, gradleFile)}, sintaks: ${kind === 'kts' ? 'Kotlin DSL' : 'Groovy'})`);
}

main();
