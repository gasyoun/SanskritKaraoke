# Gemini Flash — Code Review: Bugs to Fix

Review of commit `433ce94` ("Gemini Flash"). All files added by Gemini were inspected.
The overall structure is good; the list below is what must be fixed before the student
features are usable.

---

## Bug 1 — CRITICAL: `mode-blind` CSS targets the wrong class

**File:** `student.html` line 15

```css
/* Wrong — class 'svg-wrap' does not exist */
.mode-blind .wave-layer, .mode-blind .svg-wrap { display: none !important; }
```

The actual wrapper class used by `buildWaveSVG()` in `app.js` (line 937) is
`wave-svg-wrap`, not `svg-wrap`. In Blind mode the wave diagram is never hidden.

**Fix:**
```css
.mode-blind .wave-layer, .mode-blind .wave-svg-wrap { display: none !important; }
```

---

## Bug 2 — HIGH: Beat-tap quiz plays audio without karaoke highlight

**File:** `src/scripts/quizzes.js`, `startBeatTapQuiz()` (line 105)

The quiz mutes and plays audio, but never calls `_mainHighlightStart()`. Without the
highlight dot moving, students cannot tell which syllable is active — the quiz is
unplayable.

**Fix:** after `audio.play()` (line 124), add:
```javascript
if (typeof _mainHighlightStart === 'function') _mainHighlightStart();
```

Also restore mute state in `onQuizAudioEnd` **before** stopping highlight:
```javascript
audio.muted = false;
if (typeof _mainHighlightStop === 'function') _mainHighlightStop();
```

---

## Bug 3 — HIGH: i18n covers only 3 elements out of ~80 translatable strings

**Files:** `src/scripts/strings.js`, `index.html`, `student.html`

`strings.js` defines 5 keys. Only 3 elements in `index.html` carry `data-i18n`.
Every other user-visible string (section labels, placeholders, audio drop zone,
timing editor controls, error messages from `showMsg()`) is hardcoded Russian.

**Fix — `strings.js`:** add at minimum these missing keys (both `ru` and `en`):

```javascript
// Section headers
sylDivLabel, schemLabel, pngLabel, mp4Label, audioLabel, sessionLabel,
footerLabel, driveLabel,
// Buttons
downloadBtn, showPngBtn, altDownloadBtn, karaokeBtn, storyBtn,
saveSessionBtn, loadSessionBtn, detectMeterBtn, meterInfoBtn,
timingEditorBtn, autoBtn,
// Audio drop zone
dropZoneText, dropZoneFormats, dropZoneNoFile,
// Timing editor modes
padaModeLabel, sylModeLabel,
// Messages (passed to showMsg)
errNoAudio, errNoDiagram, errNoTiming, okKaraoke, okPng, okStory,
// Progress page
progressTitle, studyTodayHeading, catalogHeading, allDoneMsg
```

**Fix — `index.html` and `student.html`:** add `data-i18n="key"` to every
translatable element. For input placeholders, use `data-i18n-placeholder` and update
`applyI18n()` in `strings.js` to handle it:

```javascript
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
}
```

---

## Bug 4 — MEDIUM: Language button in `index.html` never updates its own label

**File:** `index.html` line 21

The `🌐 RU/EN` button label is static. After switching language with `setLang()`,
the button text doesn't change to reflect the active language. The `student.html`
version correctly updates via `toggleLang()` — apply the same pattern here.

**Fix:** give the button an `id` and update it inside `applyI18n()`:
```html
<button id="btn-lang" onclick="setLang(LANG==='ru'?'en':'ru')">🌐 RU</button>
```
```javascript
// in applyI18n():
const langBtn = document.getElementById('btn-lang');
if (langBtn) langBtn.textContent = '🌐 ' + LANG.toUpperCase();
```

---

## Bug 5 — MEDIUM: `student.html` still contains the full authoring sidebar

**File:** `student.html` lines 40–232

The sidebar is hidden with `display:none !important` on the `<aside>` tag, but all
HTML is present: PNG/MP4/Story download buttons, timing editor, session save/load,
footer editor, Google Drive controls. This is ~190 lines of dead markup that could
confuse screen readers, breaks if CSS is disabled, and means the full authoring
tool runs in the background.

**Required DOM elements** that must stay (app.js expects them by ID):

| ID | Why needed |
|---|---|
| `dev-input` | `runPipeline()` reads from it when no session |
| `s1dev`, `s2dev`, `s1iast`, `s2iast` | Hidden textareas used internally |
| `syl-mode-user`, `syl-mode-std` | Syllabification radio buttons |
| `btn-go` | Fallback click to run pipeline |
| `msg` | `showMsg()` output |
| `scheme-select` | Encoding select (read by pipeline) |
| `shloka-num` | Verse number |
| `ft-year`, `ft-url`, `ft-author`, `ft-source`, `ft-meter` | Footer fields for PNG export |
| `dl-wrap`, `mp4-block` | Toggled by app.js after diagram is built |
| `audio-drop`, `audio-file`, `audio-name` | Audio input |
| `tap-block`, `te-padas-info`, `tap-status`, `waveform-canvas` | Timing editor host |
| `btn-mp4-muxer`, `btn-mp4`, `btn-karaoke-mp4`, `btn-story-mp4` | Referenced by export functions |
| All timing-editor modal divs | Required by app.js modal system |
| Google Drive dialog | Required by `_gdOpen` |

**Fix:** keep those IDs in a hidden `<div style="display:none">` outside the sidebar,
remove all surrounding visible labels, buttons, and section headers from the student
view. The sidebar `<aside>` can then be removed entirely.

---

## Bug 6 — MINOR: JSON Schema uses non-standard `"examples"` keyword

**File:** `verses/schema/verse.schema.json` line 124

```json
"meter": { "type": "string", "examples": ["anushtubh","indravajra","mandakranta"] }
```

`"examples"` is a JSON Schema 2019-09+ keyword, not draft-07 (which the file
declares). Validators targeting draft-07 will ignore or error on it.

**Fix:** remove the `"examples"` property and fold the list into `"description"`:
```json
"meter": { "type": "string", "description": "e.g. anushtubh, indravajra, mandakranta" }
```

---

## Bug 7 — MINOR: `progress.html` title is English, body is Russian

**File:** `progress.html` line 6

```html
<title>Sanskrit Karaoke - Progress & SRS</title>
```

All visible text on the page is Russian. The title should match.

**Fix:**
```html
<title>Sanskrit Karaoke — Прогресс и повторение</title>
```

---

## Bug 8 — MINOR: Example verse files have wrong melody author

**Files:** `verses/data/bhg_2_47.json`, `bhg_2_48.json`, `bhg_2_49.json`

All three files have `"melody": "Traditional"`. The actual melody author for this
project is "Уша Санка" (matching the `ft-author` default in the app).

**Fix:** change in all three files:
```json
"author": {
  "melody": "Уша Санка",
  "transcription": "Mārcis Gasūns"
}
```

---

## Summary table

| # | Severity | File | Issue |
|---|---|---|---|
| 1 | Critical | `student.html:15` | `.svg-wrap` → `.wave-svg-wrap` in mode-blind CSS |
| 2 | High | `quizzes.js:124` | Beat-tap quiz missing `_mainHighlightStart()` call |
| 3 | High | `strings.js`, `index.html`, `student.html` | i18n covers ~3 of ~80 strings |
| 4 | Medium | `index.html:21` | Language button label doesn't update on switch |
| 5 | Medium | `student.html:40–232` | Full authoring sidebar HTML present in student page |
| 6 | Minor | `verse.schema.json:124` | Non-standard `"examples"` keyword for draft-07 |
| 7 | Minor | `progress.html:6` | English `<title>` on Russian page |
| 8 | Minor | `verses/data/*.json` | Wrong melody author in all 3 example files |
