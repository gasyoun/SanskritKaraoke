# ADR-0003: Auto-alignment as a Python CLI port of the proven in-browser algorithm

**Status:** Superseded in algorithm and QA by [ADR-0004](0004-approved-timing-corpus-alignment.md) · 2026-07-18

**Retained:** the Python CLI and batch interface remain valid.
**Replaces as plan-of-record:** `GEMINI_ALIGNMENT_PLAN.md`, `docs/auto_alignment_spec.md`
(both remain as historical design input; this ADR is what gets built).

## Context — the key finding

The full audit of `app.js` shows the alignment spec is **already substantially implemented and
shipping in the browser**, not a green-field problem:

| Spec layer | Status in app.js |
|---|---|
| Pada-boundary detection (RMS 10 ms frames, iterative silence threshold 0.02→0.20, three longest gaps, min-pada guard) | ✅ `detectPadaBounds` (4391–4478) |
| Mora-proportional distribution (guru=2, laghu=1, last-laghu-as-guru option) | ✅ `calcAutoTiming` (4480–4550) |
| Corpus scaling (same meter + syllable count, proportional rescale) | ✅ `corpusScaleTiming` (3780–3806) |
| Onset/peak detection (5 ms window / 2 ms hop RMS envelope, rise threshold, 60 ms min gap) | ✅ `detectOnsets` (3688–3734) |
| Phoneme rules (semivowels→peak, nasals→onset+offset) | ✅ `tools/phoneme_rules.json` + `_getPhonemeRule` |
| Snap + confidence (±150 ms window; 1.0/0.7/0.4/0.15 bands) | ✅ `_snapToNearest`, `_snapConfidence` (3737–3751) |
| One-button auto + review loop (orange < 0.5 flags, Tab/Shift-Tab to next uncertain) | ✅ `teAutoTimingAndSwitch` (5022–5096), `_teJumpToNextUncertain` |
| Timing in verse schema + extraction from old sessions | ✅ `timing` field; `tools/extract_timing_from_session.py` |

What is **missing** is exactly one thing: this runs per-verse inside a browser tab with a human
present. Batch drops need it to run over a folder of audio files unattended.

## Decision

1. **Port, don't redesign.** `tools/align_chapter.py` reimplements the same four layers with the
   same constants (documented above with line refs). The browser implementation is the reference;
   where outputs differ beyond tolerance, the CLI is wrong by definition until proven otherwise.
2. **Interface:**
   ```sh
   python tools/align_chapter.py <audio_dir> [--verses verses/data] [--only id1,id2] [--write]
   ```
   - Audio↔verse matching by filename stem == verse id (`bhg_2_47.m4a → bhg_2_47.json`).
   - Decode via `ffmpeg -i in -f f32le -ac 1` subprocess (no heavy audio deps; ffmpeg is the
     only binary requirement). numpy for the RMS math; nothing else.
   - Output per verse: the schema's existing `timing` object —
     `{s1, s2, confidence:{s1,s2}, auto_generated: true, generator: "cli-v1"}` — written into the
     verse JSON (`--write`) or as a sidecar patch (default, mirrors `downloadTimingJson`).
   - Exit summary: per-verse mean confidence + count of <0.5 syllables; nonzero exit if any verse
     failed pada detection (the 4-pada silence search returning the uniform-split fallback counts
     as failure in CLI mode — flag it, don't silently accept).
3. **QA loop stays in the existing Timing Editor.** The student of this pipeline is the teacher:
   open the verse in `index.html`, load audio, timing arrives from the verse JSON, orange flags +
   Tab navigation already work. CLI adds nothing UI-side. Target: ≤ 2 min review per verse.
4. **Gold-standard harness before tuning anything:** `tools/eval_alignment.py` compares generated
   timing to the hand-made timings of ≥3 reference verses (from existing Drive sessions via
   `extract_timing_from_session.py`). Metric: % of syllables within ±50 ms.
   **Acceptance: ≥90% within ±50 ms** on the gold set; report the rest. No constant-twiddling
   without this harness — it is the first thing built.
5. **Whisper/WhisperX is Phase B, cross-check only.** If RMS+rules confidence stays low on some
   verse class, a `--whisper` flag may add ASR-derived word onsets as a second candidate set.
   Not in the MVP. **MFA (Montreal Forced Aligner) is rejected** — speech-trained acoustic models
   on melodic chanting, plus a Kaldi toolchain, for no expected gain over the tuned RMS approach.
6. **Self-improvement hook (later, optional):** `analyze_phoneme_patterns.py` from the spec —
   regenerate `phoneme_rules.json` offsets from accumulated confirmed timings. Only worth it once
   the corpus has ~30+ confirmed verses.

## Consequences

- The chapter pipeline becomes: record → `align_chapter.py` → (timing editor review) →
  `render_chapter.py` (ADR-0002) → post kit. Alignment is no longer the bottleneck.
- Two implementations of one algorithm (JS + Python) must stay in sync. Mitigation: constants
  live in a shared JSON (`tools/alignment_params.json`) read by both; the eval harness is the
  contract. When ADR-0001's `timing.js` lands, the browser side imports the same constants.
- ffmpeg becomes a documented local prerequisite (it already is for any media work).

## Alternatives rejected

- **Browser-only batch** (drive the existing button via Puppeteer): couples alignment to the
  renderer, needs audio uploads per tab, and makes the eval harness awkward; alignment is pure
  signal processing that belongs in scriptable Python.
- **WhisperX / forced alignment as the primary engine:** chanting is sustained-pitch, melisma-rich
  audio; ASR timestamps on Sanskrit chant are unvalidated, GPU-hungry in CI, and the existing
  domain-aware approach (meter gives us the *expected* rhythm; we only correct it) uses strictly
  more prior knowledge than ASR can.
- **GitHub Actions auto-alignment on push** (spec Phase B): clever, but audio isn't in the repo
  (rights/size), secrets handling for Drive adds friction, and local CLI fits the batch-drop
  workflow (teacher has the audio locally on recording day).
