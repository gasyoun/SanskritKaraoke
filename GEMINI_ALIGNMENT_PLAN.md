# Gemini Flash — Auto-Alignment Implementation Plan

**Repo:** https://github.com/gasyoun/SanskritKaraoke  
**Live app:** https://samskrtam.ru/shloka-wave  
**Prepared by:** Claude Sonnet 4.6 for Mārcis Gasūns  
**Date:** 2026-05-14

---

## 0. Context

### What already exists

The Timing Editor has two modes:
- **Padas mode** — teacher drags 8 boundary lines to mark each pada's start/end
- **Timing mode** — per-syllable timing

There is already an "Авто" button (`btn-te-autotiming`) that calls `teAutoTimingAndSwitch()` →
`calcAutoTiming()` (line 4340 in `src/scripts/app.js`). This function does **linear distribution**:
distributes syllable timestamps evenly within each pada boundary, weighted by guru (2 units) / laghu (1 unit).

### What we're building

Upgrade the same button to do **waveform-based onset detection** on top of the linear estimate.
The teacher presses "Авто" → syllables snap to actual audio attacks → only orange-flagged
syllables need manual correction. Target: 10–30 min → 2–5 min per verse.

### Key globals (do not rename)

```javascript
let audioFile = null;             // File object from drag-and-drop (line 217)
let audioB64  = null;             // base64 of audio for export (line 21)

DATA = { s1: [...], s2: [...] }   // syllables: { syl, type:'guru'|'laghu', row, col, devSyl }
TAP  = { times: { s1: [], s2: [] }, cheatY: { s1: [], s2: [] }, ... }
_padaBounds = [[t0,t1],[t0,t1],[t0,t1],[t0,t1]]  // 4 pada boundaries, set in padas mode
```

### Pattern for AudioBuffer (used throughout app.js)

```javascript
const audioCtx   = new AudioContext();
const audioBuffer = await audioCtx.decodeAudioData(await audioFile.arrayBuffer());
// audioBuffer.getChannelData(0) → Float32Array of PCM samples
// audioBuffer.sampleRate        → samples per second (44100 or 48000)
// audioBuffer.duration          → total seconds
```

---

## Step 1 — Add `timing` field to verse JSON schema

**File:** `verses/schema/verse.schema.json`

Add after the `"session"` property block:

```json
"timing": {
  "type": "object",
  "description": "Per-syllable timestamps exported from the Timing Editor",
  "properties": {
    "s1": { "type": "array", "items": { "type": "number" } },
    "s2": { "type": "array", "items": { "type": "number" } },
    "confidence": {
      "type": "object",
      "properties": {
        "s1": { "type": "array", "items": { "type": "number", "minimum": 0, "maximum": 1 } },
        "s2": { "type": "array", "items": { "type": "number", "minimum": 0, "maximum": 1 } }
      }
    },
    "auto_generated": { "type": "boolean" },
    "generator": { "type": "string", "description": "browser-v1 | whisper-v1 | manual" }
  }
}
```

**Checklist:**
- [ ] `verse.schema.json` has a `timing` property block
- [ ] `node -e "JSON.parse(require('fs').readFileSync('verses/schema/verse.schema.json','utf8'))"` — no error

---

## Step 2 — Create phoneme rules file

**New file:** `tools/phoneme_rules.json`

```json
{
  "version": 1,
  "note": "Keyed by first IAST character of the syllable (from DATA[key][i].syl). align_to: onset or peak. offset_ms added after snapping.",
  "rules": {
    "y": { "align_to": "peak",  "offset_ms":   0 },
    "v": { "align_to": "peak",  "offset_ms":   0 },
    "r": { "align_to": "peak",  "offset_ms":   0 },
    "l": { "align_to": "peak",  "offset_ms":   0 },
    "m": { "align_to": "onset", "offset_ms": -15 },
    "n": { "align_to": "onset", "offset_ms": -15 },
    "ṅ": { "align_to": "onset", "offset_ms": -10 },
    "ñ": { "align_to": "onset", "offset_ms": -10 },
    "default": { "align_to": "onset", "offset_ms": 0 }
  }
}
```

**Checklist:**
- [ ] File exists at `tools/phoneme_rules.json`
- [ ] Valid JSON: `node -e "JSON.parse(require('fs').readFileSync('tools/phoneme_rules.json','utf8'))"`

---

## Step 3 — Create `tools/extract_timing_from_session.py`

This one-time script extracts `tapTimes` from a downloaded Drive session JSON and writes it
into the corresponding verse JSON as a `timing` field.

**New file:** `tools/extract_timing_from_session.py`

```python
#!/usr/bin/env python3
"""
Usage:
    python tools/extract_timing_from_session.py <session.json> <verse_id>

Example:
    python tools/extract_timing_from_session.py ~/Downloads/shloka_session.json bhg_2_47

Reads tapTimes from a Drive session, writes timing field to verses/data/<verse_id>.json.
"""
import sys, json, os

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

if len(sys.argv) != 3:
    print("Usage: extract_timing_from_session.py <session.json> <verse_id>")
    sys.exit(1)

session_path = sys.argv[1]
verse_id     = sys.argv[2]
verse_path   = os.path.join('verses', 'data', f'{verse_id}.json')

if not os.path.exists(session_path):
    print(f"ERROR: session file not found: {session_path}")
    sys.exit(1)
if not os.path.exists(verse_path):
    print(f"ERROR: verse file not found: {verse_path}")
    sys.exit(1)

with open(session_path, encoding='utf-8') as f:
    session = json.load(f)
with open(verse_path, encoding='utf-8') as f:
    verse = json.load(f)

tap = session.get('tapTimes', {})
s1  = tap.get('s1', [])
s2  = tap.get('s2', [])

if not s1 and not s2:
    print("ERROR: no tapTimes found in session file")
    sys.exit(1)

verse['timing'] = {
    's1': s1,
    's2': s2,
    'auto_generated': False,
    'generator': 'manual'
}

with open(verse_path, 'w', encoding='utf-8') as f:
    json.dump(verse, f, ensure_ascii=False, indent=2)

print(f"OK: wrote timing to {verse_path}  ({len(s1)} s1 timestamps, {len(s2)} s2 timestamps)")
```

**Checklist:**
- [ ] File exists at `tools/extract_timing_from_session.py`
- [ ] `python tools/extract_timing_from_session.py` with no args prints usage and exits 1
- [ ] (Teacher runs this manually after downloading session from Drive — not automated yet)

---

## Step 4 — Add `detectOnsets()` to `app.js`

**Location:** Insert before `function refreshWaveform()` (line 3668).

This function analyzes the loaded audio and returns two arrays:
- `onsets` — times where energy rises sharply (consonant attack)
- `peaks`  — times of local amplitude maxima (semivowel / vowel peak)

```javascript
// ── Waveform onset / peak detection ──────────────────────────────────────────
async function detectOnsets(audioBuffer) {
  const data  = audioBuffer.getChannelData(0);
  const sr    = audioBuffer.sampleRate;
  const winN  = Math.round(0.005 * sr);   // 5 ms window
  const hopN  = Math.round(0.002 * sr);   // 2 ms hop

  // Build RMS energy envelope
  const rms = [];
  for (let i = 0; i + winN < data.length; i += hopN) {
    let sum = 0;
    for (let j = 0; j < winN; j++) sum += data[i + j] ** 2;
    rms.push({ t: i / sr, e: Math.sqrt(sum / winN) });
  }

  if (!rms.length) return { onsets: [], peaks: [] };

  // Normalise
  const maxE = rms.reduce((m, r) => Math.max(m, r.e), 0) || 1;
  rms.forEach(r => r.e /= maxE);

  const minEnergy  = 0.04;   // ignore silence
  const onsetDelta = 0.06;   // minimum normalised rise to count as onset
  const minGapS    = 0.06;   // don't emit two onsets closer than 60 ms

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

    // Peak: local maximum above noise floor
    if (curr > rms[i - 1].e && curr > rms[i - 2].e &&
        curr > rms[i + 1].e && curr > rms[i + 2].e && curr > 0.1) {
      peaks.push(rms[i].t);
    }
  }

  return { onsets, peaks };
}

// Snap time t to nearest candidate within windowS seconds
function _snapToNearest(t, candidates, windowS) {
  let best = null, bestDist = windowS;
  for (const c of candidates) {
    const d = Math.abs(c - t);
    if (d < bestDist) { best = c; bestDist = d; }
  }
  return { snapped: best, dist: bestDist };
}

// Confidence score: 0–1 based on how close the snapped point was
function _snapConfidence(dist, windowS) {
  if (dist <= 0.03) return 1.0;
  if (dist <= 0.07) return 0.7;
  if (dist <= 0.12) return 0.4;
  return 0.15;
}
```

**Checklist:**
- [ ] `node --check src/scripts/app.js` — no syntax errors
- [ ] `detectOnsets` is defined (grep: `grep -n "function detectOnsets" src/scripts/app.js`)

---

## Step 5 — Add `loadPhonemeRules()` and `corpusScaleTiming()` to `app.js`

**Location:** Insert after `detectOnsets` block (after `_snapConfidence`).

```javascript
// ── Phoneme rules (loaded once, cached) ──────────────────────────────────────
let _phonemeRules = null;
async function loadPhonemeRules() {
  if (_phonemeRules) return _phonemeRules;
  try {
    const r = await fetch('tools/phoneme_rules.json');
    _phonemeRules = (await r.json()).rules;
  } catch(e) {
    _phonemeRules = { default: { align_to: 'onset', offset_ms: 0 } };
  }
  return _phonemeRules;
}

function _getPhonemeRule(syl, rules) {
  // syl is IAST transliteration from DATA, e.g. "kar", "ma", "ya"
  const first = syl.trim()[0] || '';
  return rules[first] || rules[first.toLowerCase()] || rules['default'];
}

// ── Corpus-based timing scale ─────────────────────────────────────────────────
async function corpusScaleTiming(meter, s1len, s2len, newDuration) {
  // Fetch verse index to find all verses of same meter
  let index;
  try {
    const r = await fetch('verses/index.json');
    index = await r.json();
  } catch(e) { return null; }

  const candidates = (index.verses || []).filter(v => v.meter === meter && v.id);

  for (const candidate of candidates) {
    try {
      const r = await fetch(`verses/data/${candidate.id}.json`);
      const v = await r.json();
      if (!v.timing || !v.timing.s1 || !v.timing.s2) continue;
      if (v.timing.s1.length !== s1len || v.timing.s2.length !== s2len) continue;
      if (!v.audio || !v.audio.duration_s) continue;

      const scale = newDuration / v.audio.duration_s;
      return {
        s1: v.timing.s1.map(t => t * scale),
        s2: v.timing.s2.map(t => t * scale),
      };
    } catch(e) { continue; }
  }
  return null;  // no suitable corpus match found
}
```

**Checklist:**
- [ ] `node --check src/scripts/app.js` — no syntax errors
- [ ] Functions `loadPhonemeRules`, `corpusScaleTiming` defined in file

---

## Step 6 — Add `TAP.confidence` field and upgrade `teAutoTimingAndSwitch()`

**6a. Add confidence arrays to TAP initialisation.**

Find the TAP object initialisation (search for `TAP = {` or `TAP.times = { s1: [], s2: [] }`).
Everywhere `TAP.times` is reset (there are ~3 places, e.g. `teResetTiming()`, session load),
also reset confidence:

```javascript
TAP.confidence = { s1: [], s2: [] };
```

Specifically add this line alongside every `TAP.times = { s1: [], s2: [] }` reset.
Also initialise at the top of the file near `let TAP = ...`.

**6b. Replace `teAutoTimingAndSwitch()` (line 4882).**

Current:
```javascript
function teAutoTimingAndSwitch() {
  if (!DATA.s1.length && !DATA.s2.length) { showMsg('Сначала постройте диаграмму', 'err'); return; }
  calcAutoTiming();
  openTimingEditorInMode('timing');
}
```

Replace with:
```javascript
async function teAutoTimingAndSwitch() {
  if (!DATA.s1.length && !DATA.s2.length) { showMsg('Сначала постройте диаграмму', 'err'); return; }
  if (!audioFile) { showMsg('Сначала загрузите аудиофайл', 'err'); return; }

  // Step 1: linear distribution as base (existing logic, unchanged)
  calcAutoTiming();

  // Step 2: decode audio
  showMsg('Анализ волны…', 'info');
  let audioBuffer;
  try {
    const actx = new AudioContext();
    audioBuffer = await actx.decodeAudioData(await audioFile.arrayBuffer());
  } catch(e) {
    showMsg('Не удалось декодировать аудио, используется линейный тайминг', 'info');
    openTimingEditorInMode('timing');
    return;
  }

  // Step 3: corpus scaling (overwrite linear with scaled corpus if available)
  const meter = (document.getElementById('meter-label') || {}).textContent || '';
  const scaled = await corpusScaleTiming(
    meter.toLowerCase().replace(/\s+/g, '_'),
    DATA.s1.length, DATA.s2.length, audioBuffer.duration
  );
  if (scaled) {
    TAP.times.s1 = scaled.s1;
    TAP.times.s2 = scaled.s2;
  }

  // Step 4: onset detection
  const { onsets, peaks } = await detectOnsets(audioBuffer);
  const rules = await loadPhonemeRules();
  const SNAP_WINDOW = 0.15;   // look ±150 ms around estimate

  TAP.confidence = { s1: [], s2: [] };

  for (const key of ['s1', 's2']) {
    const syls  = DATA[key] || [];
    const times = TAP.times[key] || [];
    const conf  = [];

    syls.forEach((syl, i) => {
      const t0   = times[i] ?? 0;
      const rule = _getPhonemeRule(syl.syl || '', rules);
      const candidates = rule.align_to === 'peak' ? peaks : onsets;

      const { snapped, dist } = _snapToNearest(t0, candidates, SNAP_WINDOW);
      const offsetS = (rule.offset_ms || 0) / 1000;

      if (snapped !== null) {
        TAP.times[key][i] = snapped + offsetS;
        conf.push(_snapConfidence(dist, SNAP_WINDOW));
      } else {
        conf.push(0.2);  // no candidate found → flag as uncertain
      }
    });

    TAP.confidence[key] = conf;
  }

  refreshWaveform();
  openTimingEditorInMode('timing');

  const uncertain = ['s1','s2'].reduce((n, k) =>
    n + (TAP.confidence[k] || []).filter(c => c < 0.5).length, 0);

  if (uncertain > 0) {
    showMsg(`Авто-тайминг готов. ${uncertain} слогов требуют проверки (оранжевые). Tab — следующий.`, 'info');
  } else {
    showMsg('Авто-тайминг готов!', 'ok');
  }
}
```

**Checklist:**
- [ ] `node --check src/scripts/app.js` — no syntax errors
- [ ] `teAutoTimingAndSwitch` is async and calls `detectOnsets`
- [ ] `TAP.confidence` is initialised to `{ s1: [], s2: [] }` in at least 2 reset locations

---

## Step 7 — Visualise onset candidates on the waveform

**Location:** `refreshWaveform()` function (line 3668).

The waveform canvas is already drawn with syllable timing markers. Add small vertical ticks for
detected onset candidates.

Add these two module-level variables near the top of the file (near `let audioFile`):

```javascript
let _lastOnsets = [];   // cached onset positions from last detectOnsets call
let _lastPeaks  = [];   // cached peak positions from last detectOnsets call
```

In `teAutoTimingAndSwitch()`, after computing `{ onsets, peaks }`, save them:
```javascript
_lastOnsets = onsets;
_lastPeaks  = peaks;
```

In `refreshWaveform()`, find the section that draws syllable markers (the `forEach` over
`TAP.times[key]`). After it, add:

```javascript
  // Draw onset candidate ticks
  const dur = _teDur();
  const cW  = canvas.width;
  const cH  = canvas.height;
  dc.save();
  dc.strokeStyle = 'rgba(180, 120, 0, 0.4)';
  dc.lineWidth   = 1;
  _lastOnsets.forEach(t => {
    const x = (t / dur) * cW;
    dc.beginPath(); dc.moveTo(x, 0); dc.lineTo(x, cH * 0.35); dc.stroke();
  });
  dc.strokeStyle = 'rgba(0, 100, 180, 0.35)';
  _lastPeaks.forEach(t => {
    const x = (t / dur) * cW;
    dc.beginPath(); dc.moveTo(x, 0); dc.lineTo(x, cH * 0.25); dc.stroke();
  });
  dc.restore();
```

**Checklist:**
- [ ] `node --check src/scripts/app.js` — no syntax errors
- [ ] After running Авто: small orange ticks visible on waveform at onset positions

---

## Step 8 — Highlight uncertain syllables in Timing Editor

The Timing Editor renders syllable labels in `_teRender()`. Find where individual syllables are
drawn and add confidence-based colouring.

**Search anchor:** `function _teRender()` — inside it, find the loop that draws syllable text labels.

For each syllable drawn, check `TAP.confidence[key]?.[i]`:
- If `< 0.5` → fill with `'#d97706'` (amber/orange) instead of normal colour
- If `>= 0.5` → normal colour (keep existing logic)

Add a helper (near `_snapConfidence`):
```javascript
function _isSylUncertain(key, i) {
  const conf = TAP.confidence?.[key];
  return conf && conf[i] !== undefined && conf[i] < 0.5;
}
```

In `_teRender()`, wherever syllable text colour is set, wrap with:
```javascript
const uncertain = _isSylUncertain(key, i);
dc.fillStyle = uncertain ? '#d97706' : /* existing colour */;
```

**Checklist:**
- [ ] `node --check src/scripts/app.js` — no syntax errors
- [ ] After Авто: at least some syllables appear in amber colour (if confidence < 0.5)

---

## Step 9 — Tab key navigation for uncertain syllables

**Location:** Find the `keydown` handler in the Timing Editor (search for `'KeyArrowLeft'` or
`Ctrl+←` handler around line 3825–3850).

Add Tab / Shift+Tab handling:

```javascript
  if (e.key === 'Tab') {
    e.preventDefault();
    const dir = e.shiftKey ? -1 : 1;
    _teJumpToNextUncertain(dir);
    return;
  }
```

Add the helper function:
```javascript
function _teJumpToNextUncertain(dir) {
  // Build flat list of uncertain syllables across s1 then s2
  const uncertain = [];
  for (const key of ['s1', 's2']) {
    (DATA[key] || []).forEach((_, i) => {
      if (_isSylUncertain(key, i)) uncertain.push({ key, idx: i });
    });
  }
  if (!uncertain.length) { showMsg('Нет неясных слогов!', 'ok'); return; }

  // Find current position in uncertain list
  const cur = TE.selected;
  let curPos = cur
    ? uncertain.findIndex(u => u.key === cur.key && u.idx === cur.idx)
    : -1;

  curPos = ((curPos + dir) % uncertain.length + uncertain.length) % uncertain.length;
  const next = uncertain[curPos];
  TE.selected = next;

  const syl = (DATA[next.key] || [])[next.idx];
  const t   = (TAP.times[next.key] || [])[next.idx] ?? 0;
  const info = document.getElementById('timing-editor-info');
  if (info && syl) info.textContent =
    `${next.key === 's1' ? 'Строфа 1' : 'Строфа 2'}, слог ${next.idx + 1}: ${syl.syl} — ${t.toFixed(3)}с ⚠`;

  _teRender();
}
```

**Checklist:**
- [ ] `node --check src/scripts/app.js` — no syntax errors
- [ ] After Авто, Tab key cycles through orange syllables
- [ ] Shift+Tab goes backwards

---

## Step 10 — Smoke test (run locally)

```sh
python -m http.server 8000
# open http://localhost:8000 in browser
```

1. Paste BG 2.47 into s1/s2, press Run
2. Load an audio file
3. Open Timing Editor → Padas mode → drag lines roughly → press "Авто"
4. Observe: progress message "Анализ волны…" → then "Авто-тайминг готов"
5. Switch to Timing mode: syllables rendered, some orange
6. Press Tab → cursor jumps to an orange syllable
7. Check waveform: small ticks visible at onset positions
8. Press Ctrl+Space to play full śloka — timing sounds approximately correct

---

## Step 11 — Export timing to verse JSON (optional if time)

After teacher confirms timing in the Timing Editor, add a "Save to JSON" action that writes
`timing.s1/s2` back to the verse's `verses/data/<id>.json` file.

This is a **download** (not a write) since the browser can't write to disk directly:

```javascript
function downloadTimingJson() {
  const id = document.getElementById('lib-id')?.value?.trim();
  if (!id) { showMsg('Укажи ID шлоки в секции Library Export', 'err'); return; }

  const path  = `verses/data/${id}.json`;
  const patch = {
    timing: {
      s1: TAP.times.s1 || [],
      s2: TAP.times.s2 || [],
      confidence: TAP.confidence || { s1: [], s2: [] },
      auto_generated: true,
      generator: 'browser-v1'
    }
  };

  const blob = new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${id}_timing_patch.json`;
  a.click();
  showMsg(`Скачай ${id}_timing_patch.json и вручную добавь поле timing в verses/data/${id}.json`, 'info');
}
```

Add a small button "↓ Тайминг JSON" in the Library Export section of the sidebar.

**Checklist:**
- [ ] Button visible in sidebar
- [ ] Clicking it downloads a JSON with `timing.s1` and `timing.s2` arrays

---

## Final checklist

- [ ] `node --check src/scripts/app.js` passes (no syntax errors)
- [ ] `tools/phoneme_rules.json` exists and is valid JSON
- [ ] `tools/extract_timing_from_session.py` exists
- [ ] `verse.schema.json` has `timing` property
- [ ] Авто button decodes audio, runs onset detection, fills TAP.times
- [ ] Uncertain syllables (confidence < 0.5) appear orange in Timing Editor
- [ ] Tab/Shift+Tab cycles through uncertain syllables
- [ ] Waveform shows small onset ticks after Авто
- [ ] No regressions: existing Каraоке MP4, PNG export, SRS, quizzes still work

---

## Files to modify

| File | Change |
|---|---|
| `src/scripts/app.js` | Add `detectOnsets`, `_snapToNearest`, `_snapConfidence`, `loadPhonemeRules`, `_getPhonemeRule`, `corpusScaleTiming`, `_isSylUncertain`, `_teJumpToNextUncertain`; upgrade `teAutoTimingAndSwitch`; add onset ticks to `refreshWaveform`; add Tab handler; add `TAP.confidence` resets; optionally `downloadTimingJson` |
| `verses/schema/verse.schema.json` | Add `timing` property |
| `tools/phoneme_rules.json` | **New file** — initial phoneme rules |
| `tools/extract_timing_from_session.py` | **New file** — one-time corpus extractor |

**Do NOT modify:** `student.html`, `progress.html`, `catalogue.html`, `src/scripts/srs.js`,
`src/scripts/quizzes.js` — these are not part of this task.
