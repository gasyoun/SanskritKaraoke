# Sanskrit Karaoke

**Wave-notation visualiser and karaoke exporter for Sanskrit verse**

[**Live app →**](https://samskrtam.ru/shloka-wave) · [v1.266](https://samskrtam.ru/shloka-wave/1.266)

> **If the app doesn't reflect the latest version after an update, do a hard refresh to clear the cache:**
> Edge, Firefox, Opera — `Ctrl+F5` · Chrome — `Ctrl+Shift+R` · Safari (Mac) — `Cmd+Shift+R` or `Cmd+Option+R`

---

Sanskrit Karaoke turns a Sanskrit śloka into an interactive wave diagram that shows the metrical weight of each syllable (guru / laghu), lets you mark audio timing, and exports karaoke videos or high-resolution images.

<video src="src/bhg_2_3-shloka-sample.mp4" controls width="100%"></video>

---

## Features

- **Wave diagram** — each syllable appears as a circle on one of five horizontal rows; heavy syllables (guru) in dark red, light ones (laghu) in dark green; drag to rearrange
- **Encoding support** — paste text in Devanagari, IAST, SLP1, Harvard-Kyoto, ITRANS, Velthuis, or WX; encoding is auto-detected
- **Meter detection** — automatically identifies the meter (anuṣṭubh, samavṛtta, jāti, and others) and marks vipulā variants in anuṣṭubh padas
- **Audio timing editor** — two modes:
  - *Pada mode*: drag eight boundary lines to mark the start/end of each pada
  - *Syllable mode*: fine-tune timing per syllable with keyboard shortcuts
- **Karaoke MP4 export** — renders the wave diagram with the audio track and an animated highlight dot
- **PNG export** — 1920 × 1080 image with Devanagari, IAST transliteration, and footer metadata
- **Google Drive** — save and load sessions (JSON + audio) to a shared Drive folder

---

## Using the app

1. Open the [live app](https://gasyoun.github.io/SanskritKaraoke).
2. Paste the first and second half-verse (s1 / s2) into the text fields.
3. Press **Run** — the wave diagram appears and the meter is identified.
4. Adjust syllable weights or rows by right-clicking any syllable.
5. Load an audio file and open the **Timing Editor**:
   - Use *Pada mode* first to mark rough boundaries.
   - Switch to *Syllable mode* for precise per-syllable timing.
6. Export with **PNG** or **Karaoke MP4**.

### Keyboard shortcuts (Timing Editor — syllable mode)

| Key | Action |
|---|---|
| `←` / `→` | Select previous / next syllable |
| `Ctrl+←` / `Ctrl+→` | Shift syllable timing −0.01 s / +0.01 s |
| `Home` | Align syllable to pada start |
| `Enter` | Play current syllable |
| `Space` | Play current syllable and advance |
| `Ctrl+Space` | Play to end of śloka |
| `Ctrl+Enter` | Play to end of pada |

---

## Running locally

```sh
cd SanskritKaraoke
python -m http.server 8000
# open http://localhost:8000
```

No build step or package manager required.

**Syntax check:**
```sh
node --check src/scripts/app.js
```

---

## Code overview

| File | Contents |
|---|---|
| `index.html` | Entire UI — main view + all modals (settings, help, timing editor, Drive picker) |
| `src/scripts/app.js` | All application logic (~480 KB, single file) |
| `src/style.css` | Styles |
| `apte_prosody.html` | Apte prosody reference database |
| `ver_info.txt` | Version history |

The application has no dependencies beyond the browser and `mp4-muxer` (bundled). `app.js` is a self-contained monolith; see `CLAUDE.md` for the internal function map.

---

## Roadmap

The project is evolving from a teacher-facing authoring tool into a full **Sanskrit edutech platform** for Russian and English students — covering prosody literacy, pronunciation, and memorisation. Content is delivered via Telegram stories, the web app, course platforms, and YouTube.

### ~~Telegram Story export~~ ✓ shipped in v1.267
Zoomed portrait video (9:16 or 1:1) where the camera follows the active syllable dot, keeping 2–4 syllables in frame with a smooth pan. Format and syllable-count selectors in the sidebar. Audio embedded, 24 fps.

### Verse library & JSON schema *(in progress)*
A structured file-based catalogue (`verses/data/*.json`) with metadata per verse: source, meter, difficulty, translations (RU/EN), Drive links for audio and session. Includes a JSON Schema, validation script, and auto-generated index. The data layer everything else builds on.

### Student player page
A separate read-only page (`student.html?id=…`) that loads a verse from the catalogue, renders the wave diagram, and plays the karaoke — without any authoring controls. Students land here from Telegram or course links.

### Progressive reveal mode
A "Mode" cycling button on the student player: **Full** (all labels) → **Dots only** (circles, no text) → **Blind** (audio only, highlight dot). Applies spaced challenge to memorisation practice.

### RU / EN i18n toggle
A globe button in the header switches the entire UI between Russian and English. Strings extracted to `src/scripts/strings.js`; DOM elements tagged with `data-i18n`.

### Spaced repetition (SM-2)
After playing a verse, students rate recall (😊 😐 😕). SM-2 scheduling resurfaces verses at optimal intervals. State stored in localStorage; a "Study today" queue shows what's due.

### Self-assessment quizzes
Three rotating quiz types after a verse plays: tap guru/laghu (beat tap), identify the meter (multiple choice), fill in a hidden syllable before the karaoke reaches it.

### Streak & progress tracking
Daily streak, "verses mastered" count (SRS interval ≥ 21 days), and a progress page listing all catalogue verses with status chips (New / Learning / Mastered).

### Re-enable tapping mode
Real-time tap-along for rough timing capture — the button is present but hidden while the feature is being refined.

### Fix Google Drive file replacement
When saving an updated session, the old file can persist on Drive. Needs a delete-then-upload sequence that works within the current OAuth scope.

### Apte prosody cross-check
Complete the meter cross-check modal that compares the detected meter against the full Apte database and highlights discrepancies.

### Mobile and touch support
The timing editor and wave canvas currently require a pointer device. Adapt drag interactions and keyboard shortcuts for tablets and touch screens.

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
