# ADR-0002: Headless batch renderer — Puppeteer first, node-canvas only if needed

**Status:** Accepted · 2026-06-12
**Depends on:** ADR-0001 (`compose.js`, `karaoke-frame.js`).

## Context

The roadmap's batch-drop model needs: one command turns a chapter (~20 verses with audio +
timing) into branded 9:16 30 fps MP4s + captions. Today every video is exported manually from a
browser tab, and the landscape karaoke path renders at **10 fps** (`app.js:1873`).

Constraints discovered in the full-monolith audit:

- The export pipeline is **WebCodecs** (`VideoEncoder`/`AudioEncoder`) + bundled `mp4-muxer`.
  WebCodecs does not exist in Node — but it **does** exist in headless Chromium.
- The story export already contains the hard parts: camera target tracking with lerp smoothing,
  crop-window math, highlight rings, AAC audio interleaving (`app.js:2026–2246`).
- Fonts (Sanskrit 2003, Charter Indologique) and Devanagari shaping are battle-tested in the
  browser; node-canvas Devanagari shaping (via pango) is *probably* fine but unverified.

## Decision

**Stage 1 (ship the batch MVP this way): Puppeteer driving a dedicated `render.html`.**

- New page `render.html` (not index.html): loads the ADR-0001 core + a headless export entry
  point `renderVerse(verseJson, timingJson, audioArrayBuffer, templateOpts) → Blob`.
  No UI, no Drive, no SW.
- `tools/render_chapter.py` (or node script) walks `verses/data/`, and for each verse Puppeteer:
  loads `render.html` → injects verse JSON + timing + audio bytes → awaits the returned MP4 blob
  → writes `dist/<id>_9x16.mp4`. Sidecar `.srt`/`.vtt` and thumbnail PNG are generated in the
  same pass (captions are trivial: timing array → cue list).
- Encoder settings, fixed in one place: 1080×1920 (and 1080×1080 variant), **30 fps**,
  H.264 `avc1.640028`, 8 Mbps video / 128 kbps AAC, keyframe every 2 s.
  Also raise the legacy in-app karaoke export 10 → 30 fps (one constant).
- **Template v1** lives in `compose.js`/`karaoke-frame.js` as a `template` option:
  `feed_v1` = 2 s hook card (title + meter chip), large Devanagari + IAST line with karaoke
  fill, wave strip secondary, progress bar, handle watermark, end-card CTA (parameter).
  The existing white "academic" look remains as template `classic` — the PNG/teacher exports
  keep working unchanged.

**Stage 2 (only if Stage 1 hits a wall): node-canvas + ffmpeg.**
Trigger conditions, any of: chapter render > ~30 min wall-clock; Chromium AV-sync defects we
can't fix; need for CI rendering where Chromium is unavailable. The core from ADR-0001 is
designed so only the *driver* changes (inject node-canvas `measure`, pipe raw frames to ffmpeg);
the scene code is shared. Do not build this speculatively.

## Verification

- **Golden frames:** for 3 reference verses, commit PNG snapshots of frame t=0, t=mid, t=end;
  the batch runner compares pixel-diff < 1% on every template change (catches font/layout drift).
- **A/V sync:** assert audio duration == video duration ± 1 frame in the output container.
- Acceptance for the roadmap milestone: 20 verses → MP4s + VTTs in one command, unattended.

## Consequences

- Free 1M-context re-render: template change → rerun one command over the catalogue (roadmap
  Phase 4 explicitly relies on this).
- Puppeteer becomes a dev dependency (node + headless Chromium) — acceptable; it does not touch
  the deployed site, and the no-build rule applies to the *app*, not to tooling.
- Captions become a standard export (`.srt`/`.vtt` from timing arrays), which also resolves the
  DH timed-text portability criticism — the same generator should back a "Download captions"
  button in the teacher UI later.

## Alternatives rejected

- **Remotion** — React-based video framework; powerful templating but drags in React + bundler,
  duplicates the existing scene code instead of reusing it, and conflicts with the vanilla-JS,
  no-build codebase.
- **node-canvas + ffmpeg first** — highest performance but requires re-validating Devanagari
  shaping/fonts and rewriting the encoder path before the first video ships; Puppeteer reuses
  100% proven code now, and Stage 2 keeps the door open with explicit triggers.
- **MediaRecorder/captureStream batch** — realtime-only (N× slower than encode-as-fast-as-possible
  WebCodecs), already the legacy path's weakness, and broken on iOS.
- **Keep manual per-verse export** — incompatible with chapter-sized batch drops; this is the
  bottleneck the roadmap exists to remove.
