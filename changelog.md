# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/gasyoun/SanskritKaraoke/compare/v1.4.8...HEAD
[1.4.8]: https://github.com/gasyoun/SanskritKaraoke/compare/v1.4.7...v1.4.8
[1.4.7]: https://github.com/gasyoun/SanskritKaraoke/compare/v1.4.6...v1.4.7
[1.4.6]: https://github.com/gasyoun/SanskritKaraoke/compare/v1.4.2...v1.4.6
[1.4.2]: https://github.com/gasyoun/SanskritKaraoke/releases/tag/v1.4.2
