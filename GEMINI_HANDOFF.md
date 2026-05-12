# Sanskrit Karaoke — Edutech Platform PRD
## Handoff document for Gemini Flash

**Repo:** https://github.com/gasyoun/SanskritKaraoke  
**Live app:** https://samskrtam.ru/shloka-wave  
**Date:** 2026-05-12  
**Prepared by:** Claude Sonnet 4.6 for Mārcis Gasūns

---

## 1. What exists today

Sanskrit Karaoke is a teacher-facing authoring tool (vanilla JS, single HTML page, no build step, no server). A teacher:

1. Pastes a Sanskrit śloka (two half-verses, s1 / s2) in any encoding (Devanagari, IAST, SLP1, …)
2. Gets an interactive wave diagram where each syllable appears as a circle on one of five rows, heavy syllables (guru) dark-red, light ones (laghu) dark-green
3. Loads an audio file and marks timing per syllable in a dual-mode timing editor
4. Exports a karaoke MP4 (1920×1080) or a zoomed portrait Story MP4 (1080×1920, v1.267)
5. Saves/loads sessions to Google Drive (JSON + audio)

**Stack:** `index.html` + `src/scripts/app.js` (~7 000 lines, monolith) + `src/style.css`. No npm, no bundler. One external lib: `mp4-muxer` loaded from CDN.

**Key globals in app.js:**
```javascript
DATA = { s1: [...], s2: [...] }
// Each syllable: { syl, type:'guru'|'laghu', row, col, devSyl, arrow, vipula?, vipulaType? }

TAP = {
  times: { s1: [t0,t1,...], s2: [...] },   // per-syllable timestamps (seconds)
  cheatY: { s1: [], s2: [] },
}

_padaBounds = [[t0,t1],[t0,t1],[t0,t1],[t0,t1]]  // 4 pada boundaries

let audioFile;   // File object from <input type="file">
let SHOW_DEV;    // boolean — show Devanagari labels vs IAST
```

**Key functions to reuse:**
| Function | What it does |
|---|---|
| `runPipeline()` | Build DATA from text input fields, detect meter, draw SVGs |
| `_applySession(json)` | Load a saved session object (text + timing + positions) |
| `buildWaveSVG(key)` | Return an SVG element for s1 or s2 |
| `_renderPngCanvas()` | Return `{ canvas, sylPositions }` — 1920×1080 PNG canvas |
| `_currentSylIndex(key, t)` | Index of active syllable at time t |
| `downloadKaraokeMp4()` | Encode karaoke MP4 (landscape) |
| `downloadTelegramStoryMp4()` | Encode Story MP4 (portrait, zoomed) |

---

## 2. Vision

Sanskrit Karaoke evolves into a **two-sided edutech platform**:

- **Teacher side** — existing authoring tool (do not break it)
- **Student side** — verse library + read-only player + learning mechanics

Target audience: Russian-speaking and English-speaking students of Sanskrit, learning prosody (guru/laghu patterns), pronunciation, and memorisation. Content is delivered via Telegram (stories + channel posts), the web app, a course platform (Getcourse), and YouTube.

---

## 3. Roadmap (prioritised)

| Phase | ID | Feature | Status |
|---|---|---|---|
| 1 | F1 | Verse library JSON schema + catalogue | **Done** |
| 2 | F2 | Student player page (`student.html`) | **Done** |
| 2 | F3 | Progressive reveal mode | **Done** |
| 2 | F4 | RU / EN i18n toggle | **Done** |
| 3 | F5 | Spaced repetition (SM-2) | **Done** |
| 3 | F6 | Self-assessment quizzes | **Done** |
| 3 | F7 | Streak & progress tracking | **Done** |

---

## 4. F1 — Verse Library JSON Schema *(implement first)*

### Goal
A structured file-based verse catalogue that serves as the data layer for every subsequent feature (player, SRS, quizzes, progress). All verse data lives in `verses/` in the repo.

### Directory layout
```
verses/
  schema/
    verse.schema.json        ← JSON Schema draft-07 for a single verse
  data/
    bhg_2_47.json            ← one file per verse
    bhg_2_48.json
    ...
  index.json                 ← auto-generated catalogue (light metadata only)
  README.md                  ← schema field docs for contributors
tools/
  validate_library.py        ← validates all verse files against the schema
  build_index.py             ← regenerates index.json from data/*.json
```

### Verse file schema (`verse.schema.json`)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id","version","title","meter","difficulty","encoding","s1","s2","created_at"],
  "properties": {
    "id":         { "type": "string", "pattern": "^[a-z0-9_]+$",
                    "description": "Slug, e.g. bhg_2_47" },
    "version":    { "type": "integer", "minimum": 1 },
    "title": {
      "type": "object",
      "properties": {
        "ru": { "type": "string" },
        "en": { "type": "string" }
      },
      "required": ["ru"]
    },
    "source": {
      "type": "object",
      "properties": {
        "text":    { "type": "string", "description": "Scripture name" },
        "chapter": { "type": "integer" },
        "verse":   { "type": "integer" }
      }
    },
    "meter":      { "type": "string", "examples": ["anushtubh","indravajra","mandakranta"] },
    "difficulty": { "type": "integer", "minimum": 1, "maximum": 5,
                    "description": "1=beginner … 5=advanced" },
    "language_tags": { "type": "array", "items": { "type": "string", "enum": ["ru","en"] } },
    "author": {
      "type": "object",
      "properties": {
        "melody":         { "type": "string" },
        "transcription":  { "type": "string" }
      }
    },
    "encoding": { "type": "string", "enum": ["DEV","IAST","SLP1","HK","ITRANS","VH","WX"] },
    "s1":    { "type": "string", "description": "First half-verse input text" },
    "s2":    { "type": "string", "description": "Second half-verse input text" },
    "s1dev": { "type": "string", "description": "Devanagari for s1 (optional if encoding=DEV)" },
    "s2dev": { "type": "string", "description": "Devanagari for s2" },
    "translation": {
      "type": "object",
      "properties": {
        "ru": { "type": "string" },
        "en": { "type": "string" }
      }
    },
    "audio": {
      "type": "object",
      "properties": {
        "drive_file_id": { "type": "string" },
        "duration_s":    { "type": "number" }
      }
    },
    "session": {
      "type": "object",
      "description": "Saved app session (timing, positions) hosted on Drive",
      "properties": {
        "drive_file_id": { "type": "string" },
        "created_at":    { "type": "string", "format": "date" }
      }
    },
    "tags":       { "type": "array", "items": { "type": "string" } },
    "created_at": { "type": "string", "format": "date" },
    "updated_at": { "type": "string", "format": "date" }
  }
}
```

### Index file (`index.json`)
Generated by `tools/build_index.py`. Contains only the fields needed to render a verse list without loading every full file:
```json
{
  "version": 1,
  "generated_at": "2026-05-12",
  "verses": [
    {
      "id": "bhg_2_47",
      "title": { "ru": "Бхагавад-гита 2.47", "en": "Bhagavad Gita 2.47" },
      "meter": "anushtubh",
      "difficulty": 1,
      "language_tags": ["ru", "en"],
      "tags": ["bhagavad-gita", "beginner"],
      "has_audio": true,
      "has_session": true,
      "created_at": "2026-05-12"
    }
  ]
}
```

### Example verse file (`verses/data/bhg_2_47.json`)
Create at least **3 example verse files** with realistic data. They can have placeholder Drive IDs (`"TODO"`) for audio/session.

### Python scripts (UTF-8, Python 3.9+)

**`tools/validate_library.py`**
- Reads `verses/schema/verse.schema.json`
- Validates every file in `verses/data/*.json`
- Prints a pass/fail table; exits non-zero on any failure
- Dependency: `jsonschema` (`pip install jsonschema`)

```python
# Usage:
python tools/validate_library.py
# Output:
# ✓ bhg_2_47.json
# ✓ bhg_2_48.json
# All 2 verse(s) valid.
```

**`tools/build_index.py`**
- Reads all `verses/data/*.json`
- Writes `verses/index.json`
- Sorts verses by `difficulty` then `created_at`

```python
# Usage:
python tools/build_index.py
# Output: verses/index.json written (2 verse(s))
```

Both scripts must include `sys.stdout.reconfigure(encoding='utf-8')` at the top (Windows UTF-8 requirement).

### `verses/README.md`
Document every schema field with: name, type, required/optional, description, example value. One section per field group (identity, content, learning, assets).

### Acceptance criteria
- [ ] `verse.schema.json` passes JSON Schema meta-validation
- [ ] 3 example verse files in `verses/data/`
- [ ] `python tools/validate_library.py` exits 0 on the example files
- [ ] `python tools/build_index.py` produces a valid `verses/index.json`
- [ ] `verses/README.md` exists with field documentation

---

## 5. F2 — Student Player Page *(next after F1)*

A new file `student.html` (same directory as `index.html`). Students load it via URL: `student.html?id=bhg_2_47`.

**Behaviour:**
- Fetch `verses/data/{id}.json`
- Fetch the session JSON from Google Drive (`session.drive_file_id`) using the existing GDRIVE config in app.js
- Call `_applySession(sessionJson)` to populate DATA and TAP
- Render the wave SVG (read-only — no drag, no right-click context menu)
- Load audio from Drive and play with karaoke highlight
- Show translation (RU or EN depending on toggle — see F4)
- No sidebar authoring controls visible

**What to hide/disable** from the current UI:
- Text input fields (s1, s2, s1dev, s2dev)
- Run / Reset buttons
- Timing editor button
- Download buttons (PNG, MP4, Story)
- Google Drive save button
- Footer editor fields

---

## 6. F3 — Progressive Reveal Mode *(next after F2)*

A "Mode" cycling button on `student.html`. Cycles through:

| Mode | Label | What's visible |
|---|---|---|
| 1 | Full | Wave diagram + syllable labels + audio |
| 2 | Dots | Wave diagram circles visible, all text labels hidden |
| 3 | Blind | No diagram, no labels — only audio plays, highlight dot visible |

Implementation: add CSS classes to the SVG wrapper that show/hide text nodes. The SVG structure from `buildWaveSVG` has text elements with class `syl-label` — hide them with `.mode-dots .syl-label { display:none }`.

---

## 7. F4 — RU / EN i18n Toggle *(next after F2)*

### Scope
- All UI strings in `index.html` and `student.html`
- Buttons, labels, placeholder text, help text, error messages from `showMsg()`

### Implementation

Create `src/scripts/strings.js`:
```javascript
const STRINGS = {
  ru: {
    runBtn: 'Запустить',
    resetBtn: 'Сброс',
    downloadPng: '↓ Скачать PNG',
    // … all strings
  },
  en: {
    runBtn: 'Run',
    resetBtn: 'Reset',
    downloadPng: '↓ Download PNG',
    // …
  }
};
let LANG = localStorage.getItem('shloka_lang') || 'ru';
function t(key) { return STRINGS[LANG]?.[key] ?? STRINGS.ru[key] ?? key; }
function setLang(lang) {
  LANG = lang;
  localStorage.setItem('shloka_lang', lang);
  applyI18n();
}
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
}
```

Add `data-i18n="runBtn"` attributes to every translatable element in `index.html`. Add a globe button `🌐` in the header that calls `setLang(LANG === 'ru' ? 'en' : 'ru')`.

---

## 8. F5 — Spaced Repetition (future phase)

Algorithm: **SM-2** (same as Anki).

Storage: `localStorage['srs_v1']` = JSON array of records:
```json
{ "id": "bhg_2_47", "interval": 1, "ef": 2.5, "due": "2026-05-13", "reps": 0 }
```

After a student plays a verse, show three buttons: 😊 (quality=5) 😐 (quality=3) 😕 (quality=1). Update SM-2 state per the algorithm. A "Study today" page shows verses with `due <= today`.

---

## 9. F6 — Self-assessment Quizzes (future phase)

Triggered after a verse finishes playing in student mode. One quiz type per session (rotate):

1. **Beat tap** — audio plays silently, student taps guru/laghu for each syllable; score = % correct
2. **Meter ID** — "Which meter?" 4-choice multiple choice (correct + 3 plausible distractors from the verse library)
3. **Fill-in** — one syllable label hidden per play; student types it before the highlight reaches it

Quiz results stored alongside SRS state.

---

## 10. F7 — Streak & Progress (future phase)

- Daily streak: last-played date in localStorage; increment if consecutive days
- Mastered count: verses with SRS `interval >= 21`
- Progress page `progress.html`: table of all index.json verses with status chip (New / Learning / Mastered) and last-played date

---

## 11. Encoding / platform notes

- All Python files: `sys.stdout.reconfigure(encoding='utf-8')` and `sys.stderr.reconfigure(encoding='utf-8')` at the top
- `app.js` is UTF-8 binary; always read/write with `open(..., 'rb').read().decode('utf-8')` / `'wb').write(...encode('utf-8'))`
- No build step — just edit files and serve with `python -m http.server 8000`
- Syntax check: `node --check src/scripts/app.js`
- Version bump on every change: update `<title>` and version `<span>` in `index.html`, append to `ver_info.txt`

---

## 12. What NOT to touch

- `src/scripts/app.js` internals beyond adding `data-i18n` attributes to strings — the authoring tool is stable and in active use
- `_renderPngCanvas()` rendering pipeline
- Google Drive authentication flow
- `mp4-muxer` karaoke / story export functions
- Existing session JSON format (student player must consume it as-is via `_applySession`)
