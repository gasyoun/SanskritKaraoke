/**
 * src/core/timing.js — Timing math: onset detection, mora-proportional
 * distribution, onset snapping, corpus scaling.
 * Pure ES module. No DOM, no globals. Audio enters as raw PCM (Float32Array),
 * so every export is callable from Node/tests as well as the browser.
 *
 * Numeric defaults mirror tools/alignment_params.json (the shared JS↔Python
 * contract). Ports of app.js: detectOnsets, _snapToNearest, _snapConfidence,
 * the mora-proportional core of calcAutoTiming, and the scale step of
 * corpusScaleTiming.
 */

// ── Onset detection ──────────────────────────────────────────────────────────
// Mirrors onset_detection in tools/alignment_params.json.
export const ONSET_DEFAULTS = {
  winS:       0.005, // 5 ms RMS window
  hopS:       0.002, // 2 ms hop
  minEnergy:  0.04,  // ignore silence
  onsetDelta: 0.06,  // minimum normalised rise to count as onset
  minGapS:    0.06,  // don't emit two onsets closer than 60 ms
  peakFloor:  0.1,   // peak must exceed this normalised energy
};

/**
 * Detect note onsets and energy peaks from mono PCM.
 * Pure: takes a Float32Array of samples + sample rate, returns time positions.
 * Port of app.js detectOnsets (the AudioBuffer adapter stays in app.js).
 *
 * @param {Float32Array} pcm          — mono channel samples
 * @param {number}       sampleRate   — samples per second
 * @param {object}       [p]          — overrides for ONSET_DEFAULTS
 * @returns {{onsets:number[], peaks:number[]}} times in seconds
 */
export function detectOnsetsFromPcm(pcm, sampleRate, p = ONSET_DEFAULTS) {
  const sr   = sampleRate;
  const winN = Math.round(p.winS * sr);
  const hopN = Math.round(p.hopS * sr);

  // Build RMS energy envelope
  const rms = [];
  for (let i = 0; i + winN < pcm.length; i += hopN) {
    let sum = 0;
    for (let j = 0; j < winN; j++) sum += pcm[i + j] ** 2;
    rms.push({ t: i / sr, e: Math.sqrt(sum / winN) });
  }

  if (!rms.length) return { onsets: [], peaks: [] };

  // Normalise
  const maxE = rms.reduce((m, r) => Math.max(m, r.e), 0) || 1;
  rms.forEach(r => r.e /= maxE);

  const { minEnergy, onsetDelta, minGapS, peakFloor } = p;

  const onsets = [], peaks = [];
  let lastOnset = -1;

  for (let i = 3; i < rms.length - 3; i++) {
    const curr = rms[i].e;
    if (curr < minEnergy) continue;
    const rise = curr - rms[i - 3].e;

    // Onset: sharp positive rise, not too close to previous onset
    if (rise > onsetDelta && rms[i].t - lastOnset > minGapS) {
      onsets.push(rms[i].t);
      lastOnset = rms[i].t;
    }

    // Peak: local maximum above noise floor (±2 neighbours)
    if (curr > rms[i - 1].e && curr > rms[i - 2].e &&
        curr > rms[i + 1].e && curr > rms[i + 2].e && curr > peakFloor) {
      peaks.push(rms[i].t);
    }
  }

  return { onsets, peaks };
}

// ── Onset snapping ───────────────────────────────────────────────────────────
/**
 * Snap time t to the nearest candidate within windowS seconds.
 * Port of app.js _snapToNearest.
 * @returns {{snapped:(number|null), dist:number}}
 */
export function snapToNearest(t, candidates, windowS) {
  let best = null, bestDist = windowS;
  for (const c of candidates) {
    const d = Math.abs(c - t);
    if (d < bestDist) { best = c; bestDist = d; }
  }
  return { snapped: best, dist: bestDist };
}

/**
 * Confidence band for a snap distance. Mirrors snap.confidence_* in
 * tools/alignment_params.json. Port of app.js _snapConfidence.
 */
export function snapConfidence(dist, windowS) {
  if (dist <= 0.03) return 1.0;
  if (dist <= 0.07) return 0.7;
  if (dist <= 0.12) return 0.4;
  return 0.15;
}

// ── Mora-proportional distribution ───────────────────────────────────────────
/**
 * Mora weight per syllable: guru = 2, laghu = 1. With lastLaghuAsGuru, a
 * trailing laghu is weighted as a guru. Mirrors `mora` in alignment_params.json.
 */
export function moraUnits(syls, { lastLaghuAsGuru = false } = {}) {
  return syls.map((s, i) => {
    if (s.type === 'guru') return 2;
    if (lastLaghuAsGuru && i === syls.length - 1 && s.type === 'laghu') return 2;
    return 1;
  });
}

/** Duration of one mora unit across a pada spanning [t0, t1]. */
export function padaUnitDuration(syls, t0, t1, opts = {}) {
  if (!syls.length) return 0;
  const totalUnits = moraUnits(syls, opts).reduce((a, v) => a + v, 0);
  return (t1 - t0) / totalUnits;
}

/**
 * Distribute syllable onset times across a pada spanning [t0, t1]
 * proportionally to mora weight. Pure core of app.js calcAutoTiming.
 * @returns {number[]} onset time per syllable (same length as syls)
 */
export function distributePada(syls, t0, t1, opts = {}) {
  if (!syls.length) return [];
  const units    = moraUnits(syls, opts);
  const total    = units.reduce((a, v) => a + v, 0);
  const unitDur  = (t1 - t0) / total;
  const out = [];
  let acc = 0;
  syls.forEach((s, i) => {
    out[i] = t0 + acc * unitDur;
    acc += units[i];
  });
  return out;
}

// ── Corpus scaling ───────────────────────────────────────────────────────────
/**
 * Scale a reference verse's timing to a new audio duration. Pure scale step of
 * app.js corpusScaleTiming (the verses/ fetch + match loop stays in app.js).
 * @param {{s1:number[], s2:number[]}} timing
 * @param {number} fromDuration  — reference recording duration (s)
 * @param {number} toDuration    — target recording duration (s)
 */
export function scaleTiming(timing, fromDuration, toDuration) {
  const scale = toDuration / fromDuration;
  return {
    s1: (timing.s1 || []).map(t => t * scale),
    s2: (timing.s2 || []).map(t => t * scale),
  };
}

/**
 * Find a compatible timed verse through injected data accessors and scale it
 * to the new audio duration. Hosts decide where data comes from: browser fetch,
 * test fixtures, IndexedDB, or a future batch renderer manifest.
 *
 * @param {Object} args
 * @param {string} args.meter
 * @param {number} args.s1len
 * @param {number} args.s2len
 * @param {number} args.newDuration
 * @param {Function} args.loadIndex — async () => {verses:[{id,meter},...]}
 * @param {Function} args.loadVerse — async (id) => verse JSON
 */
export async function corpusScaleTiming({
  meter,
  s1len,
  s2len,
  newDuration,
  loadIndex,
  loadVerse,
}) {
  const index = await loadIndex();
  const candidates = (index.verses || []).filter(v => v.meter === meter && v.id);

  for (const candidate of candidates) {
    const verse = await loadVerse(candidate.id);
    if (!verse.timing || !verse.timing.s1 || !verse.timing.s2) continue;
    if (verse.timing.s1.length !== s1len || verse.timing.s2.length !== s2len) continue;
    if (!verse.audio || !verse.audio.duration_s) continue;
    return scaleTiming(verse.timing, verse.audio.duration_s, newDuration);
  }
  return null;
}

// ── Pāda-boundary detection ──────────────────────────────────────────────────
// Mirrors pada_detection in tools/alignment_params.json.
export const PADA_DEFAULTS = {
  frameS:          0.01,    // 10 ms RMS frames
  threshMin:       0.02,
  threshMax:       0.20,
  threshStep:      0.01,
  minPadaFraction: 1 / 6,   // a pāda must be at least duration/6 long
};

/**
 * Detect the 4 pāda boundaries of a śloka from mono PCM by locating the three
 * longest internal silences (RMS below an iteratively-raised threshold).
 * Pure core of the former app.js detectPadaBounds.
 *
 * @param {Float32Array} pcm
 * @param {number} sampleRate
 * @param {number} duration   — clip length (s); used for the min-pāda test
 * @param {object} [p]        — overrides for PADA_DEFAULTS
 * @returns {{padas:({t0:number,t1:number}[]|null), thresh:number,
 *            norm:Float32Array, frameDur:number, empty:boolean}}
 *   padas is null when no threshold yields 4 valid pādas; empty is true for silent audio.
 */
export function detectPadaBoundsFromPcm(pcm, sampleRate, duration, p = PADA_DEFAULTS) {
  const frameSize = Math.round(sampleRate * p.frameS);
  const numFrames = Math.floor(pcm.length / frameSize);
  const frameDur  = frameSize / sampleRate;

  const rms = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    let sum = 0;
    for (let j = 0; j < frameSize; j++) sum += pcm[f * frameSize + j] ** 2;
    rms[f] = Math.sqrt(sum / frameSize);
  }

  const maxRms = rms.reduce((a, v) => a > v ? a : v, 0);
  if (maxRms === 0)
    return { padas: null, thresh: 0, norm: new Float32Array(0), frameDur, empty: true };

  const norm = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) norm[f] = rms[f] / maxRms;

  const minPadaDur = duration * p.minPadaFraction;

  function tryThresh(thresh) {
    const sil = new Uint8Array(numFrames);
    for (let f = 0; f < numFrames; f++) sil[f] = norm[f] < thresh ? 1 : 0;
    // Trim leading / trailing silence
    let first = 0, last = numFrames - 1;
    while (first < numFrames && sil[first]) first++;
    while (last >= 0 && sil[last]) last--;
    if (first >= last) return null;
    // Collect silent runs inside [first..last]
    const ranges = [];
    let i = first;
    while (i <= last) {
      if (sil[i]) { const s = i; while (i <= last && sil[i]) i++; ranges.push({ s, e: i - 1, len: i - s }); }
      else i++;
    }
    if (ranges.length < 3) return null;
    const top3 = [...ranges].sort((a, b) => b.len - a.len).slice(0, 3);
    top3.sort((a, b) => a.s - b.s); // chronological
    const padas = [
      { t0: first * frameDur,     t1: top3[0].s * frameDur },
      { t0: top3[0].e * frameDur, t1: top3[1].s * frameDur },
      { t0: top3[1].e * frameDur, t1: top3[2].s * frameDur },
      { t0: top3[2].e * frameDur, t1: last * frameDur },
    ];
    return padas.every(pd => (pd.t1 - pd.t0) >= minPadaDur) ? padas : null;
  }

  let padas = null, thresh = p.threshMin;
  for (let t = p.threshMin; t <= p.threshMax; t = Math.round((t + p.threshStep) * 100) / 100) {
    const r = tryThresh(t);
    if (r) { padas = r; thresh = t; break; }
  }
  return { padas, thresh, norm, frameDur, empty: false };
}
