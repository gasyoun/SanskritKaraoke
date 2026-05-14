# Changelog — Sanskrit Karaoke

All notable changes to this project will be documented in this file.

## [1.4.1] — 2026-05-14

### Fixed (Teaching Pipeline — Critical)

- **`nodes.py` — AttributeError on checkpoint resume**: `verse_curator` called `.get()` on
  a `VerseData` Pydantic object when a thread was resumed. Added `isinstance` guard so resumed
  threads skip re-validation and return the already-valid model directly.
- **`persistence.py` — Wrong PostgreSQL driver**: `psycopg2` (sync-only) replaced with
  `psycopg` v3 (async-compatible) as the primary driver. Graceful fallback to psycopg2
  with a deprecation warning retained.
- **`judge.py` — `eval()` security**: Replaced unrestricted `eval()` with a sandboxed call
  preventing arbitrary code execution from JSON-sourced check strings.
- **`judge.py` — Pydantic state not serialized before eval**: Added `_normalize_state()` to
  convert `VerseData` objects to plain dicts before running check expressions.
- **`nodes.py` — Sync LLM call blocks async event loop**: `content_enricher` now runs
  `call_llm` via `asyncio.run_in_executor` to avoid blocking on HTTP calls.
- **`cases.json` case_08**: Corrected expected phase from `rejected` to `curation_failed`
  and error from `Schema violation` to `Data validation error`.
- **`nodes.py` — Null translation re-triggers LLM**: Changed translation check to test the
  `ru` value explicitly; LLM returning `null` no longer causes re-enrichment on every run.

### Changed (Teaching Pipeline — Architecture)

- **`nodes.py`**: Moved all imports to module level. Extracted `_project_root`,
  `_iast_pattern`, and `_to_verse_data()` as module-level constants. Removed redundant
  `jsonschema` double-validation (Pydantic enforces schema on construction in curator).
- **`graph.py`**: Moved `route_start` and `route_after_curator` to module level for
  independent testability. Improved routing logic to explicit boolean conditions.
- **`state.py`**: Moved `TypedDict` import to top-level with other imports.
- **`test_deepcopy.py`**: Now passes a real `VerseData` object to match the production
  code path (previously tested against a raw dict).
- **`judge.py`**: Added `atexit` executor shutdown. Summary now counts skipped cases
  separately from failures.

## [1.4.0] — 2026-05-14

### Added

- **Auto-Alignment Timing Pipeline**: Integrated a waveform-based synchronization engine.
  - **Audio Analysis**: Automated onset (consonant attack) and vowel peak detection using RMS energy envelopes.
  - **Smart Snapping**: Syllables now automatically snap to detected audio features based on metrical corpus scaling and phonetic rules (`phoneme_rules.json`).
  - **Confidence Scoring**: Real-time reliability metrics (0-1) for every syllable, with amber highlighting for low-confidence areas.
  - **Rapid Navigation**: Tab/Shift+Tab support to quickly cycle through uncertain syllables for manual review.
  - **Timing JSON Export**: Dedicated export for per-syllable timestamps and confidence scores for database patching.

### Changed

- **Version unification**: Merged the two parallel version tracks (incremental v1→v1.272 and semver v1.0.0→v1.3.1) into a single semver track. All pages now show v1.4.0.

### Fixed

- **Service Worker cache staleness**: Added `activate` event handler to prune old caches, `skipWaiting()` for immediate activation, and `clients.claim()` so returning users get fresh assets.
- **Design system consistency**: `catalogue.html` now uses `Cormorant Garamond` (project font) instead of `Segoe UI`.
- **Stale documentation**: Updated `AGENTS.md` next action (was pointing to completed Phase 0), `MY_ROADMAP.md` next action, `WAVE_-_INSTRUCTION_for_Claude.md` version reference, and `.ai_state.md` with current project state.

## [1.272] — 2026-05-14

### Added

- **Touch drag support**: All drag interactions in the Timing Editor (pada boundaries, syllable timing, pan, cheatsheet, scrollbar) and waveform now work on touch screens via unified `_normEv(e)` helper that normalises mouse/touch coordinates. SVG syllable drag already had touch support.
- **Touch navigation bar**: On touch devices (`@media (pointer: coarse)`) a row of buttons appears below the Timing Editor in Syllable mode: ◀ ▶ (navigate syllables), −0.01 / +0.01s (shift timing), ⌂ (align to pada start). Replaces keyboard shortcuts unavailable without a physical keyboard.
- **iOS export handling**: `_isIOS()` detection enables platform-specific export flows — PNG shows a full-screen overlay with long-press-to-save instructions; Karaoke MP4 shows a link overlay for share/save; simple MP4 (`captureStream`) is blocked with a clear error since Safari doesn't support `canvas.captureStream()`.
- **Android MP4 warning**: `confirm()` dialog before starting MP4 export on Android/iOS, explaining memory limitations.
- **iPhone safe area**: Timing Editor overlay uses `viewport-fit=cover`, `env(safe-area-inset-*)` padding with flex centering — modal clears the notch and Home indicator on all iPhone models.

## [1.3.1] — 2026-05-12 16:57

### Added

- **PWA Support**: The app can now be installed on Android/iOS/Desktop as a standalone application.
- **Offline Mode**: Core assets are cached via Service Worker for use without an internet connection.
- **Premium App Icon**: Added a high-resolution golden 'Om' wave-pattern icon.

## [1.3.0] — 2026-05-12 16:39

### Added

- **Telegram Mini App Support**: Full integration with the Telegram Web App SDK.
- **Dark Mode Sync**: Automatic theme synchronization with Telegram's color scheme.
- **Native Navigation**: Support for the Telegram Back Button across all student views.
- **App Expansion**: Automatic full-height viewport activation in Telegram.

## [1.2.2] — 2026-05-12 16:34

### Added

- **Mobile Optimization**: Complete overhaul of the student view for mobile devices.
- **Sticky Bottom Bar**: Added a "thumb zone" navigation bar for easy access to Mode/Lang toggles on mobile.
- **Collapsible Translation**: Tap to expand/collapse translations on small screens.
- **Enhanced Quiz UI**: Large, high-contrast, touch-friendly buttons for the Beat Tap quiz.

## [1.2.1] — 2026-05-12 16:32

### Added

- **Library Export Form**: New sidebar panel in the authoring tool (`index.html`) to export the current session directly as a formatted JSON file for the library.
- **Auto-slug Generation**: Verse IDs are automatically suggested based on source and year.

## [1.2.0] — 2026-05-12 16:28

### Added

- **Catalogue Page**: New `catalogue.html` for students to browse the verse library with search, filter (meter, difficulty, tags), and sorting.
- **SRS Badges**: Real-time status chips (New, Learning, Mastered) and "Study Today" count in headers.
- **Internationalization (i18n)**: Expanded `strings.js` to cover 100% of the UI; added `data-i18n` attributes to `index.html` and `student.html`.
- **Student Help**: Dedicated learner's guide in the student view help modal.

### Fixed

- **Stable Student Player**: Rewrote `make_student.py` to correctly remove authoring sidebars while preserving necessary IDs in a hidden bridge.
- **Quiz Synchronization**: Enabled karaoke highlights in "Fill-in" and "Beat Tap" quizzes.
- **Race Conditions**: Replaced static timers in session loading with robust polling (`waitForApp`).
- **Keyboard Shortcuts**: Added G/L key support for the Beat Tap quiz.
- **Progress Logic**: Fixed `progress.html` to only show overdue verses in the "Study Today" queue.
- **CSS Regressions**: Fixed visibility issues in "Blind Mode".
- **Schema Compliance**: Corrected non-standard JSON schema keywords.

## [1.1.0] — 2026-05-11

### Added

- **Learning Mechanics**: Implemented SRS (`srs.js`) using SM-2 algorithm.
- **Interactive Quizzes**: Added Meter ID, Fill-in, and Beat Tap modes in `quizzes.js`.
- **Progress Dashboard**: Added `progress.html` to track streaks and mastery levels.
- **Initial Student Player**: First version of `student.html` with read-only view.

## [1.0.0] — 2026-05-10

### Added

- **Core Engine**: Wave notation rendering, devanagari/IAST support.
- **Timing Editor**: Precise syllable-level audio synchronization.
- **Session Management**: Google Drive integration for saving and loading authoring sessions.
- **Verse Library**: Initial `verses/` structure and validation tools.
- **Documentation**: Comprehensive READMEs in English and Russian.
