# Karaoke Product Roadmap — batch-drop funnel edition

Decided 2026-06-12 (with M.G.):
- **Audio**: Уша Санка recordings, with written permission — license metadata required per verse.
- **Channels**: all of Telegram / Instagram Reels / YouTube Shorts / TikTok (one 9:16 master per verse, cross-posted).
- **Money model**: videos are **free** — they funnel students into the paid Sanskrit courses. Optimize for volume, reach, and CTA quality, not paywalls.
- **Cadence**: **batch drops** — record/align/render a whole chapter in one sitting, then schedule posts.

The strategic consequence: the product is not the web app — it is the **pipeline**
`chapter audio + verse JSON → aligned timings → branded 9:16 videos + captions → scheduled posts`.
Everything below serves that pipeline.

---

## Phase 0 — Rights & data hygiene (gates everything; ~1 week)

The legal and DH foundation. No video ships publicly at scale before this.

- [ ] **Written permission from Уша Санка** — one short agreement covering: redistribution of her recordings inside derivative karaoke videos, all platforms, commercial context (free videos promoting paid courses). Store a copy (or its reference) in the repo.
- [ ] **Rights metadata in the verse schema**: add `audio.license`, `audio.rights_holder`, `audio.permission_ref` to `verses/schema` and backfill the 3 existing verses. Reject `TODO` drive IDs in `validate_library.py`.
- [ ] **Provenance fields**: `translation.provenance: human|gemini-flash|claude` per language. Machine translations must be marked (DH norm and increasingly platform policy).
- [ ] **FAIR-ify the corpus**: move canonical audio out of personal Google Drive — GitHub Releases or a public bucket with checksums in the verse JSON; Drive stays a working copy. Add canonical source refs (GRETIL-style citation per verse).
- [ ] **Narrow OAuth scope** from `drive` to `drive.file` (long-standing smell; do it while touching Drive code).

## Phase 1 — Auto-alignment (the force multiplier; ~2–3 weeks)

Manual ±0.01 s syllable timing is incompatible with chapter-sized batches. Target: ≤2 min of human QA per verse instead of ~20 min of manual timing.

- [ ] Revive the parked auto-alignment spec (`GEMINI_ALIGNMENT_PLAN.md` / `docs/auto_alignment_spec.md`) as a **Python CLI**, not an in-browser feature: input = audio file + syllable list (already produced by the pipeline), output = `TAP.times`-compatible JSON.
- [ ] Approach: energy/onset detection seeded by pada count works surprisingly well for chanting (steady tempo, clear syllable onsets); fall back to WhisperX/stable-ts cross-check where onset detection is ambiguous. Forced aligners trained on speech (MFA) underperform on melodic chanting — treat them as optional.
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
- [ ] Scheduling: start manual (Telegram scheduled posts + Meta Business Suite + YouTube scheduler); automate only if cadence proves it's worth it.
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
