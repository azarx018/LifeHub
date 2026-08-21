/* ===== UPDATE POPUP + SETTINGS "APP UPDATE" UI ===== */
// Spec: LifeHub_GitHub_Release_APK_Update_Spec.md bagian 3-9, 17.
//
// File ini CUMA urusan UI/wiring tombol. Logika cek-versi/download/cleanup
// ada di core/updateChecker.js (dipisah supaya updateChecker.js tetap murni
// & gampang diuji tanpa DOM).
import { el, showToast } from './utils.js';
import { openModal, closeModal } from './modal.js';
import { isNativeApp, getPlugin } from './platform.js';
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  dismissUpdatePopup,
  isDismissed,
} from './updateChecker.js';

let _lastState = null; // cache render terakhir, dipakai settings section & popup

function renderPopupContent(state) {
  const curEl = el('updateCurrentVersion');
  const latEl = el('updateLatestVersion');
  if (curEl) curEl.textContent = state.currentVersion;
  if (latEl) latEl.textContent = state.latestVersion || '-';

  const changelogBox = el('updateChangelogBox');
  const changelogText = el('updateChangelogText');
  if (changelogBox && changelogText) {
    if (state.changelog && state.changelog.trim()) {
      // GitHub release body itu Markdown mentah dari user — jangan innerHTML
      // langsung (potensi HTML injection kalau ada yang usil di release notes).
      changelogText.textContent = state.changelog.trim().slice(0, 600);
      changelogBox.style.display = '';
    } else {
      changelogBox.style.display = 'none';
    }
  }
}

function setProgressUI(visible, fraction, label) {
  const box = el('updateProgressBox');
  const fill = el('updateProgressFill');
  const lbl = el('updateProgressLabel');
  if (box) box.style.display = visible ? '' : 'none';
  if (fill) {
    if (fraction === null || fraction === undefined) {
      fill.style.width = '100%';
      fill.classList.add('indeterminate');
    } else {
      fill.classList.remove('indeterminate');
      fill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    }
  }
  if (lbl && label) lbl.textContent = label;
}

function setModalButtonsBusy(busy) {
  const yes = el('updateBtnYes'), no = el('updateBtnNo');
  if (yes) { yes.disabled = busy; yes.textContent = busy ? 'Mengunduh…' : 'Iya, Update'; }
  if (no) no.disabled = busy;
}

export function renderSettingsUpdateSection(state) {
  const s = state || _lastState;
  if (!s) return;
  const curEl = el('settingsCurrentVersion');
  const statusEl = el('settingsUpdateStatus');
  const btnUpdateNow = el('btnUpdateNow');
  if (curEl) curEl.textContent = s.currentVersion;
  if (statusEl) {
    statusEl.textContent = s.updateAvailable
      ? `Update tersedia: v${s.latestVersion}`
      : '✓ Kamu sudah pakai versi terbaru';
  }
  if (btnUpdateNow) btnUpdateNow.style.display = s.updateAvailable ? '' : 'none';
}

async function startDownloadFlow(state) {
  setModalButtonsBusy(true);
  setProgressUI(true, 0, 'Mengunduh…');
  try {
    await downloadAndInstallUpdate(state.downloadUrl, (fraction) => {
      setProgressUI(true, fraction, fraction === null
        ? 'Mengunduh…'
        : `Mengunduh… ${Math.round(fraction * 100)}%`);
    });
    setProgressUI(true, 1, 'Membuka installer…');
    setTimeout(() => {
      closeModal('updateModal');
      setModalButtonsBusy(false);
      setProgressUI(false);
    }, 800);
  } catch (e) {
    console.error('Update gagal', e);
    showToast('Update gagal. Silakan coba lagi nanti.', 3500);
    // Bersihkan file APK yang gagal/tidak lengkap sesuai spec bagian 13.
    try {
      if (await isNativeApp()) {
        const Filesystem = getPlugin('Filesystem');
        await Filesystem.deleteFile({ path: 'lifehub-update.apk', directory: 'CACHE' });
      }
    } catch (_) { /* file mungkin memang belum sempat dibuat, aman diabaikan */ }
    setModalButtonsBusy(false);
    setProgressUI(false);
  }
}

function showUpdatePopup(state) {
  renderPopupContent(state);
  setProgressUI(false);
  setModalButtonsBusy(false);
  openModal('updateModal');
}

export function initUpdateUI() {
  const btnNo = el('updateBtnNo');
  const btnYes = el('updateBtnYes');
  const btnCheck = el('btnCheckUpdate');
  const btnUpdateNow = el('btnUpdateNow');

  if (btnNo) btnNo.addEventListener('click', async () => {
    if (_lastState && _lastState.latestVersion) await dismissUpdatePopup(_lastState.latestVersion);
    closeModal('updateModal');
  });

  if (btnYes) btnYes.addEventListener('click', async () => {
    if (!_lastState || !_lastState.downloadUrl) return;
    if (await isNativeApp() && !navigator.onLine) {
      showToast('Butuh koneksi internet untuk update.', 3000);
      return;
    }
    await startDownloadFlow(_lastState);
  });

  if (btnCheck) btnCheck.addEventListener('click', async () => {
    btnCheck.disabled = true;
    const prevText = btnCheck.textContent;
    btnCheck.textContent = 'Memeriksa…';
    try {
      const state = await checkForUpdate({ force: true });
      _lastState = state;
      renderSettingsUpdateSection(state);
      showToast(state.updateAvailable ? `Update v${state.latestVersion} tersedia 🎉` : 'Sudah versi terbaru ✓', 2500);
    } finally {
      btnCheck.disabled = false;
      btnCheck.textContent = prevText;
    }
  });

  if (btnUpdateNow) btnUpdateNow.addEventListener('click', async () => {
    if (!_lastState || !_lastState.updateAvailable) return;
    if (await isNativeApp() && !navigator.onLine) {
      showToast('Butuh koneksi internet untuk update.', 3000);
      return;
    }
    showUpdatePopup(_lastState);
  });
}

// Dipanggil sekali dari main.js setelah splash selesai. TIDAK BOLEH
// menghalangi startup — dipanggil via setTimeout non-blocking oleh caller,
// dan checkForUpdate() sendiri sudah graceful terhadap error/offline.
export async function runStartupUpdateCheck() {
  const state = await checkForUpdate({ force: false });
  _lastState = state;
  renderSettingsUpdateSection(state);
  if (!state.updateAvailable || !state.latestVersion) return;
  if (await isDismissed(state.latestVersion)) return; // sudah ditolak utk versi ini
  showUpdatePopup(state);
}
