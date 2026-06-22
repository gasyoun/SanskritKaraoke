/**
 * src/core/svg.js — Wave diagram SVG string builder.
 * Returns an SVG string (not a DOM element). All colors and options explicit.
 * Port of app.js:833–1044 with DOM deps severed.
 *
 * Import: import { buildWaveSvgString } from './svg.js';
 */
import { getRowY, getSvgH, colX, totalSvgW, buildWavePath, measureText, COL_STEP_MIN, SVG_PAD } from './layout.js';

/**
 * Build an SVG string for one strophe.
 *
 * @param {string} key     — 's1' | 's2' (used in element IDs / data-key)
 * @param {Array}  syls    — [{syl, type, col, row, devSyl, arrow, vipula?, vipulaType?}]
 * @param {Object} colWidths — from computeSharedColWidths()
 * @param {Object} [opts]
 *   scale:     number  0.5   — wave scale
 *   smooth:    string  'bezier'
 *   showDots:  bool    true
 *   showLine:  bool    true
 *   hollow:    bool    true
 *   showDev:   bool    false  — show Devanāgarī instead of IAST on nodes
 *   guruColor: string  '#8B0000'
 *   laghuColor:string  '#2C4A1E'
 *   measureFn: Function(text, font)→number  — for IAST line font-size fitting
 *
 * @returns {string} Raw SVG string (no surrounding wrapper div).
 */
export function buildWaveSvgString(key, syls, colWidths, opts = {}) {
  if (!syls.length) return '<svg width="620" viewBox="0 0 620 100"></svg>';

  const scale     = opts.scale     ?? 0.5;
  const smooth    = opts.smooth    ?? 'bezier';
  const showDots  = opts.showDots  ?? true;
  const showLine  = opts.showLine  ?? true;
  const hollow    = opts.hollow    ?? true;
  const showDev   = opts.showDev   ?? false;
  const guruCol   = opts.guruColor  || '#8B0000';
  const laghuCol  = opts.laghuColor || '#2C4A1E';
  const measureFn = opts.measureFn  || null;
  const showDivider = opts.showPadaDivider ?? true;

  const hasVipula = syls.some(s => s.vipula);
  const rowY      = getRowY(scale);
  const svgH      = getSvgH(syls, scale, hasVipula);
  const numCols   = Math.max(0, ...syls.map(s => s.col)) + 1;
  const W         = Math.max(620, totalSvgW(numCols, colWidths));

  // Fit IAST text to SVG width for node font size
  const sorted   = [...syls].sort((a, b) => a.col - b.col);
  const iastAll  = sorted.map(s => s.syl).join('  ');
  let iastFs = 24;
  for (let sz = 24; sz >= 9; sz--) {
    const font = `400 ${sz}px "Charter Indologique",serif`;
    if (measureText(iastAll, font, measureFn) <= W - SVG_PAD * 2) { iastFs = sz; break; }
  }
  const nodeFs = Math.max(9, Math.round(iastFs * 0.8));

  // Guide lines (all 5 rows, preview-only numbers stripped in PNG export)
  const guides = rowY.map((ry, ri) =>
    `<line class="guide" x1="16" y1="${ry}" x2="${W - 8}" y2="${ry}"/>` +
    `<text class="row-lbl preview-only" x="8" y="${ry + 3}">${ri + 1}</text>`
  ).join('');

  // Wave path
  const wavePath = showLine
    ? `<path id="wave-path-${key}" d="${buildWavePath(syls, colWidths, rowY, { smooth })}" fill="none" stroke="${guruCol}" stroke-width="1.6" stroke-opacity="0.35" stroke-linejoin="round"/>`
    : '';

  // Nodes
  const DEV_FONT  = "'Sanskrit 2003',serif";
  const IAST_FONT = "'Charter Indologique','Cormorant Garamond',serif";
  const LABEL_GAP = 4;
  const ascentK_iast = 0.75, descentK_iast = 0.20;
  const ascentK_dev  = 0.85, descentK_dev  = 0.25;

  const nodes = sorted.map(s => {
    const x     = colX(s.col, colWidths);
    const y     = rowY[s.row] ?? rowY[1];
    const guru  = s.type === 'guru';
    const r     = guru ? 8 : 5.5;
    const label = showDev && s.devSyl ? s.devSyl : s.syl;
    const fw    = guru ? 700 : 400;
    const font  = showDev && s.devSyl ? DEV_FONT : IAST_FONT;
    const isDevMode = showDev && !!s.devSyl;
    const ascentK  = isDevMode ? ascentK_dev  : ascentK_iast;
    const descentK = isDevMode ? descentK_dev : descentK_iast;
    const col   = guru ? guruCol : laghuCol;
    const forceBelow = s.vipula && s.row === 0;
    const ly = (s.row === 0 && !forceBelow)
      ? y - r - LABEL_GAP - nodeFs * descentK
      : y + r + LABEL_GAP + nodeFs * ascentK;

    // Vipulā overlay hatching
    let vipulaOverlay = '';
    if (s.vipula === 'culprit') {
      vipulaOverlay = `<circle cx="${x}" cy="${y}" r="${r - 0.5}" fill="url(#vp-culprit-${key})" stroke="rgba(180,80,0,0.8)" stroke-width="1.5"/>`;
    } else if (s.vipula === 'group') {
      vipulaOverlay = `<circle cx="${x}" cy="${y}" r="${r - 0.5}" fill="url(#vp-group-${key})" stroke="rgba(30,90,180,0.6)" stroke-width="1" stroke-dasharray="3,2"/>`;
    }

    const circle = showDots
      ? (hollow
          ? `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" stroke="${col}" stroke-width="${guru ? 2.5 : 1.5}"/>${vipulaOverlay}`
          : `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" stroke="none"/>${vipulaOverlay}`)
      : vipulaOverlay;

    return `<g class="syl-node ${guru ? 'guru' : 'laghu'}" data-key="${key}" data-col="${s.col}"
      onmousedown="svgDragStart(event,this)" ontouchstart="svgTouchStart(event,this)" oncontextmenu="onSylCtx(event,this)">
      ${circle}
      <text x="${x}" y="${ly}" font-size="${nodeFs}" text-anchor="middle" font-family="${font}" font-weight="${fw}" fill="${col}">${label}${s.arrow ? `<tspan fill="#c0392b">${s.arrow}</tspan>` : ''}</text>
    </g>`;
  }).join('');

  // Pada divider line
  const halfIdx = Math.ceil(sorted.length / 2);
  let divLine = '';
  if (showDivider && halfIdx > 0 && halfIdx < sorted.length) {
    const xA = colX(sorted[halfIdx - 1].col, colWidths);
    const xB = colX(sorted[halfIdx].col, colWidths);
    const dx = (xA + xB) / 2;
    divLine = `<line class="pada-divider" x1="${dx}" y1="4" x2="${dx}" y2="${svgH - 4}" stroke="#a07020" stroke-width="1.2" stroke-dasharray="4,3" opacity="0.7"/>`;
  }

  // Vipulā bracket (syllables 5–7 of the first half)
  let vipulaBrackets = '';
  const s4 = sorted[3], s5 = sorted[4], s6 = sorted[5], s7 = sorted[6], s8 = sorted[7];
  if (s5?.vipula && s6?.vipula && s7?.vipula && sorted.indexOf(s5) < halfIdx) {
    const x4 = s4 ? colX(s4.col, colWidths) : colX(s5.col, colWidths) - 40;
    const x5 = colX(s5.col, colWidths), x7 = colX(s7.col, colWidths);
    const x8 = s8 ? colX(s8.col, colWidths) : colX(s7.col, colWidths) + 40;
    const xL = (x4 + x5) / 2, xR = (x7 + x8) / 2, xMid = (xL + xR) / 2;
    const r5 = s5.type === 'guru' ? 8 : 5.5, r6 = s6.type === 'guru' ? 8 : 5.5, r7 = s7.type === 'guru' ? 8 : 5.5;
    const y5 = rowY[s5.row] ?? rowY[0], y6 = rowY[s6.row] ?? rowY[0], y7 = rowY[s7.row] ?? rowY[0];
    const yTop = Math.min(y5 - r5, y6 - r6, y7 - r7) - 6;
    function sylBot(sy, ry, rr) {
      if (sy.row === 0 && !sy.vipula) return ry - rr - 4;
      return ry + rr + 4 + nodeFs * ascentK_iast;
    }
    const yBot = Math.max(sylBot(s5, y5, r5), sylBot(s6, y6, r6), sylBot(s7, y7, r7)) + 10;
    const pat57 = [s5, s6, s7].map(s => s.type === 'guru' ? 'g' : 'l').join('');
    const vt    = s5.vipulaType || '';
    const lbl   = vt ? `${vt} (${pat57})` : pat57;
    vipulaBrackets = `<g class="vipula-bracket" pointer-events="none">
      <rect x="${xL}" y="${yTop}" width="${xR - xL}" height="${yBot - yTop}" rx="5" fill="rgba(184,92,0,0.06)" stroke="#B85C00" stroke-width="1.1" stroke-dasharray="4,2" pointer-events="none"/>
      <text x="${xMid}" y="${yTop - 4}" text-anchor="middle" font-size="9.5" font-family="'JetBrains Mono',monospace" fill="#B85C00" font-weight="600" pointer-events="none">${lbl}</text>
    </g>`;
  }

  const defs = `<defs>
    <pattern id="vp-culprit-${key}" patternUnits="userSpaceOnUse" width="4" height="4">
      <rect width="4" height="4" fill="rgba(255,180,0,0.25)"/>
      <line x1="0" y1="4" x2="4" y2="0" stroke="rgba(180,60,0,0.7)" stroke-width="1.5"/>
    </pattern>
    <pattern id="vp-group-${key}" patternUnits="userSpaceOnUse" width="4" height="4">
      <rect width="4" height="4" fill="rgba(180,220,255,0.2)"/>
      <line x1="0" y1="0" x2="4" y2="4" stroke="rgba(30,90,180,0.5)" stroke-width="1.2"/>
    </pattern>
  </defs>`;

  return `<svg id="svg-${key}" width="${W}" viewBox="0 0 ${W} ${svgH}" style="display:block;overflow:visible;touch-action:none">
  ${defs}
  ${guides}
  ${wavePath}
  ${nodes}
  ${divLine}${vipulaBrackets}
</svg>`;
}

/**
 * Wrap an SVG string in a .wave-svg-wrap div (matching what app.js buildWaveSVG returns).
 * Provides backward-compatible DOM integration when delegating from app.js.
 */
export function wrapSvgInDiv(key, svgString, contentBottom) {
  const wrap = document.createElement('div');
  wrap.className = 'wave-svg-wrap';
  wrap.id = `wave-${key}`;
  if (contentBottom != null) wrap.dataset.contentBottom = contentBottom;
  wrap.innerHTML = svgString;
  return wrap;
}
