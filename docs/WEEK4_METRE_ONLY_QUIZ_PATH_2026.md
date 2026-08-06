_Created: 06-08-2026 · Last updated: 06-08-2026_

# Week-4 metre-only quiz path («Старт чтения» residual, H2114)

Parent curriculum: [SanskritGrammar `docs/CURRICULUM_START_CHTENIYA_W1_W5.md`](https://github.com/gasyoun/SanskritGrammar/blob/main/docs/CURRICULUM_START_CHTENIYA_W1_W5.md) §Week 4 (already names the pinned verse set below and the fence — this doc is the Karaoke-side technical companion, not a replacement).
Handoff: [H2114](https://github.com/gasyoun/Uprava/blob/main/handoffs/H2114-Sonnet_SanskritKaraoke_start-chteniya-week4-metre_01.08.26.md).

## Goal

Week 4 of the pilot needs an oral-paraphrase + metre-ID digital drill with **no audio**
(audio v1 for this pilot is the live teacher voice only — see PLAN D4/D8). This doc documents
which verses to use and exactly how a student reaches the meter-only quiz, without touching
alignment, rendering, or the audio-drop pipeline.

## Pinned verse set (5, all `has_audio: false`)

| ID | Meter | Title |
|---|---|---|
| `bhg_2_47` | anushtubh | Bhagavad Gita 2.47 |
| `bhg_2_48` | anushtubh | Bhagavad Gita 2.48 |
| `bhg_2_49` | anushtubh | Bhagavad Gita 2.49 |
| `subh_1249` | anushtubh | Subhāṣita №1249 (*udyamena hi sidhyanti…*) |
| `subh_6087` | anushtubh | Subhāṣita №6087 (*vidyā dadāti vinayaṃ…*) |

Source: [verses/index.json](https://github.com/gasyoun/SanskritKaraoke/blob/main/verses/index.json); individual records under [verses/data/](https://github.com/gasyoun/SanskritKaraoke/tree/main/verses/data). Set matches the curriculum map's "Pinned W4 set" row — do not diverge without updating that map too.

⚠ RU-cohort caveat (already flagged in the curriculum map): `subh_1249` / `subh_6087` carry only a German translation layer here (`language_tags: ['de']`); the teacher covers RU live, or the student is pointed at the kosha subhāṣita pack for RU gloss. Adding an RU translation to these two verse files is future Karaoke-side work, out of scope for this residual.

## Student path

1. Open [catalogue.html](https://github.com/gasyoun/SanskritKaraoke/blob/main/catalogue.html), or deep-link straight to `student.html?id=<verse_id>` for one of the five IDs above.
2. **Wave diagram renders from the verse's own syllable/meter data** — `buildWaveSVG()` needs no audio, so this works identically for every verse in the library.
3. **Meter-only quiz.** For a `has_audio: false` verse, `loadStudentData()` now shows a **"Начать квиз: размер стиха" / "Start quiz: verse metre"** button (`#btn-start-meter-quiz`) instead of the audio player. Clicking it calls the new `startMeterOnlyQuiz()` (`src/scripts/quizzes.js`), which opens the quiz panel and runs the existing `startMeterQuiz()` directly.
4. Skip fill-in and beat-tap for these verses — see "Why a code change was needed" below.

## Fence

- No `align_chapter`, no render pipeline, no audio-drop work touched.
- No changes to ADR-0004 / Usha-calibrated alignment.
- The five verses' `audio` blocks stay `drive_file_id: "TODO"` — this residual does not wait on or request chapter audio.

## Why a code change was needed (not documentation alone)

Before this pass, **no path existed to reach any quiz — meter included — on a `has_audio: false` verse.** `triggerQuizCycle()` (which picks meter/fill-in/beat-tap in rotation) only fires from `onVerseEnded()`, wired to the `<audio>` element's native `ended` event (`tools/templates/student.html`). When a verse has no audio, `audio-preview` is never given a `src` and stays hidden, so `ended` never fires and the quiz panel never opens.

Fill-in and beat-tap are correctly excluded from this path on their own merits too — both call `audio.play()` and rely on playback events (`startFillInQuiz`/`startBeatTapQuiz`/`recordTap`, `src/scripts/quizzes.js`) and would silently no-op against an empty audio source.

The fix is a small, self-contained addition, not a rebuild of the quiz system:
- `startMeterOnlyQuiz()` (`src/scripts/quizzes.js`) — opens the quiz panel and calls the existing `startMeterQuiz()`.
- A conditionally-shown `#btn-start-meter-quiz` button (`tools/templates/student.html`, regenerated to `student.html` via `python tools/make_student.py`) — shown only in the "no audio" branch of `loadStudentData()`.
- `startMeterQuizBtn` RU/EN string (`src/scripts/strings.js`).

`startMeterQuiz()` itself was already generic across the whole library (draws distractor meters from `verses/index.json`) — it needed no change to work on these five IDs.

## Acceptance / prove

- `python tools/validate_library.py` — unaffected verse count/shape (13/13 valid).
- `node --check src/scripts/quizzes.js` and `node --check src/scripts/app.js` — syntax clean.
- Manual QA: `python -m http.server 8000`, open `student.html?id=bhg_2_47` (or any of the five IDs above) — wave diagram renders, no audio player, "Начать квиз: размер стиха" button appears, clicking it runs the meter quiz and reports correct/incorrect.
- Cross-check against a `has_audio: true`-shaped verse (any with a real `drive_file_id`) to confirm the existing audio → `triggerQuizCycle()` (meter/fill-in/beat-tap rotation) path is unchanged.

## Non-goals

- Executing sibling `START_CHTENIYA` handoffs from this doc.
- RU translations for `subh_1249`/`subh_6087`.
- Any audio pipeline, alignment, or render work.

_Dr. Mārcis Gasūns_
