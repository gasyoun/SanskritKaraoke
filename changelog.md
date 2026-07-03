# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- [docs/AUDIO_DROP_RUNBOOK.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/AUDIO_DROP_RUNBOOK.md) — audio-in-hand → scheduled-posts contract for the first chapter drop; MY_ROADMAP.md Phase 6 (Autonomous Production Run) defined.
- Subhāṣita verse feed: 10 curated short anuṣṭubh ślokas from Böhtlingk's *Indische
  Sprüche* (public domain), imported from VisualDCS `archive.sqlite` via
  `tools/import_subhashita.py` into `verses/data/subh_*.json`. Text-only (no audio yet);
  German kept as the explicitly-labelled translation. Verse schema extended additively
  with a German (`de`) translation branch and `source.attribution`.

### Changed

### Deprecated

### Removed

### Fixed
- `tools/render_chapter.js` never worked: it loaded `render.html` via `file://`, and Chromium blocks ES-module imports cross-origin from `file://` (every render timed out). Now serves the repo over an embedded localhost HTTP server. Found by the first synthetic end-to-end pipeline run (fake audio, 02-07-2026); all 3 sample verses now render 1080×1920 H.264 30 fps MP4 + SRT/VTT + thumbnail.

### Security

## [1.4.2] - 2026-06-30

### Added
- Initial release of SanskritKaraoke

[Unreleased]: https://github.com/gasyoun/SanskritKaraoke/compare/v1.4.2...HEAD
[1.4.2]: https://github.com/gasyoun/SanskritKaraoke/releases/tag/v1.4.2
