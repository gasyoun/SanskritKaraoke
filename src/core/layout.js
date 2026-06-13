/**
 * src/core/layout.js — Wave diagram geometry: column widths, row positions, wave path.
 * Pure ES module. DOM dependency severed: measureSyl is injected or uses a lazy canvas.
 * Port of app.js:633–831.
 */

export const ROW_Y_BASE = [72, 112, 152, 188, 224]; // 5 rows (0-indexed)
export const SVG_H_BASE = 266;
export const COL_STEP_MIN = 30;
export const SVG_PAD = 4;

/** Compute scaled row Y positions for a given wave scale (default 0.5). */
export function getRowY(scale = 0.5) {
  return ROW_Y_BASE.map(y => Math.round(y * scale));
}

/**
 * Compute SVG height for a set of syllables at a given wave scale.
 * syls: array of {row} objects; maxRow defaults to 3.
 */
export function getSvgH(syls = [], scale = 0.5, hasVipula = false) {
  const maxRow = syls.length
    ? Math.max(3, ...syls.map(s => s.row ?? 1))
    : 3;
  const lastUsedY = Math.round(ROW_Y_BASE[maxRow] * scale);
  return lastUsedY + 34 + (hasVipula ? 20 : 0);
}

// ── Text measurement ───────────────────────────────────────────────────────────
// Lazy browser canvas for measurement (created once per module load in browser context).
let _ctx = null;
const _cache = new Map();

function _lazyCtx() {
  if (!_ctx) {
    const c = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(1, 1)
      : document.createElement('canvas');
    _ctx = c.getContext('2d');
  }
  return _ctx;
}

/**
 * Measure text width in pixels.
 * @param {string} text
 * @param {string} font  — full CSS font string, e.g. '700 13px "Charter Indologique",serif'
 * @param {Function} [measureFn]  — injected measure(text, font)→number; uses browser canvas if omitted.
 */
export function measureText(text, font, measureFn) {
  if (measureFn) return measureFn(text, font);
  const key = font + '|' + text;
  if (_cache.has(key)) return _cache.get(key);
  const ctx = _lazyCtx();
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width);
  _cache.set(key, w);
  return w;
}

/** Measure syllable label width (guru=bold 13px, laghu=regular 13px). */
export function measureSyl(text, bold, measureFn) {
  const font = `${bold ? '700' : '400'} 13px "Charter Indologique",serif`;
  return measureText(text, font, measureFn);
}

// ── Column widths ──────────────────────────────────────────────────────────────
/**
 * Compute unified column widths from both strophe syllable lists.
 * Returns a colWidths object: { [colIndex]: width }.
 * Port of app.js:704 computeSharedColWidths.
 */
export function computeSharedColWidths(syls1, syls2, measureFn) {
  if (!syls1.length && !syls2.length) return {};

  function rawWidths(syls) {
    const w = {};
    syls.forEach(s => {
      w[s.col] = Math.max(COL_STEP_MIN,
        measureSyl((s.syl || '') + (s.arrow || ''), s.type === 'guru', measureFn) + 14);
    });
    return w;
  }

  const raw1 = rawWidths(syls1);
  const raw2 = rawWidths(syls2);

  const numCols = Math.max(
    syls1.length ? Math.max(...syls1.map(s => s.col)) + 1 : 0,
    syls2.length ? Math.max(...syls2.map(s => s.col)) + 1 : 0
  );
  const merged = {};
  for (let i = 0; i < numCols; i++) {
    merged[i] = Math.max(raw1[i] || COL_STEP_MIN, raw2[i] || COL_STEP_MIN);
  }

  // Stretch so total width >= 620
  const rawTotal = Object.values(merged).reduce((a, v) => a + v, 0) + SVG_PAD * 2;
  const targetW  = Math.max(620, rawTotal);
  const stretch  = (targetW - SVG_PAD * 2) / (rawTotal - SVG_PAD * 2);
  if (stretch > 1) {
    for (let i = 0; i < numCols; i++) merged[i] = Math.round(merged[i] * stretch);
  }

  return merged;
}

/** X center coordinate for column c. Port of app.js:738. */
export function colX(c, colWidths) {
  if (!colWidths || !Object.keys(colWidths).length) return SVG_PAD + c * COL_STEP_MIN + COL_STEP_MIN / 2;
  let x = SVG_PAD;
  for (let i = 0; i < c; i++) x += colWidths[i] || COL_STEP_MIN;
  return x + (colWidths[c] || COL_STEP_MIN) / 2;
}

/** Total SVG width for numCols columns. Port of app.js:745. */
export function totalSvgW(numCols, colWidths) {
  if (!colWidths || !Object.keys(colWidths).length) return numCols * COL_STEP_MIN + SVG_PAD * 2;
  let t = SVG_PAD * 2;
  for (let i = 0; i < numCols; i++) t += colWidths[i] || COL_STEP_MIN;
  return t;
}

// ── Wave path ──────────────────────────────────────────────────────────────────
/**
 * Build an SVG path string for the wave through the syllable nodes.
 * opts.smooth: 'bezier' (default) | 'cardinal' | 'monotone' | 'none'
 * Port of app.js:763.
 */
export function buildWavePath(syls, colWidths, rowY, opts = {}) {
  const sorted = [...syls].sort((a, b) => a.col - b.col);
  if (sorted.length < 2) return '';
  const pts = sorted.map(s => ({ x: colX(s.col, colWidths), y: rowY[s.row] || rowY[1] }));
  const mode = opts.smooth || 'bezier';

  if (mode === 'none') {
    return pts.map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`)).join(' ');
  }
  if (mode === 'bezier') {
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], c = pts[i];
      const dx = (c.x - p.x) * 0.42;
      d += ` C${p.x + dx} ${p.y} ${c.x - dx} ${c.y} ${c.x} ${c.y}`;
    }
    return d;
  }
  if (mode === 'cardinal') {
    const tension = 0.5;
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) * tension / 3, cp1y = p1.y + (p2.y - p0.y) * tension / 3;
      const cp2x = p2.x - (p3.x - p1.x) * tension / 3, cp2y = p2.y - (p3.y - p1.y) * tension / 3;
      d += ` C${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
    }
    return d;
  }
  if (mode === 'monotone') {
    const n = pts.length;
    const dx = [], dy = [], m = [], tan = new Array(n);
    for (let i = 0; i < n - 1; i++) { dx[i] = pts[i+1].x - pts[i].x; dy[i] = pts[i+1].y - pts[i].y; m[i] = dx[i] === 0 ? 0 : dy[i] / dx[i]; }
    tan[0] = m[0]; tan[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) tan[i] = (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { tan[i] = tan[i + 1] = 0; continue; }
      const a = tan[i] / m[i], b = tan[i + 1] / m[i];
      if (a * a + b * b > 9) { const s = 3 / Math.sqrt(a * a + b * b); tan[i] *= s; tan[i + 1] *= s; }
    }
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < n - 1; i++) {
      const x1 = pts[i].x + dx[i] / 3, y1 = pts[i].y + tan[i] * dx[i] / 3;
      const x2 = pts[i + 1].x - dx[i] / 3, y2 = pts[i + 1].y - tan[i + 1] * dx[i] / 3;
      d += ` C${x1} ${y1} ${x2} ${y2} ${pts[i + 1].x} ${pts[i + 1].y}`;
    }
    return d;
  }
  return '';
}
