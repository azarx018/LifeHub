/* ===== DONUT CHART ===== */
// Tidak ada perubahan logika dari app.js v5.7 — cuma dipindah + di-export.
// Dipakai lintas fitur: Dashboard, Stats.

export function buildDonutSVG(segments) {
  const R = 48, SW = 13, SIZE = 116;
  const C = 2 * Math.PI * R;
  const cx = SIZE / 2, cy = SIZE / 2;
  const GAP = 2.5;
  const validSegs = segments.filter(s => s.total > 0);
  if (!validSegs.length) {
    return { svg: `<svg viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}"><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--border)" stroke-width="${SW}"/><text x="${cx}" y="${cy+5}" text-anchor="middle" font-size="12" fill="var(--text3)">No data</text></svg>`, pct: 0 };
  }
  const totalWeight = validSegs.reduce((a, s) => a + s.total, 0);
  const totalGap = GAP * validSegs.length;
  const availPct = 100 - totalGap;
  let offset = 0, arcs = '';
  validSegs.forEach(s => {
    const segPct = (s.total / totalWeight) * availPct;
    const donePct = (Math.min(s.value, s.total) / s.total) * segPct;
    const rot = -90 + (offset / 100 * 360);
    const dashTotal = (segPct / 100 * C).toFixed(2);
    const dashBg = (C - segPct / 100 * C).toFixed(2);
    const dashDone = (donePct / 100 * C).toFixed(2);
    const dashRest = (C - donePct / 100 * C).toFixed(2);
    arcs += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${s.color}28" stroke-width="${SW}" stroke-dasharray="${dashTotal} ${dashBg}" transform="rotate(${rot} ${cx} ${cy})"/>`;
    if (donePct > 0.3) {
      arcs += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${s.color}" stroke-width="${SW}" stroke-linecap="round" stroke-dasharray="${dashDone} ${dashRest}" transform="rotate(${rot} ${cx} ${cy})"/>`;
    }
    offset += segPct + GAP;
  });
  const totalDone = segments.reduce((a, s) => a + s.value, 0);
  const totalAll = segments.reduce((a, s) => a + s.total, 0);
  const pct = totalAll > 0 ? Math.round(totalDone / totalAll * 100) : 0;
  return { svg: `<svg viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}"><g>${arcs}</g><text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="19" font-weight="700" fill="var(--text)">${pct}%</text><text x="${cx}" y="${cy + 13}" text-anchor="middle" font-size="8" fill="var(--text3)">selesai hari ini</text></svg>`, pct };
}
