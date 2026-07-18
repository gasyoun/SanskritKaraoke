# Karaoke Product Roadmap — batch-drop funnel edition

_Created: 12-06-2026 · Last updated: 14-06-2026_

Decided 2026-06-12 (with M.G.):
- **Audio**: Уша Санка recordings, with written permission — license metadata required per verse.
- **Channels**: all of Telegram / Instagram Reels / YouTube Shorts / TikTok (one 9:16 master per verse, cross-posted).
- **Money model**: videos are **free** — they funnel students into the paid Sanskrit courses. Optimize for volume, reach, and CTA quality, not paywalls.
- **Cadence**: **batch drops** — record/align/render a whole chapter in one sitting, then schedule posts.

The strategic consequence: the product is not the web app — it is the **pipeline**
`chapter audio + verse JSON → aligned timings → branded 9:16 videos + captions → scheduled posts`.
Everything below serves that pipeline.

**Technical design is locked in ADRs** (full-monolith audit, 2026-06-12):
[adr/0001](adr/0001-rendering-core-extraction.md) — DOM-free core extraction map for app.js;
[adr/0002](adr/0002-headless-batch-renderer.md) — Puppeteer-driven batch renderer + template v1;
[adr/0003](adr/0003-auto-alignment-cli.md) — `align_chapter.py` as a port of the proven in-browser algorithm.

---

## Status & decisions (2026-06-14)

**Rights (Phase 0) is largely solved; AUDIO is now the single hard gate.**

- **Translations cleared, both languages:** EN = Telang (1882, public domain); RU = Sementsov, cleared via a permission letter from his daughter (heir). `translation.rights` is recorded per verse; `validate_library.py` + `tools/post_kit.py` gate publication on it.
- **Audio = batch session (the gate):** Уша Санка will record a whole chapter in one sitting → the pipeline must ingest a *folder* of audio in one command (align → render → post-kit). No recordings exist yet; nothing ships until they land.
- **Library growth = repertoire-driven:** grow by what Уша Санка already chants, across texts — content availability sets the order (not a fixed chapter).
- **Template = one strong `feed_v1`, perfected** — a single template, iterated; not a template system yet.
- **Funnel = full custom multi-platform scheduling automation** (Telegram + Instagram + YouTube + TikTok via their official APIs), driven by a versioned repo cadence config (`schedule.yaml`). Upgrades the "start manual" stance in Phase 3. ⚠ IG/TikTok/YT posting needs platform app credentials + review → build pluggable per-platform publishers, Telegram working first.
- **Shipped:** `translation.rights` schema + validator gate; `tools/post_kit.py` (UTM CTAs to samskrtam.ru/usha-sanka); Sementsov agreement draft (SK-LIC-2026-002). **Next build:** `feed_v1` + a chapter batch-ingest entry point + scheduling automation.

---

## Phase 0 — Rights & data hygiene (gates everything; ~1 week)

The legal and DH foundation. No video ships publicly at scale before this.

- [ ] **Written permission from Уша Санка** — one short agreement covering: redistribution of her recordings inside derivative karaoke videos, all platforms, commercial context (free videos promoting paid courses). Store a copy (or its reference) in the repo.
- [ ] **Rights metadata in the verse schema**: add `audio.license`, `audio.rights_holder`, `audio.permission_ref` to `verses/schema` and backfill the 3 existing verses. Reject `TODO` drive IDs in `validate_library.py`.
- [ ] **Provenance fields**: `translation.provenance: human|gemini-flash|claude` per language. Machine translations must be marked (DH norm and increasingly platform policy).
- [ ] **FAIR-ify the corpus**: move canonical audio out of personal Google Drive — GitHub Releases or a public bucket with checksums in the verse JSON; Drive stays a working copy. Add canonical source refs (GRETIL-style citation per verse).
- [ ] **Narrow OAuth scope** from `drive` to `drive.file` (long-standing smell; do it while touching Drive code).

## Phase 1 — Auto-alignment (the force multiplier; ~2–3 weeks)

Manual tapping, dragging, and repeated listening is incompatible with chapter-sized batches.
The approved 15.7-second sample took about 10 minutes; the binding target is **<1 minute of human
review per clip** with cursor behavior matching that sample.

- [ ] Implement [ADR-0004](adr/0004-approved-timing-corpus-alignment.md): comparison corpus =
  original audio + automatic-before JSON + human-approved-after JSON; learn Uṣā-specific onset
  offsets and evaluate on held-out recordings.
- [ ] Approach: automatic phrase/pause segmentation + existing Taylor-derived chandas constraints
  + monotonic known-text acoustic alignment. Target the earliest audible syllable onset; use vowel
  nuclei internally where helpful. General ASR remains optional evidence, not the primary engine.
- [ ] **Timing QA mode** in the existing Timing Editor: load auto-aligned JSON, flag low-confidence syllables, human nudges only those. The editor you already built becomes the *reviewer*, not the *author*.
- [ ] Batch entry point: `python tools/align_chapter.py audio_dir/ verses/data/` → writes timing JSONs for every verse in the drop.

## Phase 2 — Headless batch renderer + trendy template (~3 weeks, overlaps Phase 1)

Replace "browser tab, one verse at a time, 10 fps" with one command per chapter.

- [ ] **Headless renderer**: Node + canvas + ffmpeg (or Puppeteer driving the existing renderer as a stopgap). Input = verse JSON + timing JSON + audio; output = 1080×1920 @ **30 fps** MP4. Kill the 10 fps landscape path (`app.js:1873`) or raise it to 30 while you're there.
- [ ] **Template system v1** — one strong vertical template, designed for the feed:
  - first 2 s hook: verse title + meter chip + animated wave intro;
  - huge Devanagari + IAST line with karaoke-fill or bouncing-dot highlight (the wave diagram becomes a *secondary* strip, not the whole frame);
  - dark/gradient background option; progress bar; your handle watermark;
  - end-card CTA: course link / Telegram channel (this is the funnel — make it a template parameter, A/B-testable).
- [ ] **Captions export**: emit `.srt`/`.vtt` per verse from the timing JSON (trivial — the data already exists). Burned-in for Reels/TikTok, sidecar for YouTube. This is also the DH win: your alignments become a portable timed-text resource instead of app-locked data.
- [ ] Batch entry point: `python tools/render_chapter.py bhg_2 --template feed_v1` → folder of MP4s + VTTs + thumbnail PNGs.

## Phase 3 — Distribution & funnel (~1–2 weeks)

- [ ] **Post kit generator**: per verse, auto-write the caption text (RU+EN), hashtags, and the course CTA link with UTM parameters per platform — so a chapter drop produces a ready-to-schedule folder.
- [ ] **Scheduling automation (chosen 2026-06-14):** full custom multi-platform posting (Telegram/Instagram/YouTube/TikTok via official APIs), driven by a versioned repo `schedule.yaml` (start date, per-day slots, platform order) that spaces a chapter's verses automatically. Input = post-kit `drop/<id>/` folders. Pluggable per-platform publishers; Telegram (Bot API) works first, IG/TikTok/YT gated on app credentials + review.
- [ ] **Funnel measurement**: UTM-tagged links → course landing; track which verses/templates convert. Without this you can't tell whether "trendy" is working.
- [ ] Student player deep links from video CTAs (`student.html?id=…` already exists — every video should point at its interactive version).

## Phase 4 — Scale & polish (ongoing)

- [ ] Second/third templates (seasonal, meter-specific colourways) — re-render the whole back-catalogue in one command when a template improves (this is why headless matters).
- [ ] Grow the verse library chapter-by-chapter through the existing VerseCurator/QualityGate pipeline, now with rights+provenance fields enforced.
- [ ] Doc consolidation: retire `GEMINI_ROADMAP.md`, `GEMINI_HANDOFF.md`, `MY_ROADMAP.md`, `WAVE_-_INSTRUCTION_for_Claude.md` into `docs/history/`; one live roadmap (this file) + README.
- [ ] Later, if videos prove demand: paid tiers (verse packs via Telegram Stars / Boosty) become an *option*, not a prerequisite.

---

## Explicit non-goals (for now)

- Paywalling the student platform (model is free-funnel).
- In-browser video export improvements beyond fps fix (headless replaces it).
- TEI export of verse texts (document the schema crosswalk instead; revisit if scholars ask).

## Success criteria

- One chapter (≈20 verses) goes from raw audio to scheduled posts in **one working day**.
- Every published verse has rights metadata and a permission reference.
- Measurable course-signup clicks attributable to videos within the first two drops.

_Dr. Mārcis Gasūns_
