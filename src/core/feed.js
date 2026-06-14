/**
 * src/core/feed.js — feed_v1 native-vertical karaoke template (1080×1920).
 *
 * Unlike the "classic" path (compose.js landscape frame + camera pan in
 * render.html), feed_v1 draws each 9:16 frame directly: dark background,
 * header (ॐ + title + meter chip), the verse as a big continuous Devanāgarī
 * line with a per-syllable IAST line beneath it (the active syllable filled
 * gold = karaoke-fill, driven by timing + t), a progress bar, a handle/CTA
 * footer, and a CTA end-card overlay in the final seconds (the funnel payload).
 *
 * Devanāgarī is drawn continuously (syllabifyVerse leaves devSyl empty, and
 * splitting Devanāgarī per syllable breaks conjuncts) — the karaoke highlight
 * lives on the IAST line, which IS per-syllable.
 *
 * Pure module: Canvas 2D only, no DOM lookups. Fonts ('Sanskrit 2003',
 * 'Charter Indologique') must be loaded by the host (render.html does
 * `await document.fonts.ready`).
 */
import { currentSylIndex, isKeyActive } from './karaoke-frame.js';

export const FEED_W = 1080;
export const FEED_H = 1920;

const C = {
  bgTop: '#1a1426', bgBot: '#0f0b16',
  om: '#C9A227', gold: '#E0A33E', goldInk: '#2A1A05',
  ink: '#F4EFE6', iastDim: '#8A8290',
  chipBg: '#2A2233', track: '#2A2233', muted: '#6E6578',
  panel: 'rgba(15,11,22,0.86)',
};
const DEV_FONT = '"Sanskrit 2003", serif';
const LAT_FONT = '"Charter Indologique", "Cormorant Garamond", serif';
const OUTRO_S = 3.0; // seconds of CTA end-card at the tail

function fitFont(ctx, text, family, maxW, maxPx, minPx, weight = 700) {
  for (let px = maxPx; px >= minPx; px -= 1) {
    ctx.font = `${weight} ${px}px ${family}`;
    if (ctx.measureText(text).width <= maxW) return px;
  }
  return minPx;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (ctx.measureText(trial).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = trial;
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Precompute static layout data for a verse.
 * @param {Object} verse      — verse JSON (s1dev/s2dev, title, meter, translation…)
 * @param {Object} syllables  — {s1:[{syl,type,col}], s2:[...]} from syllabifyVerse
 * @param {Object} [opts]     — {handle, cta, lang}
 */
export function prepareFeed(verse, syllables, opts = {}) {
  const lang = opts.lang || 'ru';
  const title = (verse.title && (verse.title[lang] || verse.title.en || verse.title.ru)) ||
                ((verse.source && verse.source.text) ? `${verse.source.text} ${verse.source.chapter}.${verse.source.verse}` : (verse.id || ''));
  const line = (key, devKey) => ({
    dev: (verse[devKey] || verse[key] || '').trim(),
    tokens: (syllables[key] || []).slice().sort((a, b) => a.col - b.col),
  });
  return {
    title,
    meter: verse.meter || '',
    s1: line('s1', 's1dev'),
    s2: line('s2', 's2dev'),
    syllables,
    handle: opts.handle || '',
    cta: opts.cta || '',
    lang,
    translation: (verse.translation || {}),
  };
}

function drawHeader(ctx, prep) {
  const cx = FEED_W / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.font = `400 46px ${DEV_FONT}`;
  ctx.fillStyle = C.om;
  ctx.fillText('ॐ', cx, 132);

  const titlePx = fitFont(ctx, prep.title, LAT_FONT, FEED_W - 200, 56, 30);
  ctx.font = `700 ${titlePx}px ${LAT_FONT}`;
  ctx.fillStyle = C.ink;
  ctx.fillText(prep.title, cx, 210);

  if (prep.meter) {
    const mPx = 26;
    ctx.font = `400 ${mPx}px ${LAT_FONT}`;
    const w = ctx.measureText(prep.meter).width;
    const padX = 24, chipW = w + padX * 2, chipH = 48, chipY = 238;
    ctx.fillStyle = C.chipBg;
    roundRect(ctx, cx - chipW / 2, chipY, chipW, chipH, chipH / 2);
    ctx.fill();
    ctx.fillStyle = C.gold;
    ctx.textBaseline = 'middle';
    ctx.fillText(prep.meter, cx, chipY + chipH / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }
}

/** Draw one verse line group (Devanāgarī + per-syllable IAST with active gold). */
function drawLine(ctx, lineData, devCenterY, iastCenterY, activeIdx) {
  const cx = FEED_W / 2, maxW = FEED_W - 140;

  if (lineData.dev) {
    const px = fitFont(ctx, lineData.dev, DEV_FONT, maxW, 88, 40);
    ctx.font = `700 ${px}px ${DEV_FONT}`;
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lineData.dev, cx, devCenterY);
  }

  const tokens = lineData.tokens;
  if (!tokens.length) return;
  const labels = tokens.map(t => t.syl);
  const joined = labels.join('  ');
  const px = fitFont(ctx, joined, LAT_FONT, maxW, 46, 22, 400);
  ctx.font = `400 ${px}px ${LAT_FONT}`;
  const spaceW = ctx.measureText('  ').width;
  const widths = labels.map(l => ctx.measureText(l).width);
  const total = widths.reduce((a, w) => a + w, 0) + spaceW * (labels.length - 1);
  let x = cx - total / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  labels.forEach((l, i) => {
    const active = i === activeIdx;
    ctx.font = `${active ? 700 : 400} ${px}px ${LAT_FONT}`;
    ctx.fillStyle = active ? C.gold : C.iastDim;
    ctx.fillText(l, x, iastCenterY);
    x += widths[i] + spaceW;
  });
}

function drawProgress(ctx, frac) {
  const x = 80, y = 1736, w = FEED_W - 160, h = 10;
  ctx.fillStyle = C.track;
  roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = C.gold;
  roundRect(ctx, x, y, Math.max(h, w * Math.min(1, Math.max(0, frac))), h, h / 2); ctx.fill();
}

function drawFooter(ctx, prep) {
  const cx = FEED_W / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (prep.cta) {
    ctx.font = `700 34px ${LAT_FONT}`;
    ctx.fillStyle = C.gold;
    ctx.fillText('▶ ' + prep.cta, cx, 1800);
  }
  if (prep.handle) {
    ctx.font = `400 28px ${LAT_FONT}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(prep.handle, cx, 1850);
  }
}

function drawEndCard(ctx, prep, alpha) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, 0, FEED_W, FEED_H);
  const cx = FEED_W / 2, maxW = FEED_W - 200;

  ctx.textAlign = 'center';
  ctx.fillStyle = C.om;
  ctx.font = `400 52px ${DEV_FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('ॐ', cx, 560);

  const tr = prep.translation[prep.lang] || prep.translation.en || '';
  if (tr) {
    ctx.font = `400 38px ${LAT_FONT}`;
    ctx.fillStyle = C.ink;
    const lines = wrapLines(ctx, '“' + tr + '”', maxW);
    let y = 760 - (lines.length - 1) * 28;
    for (const ln of lines) { ctx.fillText(ln, cx, y); y += 56; }
  }

  if (prep.cta) {
    const label = '▶ ' + prep.cta;
    ctx.font = `700 40px ${LAT_FONT}`;
    const w = ctx.measureText(label).width;
    const padX = 40, bw = w + padX * 2, bh = 84, by = 1120;
    ctx.fillStyle = C.gold;
    roundRect(ctx, cx - bw / 2, by, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = C.goldInk;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, by + bh / 2 + 1);
  }
  if (prep.handle) {
    ctx.font = `400 30px ${LAT_FONT}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(prep.handle, cx, 1300);
  }
  ctx.restore();
}

/**
 * Draw one feed_v1 frame at time t.
 * @param {CanvasRenderingContext2D} ctx — 1080×1920 context
 * @param {Object} prep      — from prepareFeed()
 * @param {Object} timing    — {s1:[...], s2:[...]} onset seconds
 * @param {Array}  padaBounds
 * @param {number} t         — current time (s)
 * @param {number} duration  — total audio duration (s)
 */
export function drawFeedFrame(ctx, prep, timing, padaBounds, t, duration) {
  const g = ctx.createLinearGradient(0, 0, 0, FEED_H);
  g.addColorStop(0, C.bgTop);
  g.addColorStop(1, C.bgBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FEED_W, FEED_H);

  drawHeader(ctx, prep);

  const a1 = isKeyActive('s1', t, timing, prep.syllables, padaBounds)
    ? currentSylIndex(timing.s1 || [], t) : -1;
  const a2 = isKeyActive('s2', t, timing, prep.syllables, padaBounds)
    ? currentSylIndex(timing.s2 || [], t) : -1;

  drawLine(ctx, prep.s1, 700, 800, a1);
  drawLine(ctx, prep.s2, 1010, 1110, a2);

  drawProgress(ctx, duration ? t / duration : 0);
  drawFooter(ctx, prep);

  const tailStart = duration - OUTRO_S;
  if (duration && t >= tailStart) {
    drawEndCard(ctx, prep, (t - tailStart) / OUTRO_S);
  }
}
