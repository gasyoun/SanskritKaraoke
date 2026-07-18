# Sanskrit Karaoke

_Created: 12-05-2026 · Last updated: 11-07-2026_

## Wave-notation visualiser and karaoke exporter for Sanskrit verse

[**Live app →**](https://gasyoun.github.io/SanskritKaraoke/) · [v1.4.6](https://gasyoun.github.io/SanskritKaraoke/) · [changelog](https://github.com/gasyoun/SanskritKaraoke/blob/main/changelog.md)

> **If the app doesn't reflect the latest version after an update, do a hard refresh to clear the cache:**
> Edge, Firefox, Opera — `Ctrl+F5` · Chrome — `Ctrl+Shift+R` · Safari (Mac) — `Cmd+Shift+R` or `Cmd+Option+R`

---

Sanskrit Karaoke turns a Sanskrit śloka into an interactive wave diagram that shows the metrical weight of each syllable (guru / laghu), lets you mark audio timing, and exports karaoke videos or high-resolution images.

[![Sanskrit Karaoke Video](https://img.shields.io/badge/Video-Sample-red)](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/bhg_2_3-shloka-sample.mp4)

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
- **Mobile & touch** — full touch drag in the Timing Editor; on-screen navigation bar (◀ ▶ −0.01 +0.01 ⌂) on touch devices; iOS-specific export overlays for PNG and MP4; iPhone safe-area support

---

## Using the app

1. Open the [live app](https://gasyoun.github.io/SanskritKaraoke/).
2. Paste the first and second half-verse (s1 / s2) into the text fields.
3. Press **Run** — the wave diagram appears and the meter is identified.
4. Adjust syllable weights or rows by right-clicking any syllable.
5. Load an audio file and open the **Timing Editor**:
   - Use *Pada mode* first to mark rough boundaries.
   - Switch to *Syllable mode* for precise per-syllable timing.
6. Export with **PNG** or **Karaoke MP4**.

### Example inputs

Paste s1 into the first field, s2 into the second. Encoding is auto-detected (Devanagari, IAST, SLP1, etc.).

**Anuṣṭubh** (8 syllables × 4 pādas) — Bhagavadgītā 2.47

| Field | Text |
| :--- | :--- |
| s1 | `कर्मण्येवाधिकारस्ते मा फलेषु कदाचन` |
| s2 | `मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि` |

**Upajāti / Triṣṭubh** (11 syllables × 4 pādas) — Kumārasambhava 1.1 (Kālidāsa)

| Field | Text |
| :--- | :--- |
| s1 | `अस्त्युत्तरस्यां दिशि देवतात्मा हिमालयो नाम नगाधिराजः` |
| s2 | `पूर्वापरौ तोयनिधी वगाह्य स्थितः पृथिव्या इव मानदण्डः` |

**Mandākrāntā** (17 syllables × 4 pādas) — Meghadūta 1.1 (Kālidāsa)

Each printed line of Meghadūta is one pāda. Concatenate lines 1+2 into s1 and lines 3+4 into s2.

| Field | Text |
| :--- | :--- |
| s1 | `कश्चित्कान्ताविरहगुरुणा स्वाधिकारात्प्रमत्तः शापेनास्तङ्गमितमहिमा वर्षभोग्येण भर्तुः` |
| s2 | `यक्षश्चक्रे जनकतनयास्नानपुण्योदकेषु स्निग्धच्छायातरुषु वसतिं रामगिर्याश्रमेषु` |

### Keyboard shortcuts (Timing Editor — syllable mode)

| Key | Action |
| :--- | :--- |
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

**Student page generation:**
```sh
python tools/make_student.py
python tools/make_student.py --check
```

`tools/templates/student.html` is the source of truth for the deployed `student.html`.

**Syntax check:**
```sh
node --check src/scripts/app.js
```

---

## Code overview

| File | Contents |
| :--- | :--- |
| `index.html` | Entire UI — main view + all modals (settings, help, timing editor, Drive picker) |
| `src/scripts/app.js` | Main application logic (~320 KB ES module) — imports the reusable rendering core |
| `src/core/*.js` | Extracted rendering core (`translit`, `layout`, `svg`, `compose`, `karaoke-frame`, `timing`, `feed`) shared by the app and the headless renderer — see [ADR-0001](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/adr/0001-rendering-core-extraction.md) |
| `docs/reference/apte_prosody.html` | Apte prosody reference database |
| [`ARCHITECTURE.md`](https://github.com/gasyoun/SanskritKaraoke/blob/main/ARCHITECTURE.md) | Current + target architecture, phase by phase |

---

## Teaching Pipeline & Evals

The project includes a server-side **Teaching Pipeline** built on **LangGraph 1.0** and **Pydantic**, designed to automate verse curation and student analysis.

### Architecture

- **VerseCurator**: Validates and enriches new verse JSON files.
- **ContentEnricher**: Uses Gemini Flash to generate missing translations and tags.
- **QualityGate**: Enforces strict semantic and schema rules before publication.
- **StudentAnalyzer**: Analyzes SRS history and recommends the next study queue.

### Automated Quality Control (Evals)

A **Golden Dataset** of 8 test cases (including edge cases like duplicate IDs and IAST script validation) is maintained in `evals/golden/`. The `evals/judge.py` harness scores the pipeline's output against expected criteria using an LLM judge with a provider-preference chain (Anthropic → OpenRouter → Gemini), ensuring no regressions in the automated content enrichment logic.

---
The browser app has no dependencies beyond the browser itself and `mp4-muxer` (bundled). `app.js` is an ES module that imports the shared `src/core/*` rendering modules; see [`CLAUDE.md`](https://github.com/gasyoun/SanskritKaraoke/blob/main/CLAUDE.md) for the internal function map.

---

## Video production pipeline (batch drops)

The 2026 layer: a single batch recording of a **whole chapter** becomes a set of
publish-ready vertical karaoke videos with a funnel to the paid course. Roles and
step-by-step workflows are in [docs/USE_CASES.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/USE_CASES.md).

- **One command:** `python tools/build_chapter.py <audio_dir>` — auto-timing
  (`align_chapter.py`) → `feed_v1` render (vertical 9:16 MP4 @ 30 fps + `.srt`/`.vtt`,
  `render_chapter.js` via Puppeteer) → post-kit with per-platform UTM CTAs (`post_kit.py`).
  Run `npm install --prefix tools` once; `--dry-run` prints the plan without executing.
- **Alignment contract:** one highlight per syllable, beginning at its earliest audible onset
  (initial consonant, or vowel for a vowel-initial syllable); guru/laghu mātrās guide expected
  duration but do not create extra visual transitions. Real pauses clear the highlight. The next
  alignment version learns from automatic-before vs human-approved-after JSON pairs for Uṣā's
  stable recording setup, with a product target of **under one minute of human review per clip**.
  See [ADR-0004](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/adr/0004-approved-timing-corpus-alignment.md)
  and the [user rulings](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/DECISIONS_ALIGNMENT.md).
- **`feed_v1` template** (`src/core/feed.js`): a dark vertical frame — ॐ + title + meter
  (hook), Devanagari with a per-syllable IAST karaoke-fill on the active syllable, a
  progress bar, and a CTA end-card with the translation and link in the final seconds.
- **Rights (clearance before publishing):** EN — Telang, 1882 (public domain); RU —
  Sementsov (under copyright in Russia until end of 2056), licensed via a permission letter
  from his daughter (heir). `validate_library.py` and `post_kit.py` refuse to publish
  anything not cleared (see the "Rights Manager" role in the use cases).
- **Scheduling & posting:** `python tools/schedule_drops.py --config schedule.yaml` builds
  the posting plan from a cadence file; add `--live` to post via the publishers for
  **Telegram, VK, Facebook, Instagram, and WordPress** — each fires only where that
  platform's env-var credentials are set (see [docs/USE_CASES.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/USE_CASES.md)
  Appendix D). Telegram needs just a BotFather token; nothing is sent without `--live` + creds.
- **The only gate to a first drop:** Uṣā Saṅkā's recordings (audio). The rest of the
  pipeline is already built.

**At a glance:**

```
audio_dir/<id>.m4a ─▶ align_chapter.py ─▶ render_chapter.js ─▶ post_kit.py ─▶ schedule_drops.py
   (one recording)      timing → JSON       feed_v1 MP4+subs     captions+UTM     posting plan
                                            → dist/              → drop/<ch>/<id>/  → drop/schedule_plan.json
```

A full **command reference**, the **first-drop checklist**, and a **glossary** are in
[docs/USE_CASES.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/USE_CASES.md) (Appendices A–C).

---

### Roadmap

The project is evolving from a teacher-facing authoring tool into a full **Sanskrit edutech platform** for Russian and English students — covering prosody literacy, pronunciation, and memorisation. Content is delivered via Telegram stories, the web app, course platforms, and YouTube.

### ~~Telegram Story export~~ ✓ shipped in v1.267

Zoomed portrait video (9:16 or 1:1) where the camera follows the active syllable dot, keeping 2–4 syllables in frame with a smooth pan. Format and syllable-count selectors in the sidebar. Audio embedded, 24 fps.

### ~~Verse library & JSON schema~~ ✓ shipped

A structured file-based catalogue (`verses/data/*.json`) with metadata per verse: source, meter, difficulty, translations (RU/EN), Drive links for audio and session. Includes a JSON Schema, validation script, and auto-generated index. The data layer everything else builds on.

### ~~Student player page~~ ✓ shipped

A separate read-only page (`student.html?id=…`) that loads a verse from the catalogue, renders the wave diagram, and plays the karaoke — without any authoring controls. Students land here from Telegram or course links.

### ~~Progressive reveal mode~~ ✓ shipped

A "Mode" cycling button on the student player: **Full** (all labels) → **Dots only** (circles, no text) → **Blind** (audio only, highlight dot). Applies spaced challenge to memorisation practice.

### ~~RU / EN i18n toggle~~ ✓ shipped

A globe button in the header switches the entire UI between Russian and English. Strings extracted to `src/scripts/strings.js`; DOM elements tagged with `data-i18n`.

### ~~Spaced repetition (SM-2)~~ ✓ shipped

After playing a verse, students rate recall (😊 😐 😕). SM-2 scheduling resurfaces verses at optimal intervals. State stored in localStorage; a "Study today" queue shows what's due.

### ~~Self-assessment quizzes~~ ✓ shipped

Three rotating quiz types after a verse plays: tap guru/laghu (beat tap), identify the meter (multiple choice), fill in a hidden syllable before the karaoke reaches it.

### ~~Streak & progress tracking~~ ✓ shipped

Daily streak, "verses mastered" count (SRS interval ≥ 21 days), and a progress page listing all catalogue verses with status chips (New / Learning / Mastered).

### Re-enable tapping mode

Real-time tap-along for rough timing capture — the button is present but hidden while the feature is being refined.

### Fix Google Drive file replacement

When saving an updated session, the old file can persist on Drive. Needs a delete-then-upload sequence that works within the current OAuth scope.

### Apte prosody cross-check

Complete the meter cross-check modal that compares the detected meter against the full Apte database and highlights discrepancies.

### ~~Mobile and touch support~~ ✓ shipped in v1.2.2

Complete overhaul of the student view for mobile devices. Sticky bottom bar, collapsible translations, and touch-friendly quiz buttons.

### ~~Telegram Mini App support~~ ✓ shipped in v1.4.0

Full integration with the Telegram Web App SDK. Dark mode synchronization, native back button support, and automatic expansion.

### ~~Production hardening & monitoring~~ ✓ shipped in v1.4.1

LLM cost logging (`llm_costs.jsonl`), a cost dashboard, student-session telemetry, and local caching (Drive Fallback).

### Firebase cloud sync

Firebase Auth (Google) + Firestore for cross-device sync of student progress (SRS) and telemetry. See `docs/FIREBASE_ACCEPTANCE.md` for the remaining live acceptance steps.

---

## Use Case Scenarios

Detailed workflows for both audiences — maintainers (developers, drop producers, the rights manager, curators) and end-users (viewers, students, content creators, offline practitioners) — are documented in [**docs/USE_CASES.md**](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/USE_CASES.md).

### Summary of Roles:

**Maintainers:**
- **Developer**: local setup, the `src/core/*` modules, the headless `render.html`.
- **Drop Producer**: `build_chapter.py` — chapter → videos → posts in one command.
- **Rights Manager**: clears audio and translations (EN/RU/audio) before publishing.
- **The Curator**: manages the verse library via the automated Teaching Pipeline and observability tools.

**End-users:**
- **Viewer → Student**: arrives from social media via the `feed_v1` UTM funnel to the course.
- **The Content Creator**: transforms raw text and audio into structured lessons.
- **The Active Learner**: systematically memorizes verses using the student player and quizzes.
- **The Offline Practitioner**: uses PWA and caching features to practice without connectivity.

---

## License

Apache 2.0 — see [LICENSE](https://github.com/gasyoun/SanskritKaraoke/blob/main/LICENSE).

---

_Dr. Mārcis Gasūns_
