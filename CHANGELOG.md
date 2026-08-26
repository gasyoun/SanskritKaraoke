# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Phase-4 evals cluster truth-pass-ticked in MY_ROADMAP.md** (OxAlpha `stealth/ox-alpha`, 27-08-2026, bare `/drain` pick). All four Week-1–3 deliverables verified shipped on-disk and ticked with evidence links: [`evals/golden/cases.json`](https://github.com/gasyoun/SanskritKaraoke/blob/main/evals/golden/cases.json) (exactly 8 golden cases), [`evals/judge.py`](https://github.com/gasyoun/SanskritKaraoke/blob/main/evals/judge.py) + [`evals/check_report.py`](https://github.com/gasyoun/SanskritKaraoke/blob/main/evals/check_report.py) (pipeline-driving judge, builtins-restricted check sandbox, explicit skip-not-pass on missing keys), [`.github/workflows/evals.yml`](https://github.com/gasyoun/SanskritKaraoke/blob/main/.github/workflows/evals.yml) (deterministic CI gate on pipeline/eval paths), and baseline [`evals/report.json`](https://github.com/gasyoun/SanskritKaraoke/blob/main/evals/report.json) (6/8 pass, 2 skipped pending Gemini/LangSmith key). No code changed on this pass.

- **A7 executed — tapping mode restored + Drive same-name session replacement fixed** (OxAlpha `stealth/ox-alpha`, 26-08-2026, bare `/drain` pick, commit `0e2f6a4`). *Tapping:* the manual beat-entry UI removed by `7da6f15` (only its entry points were deleted — all functions survived in [src/scripts/app.js](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/scripts/app.js)) is restored in `#tap-block` under the Timing Editor button: playback-rate select (0.5×/0.75×/1.0×), «⏺ Тэппинг» (`startTapping()`), reset, and the previously dangling-dependency play/stop pair that `startTapping`/`karaokePlay`/`karaokeStop` dereference; i18n keys (`tapRateLabel`, `tapBtn`, `tapResetBtn`, `karaokePlayBtn`, `karaokeStopBtn`) added to both ru+en in [src/scripts/strings.js](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/scripts/strings.js); button state writes are now null-safe via a `setBtnDisabled` helper so the headless student bridge never throws. *Drive:* `gdriveSave` had two leak paths — it only deleted the file selected in the picker (folder-save accumulated same-name duplicates), and the old-file DELETE was fire-and-forget (`catch(() => {})`). It now resolves every stale same-name copy in the target folder through `files.list` with an escaped `name='…'` query before uploading the replacement, deletes all stale copies **after** the upload succeeds (404 treated as already-gone), and surfaces failed deletions as a visible ⚠️ message carrying id + HTTP status instead of swallowing them. Verified: `node --check` on both scripts green; headless-Chrome load of [index.html](https://github.com/gasyoun/SanskritKaraoke/blob/main/index.html) renders zero console errors with the restored controls present post-i18n; [tools/test_core_modules.mjs](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/test_core_modules.mjs) green; `validate_library.py` not rerun on this machine (no `jsonschema` under PEP 668) — verses untouched by this unit. Roadmap/residual bookkeeping: [ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/ROADMAP.md) Backlog bullets ticked, Lane A of [the blocker-sorted residual](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md) fully drained (A3 owner-act residue remains).

- **A5 executed — Telang/Sementsov wording verified for BG 2.47–2.49, honest attribution + 2.49 EN correction** (OxAlpha `stealth/ox-alpha`, 26-08-2026, bare `/drain` pick). Verdicts against primary sources: EN 2.47/2.48 **are verbatim Telang** (SBE vol. 8 print text re-extracted from the [`bhagavadgtwi00tela`](https://archive.org/details/bhagavadgtwi00tela) 1882 scan page layer and confirmed by the 1908 impression `bhagavadgtwithsa00tela`; sacred-texts' «Dhanañgaya» is transcription noise for Dhanañjaya). EN 2.49 **was not Telang** — «For action… Have recourse (then) to (this) devotion…» matches no edition; both witnesses print *«Action, O Dhanañjaya! is far inferior to the devotion of the mind. In that devotion seek shelter. Wretched are those whose motive (to action) is the fruit (of action).»* — [verses/data/bhg_2_49.json](https://github.com/gasyoun/SanskritKaraoke/blob/main/verses/data/bhg_2_49.json) EN now carries the true print wording. RU lines of all three verses are **not verbatim Sementsov** (checked against his published text via IA copy [`Bhagavadiita_Sementsov`](https://archive.org/details/Bhagavadiita_Sementsov), e.g. 2.48 = «От привязанностей свободен, в йоге стоек, свершай деянья, уравняв неудачу с удачей: эта ровность зовется йогой.» vs the compressed paraphrase in the verse files): each verse's `translation.rights.ru` gains an `attribution` field «по мотивам перевода В. С. Семенцова (переложение; не дословный текст перевода)» (schema field added by H1858; licence basis unchanged, SK-LIC-2026-002 refs stay). Word-glosses are unaffected — they were machine-aligned over real Sementsov tokens («в йоге стоек», «свершай», «деянья»). `validate_library.py`: 13/13 valid, 52 warnings (= baseline).

### Added

- **Phase-3 harness unit shipped: `validate-verse` skill + verses pre-commit gate** (OxAlpha `stealth/ox-alpha`, 26-08-2026, bare `/drain` pick). MY_ROADMAP.md Phase 3 line 111 lands both halves of its deliverable: project skill [`.claude/skills/validate-verse/SKILL.md`](https://github.com/gasyoun/SanskritKaraoke/blob/main/.claude/skills/validate-verse/SKILL.md) — single-file + full-library validation commands, `jsonschema` machine ergonomics, warning-baseline interpretation (13 verses / 52 warnings as of today); plus [`.githooks/pre-commit`](https://github.com/gasyoun/SanskritKaraoke/blob/main/.githooks/pre-commit) extended so any commit staging `verses/**` auto-runs [`tools/validate_library.py`](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/validate_library.py): real validation failures BLOCK (`ALLOW_VALIDATE_SKIP=1` solo escape), while a python-without-jsonschema machine degrades to a loud WARNING so env drift never blocks other sessions' commits. Gate proven on this pass: broken-verse staging BLOCKED (venv python), validator green at baseline 13/13 · 52 warnings. The sibling Phase-3 checkbox was also truth-pass-ticked — [`docs/harness_gap_analysis.md`](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/harness_gap_analysis.md) has been fully shipped since commit `ad09b87`; its §3 now records the closure instead of a future-tense promise.

- **Metre-detector coverage test + Lane-A truth-pass of the residual roadmap** (OxAlpha `stealth/ox-alpha`, 26-08-2026, bare `/drain` pick). [tools/test_meter_detector.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/test_meter_detector.py) extracts `METER_DATA` live from `src/scripts/app.js` and hard-asserts that ROADMAP Phase 4's four metres (Mālinī, Śārdūlavikrīḍita, Vasantatilakā, Sragdharā) are registered, round-trip through the gaṇa abbreviation, and identify uniquely; per-verse anuṣṭubh scans of the library run as diagnostics (stored metres are hand-labelled authoring data, not detector output). The truth-pass re-verdicted [Lane A](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md): A1/A2 shipped in commit [`3a31711`](https://github.com/gasyoun/SanskritKaraoke/commit/3a31711), A4 already consolidated by [`src/scripts/cloud_sync.js`](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/scripts/cloud_sync.js) since v1.4.2, A6 verified done and ticked in [ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/ROADMAP.md); A3 (`drive`→`drive.file`) re-verdicted **gated** — the load path browses a shared folder for files others created, which `drive.file` cannot serve, so narrowing requires a Picker-API migration with an owner Cloud-Console act and a live 2FA acceptance test. Remaining open Lane-A work: A5 (Telang wording) and A7 (tapping mode + Drive file replacement).

## [1.5.6] - 2026-08-24


### Added

- **Residual `/ask` set: the repo's open work sorted by blocker, not by phase (H3000)** (Opus 5 `claude-opus-5`, 18-08-2026). This repo had **four roadmaps and zero planning documents**, and all three living roadmaps are phase-ordered — so a reader working them top-down stops at
  [docs/KARAOKE_PRODUCT_ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/KARAOKE_PRODUCT_ROADMAP.md) Phase 0 item 1, which is *a written agreement with Уша Санка*: a legal act no agent at any tier can perform. The repo reads dead; it is not. The new six-doc set
  ([PLAN](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md) · [ROADMAP](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md) · ARCHITECTURE · IMPLEMENTATION · VERIFICATION · metadoc)
  re-sorts every open item across the roadmaps and [.ai_state.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/.ai_state.md) into three lanes by **who can unblock it**: **Lane A — seven items agent-doable today** (rights/provenance schema fields + backfill, `drive`→`drive.file` OAuth narrowing, shared `auth-state.js` across the three pages that each wire Firebase differently, four new metres, the Telang/Sementsov text check for BG 2.48–2.49, tapping mode, Drive file replacement); **Lane B — three items fully specified and waiting on an artefact** (chapter audio, ADR-0004 calibration, Telegram credentials); **Lane C — one human legal act**. Scope was deliberately not invented: every item is cited to the roadmap or journal line it came from. Two standing rulings are written down rather than left implicit — [MY_ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/MY_ROADMAP.md) is a personal agent-engineering curriculum and **must not be counted as product backlog**, and TTS integration stays unscheduled because generating synthetic audio while waiting for a named reciter's recordings is a product-premise decision, not a drain unit. Programme parent: [H3000](https://github.com/gasyoun/Uprava/blob/main/handoffs/H3000-Opus_multi_stale-roadmap-s2-tier0-ask-replan_17.08.26.md).

### Changed

- **`GEMINI_ROADMAP.md` archived for real, not merely bannered (H3000)** (Opus 5 `claude-opus-5`, 18-08-2026). It has carried an `АРХИВ` banner since 29-07-2026 (H1879) because its bug list targets `make_student.py` code paths that no longer exist — but it stayed at a live path, where every census that counts files rather than reading them kept scoring it as a fourth live roadmap. Moved to [archive/GEMINI_ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/archive/GEMINI_ROADMAP.md) with a tombstone at the old path. The three living roadmaps each gained a dated truth-pass banner stating what actually blocks them.

### Changed

- **H2820 — CLAUDE.md truth-pass** (Grok 4.6 `grok-4.6`, 16-08-2026). What this
  repo is (śloka wave-diagram SPA), how to run (`http.server`, validators,
  `make_student.py`), five-locus version bump, do-not-touch (`student.html`
  generated). Slimmed architecture dump. AGENTS.md twin regenerated.
## [1.5.5] - 2026-08-06

### Added
- **Week-4 metre-only quiz path (H2114)** — [docs/WEEK4_METRE_ONLY_QUIZ_PATH_2026.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/WEEK4_METRE_ONLY_QUIZ_PATH_2026.md): documents the 5 pinned `has_audio: false` verses (`bhg_2_47`, `bhg_2_48`, `bhg_2_49`, `subh_1249`, `subh_6087`) used by the «Старт чтения» pilot Week 4. Fixes a real gap, not just docs: `triggerQuizCycle()` only ever fired from the `<audio>` element's `ended` event, so no verse without audio could reach *any* quiz. Added `startMeterOnlyQuiz()` (`src/scripts/quizzes.js`) plus a conditionally-shown `#btn-start-meter-quiz` button (`tools/templates/student.html` → regenerated `student.html`) that opens the existing meter quiz directly when a verse has no audio — fill-in/beat-tap stay audio-gated as before. No changes to alignment, rendering, or the audio-drop pipeline.

## [1.5.4] - 2026-08-05

### Added
- **ADR-0005: transliteration display ruling for singers (H1870)** — [docs/adr/0005-transliteration-display-for-singers.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/adr/0005-transliteration-display-for-singers.md): lowercase full-diacritic IAST is the canonical per-syllable display on every singer-facing surface (balls, karaoke/story frames, WebVTT cues, feed highlight line, quizzes); Devanāgarī only as a continuous reference line or the explicit देव opt-in; Cyrillic transcription and ASCII input schemes (HK/SLP1/ITRANS/Velthuis/WX) display-banned. Codifies the shipped defaults — no behavior change, no data migration. Applied live: new «Запись слогов — почему IAST» section in the help modal (`index.html`) and ADR-referencing tooltips on the देव/IAST toggle (`src/scripts/app.js`, 3 sites).

## [1.5.3] - 2026-08-05

### Added
- **Russian anuṣṭubh recitation методичка (H1869)** — [docs/METODICHKA_ANUSHTUBH_RECITATION_RU_2026.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/METODICHKA_ANUSHTUBH_RECITATION_RU_2026.md) (+ sibling `.meta.md`): print-first student guide to reciting the śloka without a teacher — pāda structure, guru/laghu weight rules, pathyā vs vipulā cadences (with the app's own `detectAndMarkVipula` patterns), pause hierarchy tied to the timing editor's pāda bounds, 2:1 mora timing as used by the aligner, and worked examples from the library (bhg_2_47 pathyā, subh_6087 na-vipulā, subh_3981 ma-vipulā). Includes a machine-computed cadence census of all 13 library verses (22 pathyā / 2 ma-vipulā / 2 na-vipulā odd pādas, zero even-pāda exceptions) via `src/core/translit.js` strict syllabification, plus 4 exercises with an answer key (⟦MG-viza⟧ gate pending). Recitation melody explicitly attributed to Уша Санка's style, not presented as a neutral standard.

## [1.5.2] - 2026-08-04

### Added
- **Russian renderings for all ten Böhtlingk subhāṣitas (H1858)** — every `subh_*` verse now carries `translation.ru` rendered from the Sanskrit (Böhtlingk's German used as a check only), with honest provenance (`provenance.ru: "claude"` — Claude Fable 5, `claude-fable-5`) and cleared rights (`rights.ru.status: "own-work"`, source + ready-to-print attribution citing the Indische Sprüche number). `tools/post_kit.py` now emits real `caption_ru.txt` for these verses — zero `caption_ru.BLOCKED.txt` placeholders remain; the only surviving publish gate is missing audio. `language_tags` gain `ru`; `verses/index.json` regenerated.

### Fixed
- **`tools/post_kit.py` no longer hardcodes the RU caption credit to В. С. Семенцов** — the caption attribution line and the manifest's `ru_translation` credit now come from the verse's own `translation.rights.ru.attribution`/`rights_holder` (new optional `attribution` field documented in `verses/schema/verse.schema.json`), falling back to the legacy Bhagavad-Gita constants. Before this, a subhāṣita caption would have falsely credited the Gita translator.

## [1.5.1] - 2026-08-01
### Added
- **`agents/verse_agent_raw.py` live dry-run path (H2101)** — Phase 1 raw SDK verse-library agent restored under `agents/` with `--help` / default `--dry-run` (catalogue list → read one verse → schema validate; no paid API, no write). Paid meter/translate stays behind `--live`. Minimal [`agents/README.md`](https://github.com/gasyoun/SanskritKaraoke/blob/main/agents/README.md). Historical pre-CLI copy unchanged at `docs/history/verse_agent_raw.py`.

## [1.5.0] - 2026-08-01

### Added
- **Teacher dashboard (`teacher.html`, v1.5.0)** — ROADMAP.md Phase 1 deliverable "кто из студентов что изучал, какой streak". A teacher signs in with the same Google/Firebase login used elsewhere in the app and sees a table of every student's email, streak, mastered/learning/total verse counts, and last-active date. Data model: a new top-level `users/{uid}` Firestore profile doc (email/displayName, written on every login via `syncUserProfile()` in `src/scripts/cloud_sync.js`) lets the dashboard enumerate students with `collection(db, 'users')`, then reads each student's existing `srs_v1`/`progress_meta` docs. Client-side allowlist in `src/scripts/teacher-config.js` (`window.TEACHER_EMAILS`) drives the UI gate; the actual enforcement is a matching `isTeacher()` email allowlist added to `firestore.rules`. **Owner residual:** the updated `firestore.rules` need `firebase deploy --only firestore:rules` run manually against the live `sanskritkaraoke` project (no CI wiring exists for rules deploys) before the dashboard can read other students' data in production — until then a teacher sees only their own row.

## [1.4.9] - 2026-08-01

### Changed
- Docs-only maintenance release: `MY_ROADMAP.md` Phase 2 deliverable `agents/teaching_pipeline/` — LangGraph multi-agent project — ticked as shipped (was already built and merged via commit `ad09b87`, just never marked done); re-verified 01-08-2026: `pytest agents/teaching_pipeline/` and `python agents/teaching_pipeline/test_simulation.py` both run clean end-to-end. No application changes — the in-browser version intentionally remains v1.4.8.

## [1.4.8] - 2026-07-12

### Added
- **Course CTA footer on all four deployed pages** (H716 free-funnel CTA audit): `index.html`, `catalogue.html`, `progress.html` and the student player (via `tools/templates/student.html` + regeneration) now carry a shared `.cta-footer` block — primary button «Записаться на курс санскрита →» to `https://samskrtam.ru/usha-sanka` with UTM tagging (`utm_source=karaoke&utm_medium=cta&utm_campaign=<page>`, matching the `tools/post_kit.py` convention), custdev-proven hint «Можно в записи и в своём темпе», secondary link «Задать вопрос в Telegram» to `https://t.me/rusamskrtam`. RU/EN i18n keys `ctaCourse`/`ctaCourseHint`/`ctaTelegram` in `src/scripts/strings.js`; styles in `src/style.css`. No urgency/social-proof copy per the ORS-FAQ custdev win/loss evidence.
- [docs/FREE_FUNNEL_CTA_AUDIT_07_2026.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/FREE_FUNNEL_CTA_AUDIT_07_2026.md) — cross-surface audit table (CTA present? destination? metric wired?) over the org's free-funnel surfaces.

### Fixed
- GitHub Pages artifact no longer ships `docs/legal/` (draft license agreements with personal data were publicly reachable on the Pages site).

## [1.4.7] - 2026-07-03

### Changed
- Docs-only maintenance release: CLAUDE.md versioning workflow rewritten (5 real version locations, release recipe, Pages-flake workaround; dead `ver_info.txt` dropped) + `.ai_state.md` session-close tidies. No application changes — the in-browser version intentionally remains v1.4.6.

## [1.4.6] - 2026-07-03

### Added
- [docs/archive/H132-Sonnet_SanskritKaraoke_AUDIO_DROP_RUNBOOK_02.07.26.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/archive/H132-Sonnet_SanskritKaraoke_AUDIO_DROP_RUNBOOK_02.07.26.md) — audio-in-hand → scheduled-posts contract for the first chapter drop; MY_ROADMAP.md Phase 6 (Autonomous Production Run) defined.
- Subhāṣita verse feed: 10 curated short anuṣṭubh ślokas from Böhtlingk's *Indische
  Sprüche* (public domain), imported from VisualDCS `archive.sqlite` via
  `tools/import_subhashita.py` into `verses/data/subh_*.json`. Text-only (no audio yet);
  German kept as the explicitly-labelled translation. Verse schema extended additively
  with a German (`de`) translation branch and `source.attribution`.
- **Gloss layer in the student player (v1.4.6)**: word-by-word Sanskrit→RU glosses (`verse.glosses`, built 2026-06-26) now render as a collapsible «Пословный разбор» panel above the translation — IAST word on top, RU gloss beneath, auto-alignment disclaimer tooltip, collapse state persisted in localStorage, hidden in Dots/Blind study modes, RU/EN i18n headings.

### Fixed
- Translation box no longer renders empty for verses without a RU/EN translation: `updateTranslation` now falls back to any real language entry in `verse.translation` (metadata keys like `provenance`/`rights` excluded) and prefixes it with the language code — the German-only subhāṣita verses show "(DE) …"; the box hides entirely when no translation exists.
- **Student player was entirely broken since the ADR-0001 ES-module migration**: `student.html` loaded `app.js` without `type="module"` (parse error on the first `import`); `_applySession` was missing from the window-export block, so the `waitForApp` gate could never pass; a successful `runPipeline` wiped the student UI because `render()` clears `#main-area` and the audio/translation/quiz/SRS panels lived inside it (moved to a sibling `#student-panels` section); and the scheme auto-detect never ran for programmatically-set input, so the pipeline bailed on the empty scheme select. All four fixed; player verified end-to-end headless (wave + gloss + translation + Dots/Blind cycling + RU/EN toggle). `waitForApp` budget raised 2 s → 15 s for slow connections.
- Template↔deployed drift reconciled: the 2026-06-13 i18n/security/cache-bust fixes existed only in the deployed `student.html`; they are now in `tools/templates/student.html` (the source of truth), so regeneration no longer reverts them.
- `tools/render_chapter.js` never worked: it loaded `render.html` via `file://`, and Chromium blocks ES-module imports cross-origin from `file://` (every render timed out). Now serves the repo over an embedded localhost HTTP server. Found by the first synthetic end-to-end pipeline run (fake audio, 02-07-2026); all 3 sample verses now render 1080×1920 H.264 30 fps MP4 + SRT/VTT + thumbnail.

## [1.4.2] - 2026-06-30

### Added
- Initial release of SanskritKaraoke

[Unreleased]: https://github.com/gasyoun/SanskritKaraoke/compare/v1.5.5...HEAD
[1.5.5]: https://github.com/gasyoun/SanskritKaraoke/compare/v1.5.4...v1.5.5
[1.5.4]: https://github.com/gasyoun/SanskritKaraoke/compare/v1.5.3...v1.5.4
[1.5.3]: https://github.com/gasyoun/SanskritKaraoke/compare/v1.5.2...v1.5.3
[1.5.2]: https://github.com/gasyoun/SanskritKaraoke/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/gasyoun/SanskritKaraoke/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/gasyoun/SanskritKaraoke/compare/v1.4.9...v1.5.0
[1.4.9]: https://github.com/gasyoun/SanskritKaraoke/compare/v1.4.8...v1.4.9
[1.4.8]: https://github.com/gasyoun/SanskritKaraoke/compare/v1.4.7...v1.4.8
[1.4.7]: https://github.com/gasyoun/SanskritKaraoke/compare/v1.4.6...v1.4.7
[1.4.6]: https://github.com/gasyoun/SanskritKaraoke/compare/v1.4.2...v1.4.6
[1.4.2]: https://github.com/gasyoun/SanskritKaraoke/releases/tag/v1.4.2
