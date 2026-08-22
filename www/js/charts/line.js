/* ===== LINE CHART ===== */
// Dipakai buat Trend Chart di Stats. Gaya & pendekatan sama kayak donut.js —
// SVG di-generate manual pakai koordinat matematis, tanpa library luar
// (konsisten sama prinsip project: vanilla JS, tanpa framework/build tool).
import { fmt } from '../core/utils.js';
// BUG (v6.4.14): "fmt" dipakai di bawah (format angka titik data) tapi
// nggak PERNAH di-import — pola bug yang sama kayak renderJournal/renderTodos
// sebelumnya (fungsi dipakai, lupa di-import). Beda efeknya: karena dipanggil
// di dalam SVG-string-builder yang jalan pas render, chart trend di Stats
// bakal throw "fmt is not defined" tiap kali ada data buat digambar.

// points: array of { label, value } — value dalam skala 0-100 (persen) atau
// unit bebas asal `target` disediakan buat gambar garis putus-putus target.
export function buildLineChartSVG(points, opts = {}) {
  const {
    width = 300, height = 130,
    padTop = 18, padBottom = 24, padX = 10,
    color = '#6C63FF',
    maxValue = null,       // kalau null, dihitung otomatis dari data
    target = null,         // gambar garis putus-putus horizontal (misal target tidur 8 jam)
    valueSuffix = '',      // misal '%' atau 'j' (jam)
    valueFormat = null,    // function(v) => string, override default toFixed
  } = opts;

  if (!points.length) {
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}">
      <text x="${width/2}" y="${height/2}" text-anchor="middle" font-size="12" fill="var(--text3)">Belum ada data</text>
    </svg>`;
  }

  const values = points.map(p => p.value);
  const dataMax = Math.max(...values, target || 0, 1);
  const vMax = maxValue !== null ? maxValue : Math.ceil(dataMax * 1.15);
  const vMin = 0;
  const chartW = width - padX * 2;
  const chartH = height - padTop - padBottom;
  const n = points.length;

  const xAt = i => n === 1 ? width / 2 : padX + (i / (n - 1)) * chartW;
  const yAt = v => padTop + chartH - ((v - vMin) / (vMax - vMin)) * chartH;

  const fmt = v => valueFormat ? valueFormat(v) : (Number.isInteger(v) ? v : v.toFixed(1));

  // Garis polyline utama
  const linePts = points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(' ');

  // Area gradient di bawah garis (kesan "tren", bukan cuma garis kering)
  const areaPts = `${xAt(0).toFixed(1)},${(padTop+chartH).toFixed(1)} ${linePts} ${xAt(n-1).toFixed(1)},${(padTop+chartH).toFixed(1)}`;

  // Titik-titik data + label value di titik terakhir & titik tertinggi/terendah biar ga penuh
  const lastIdx = n - 1;
  let dots = '';
  points.forEach((p, i) => {
    const x = xAt(i), y = yAt(p.value);
    const isLast = i === lastIdx;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isLast ? 3.5 : 2.5}" fill="${isLast ? color : 'var(--surface)'}" stroke="${color}" stroke-width="1.6"/>`;
    if (isLast) {
      dots += `<text x="${x.toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="${n > 1 ? 'end' : 'middle'}" font-size="10.5" font-weight="700" fill="${color}">${fmt(p.value)}${valueSuffix}</text>`;
    }
  });

  // Garis target putus-putus (opsional)
  let targetLine = '';
  if (target !== null) {
    const ty = yAt(target);
    targetLine = `<line x1="${padX}" y1="${ty.toFixed(1)}" x2="${width-padX}" y2="${ty.toFixed(1)}" stroke="var(--text3)" stroke-width="1" stroke-dasharray="3,3" opacity="0.5"/>`;
  }

  // Label sumbu-X — biar ga penuh, tampilin cuma sebagian (awal, tengah, akhir)
  const showLabelAt = new Set([0, Math.floor((n-1)/2), n-1]);
  let xLabels = '';
  points.forEach((p, i) => {
    if (!showLabelAt.has(i)) return;
    const x = xAt(i);
    const anchor = i === 0 ? 'start' : i === n-1 ? 'end' : 'middle';
    xLabels += `<text x="${x.toFixed(1)}" y="${height-8}" text-anchor="${anchor}" font-size="9" fill="var(--text3)">${p.label}</text>`;
  });

  const gradId = 'trendGrad' + Math.random().toString(36).slice(2,8);

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="none" style="overflow:visible">
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${targetLine}
    <polygon points="${areaPts}" fill="url(#${gradId})"/>
    <polyline points="${linePts}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    ${xLabels}
  </svg>`;
}
