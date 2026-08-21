#!/usr/bin/env node
/* ===== APPLY RELEASE SIGNING ===== */
// node scripts/apply-release-signing.js
//
// KENAPA SCRIPT INI ADA (bukan cukup taruh signingConfig langsung di build.gradle):
// Sama seperti scripts/sync-version.js, folder android/ di project ini
// EPHEMERAL — di-.gitignore, digenerate ulang dari nol tiap kali
// `npx cap add android` jalan (lihat catatan panjang di sync-version.js).
// Artinya TIDAK ADA build.gradle yang persisten di repo untuk ditaruhi
// signingConfig secara manual — file itu harus di-patch programatis setiap
// run CI, SETELAH "cap add android" dan SEBELUM "gradlew assembleRelease".
//
// Script ini HANYA membaca kredensial signing dari environment variable
// (di-set oleh workflow dari GitHub Actions Secrets) — TIDAK PERNAH
// menerima atau menulis password sebagai argumen CLI (yang bisa nyangkut di
// shell history/process list) dan TIDAK PERNAH mencetak nilainya ke log.
//
// Env var yang dibutuhkan:
//   LIFEHUB_KEYSTORE_PATH      - path absolut ke file .jks hasil decode base64
//   LIFEHUB_KEYSTORE_PASSWORD  - storePassword
//   LIFEHUB_KEY_ALIAS          - keyAlias
//   LIFEHUB_KEY_PASSWORD       - keyPassword
//
// Gradle sendiri yang membaca env var ini saat build (lewat System.getenv(...)
// di build.gradle yang disuntik script ini) — bukan script Node ini yang
// menyimpan valuenya ke file. Password TIDAK PERNAH ditulis ke build.gradle,
// hanya NAMA env var-nya.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ANDROID_DIR = path.join(ROOT, 'android');
const GRADLE_GROOVY = path.join(ANDROID_DIR, 'app', 'build.gradle');
const GRADLE_KTS = path.join(ANDROID_DIR, 'app', 'build.gradle.kts');

const REQUIRED_ENV = [
  'LIFEHUB_KEYSTORE_PATH',
  'LIFEHUB_KEYSTORE_PASSWORD',
  'LIFEHUB_KEY_ALIAS',
  'LIFEHUB_KEY_PASSWORD',
];

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function checkEnv() {
  const missing = REQUIRED_ENV.filter(k => !process.env[k] || !process.env[k].trim());
  if (missing.length) {
    fail(
      `Env var wajib belum di-set: ${missing.join(', ')}.\n` +
      `  Ini harus di-export oleh step workflow SEBELUM memanggil script ini ` +
      `(hasil decode GitHub Secrets KEYSTORE_BASE64/KEYSTORE_PASSWORD/KEY_ALIAS/KEY_PASSWORD).`
    );
  }
  if (!fs.existsSync(process.env.LIFEHUB_KEYSTORE_PATH)) {
    fail(
      `File keystore tidak ditemukan di LIFEHUB_KEYSTORE_PATH="${process.env.LIFEHUB_KEYSTORE_PATH}".\n` +
      `  Pastikan step decode base64 (echo "$KEYSTORE_BASE64" | base64 --decode > ...) sudah jalan duluan.`
    );
  }
}

function detectGradleFile() {
  if (!fs.existsSync(ANDROID_DIR)) {
    fail(`Folder android/ tidak ditemukan di ${ANDROID_DIR}. Jalankan "npx cap add android" dulu sebelum script ini.`);
  }
  const groovyExists = fs.existsSync(GRADLE_GROOVY);
  const ktsExists = fs.existsSync(GRADLE_KTS);
  if (groovyExists && ktsExists) {
    fail(`Ditemukan DUA file build.gradle (build.gradle DAN build.gradle.kts) di android/app/. Cek manual dulu.`);
  }
  if (groovyExists) return { file: GRADLE_GROOVY, kind: 'groovy' };
  if (ktsExists) return { file: GRADLE_KTS, kind: 'kts' };
  fail(`android/app/build.gradle maupun build.gradle.kts tidak ditemukan. Struktur project Android tidak dikenali.`);
}

// Brace-counting generik: cari `needle` (regex match untuk header blok, mis.
// /android\s*\{/), lalu balikkan rentang isi blok { ... }-nya. Dipakai juga
// untuk cari sub-blok bersarang (buildTypes -> release) dengan menjalankan
// fungsi ini lagi di dalam teks blok induk.
function findBlock(content, headerRegex, fromIndex = 0) {
  const re = new RegExp(headerRegex.source, headerRegex.flags.includes('g') ? headerRegex.flags : headerRegex.flags + 'g');
  re.lastIndex = fromIndex;
  const m = re.exec(content);
  if (!m) return null;
  const braceOpenIdx = m.index + m[0].length - 1;
  let depth = 0;
  let endIdx = -1;
  for (let i = braceOpenIdx; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) { endIdx = i; break; }
    }
  }
  if (endIdx === -1) return null;
  return {
    headerStart: m.index,
    blockStart: braceOpenIdx + 1,
    blockEnd: endIdx,
    blockText: content.slice(braceOpenIdx + 1, endIdx),
  };
}

function alreadyApplied(content) {
  return content.includes('LIFEHUB_KEYSTORE_PATH');
}

function applyGroovy(content) {
  const androidBlock = findBlock(content, /\bandroid\s*\{/);
  if (!androidBlock) fail(`Tidak menemukan blok "android { ... }" di build.gradle.`);

  const buildTypesBlock = findBlock(content, /\bbuildTypes\s*\{/, androidBlock.blockStart);
  if (!buildTypesBlock || buildTypesBlock.blockStart > androidBlock.blockEnd) {
    fail(`Tidak menemukan blok "buildTypes { ... }" di dalam blok android { ... }.`);
  }
  const releaseBlock = findBlock(content, /\brelease\s*\{/, buildTypesBlock.blockStart);
  if (!releaseBlock || releaseBlock.blockStart > buildTypesBlock.blockEnd) {
    fail(`Tidak menemukan blok "release { ... }" di dalam buildTypes { ... }.`);
  }

  const signingConfigsBlock =
`    signingConfigs {
        release {
            storeFile file(System.getenv("LIFEHUB_KEYSTORE_PATH"))
            storePassword System.getenv("LIFEHUB_KEYSTORE_PASSWORD")
            keyAlias System.getenv("LIFEHUB_KEY_ALIAS")
            keyPassword System.getenv("LIFEHUB_KEY_PASSWORD")
        }
    }
`;
  // Sisipkan "signingConfig signingConfigs.release" sebagai baris pertama
  // di dalam release { ... }, TANPA mengganggu isi lain (minifyEnabled,
  // proguardFiles, dst tetap utuh).
  const newReleaseBlockText = `\n            signingConfig signingConfigs.release` + releaseBlock.blockText;

  // Susun ulang dari belakang ke depan (index besar dulu) supaya index yang
  // lebih kecil tidak bergeser saat splice string dilakukan.
  let out = content.slice(0, releaseBlock.blockStart) + newReleaseBlockText + content.slice(releaseBlock.blockEnd);
  // Sisipkan signingConfigs block tepat sebelum "buildTypes {" (posisi
  // buildTypesBlock.headerStart masih valid karena kita cuma ubah teks
  // SETELAH releaseBlock, yang posisinya > buildTypesBlock.headerStart).
  out = out.slice(0, buildTypesBlock.headerStart) + signingConfigsBlock + out.slice(buildTypesBlock.headerStart);
  return out;
}

function applyKts(content) {
  const androidBlock = findBlock(content, /\bandroid\s*\{/);
  if (!androidBlock) fail(`Tidak menemukan blok "android { ... }" di build.gradle.kts.`);

  const buildTypesBlock = findBlock(content, /\bbuildTypes\s*\{/, androidBlock.blockStart);
  if (!buildTypesBlock || buildTypesBlock.blockStart > androidBlock.blockEnd) {
    fail(`Tidak menemukan blok "buildTypes { ... }" di dalam blok android { ... }.`);
  }
  const releaseBlock = findBlock(content, /\brelease\s*\{/, buildTypesBlock.blockStart);
  if (!releaseBlock || releaseBlock.blockStart > buildTypesBlock.blockEnd) {
    fail(`Tidak menemukan blok "release { ... }" di dalam buildTypes { ... }.`);
  }

  const signingConfigsBlock =
`    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("LIFEHUB_KEYSTORE_PATH"))
            storePassword = System.getenv("LIFEHUB_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("LIFEHUB_KEY_ALIAS")
            keyPassword = System.getenv("LIFEHUB_KEY_PASSWORD")
        }
    }
`;
  const newReleaseBlockText = `\n            signingConfig = signingConfigs.getByName("release")` + releaseBlock.blockText;

  let out = content.slice(0, releaseBlock.blockStart) + newReleaseBlockText + content.slice(releaseBlock.blockEnd);
  out = out.slice(0, buildTypesBlock.headerStart) + signingConfigsBlock + out.slice(buildTypesBlock.headerStart);
  return out;
}

function main() {
  checkEnv();
  const { file: gradleFile, kind } = detectGradleFile();
  const original = fs.readFileSync(gradleFile, 'utf8');

  if (alreadyApplied(original)) {
    console.log(`✓ Release signingConfig sudah pernah diterapkan di ${path.relative(ROOT, gradleFile)}, skip (idempotent).`);
    return;
  }

  const newContent = kind === 'kts' ? applyKts(original) : applyGroovy(original);
  fs.writeFileSync(gradleFile, newContent, 'utf8');

  console.log(`✓ Release signingConfig diterapkan ke ${path.relative(ROOT, gradleFile)} (sintaks: ${kind === 'kts' ? 'Kotlin DSL' : 'Groovy'})`);
  console.log(`✓ Alias: ${process.env.LIFEHUB_KEY_ALIAS}`);
  console.log(`✓ Keystore path: ${process.env.LIFEHUB_KEYSTORE_PATH}`);
  console.log(`  (password TIDAK dicetak — dibaca Gradle langsung dari environment variable saat build)`);
}

main();
