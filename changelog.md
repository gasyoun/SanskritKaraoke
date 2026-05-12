# Changelog — Sanskrit Karaoke

All notable changes to this project will be documented in this file.

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
