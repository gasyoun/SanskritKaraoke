/**
 * src/core/compose.js — 1920×1080 PNG frame compositor.
 * Assembles the wave SVGs + Devanāgarī + IAST + footer onto a canvas.
 * Returns {canvas, sylPositions} — same contract as _renderPngCanvas in app.js.
 * Port of app.js:2353–2613 with DOM deps severed.
 *
 * Browser APIs used (acceptable in render.html / headless Chromium):
 *   Canvas 2d, Blob, URL.createObjectURL, Image
 * DOM structure dependencies severed: no getElementById, no getComputedStyle.
 */
import { computeSharedColWidths, measureText, colX, getRowY } from './layout.js';
import { buildWaveSvgString } from './svg.js';

const OUT_W  = 1920, OUT_H = 1080, MARGIN = 24, FT_AREA = 80;
const GAP_BLOCK = 40, GAP_LINE = 14;
const INK_C  = '#18120c';

/**
 * Rasterize an SVG string to an HTMLCanvasElement at the given scale.
 * Uses Blob URL + Image (works in browser and headless Chromium).
 */
export async function rasterizeSvg(svgString, svgW, svgH, scale) {
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url  = URL.createObjectURL(blob);
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width  = Math.round(svgW * scale);
      c.height = Math.round(svgH * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('SVG rasterize failed')); };
    img.src = url;
  });
}

/** Parse width and height out of an SVG string. */
function parseSvgDims(svgString) {
  const mW = svgString.match(/\bwidth="(\d+(?:\.\d+)?)"/);
  const mV = svgString.match(/viewBox="[^"]*\s+[^"]*\s+[^"]*\s+(\d+(?:\.\d+)?)"/);
  return {
    w: mW ? parseFloat(mW[1]) : 620,
    h: mV ? parseFloat(mV[1]) : 200,
  };
}

/**
 * Compose the full 1920×1080 academic frame.
 *
 * @param {Object} verse       — {s1dev, s2dev, meter, title}; text fields may be Devanāgarī
 * @param {Object} syllables   — {s1: [{syl,type,col,row,devSyl,...}], s2: [...]}
 * @param {Object} [opts]
 *   guruColor:  '#8B0000'
 *   laghuColor: '#2C4A1E'
 *   showDev:    false
 *   waveScale:  0.5
 *   smooth:     'bezier'
 *   showDots:   true
 *   showLine:   true
 *   hollow:     true
 *   greyIast:   true
 *   footer: {author, year, url, source, meter}
 *   measureFn:  Function(text, font)→number
 *
 * @returns {Promise<{canvas: HTMLCanvasElement, sylPositions: Object}>}
 */
export async function composePngFrame(verse, syllables, opts = {}) {
  const guruCol   = opts.guruColor  || '#8B0000';
  const laghuCol  = opts.laghuColor || '#2C4A1E';
  const showDev   = opts.showDev    ?? false;
  const waveScale = opts.waveScale  ?? 0.5;
  const greyIast  = opts.greyIast   ?? true;
  const showPadaDivider = opts.showPadaDivider ?? true;
  const footer    = opts.footer     || {};
  const measureFn = opts.measureFn  || null;

  const syls1 = syllables.s1 || [];
  const syls2 = syllables.s2 || [];

  // Shared column widths
  const colWidths = computeSharedColWidths(syls1, syls2, measureFn);

  const svgOpts = {
    scale: waveScale, smooth: opts.smooth || 'bezier',
    showDots: opts.showDots ?? true, showLine: opts.showLine ?? true,
    hollow: opts.hollow ?? true, showPadaDivider, showDev, guruColor: guruCol, laghuColor: laghuCol,
    measureFn,
  };

  // Build SVG strings
  const svg1 = buildWaveSvgString('s1', syls1, colWidths, svgOpts);
  const svg2 = buildWaveSvgString('s2', syls2, colWidths, svgOpts);
  const dims1 = parseSvgDims(svg1), dims2 = parseSvgDims(svg2);

  // Helper: canvas measure
  const mc = document.createElement('canvas').getContext('2d');
  function fitFontSize(text, family, maxW, maxSz, minSz) {
    for (let sz = maxSz; sz >= minSz; sz -= 0.5) {
      mc.font = `700 ${sz}px "${family}",serif`;
      if (mc.measureText(text).width <= maxW) return sz;
    }
    return minSz;
  }

  const dev1 = (verse.s1dev || verse.s1 || '').trim();
  const dev2 = (verse.s2dev || verse.s2 || '').trim();
  const devTarget = Math.round(OUT_W * 0.8);
  const fp1 = Math.round(fitFontSize(dev1, 'Sanskrit 2003', devTarget, 120, 18));
  const fp2 = Math.round(fitFontSize(dev2, 'Sanskrit 2003', devTarget, 120, 18));

  const svgNatW = Math.max(dims1.w, dims2.w);
  mc.font = `700 ${fp1}px "Sanskrit 2003",serif`;
  const w1 = Math.round(mc.measureText(dev1).width) || 0;
  mc.font = `700 ${fp2}px "Sanskrit 2003",serif`;
  const w2 = Math.round(mc.measureText(dev2).width) || 0;
  const blockW = Math.max(w1, w2, svgNatW, 620);

  function calcBlock(devText, fp, syls) {
    const sorted = [...syls].sort((a, b) => a.col - b.col);
    const iast = sorted.map(s => s.syl).join('  ');
    const ip   = Math.round(fitFontSize(iast, 'Charter Indologique', blockW, 48, 8));
    const devMain   = devText.replace(/\s*[।॥|]+(?:\s*[\d०-९0-9]+\s*[।॥|]+)?\s*$/, '');
    const devSuffix = devText.slice(devMain.length);
    return { dev: devMain, devSuffix, iast, syls: sorted, devFontPx: fp, iastFontPx: ip, devH: fp + 10, iastH: ip + 8 };
  }

  const b1 = calcBlock(dev1, fp1, syls1);
  const b2 = calcBlock(dev2, fp2, syls2);

  const contentH = OUT_H - MARGIN - FT_AREA - MARGIN;

  async function rasterizeBlock(svg, dims, targetW) {
    return rasterizeSvg(svg, dims.w, dims.h, targetW / dims.w);
  }

  let [wave1, wave2] = await Promise.all([
    rasterizeBlock(svg1, dims1, blockW),
    rasterizeBlock(svg2, dims2, blockW),
  ]);

  function makeB(bi, wc, gl = GAP_LINE) {
    return { ...bi, gl, totalH: wc.height + gl + bi.devH + gl + bi.iastH };
  }

  let fb1 = makeB(b1, wave1), fb2 = makeB(b2, wave2), finalBlockW = blockW;
  let finalWave1 = wave1, finalWave2 = wave2;

  const naturalH = fb1.totalH + GAP_BLOCK + fb2.totalH;
  const vScale   = naturalH > contentH ? contentH / naturalH : 1;
  if (vScale < 1) {
    const sW = Math.round(blockW * vScale);
    [finalWave1, finalWave2] = await Promise.all([
      rasterizeBlock(svg1, dims1, sW),
      rasterizeBlock(svg2, dims2, sW),
    ]);
    finalBlockW = sW;
    function sB(bi, wc) {
      const dp = Math.round(fitFontSize(bi.dev, 'Sanskrit 2003', sW, 120, 18));
      const ip = Math.round(fitFontSize(bi.iast, 'Charter Indologique', sW, 48, 8));
      const gl = Math.round(GAP_LINE * vScale);
      return { ...bi, devFontPx: dp, iastFontPx: ip, devH: dp + 10, iastH: ip + 8, gl,
               totalH: wc.height + gl + dp + 10 + gl + ip + 8 };
    }
    fb1 = sB(b1, finalWave1); fb2 = sB(b2, finalWave2);
  }

  const canvas = document.createElement('canvas');
  canvas.width = OUT_W; canvas.height = OUT_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, OUT_W, OUT_H);

  const usedH   = fb1.totalH + Math.round(GAP_BLOCK * vScale) + fb2.totalH;
  const vOffset = MARGIN + Math.max(0, Math.round((contentH - usedH) / 2));
  const hOffset = Math.round((OUT_W - finalBlockW) / 2);

  function drawBlock(waveCanvas, b, yStart) {
    ctx.drawImage(waveCanvas, hOffset, yStart);
    let y = yStart + waveCanvas.height + b.gl;
    ctx.font = `700 ${b.devFontPx}px "Sanskrit 2003",serif`;
    ctx.fillStyle = INK_C;
    ctx.fillText(b.dev, hOffset, y + b.devFontPx * 0.82);
    if (b.devSuffix) {
      mc.font = ctx.font;
      ctx.fillText(b.devSuffix, hOffset + mc.measureText(b.dev).width, y + b.devFontPx * 0.82);
    }
    y += b.devH + b.gl;
    const sorted = b.syls;
    const sylFont  = s => showDev && s.devSyl
      ? `${s.type==='guru'?700:400} ${b.iastFontPx}px "Sanskrit 2003",serif`
      : `${s.type==='guru'?700:400} ${b.iastFontPx}px "Charter Indologique","Cormorant Garamond",serif`;
    const sylLabel = s => showDev && s.devSyl ? s.devSyl : s.syl;
    const sylWidths = sorted.map(s => { ctx.font = sylFont(s); return ctx.measureText(sylLabel(s)).width; });
    const natW = sylWidths.reduce((a, w) => a + w, 0);
    const gapW = sorted.length > 1 ? Math.min((finalBlockW - natW) / (sorted.length - 1), b.iastFontPx * 1.2) : 0;
    let x = hOffset;
    sorted.forEach((s, i) => {
      const iastCol = greyIast ? '#888888' : (s.type === 'guru' ? guruCol : laghuCol);
      ctx.font = sylFont(s); ctx.fillStyle = iastCol;
      ctx.fillText(sylLabel(s), x, y + b.iastFontPx * 0.82);
      x += (sylWidths[i] || 0) + gapW;
    });
  }

  drawBlock(finalWave1, fb1, vOffset);
  drawBlock(finalWave2, fb2, vOffset + fb1.totalH + Math.round(GAP_BLOCK * vScale));

  // Pada divider lines
  function drawPadaDivider(syls, waveTop, svgDims) {
    const sorted = [...syls].sort((a, b) => a.col - b.col);
    const halfIdx = Math.ceil(sorted.length / 2);
    if (halfIdx <= 0 || halfIdx >= sorted.length) return;
    const sc   = finalBlockW / svgDims.w;
    const xA = colX(sorted[halfIdx - 1].col, colWidths), xB = colX(sorted[halfIdx].col, colWidths);
    const divX = hOffset + (xA + xB) / 2 * sc;
    const y0 = waveTop + 4 * sc, y1 = waveTop + (svgDims.h - 4) * sc;
    ctx.save();
    ctx.strokeStyle = '#a07020'; ctx.lineWidth = Math.max(2, sc * 1.2);
    ctx.setLineDash([Math.round(6 * sc), Math.round(4 * sc)]);
    ctx.globalAlpha = 0.75;
    ctx.beginPath(); ctx.moveTo(divX, y0); ctx.lineTo(divX, y1); ctx.stroke();
    ctx.restore();
  }
  if (showPadaDivider) {
    drawPadaDivider(syls1, vOffset, dims1);
    drawPadaDivider(syls2, vOffset + fb1.totalH + Math.round(GAP_BLOCK * vScale), dims2);
  }

  // Collect sylPositions for the karaoke encoder
  const sylPositions = {};
  function collectSylPos(key, syls, svgDims, waveTop) {
    const sc   = finalBlockW / svgDims.w;
    const rowY = getRowY(opts.waveScale ?? 0.5);
    sylPositions[key] = {};
    syls.forEach(s => {
      const cxSvg = colX(s.col, colWidths);
      const cySvg = rowY[s.row] ?? rowY[1];
      const r  = s.type === 'guru' ? 8 : 5.5;
      sylPositions[key][s.col] = {
        x: hOffset + cxSvg * sc,
        y: waveTop + cySvg * sc,
        r: r * sc,
      };
    });
  }
  collectSylPos('s1', syls1, dims1, vOffset);
  collectSylPos('s2', syls2, dims2, vOffset + fb1.totalH + Math.round(GAP_BLOCK * vScale));

  // Footer
  const { author='', year='', url='', source='', meter:ftMeter='' } = footer;
  const FT_SZ = 24, FT_Y = OUT_H - 20;
  const FT_COL = '#3a3530', OM_COL = '#c0392b', URL_COL = '#2a6496', OM = 'ॐ';
  const MAX_CONTENT_W = OUT_W - MARGIN * 2, SEP = '  ·  ', gap = 20;

  ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(MARGIN, OUT_H - FT_AREA); ctx.lineTo(OUT_W - MARGIN, OUT_H - FT_AREA); ctx.stroke();

  function buildFt(sz) {
    const ff = `400 ${sz}px "Charter Indologique","Cormorant Garamond",serif`;
    const fb = `700 ${sz}px "Charter Indologique","Cormorant Garamond",serif`;
    const of = `400 ${sz + 6}px "Sanskrit 2003",serif`;
    const segs = [];
    if (author)   segs.push({ text: author,   font: ff, col: FT_COL });
    if (source)   segs.push({ text: source,   font: ff, col: FT_COL });
    if (ftMeter)  segs.push({ text: ftMeter,  font: ff, col: FT_COL });
    if (year)     segs.push({ text: year,     font: ff, col: FT_COL });
    if (url)      segs.push({ text: url,      font: fb, col: URL_COL, underline: true });
    const mw = (t, f) => { ctx.font = f; return ctx.measureText(t).width; };
    const sepW = mw(SEP, ff), omW = mw(OM, of);
    let cW = 0;
    segs.forEach((s, i) => { s.w = mw(s.text, s.font); cW += s.w + (i < segs.length - 1 ? sepW : 0); });
    return { segs, sepW, omW, centreW: cW, totalW: omW + gap + cW + gap + omW, ff, of };
  }

  let ftSz = FT_SZ, ft = buildFt(ftSz);
  while (ft.totalW > MAX_CONTENT_W && ftSz > 14) ft = buildFt(--ftSz);

  const x0 = Math.round((OUT_W - ft.totalW) / 2);
  const ftY = FT_Y + Math.round((FT_SZ - ftSz) / 2);
  ctx.font = ft.of; ctx.fillStyle = OM_COL; ctx.textAlign = 'left';
  ctx.fillText(OM, x0, ftY);

  let cx2 = x0 + ft.omW + gap;
  ft.segs.forEach((s, i) => {
    ctx.font = s.font; ctx.fillStyle = s.col;
    ctx.fillText(s.text, cx2, ftY);
    if (s.underline) {
      ctx.strokeStyle = s.col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx2, ftY + 3); ctx.lineTo(cx2 + s.w, ftY + 3); ctx.stroke();
    }
    cx2 += s.w;
    if (i < ft.segs.length - 1) { ctx.font = ft.ff; ctx.fillStyle = FT_COL; ctx.fillText(SEP, cx2, ftY); cx2 += ft.sepW; }
  });
  ctx.font = ft.of; ctx.fillStyle = OM_COL;
  ctx.fillText(OM, x0 + ft.omW + gap + ft.centreW + gap, ftY);
  ctx.textAlign = 'left';

  return { canvas, sylPositions };
}
