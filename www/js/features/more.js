/* ===== MORE / LAINNYA (v6.7) =====
   Halaman daftar fitur + pengaturan cepat untuk mobile (menggantikan item
   Journal di bottom nav). Baris-barisnya navigasi lewat data-page biasa. */
import { S } from '../core/state.js';
import { el } from '../core/utils.js';
import { APP_VERSION } from '../core/version.js';

export function renderMore() {
  const name = (S.settings && S.settings.name) || 'Azhar';
  const a = el('moreAvatar'); if(a) a.textContent = name.trim().charAt(0).toUpperCase() || 'A';
  const n = el('moreName'); if(n) n.textContent = name;
  const v = el('moreVer'); if(v) v.textContent = 'LifeHub v' + APP_VERSION;
  const dm = el('moreDarkToggle'); if(dm) dm.checked = !!S.settings.darkMode;
}
