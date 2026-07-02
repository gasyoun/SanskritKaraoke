# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Subhāṣita verse feed: 10 curated short anuṣṭubh ślokas from Böhtlingk's *Indische
  Sprüche* (public domain), imported from VisualDCS `archive.sqlite` via
  `tools/import_subhashita.py` into `verses/data/subh_*.json`. Text-only (no audio yet);
  German kept as the explicitly-labelled translation. Verse schema extended additively
  with a German (`de`) translation branch and `source.attribution`.

### Changed

### Deprecated

### Removed

### Fixed

### Security

## [1.4.2] - 2026-06-30

### Added
- Initial release of SanskritKaraoke

[Unreleased]: https://github.com/gasyoun/SanskritKaraoke/compare/v1.4.2...HEAD
[1.4.2]: https://github.com/gasyoun/SanskritKaraoke/releases/tag/v1.4.2
