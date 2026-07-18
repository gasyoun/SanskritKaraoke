# ADR-0004: Speaker-calibrated constrained alignment from approved timing pairs

**Status:** Accepted · 2026-07-18

**Supersedes:** ADR-0003's “port, don't redesign” algorithm choice and ≤2 minute QA target. The
CLI/batch interface from ADR-0003 remains valid.

**User rulings:** [Alignment decisions D1–D4](../DECISIONS_ALIGNMENT.md)

## Context

ADR-0003 assumed that the browser's RMS onset detector, four-pāda segmentation, mora
distribution, and independent ±150 ms snapping were already a sufficiently accurate algorithm
and only needed a Python batch port. The first approved real sample disproves that assumption.

`sample.mp4` contains Yoga Sūtras 1.15–1.16, lasts 15.7 seconds, and has 35 approved syllable
transitions. A review run extracted those transitions at the video's 30 fps resolution and
applied the current CLI to the video's audio and displayed text. Only 1/35 generated onsets was
within ±50 ms of the approved timing; mean absolute error was 448 ms and maximum error was
1.772 s. Pāda detection failed and the equal-quarter fallback ignored the pause between the two
sūtras. Despite that, the existing confidence mean was 0.657 because confidence measures
distance to a dense acoustic candidate set, not correctness against the utterance sequence.

The approved MP4 required about ten minutes of human tapping, dragging, and repeated listening.
The product goal is the same approved behavior with less than one minute of human review. The
original audio and session/timing export will turn the sample into a versioned gold fixture when
provided.

## Timing contract

1. There is one visible timing event per syllable. Laghu/guru mātrā weights constrain expected
   duration but never add a midpoint transition inside a guru syllable.
2. The display timestamp is the earliest audible syllable onset: initial consonant/cluster onset,
   or vowel onset for a vowel-initial syllable. A detected vowel nucleus may be used internally to
   estimate the earlier onset.
3. A syllable remains highlighted until the next syllable begins. The final syllable ends at an
   explicit or derived acoustic phrase end. No dot is visible during a real pause.
4. `sample.mp4` is the behavioral gold standard for cursor movement and pause behavior.

## Decision

Replace independent nearest-candidate snapping with known-text, sequence-constrained alignment:

1. **Ingest approved comparisons.** Each gold case consists of the original audio, the automatic
   pre-edit timing JSON, the human-approved post-edit JSON/session export, the exact syllable
   sequence, and meter metadata. Comparison mode reports per syllable `{auto_s, approved_s,
   delta_ms}` plus aggregate errors by initial phoneme, laghu/guru class, content type, pāda, and
   recording.
2. **Segment audio before distributing syllables.** Detect leading/trailing silence, internal
   phrases, and genuine pauses automatically. Do not require sūtra boundaries from the author.
   Do not accept equal-quarter division as a successful fallback.
3. **Reuse textual constraints.** For ślokas, consume the existing Taylor-derived chandas/meter
   result for pāda and mātrā expectations; do not rebuild it. Provide separate constraint modes
   for prose sūtras and Vedic material.
4. **Align the complete ordered sequence.** Generate acoustic evidence for consonant attacks,
   vowel onsets/nuclei, energy change, and voicing. Use monotonic dynamic programming/DTW (or an
   equivalent sequence model) so each textual syllable maps to one ordered acoustic position;
   candidates cannot be independently duplicated, skipped, or reordered.
5. **Calibrate for Usha.** Learn phoneme-to-nucleus offsets and tempo/duration priors from approved
   Usha recordings made with the stable microphone/setup. Global Sanskrit/chandas constraints
   remain the fallback for unseen material.
6. **Calibrate confidence on held-out gold.** Confidence represents observed probability of being
   close to approved timing, not merely proximity to some acoustic peak. Empty gold input is a
   failed evaluation, not a green run.

The existing `align_chapter.py` CLI remains the batch entry point. The implementation may replace
its internals and bump the generator version; it must not overwrite approved timing data while
building or evaluating the comparison corpus.

### Draft comparison artifact

Comparison mode writes a derived report; it does not modify either source JSON. Field names may
be extended during implementation, but this is the minimum reviewable contract:

```json
{
  "schema_version": 1,
  "verse_id": "ys_1_15_16",
  "audio": {
    "sha256": "<content hash>",
    "duration_s": 15.659,
    "reciter_profile": "usha-v1"
  },
  "sources": {
    "automatic_before": "<path or immutable source id>",
    "human_approved_after": "<path or immutable source id>"
  },
  "syllables": [
    {
      "line": "s1",
      "index": 0,
      "text": "dṛṣ",
      "weight": "guru",
      "target": "consonant_onset",
      "auto_s": 0.000,
      "approved_s": 0.300,
      "delta_ms": 300
    }
  ],
  "phrase_ends": [
    {
      "line": "s1",
      "auto_s": null,
      "approved_s": 8.800,
      "delta_ms": null
    }
  ],
  "metrics": {
    "within_50ms_fraction": 0.0,
    "mean_abs_error_ms": 300.0,
    "max_abs_error_ms": 300.0
  }
}
```

The real artifact includes every syllable and phrase end. Paths may be replaced by immutable IDs
when audio/session storage is external; the audio hash prevents an approved timing from being
silently evaluated against a different recording.

## Acceptance

- **Product gate:** a human can review and approve a short verse/clip in less than one minute.
- **Behavioral gate:** cursor onset and silence behavior match the approved `sample.mp4`.
- **Diagnostic gate:** report percentage within ±50 ms, mean/median/p95/max onset error, phrase-end
  error, and number of syllables requiring adjustment on held-out recordings.
- **Coverage gate:** evaluate śloka, prose-sūtra, and Vedic modes separately; aggregate success
  cannot hide a failed content class.

## Alternatives rejected

- **One transition per mātrā:** creates an artificial midpoint event inside guru syllables.
- **Musical-beat alignment:** the target is phonetic syllable onset, not rhythmic pulse.
- **Independent RMS/peak snapping:** dense candidates create false confidence and do not preserve
  utterance position.
- **Uniform four-quarter fallback:** destroys real phrase and pause timing, especially for prose.
- **Manual sūtra boundaries:** reinstates authoring work the automatic stage is meant to remove.
- **General ASR as the primary engine:** known Sanskrit text, chandas, and a stable reciter provide
  stronger constraints; ASR may remain an optional evidence source.

## Consequences

- Before/after JSON drafting and gold ingestion are the next implementation milestone.
- The timing schema must represent phrase end(s), either directly or through an equivalent segment
  structure, so the final dot clears during pauses.
- The old current-constant tuning loop is no longer the plan of record.
- Human edits become reusable evidence rather than discarded correction work.
