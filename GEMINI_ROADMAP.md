# Gemini Flash — Round 2 Review + Roadmap

**Previous bugs:** see `GEMINI_FIXES.md` (8 issues, fix those first)  
**This document:** 8 additional bugs found in round 2 review, then a prioritised roadmap.

---

## Additional Bugs (fix alongside GEMINI_FIXES.md)

### Bug 9 — CRITICAL: `make_student.py` panel injection fails silently

`make_student.py` injects the audio/translation/quiz/SRS panels with:
```python
main_end_tag = '</main>'
html = html.replace(main_end_tag, panels + main_end_tag)
```
`index.html` has no `<main>` element — it uses `<div class="app">`. The replacement
never runs. The committed `student.html` was hand-written to work around this, but
since `make_student.py` is the chosen source of truth, this must be fixed.

**Fix:** replace the injection target:
```python
# inject just before the closing </div> of the main content area
main_end_tag = '<!-- END MAIN CONTENT -->'
```
Add the comment `<!-- END MAIN CONTENT -->` to `index.html` just before the closing
`</div>` of `<div class="app">`, then inject against that sentinel.

---

### Bug 10 — CRITICAL: `make_student.py` calls non-existent SRS function

`make_student.py` line 198:
```javascript
updateSrsRecord(currentVerse.id, quality);  // ← does not exist
```
`srs.js` exports `updateSrs(id, quality)`. Name mismatch — `submitSrs()` silently
fails to record the rating.

The hand-written `student.html` has this correct. Fix it in `make_student.py`.

---

### Bug 11 — HIGH: `make_student.py` stub elements break app.js

The sidebar-removal regex replaces `<aside>` with stub elements. Several stubs are
wrong type or missing required attributes:

| ID | Generated stub | Problem |
|---|---|---|
| `dev-input` | `<input type="text">` | Should be `<textarea>` — app.js may call `textarea`-specific APIs |
| `scheme-select` | `<select>` (empty) | No `<option>` children — `value` always `""` — scheme detection breaks |
| `btn-go` | `<button>` (empty) | `onclick` attribute missing — `.click()` does nothing |
| `audio-file` | `<input type="file">` | Missing `onchange="onAudioFile(this)"` — file handler never fires |

**Fix:** For `scheme-select`, copy the full `<option>` list from index.html. For
`btn-go`, set `onclick="runPipeline()"`. For `audio-file`, add the `onchange` handler.
For `dev-input`, use `<textarea id="dev-input" style="display:none"></textarea>`.

---

### Bug 12 — HIGH: `progress.html` shows all un-studied verses as "due today"

`progress.html` line 101:
```javascript
if (isDue || !srs) {   // ← "!srs" means every new verse appears in due list
```
On first visit, every verse is new (no SRS record), so all of them appear in
"Изучать сегодня". A student with 100 verses would see 100 items due on day one.

**Fix:** only show a verse as due if it has been studied at least once and is past
its due date:
```javascript
if (srs && srs.due <= today) {
```
New verses should appear in the catalogue table with status "New" and an "Open"
button, but NOT in the "Study today" queue.

---

### Bug 13 — HIGH: Fill-in quiz starts audio but not karaoke highlight

`quizzes.js` `startFillInQuiz()` (line 80):
```javascript
audio.currentTime = 0;
audio.play();
// _mainHighlightStart() is never called
```
The audio plays but no syllable is highlighted, making the quiz meaningless — the
student can't see the syllable to fill in before the karaoke reaches it.

**Fix:** add after `audio.play()`:
```javascript
if (typeof _mainHighlightStart === 'function') _mainHighlightStart();
```

---

### Bug 14 — MEDIUM: Beat-tap quiz — G/L keyboard shortcut not wired up

`quizzes.js` shows G and L buttons but no `keydown` listener. The PRD specifies
both keyboard and on-screen buttons.

**Fix:** add a `keydown` handler when the quiz is active and remove it when done:
```javascript
function _beatTapKeyHandler(e) {
  if (e.key === 'g' || e.key === 'G') recordTap('guru');
  if (e.key === 'l' || e.key === 'L') recordTap('laghu');
}
// in startBeatTapQuiz():
document.addEventListener('keydown', _beatTapKeyHandler);
// in onQuizAudioEnd() / cleanup:
document.removeEventListener('keydown', _beatTapKeyHandler);
```

---

### Bug 15 — MEDIUM: `loadStudentData` uses a 300 ms race-condition timer

`student.html` line 737:
```javascript
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(loadStudentData, 300);  // hope app.js has finished by then
});
```
If `app.js` is slow to parse (large file, slow device), `_applySession` is called
before it exists. On a cold mobile load this can fail.

**Fix:** wait for an explicit ready signal from app.js. The simplest approach: check
for a known function before calling it, and retry if not ready:
```javascript
function waitForApp(cb, retries = 20) {
  if (typeof _applySession === 'function') { cb(); return; }
  if (retries > 0) setTimeout(() => waitForApp(cb, retries - 1), 100);
  else console.error('app.js failed to load');
}
window.addEventListener('DOMContentLoaded', () => waitForApp(loadStudentData));
```

---

### Bug 16 — MINOR: Help modal in student view shows teacher-facing content

`student.html` includes the full authoring help modal (timing editor, wave diagram
building, session management). Students should see student-facing help only.

**Fix in `make_student.py`:** after generating the HTML, replace the help modal
content with a student version covering:
- What the wave diagram shows (guru = heavy, laghu = light, the 5 rows)
- The Mode button (Full → Dots → Blind) and why to use each
- How SRS works (😊 😐 😕 and spaced repetition)
- Quiz types (meter ID, fill-in, beat tap — with G/L key hint)

---

## Roadmap — Prioritised

### Phase 0: Fix make_student.py and regenerate student.html (do first)

Fix bugs 9–11 above, then run:
```sh
python tools/make_student.py
```
Commit the regenerated `student.html` and delete the hand-written version. From
this point, `student.html` is always generated — never hand-edited.

Also fix bugs 12–16 in the same pass.

---

### Phase 1 — `catalogue.html` *(highest priority feature)*

A student-facing verse browser. Students land here from Telegram or course links.

**URL:** `catalogue.html`  
**Data source:** `verses/index.json` (fetched at runtime)

**Features:**
- Grid or list of verse cards; each card shows: title (RU/EN toggle), meter, difficulty stars (1–5), status chip (New / Learning / Mastered from localStorage SRS)
- Filter bar: by meter (dropdown from index), by difficulty (1–5 stars), by tag (multi-select chips)
- Search: text input filters by title, source text, tags
- Sort: by difficulty (default), by due date, by title
- "Study today" count badge in the header (verses due ≤ today with SRS record)
- Each card links to `student.html?id=X`
- RU/EN toggle (same `strings.js` mechanism)
- Responsive grid: 3 columns desktop, 2 tablet, 1 mobile

**Implementation notes:**
- Load `verses/index.json` once on page load; filter/sort in memory
- SRS status read from `localStorage['srs_v1']` (same key as `srs.js`)
- No backend needed

---

### Phase 2 — GitHub Actions CI

Automatically validate verse files and rebuild the index on every push.

**File:** `.github/workflows/verses.yml`

```yaml
name: Verse Library CI
on:
  push:
    paths:
      - 'verses/data/**'
      - 'verses/schema/**'

jobs:
  validate-and-index:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install jsonschema
      - run: python tools/validate_library.py
      - run: python tools/build_index.py
      - name: Commit updated index
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add verses/index.json
          git diff --cached --quiet || git commit -m "ci: rebuild verses/index.json"
          git push
```

**Acceptance criteria:**
- Push with a valid verse file: CI passes, `verses/index.json` auto-updated and committed
- Push with invalid JSON: CI fails with clear error, PR blocked
- Push with schema violation: CI fails listing which field failed and why

---

### Phase 3 — Teacher add-verse form

A page or modal that lets the teacher save the current app state as a new verse
JSON file into the `verses/data/` catalogue.

**Approach:** a new panel in `index.html` sidebar (shown only when diagram is built
and timing is set). Fields:
- Verse ID (slug auto-generated from source + chapter + verse, editable)
- Title RU / EN
- Source text, chapter, verse
- Meter (auto-filled from `ftDetectMeter()` result)
- Difficulty (1–5 star selector)
- Tags (comma-separated input)
- Translation RU / EN (textareas)
- Author melody / transcription

On submit: generates the verse JSON, triggers browser download as
`verses/data/{id}.json`. Teacher commits the file to the repo. CI rebuilds the index.

**No server needed.** The form just downloads a pre-filled JSON file.

---

### Phase 4 — Mobile-optimised student view

Currently `student.html` uses the desktop app layout. On phones the wave diagram
is tiny and the quiz buttons are hard to tap.

**Changes:**
- Breakpoint at 600px: switch to single-column vertical layout
- Wave diagrams scale to full viewport width
- Audio controls: larger touch targets (min 44px height)
- Beat-tap quiz buttons: full-width, 64px height, clear G/L labels
- Mode button moves to bottom bar (thumb zone)
- Translation box collapses/expands with a tap

---

### Phase 5 — Telegram Mini App

Wrap `catalogue.html` and `student.html` as a Telegram Mini App so students can
open karaoke directly inside Telegram without leaving the app.

**What to add:**
1. `<script src="https://telegram.org/js/telegram-web-app.js"></script>` in both pages
2. Read `window.Telegram.WebApp.colorScheme` and apply dark/light theme
3. Call `Telegram.WebApp.expand()` on load for full-height view
4. Call `Telegram.WebApp.ready()` when content is rendered
5. Use `Telegram.WebApp.BackButton` instead of browser back
6. A Telegram bot (separate repo / service) sends messages with a
   `web_app` button pointing to `https://samskrtam.ru/shloka-wave/catalogue.html`

**Note:** the Mini App must be served over HTTPS. `samskrtam.ru` already qualifies.

---

## Architecture decisions recorded

| Decision | Choice | Reason |
|---|---|---|
| student.html source | `make_student.py` generates it | Stays in sync with index.html automatically |
| Audio delivery for students | Google Drive, public sharing | No student login required; teacher shares files with "anyone with link" |
| Verse browse | Separate `catalogue.html` | Clean separation from progress tracking |
| Quiz skipping | Both quiz and SRS always skippable | Students control their own session |
| Student help | Student-specific (replace teacher docs) | Teacher authoring instructions are irrelevant for learners |
| Beat-tap input | G/L keyboard + on-screen buttons | Best for both desktop and mobile |
| CI | GitHub Actions on `verses/data/**` push | Automatic quality gate, always-fresh index |
