/**
 * src/core/karaoke-frame.js — Karaoke highlight ring + camera for story/feed export.
 * Pure ES module. Stateless functions — caller tracks camera state.
 * Port of app.js:1919–1978, 2060–2246 with DOM deps severed.
 */

/**
 * Find the index of the active syllable at time t.
 * times: sorted array of onset timestamps (seconds).
 * Returns -1 if before the first syllable.
 * Port of _currentSylIndex (app.js:4129).
 */
export function currentSylIndex(times, t) {
  if (!times || !times.length || t < times[0]) return -1;
  let lo = 0, hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Compute the laghu unit duration for a key, used to estimate when the last syllable ends.
 * Port of getVideoLaghuDur / getStoryLaghuDur (app.js:1927, 2084).
 */
export function laghuDuration(syls, times) {
  if (!times || times.length < 2) return 0.3;
  const halfIdx = Math.floor(times.length / 2);
  const span  = times[times.length - 1] - times[halfIdx];
  const units = syls.slice(halfIdx).reduce((a, s) => a + (s.type === 'guru' ? 2 : 1), 0);
  return units > 0 ? span / units : 0.3;
}

/**
 * Is key still active at time t (i.e. before the last syllable ends)?
 */
export function isKeyActive(key, t, timing, syllables, padaBounds) {
  const times = timing[key] || [];
  if (!times.length) return false;
  const syls = syllables[key] || [];
  let lastSylEnd;
  if (padaBounds) {
    const lastPada = key === 's1' ? padaBounds[1] : padaBounds[3];
    lastSylEnd = lastPada ? lastPada[1] : (times[times.length - 1] + laghuDuration(syls, times) * 2);
  } else {
    lastSylEnd = times[times.length - 1] + laghuDuration(syls, times) * 2;
  }
  return t <= lastSylEnd;
}

/**
 * Draw the karaoke highlight ring for a single frame on the base canvas context.
 * baseCtx: CanvasRenderingContext2D for the full 1920×1080 base canvas.
 * Port of app.js:1957–1966.
 */
export function drawHighlight(ctx, pos) {
  if (!pos) return;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, pos.r * 1.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(238,68,68,0.85)';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, pos.r * 0.3);
  ctx.stroke();
}

/**
 * Update the smooth camera position (lerp toward the current active syllable).
 * Returns new {camX, camY}.
 * Port of camera update in downloadTelegramStoryMp4 (app.js:2160–2165).
 *
 * @param {Object} cam        — {camX, camY} current camera center in base-canvas coords
 * @param {Object} sylPositions — {s1: {col: {x,y,r}}, s2: {...}}
 * @param {Object} timing     — {s1: [...], s2: [...]}
 * @param {Array}  syllables  — {s1: [{type,...}], s2: [...]}
 * @param {Array}  padaBounds — [[t0,t1]×4] or null
 * @param {number} t          — current time in seconds
 * @param {Object} bounds     — {minX, maxX, minY, maxY} camera clamp bounds
 * @param {number} lerp       — smoothing factor per frame (default 0.10)
 */
export function updateCamera(cam, sylPositions, timing, syllables, padaBounds, t, bounds, lerp = 0.10) {
  let camX = cam.camX, camY = cam.camY;
  for (const key of ['s1', 's2']) {
    if (!isKeyActive(key, t, timing, syllables, padaBounds)) continue;
    const idx = currentSylIndex(timing[key] || [], t);
    if (idx < 0) continue;
    const syl = (syllables[key] || [])[idx];
    if (!syl) continue;
    const pos = sylPositions[key]?.[syl.col];
    if (!pos) continue;
    const tx = Math.max(bounds.minX, Math.min(bounds.maxX, pos.x));
    const ty = Math.max(bounds.minY, Math.min(bounds.maxY, pos.y));
    camX += (tx - camX) * lerp;
    camY += (ty - camY) * lerp;
    break; // use the first active key
  }
  return { camX, camY };
}

/**
 * Draw one story frame: crop the base canvas and composite into the output context.
 * wdc: CanvasRenderingContext2D for the story output canvas (storyW × storyH).
 * Port of app.js:2168–2193.
 *
 * @param {CanvasRenderingContext2D} wdc
 * @param {HTMLCanvasElement} baseCanvas — 1920×1080
 * @param {Object} cam       — {camX, camY}
 * @param {number} srcW      — source crop width in base-canvas pixels
 * @param {number} srcH      — source crop height in base-canvas pixels
 * @param {number} storyW    — output width  (e.g. 1080)
 * @param {number} storyH    — output height (e.g. 1920)
 * @param {Object} sylPositions  — {s1: {col:{x,y,r}}, s2: {...}}
 * @param {Object} timing    — {s1:[...], s2:[...]}
 * @param {Object} syllables — {s1:[{col,...}], s2:[...]}
 * @param {Array}  padaBounds
 * @param {number} t
 */
export function drawStoryFrame(wdc, baseCanvas, cam, srcW, srcH, storyW, storyH,
                                sylPositions, timing, syllables, padaBounds, t) {
  const BW = baseCanvas.width, BH = baseCanvas.height;
  const sx = Math.max(0, Math.min(BW - srcW, cam.camX - srcW / 2));
  const sy = Math.max(0, Math.min(BH - srcH, cam.camY - srcH / 2));

  wdc.clearRect(0, 0, storyW, storyH);
  wdc.drawImage(baseCanvas, sx, sy, srcW, srcH, 0, 0, storyW, storyH);

  // Karaoke highlight rings, transformed to story coords
  const scaleX = storyW / srcW, scaleY = storyH / srcH;
  for (const key of ['s1', 's2']) {
    if (!isKeyActive(key, t, timing, syllables, padaBounds)) continue;
    const idx = currentSylIndex(timing[key] || [], t);
    if (idx < 0) continue;
    const syl = (syllables[key] || [])[idx];
    if (!syl) continue;
    const pos = sylPositions[key]?.[syl.col];
    if (!pos) continue;
    const dx = (pos.x - sx) * scaleX;
    const dy = (pos.y - sy) * scaleY;
    const dr = pos.r * scaleX * 1.6;
    wdc.beginPath();
    wdc.arc(dx, dy, dr, 0, Math.PI * 2);
    wdc.fillStyle = 'rgba(238,68,68,0.85)'; wdc.fill();
    wdc.strokeStyle = '#ffffff'; wdc.lineWidth = Math.max(2, pos.r * scaleX * 0.3); wdc.stroke();
  }
}

// ── Captions export ────────────────────────────────────────────────────────────
function fmtTs(t, sep = ',') {
  const h  = Math.floor(t / 3600);
  const m  = Math.floor((t % 3600) / 60);
  const s  = Math.floor(t % 60);
  const ms = Math.round((t % 1) * 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}${sep}${String(ms).padStart(3,'0')}`;
}

/**
 * Build a list of caption cues from syllables + timing.
 * Each cue: {index, start, end, text}
 * Merges s1 + s2 in chronological order.
 */
export function buildCues(syllables, timing) {
  const cues = [];
  for (const key of ['s1', 's2']) {
    const syls  = syllables[key] || [];
    const times = timing[key]   || [];
    for (let i = 0; i < syls.length; i++) {
      const t0 = times[i] ?? 0;
      const t1 = (i + 1 < times.length) ? times[i + 1] : (t0 + (key === 's1' ? 0.4 : 0.5));
      cues.push({ start: t0, end: t1, text: syls[i].syl });
    }
  }
  cues.sort((a, b) => a.start - b.start);
  return cues.map((c, i) => ({ ...c, index: i + 1 }));
}

/** Generate SRT string from cues. */
export function toSrt(cues) {
  return cues.map(c =>
    `${c.index}\n${fmtTs(c.start)} --> ${fmtTs(c.end)}\n${c.text}`
  ).join('\n\n');
}

/** Generate VTT string from cues. */
export function toVtt(cues) {
  return 'WEBVTT\n\n' + cues.map(c =>
    `${c.index}\n${fmtTs(c.start, '.')} --> ${fmtTs(c.end, '.')}\n${c.text}`
  ).join('\n\n');
}
