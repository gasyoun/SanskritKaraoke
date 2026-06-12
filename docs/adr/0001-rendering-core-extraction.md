# ADR-0001: Extract a DOM-free rendering core from app.js

**Status:** Accepted · 2026-06-12
**Basis:** full read of `src/scripts/app.js` (7,763 lines, v1.4.2) in one context window.

## Context

`app.js` is a single monolith mixing pure computation, SVG/canvas rendering, and DOM-bound UI.
Two consumers already strain against this:

- **student.html** loads the *entire* app.js and fakes a hidden DOM bridge
  (`#student-hidden-bridge`, ~30 dummy elements: `dev-input`, `s1dev`, `ft-*`, `audio-drop`, …)
  purely to satisfy `document.getElementById` calls inside logic it needs.
- **The planned headless batch renderer (ADR-0002)** needs the same diagram/frame
  composition without any DOM at all.

A wholesale rewrite is out of the question (the app is live, QA is manual). What we need is a
*seam map*: which functions are pure or trivially parameterizable, and which stay in the UI shell.

## Audit: what lives where in app.js (line refs @ v1.4.2)

### Extractable — pure or parameterizable (the **core**)

| Group | Functions / data | Lines | DOM dependencies to sever |
|---|---|---|---|
| Transliteration | `devToIast`, `mapReplace`, `slpToDev`, `transliterateToDev`, `detectScheme`, `iastToSlp`, `syllabifySlp`, `scanWeights`; data `SCHEME_MAPS`, `TRL`, `IAST_TO_SLP` | 27–77, 2897–2950, 2973–3043, 3111–3181 | none |
| Syllabification | `syllabifyIast`, `isGuru` | 82–206 | reads `#syl-mode-std` checkbox → pass `{strict}` option |
| Meter analysis | `identifyMeterLocal`, `gaRaAbbrev`, `chooseHeavy`, `morePerLine`, `detectAndMarkVipula`, `lookupApte`, `lookupApte2`, `getGroupFromLabel`, `meterLabelForFooter`; data `METER_DATA`, `APTE_METERS`, `APTE_METERS2` | 3044–3109, 3184–3405, 7087–7199 | none (vipulā marking mutates the verse data passed in) |
| Wave geometry | `ROW_Y_BASE`, `getROW_Y`, `getSVG_H`, `computeColWidths`, `computeSharedColWidths`, `colX`, `totalSvgW`, `buildWavePath` (bezier/cardinal/monotone) | 633–831 | reads `#opt-wave-scale`, `#opt-smooth`; `measureSyl` uses a detached canvas 2d context (already DOM-free in node-canvas/OffscreenCanvas) → inject `measure(text, font)` + options |
| SVG builder | `buildWaveSVG` | 833–1044 | `getComputedStyle` for `--guru`/`--laghu` colors, `#opt-dots/-line/-hollow`, global `SHOW_DEV` → options object; emit an **SVG string**, let the caller wrap it in a DOM node |
| Frame composition | `_renderPngCanvas` (1920×1080 scene: two wave canvases + Devanagari + IAST + footer + pada dividers + **`sylPositions`**) | 2353–2613 | reads `#s1dev/#s2dev/#ft-*` inputs, live `svg-s1/s2` elements, `document.fonts.ready` → accept a `verse` object + pre-rendered wave canvases; abstract SVG→canvas rasterization |
| Karaoke frame | highlight-ring drawing and story **camera** (target tracking, lerp, crop window) inside `downloadKaraokeMp4` / `downloadTelegramStoryMp4` | 1919–1978, 2060–2205 | none once `sylPositions`, timing, and a 2d ctx are parameters → `drawKaraokeFrame(ctx, base, sylPos, timing, t, opts)` |
| Timing math | mora-proportional distribution (core of `calcAutoTiming`), `getVideoLaghuDur`, `_currentSylIndex`, `detectOnsets`, `_snapToNearest`, `_snapConfidence`, pada-bounds RMS search (core of `detectPadaBounds`), `corpusScaleTiming` | 3688–3806, 4391–4550, 4129–4136 | `corpusScaleTiming` fetches `verses/` → inject a data accessor; the rest is pure given PCM `Float32Array` |

### Stays in the UI shell (browser-only)

`render()` + cheat tables + drag handlers (447–1535), context menus, undo/history, settings &
localStorage, session save/load, scheme-detect debounce, waveform canvas + marker drag,
the whole Timing Editor (`TE`, 4659–6548), Google Drive (6555–7085), messages/i18n hooks,
WebCodecs encoder loops (browser keeps its in-app export buttons), DOCX export.

## Decision

1. Create **`src/core/`** as native ES modules with **zero `document`/`window` references**:
   `translit.js`, `syllabify.js`, `meter.js`, `apte-data.js` (lazy), `layout.js`, `svg.js`,
   `compose.js`, `karaoke-frame.js`, `timing.js`.
2. Severing pattern: every DOM read becomes a field in an explicit `opts` object with defaults
   matching today's UI defaults; every measurement/rasterization becomes an injected function.
   Data flows in as the **verse object** (same shape as `verses/data/*.json` + `DATA`/`TAP.times`).
3. The browser keeps **no build step**: `index.html` loads `<script type="module">` for the core
   plus a thin `core-globals.js` adapter that re-exports the handful of names used by inline
   `onclick=` handlers onto `window`. (Native ES modules work on GitHub Pages; the no-bundler
   invariant in README/CLAUDE.md is preserved.)
4. The ~210 KB of inline data (`APTE_METERS` ≈150 KB, `APTE_METERS2` ≈55 KB) moves to
   `src/core/data/*.json`, fetched lazily on first meter-info lookup. This alone cuts app.js
   parse weight by ~40% for students who never open meter info.
5. Extraction is **incremental and behavior-preserving** — one module per PR, app.js delegates
   to the core ("strangler fig"), `node --check` + in-browser QA per step. Order:
   `translit → syllabify → meter → layout/svg → compose → karaoke-frame → timing`.
   The first four unblock nothing downstream and can be batched; `compose` + `karaoke-frame`
   are the blockers for ADR-0002 and ship first if time is short.
6. `student.html`'s hidden-bridge shrinks as the core lands; it keeps loading app.js until the
   core covers playback, then switches to core-only imports (separate, later step).

## Consequences

- ADR-0002's headless renderer imports the *same* modules the browser runs — no fork, no drift;
  re-rendering the back-catalogue after a template change stays a one-command operation.
- The SW cache list and version-query strings must include the new module files
  (`sw.js` pattern already exists for `strings.js`/`srs.js`).
- Risk: inline-handler globals. Mitigated by the `core-globals.js` adapter and by grepping
  `index.html`/templates for `on*=` references before each extraction PR.
- Risk: `measureText` differences between browser canvas and node-canvas fonts cause column-width
  drift. Mitigated: the injected `measure` function is part of the contract; golden-image tests
  in ADR-0002 catch drift.

## Alternatives rejected

- **Full rewrite / framework adoption** — discards a working, manually-QA'd app; weeks of risk
  for zero user-visible gain.
- **Bundler (Vite/esbuild)** — violates the project's explicit no-build invariant; GitHub Pages
  deploy simplicity is a feature.
- **Keep monolith, drive headless via the existing page only** — workable short-term (ADR-0002
  stage 1 does exactly this) but leaves the student player's fake-DOM hack and blocks template v2.
