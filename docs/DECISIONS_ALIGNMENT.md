# Alignment decisions

Append-only record of product and scholarly rulings for Sanskrit karaoke timing.
Later reversals must be new entries that cite and supersede the earlier decision.

## D1 — One highlight per syllable, not one transition per mātrā

**Context.** The renderer consumes one timestamp per syllable, while the metrical model uses
laghu = one mātrā and guru = two mātrās as duration weights. The question was whether a guru
syllable should create an additional visual transition halfway through. The accepted reference
is the approved `sample.mp4`, received locally on 18-07-2026; its original audio and Timing
Editor/session JSON are still to be supplied. See the prior architecture in
[ADR-0003](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/adr/0003-auto-alignment-cli.md).

**Options considered.**

- One onset per syllable; mātrās influence expected duration but do not create extra dots.
- One visual transition per mātrā, including an artificial midpoint inside guru syllables.

**Ruling.** MG, 18-07-2026: “artificial visual transition we do not need.” Follow
`sample.mp4`: the red dot moves once per syllable and remains there until the next syllable
begins.

**Consequences.** Keep one onset per syllable. The duration of a non-final syllable is derived
from the next onset. Store or derive an explicit phrase end so the last dot disappears during a
real pause. Guru/laghu and chandas remain alignment priors, not extra display events.

## D2 — Highlight the earliest audible syllable onset

**Context.** A consonant-initial syllable has an acoustic consonant onset before its vowel
nucleus; a vowel-initial syllable begins at the vowel. Raw energy peaks often find the nucleus
more reliably but make the visible cursor late. The current independent onset/peak snapping is
implemented in
[`tools/align_chapter.py`](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/align_chapter.py).

**Options considered.**

- Earliest audible syllable onset: consonant onset, or vowel onset for a vowel-initial syllable.
- Vowel nucleus/energy peak for every syllable.
- Musical beat rather than a phonetic onset.

**Ruling.** MG, 18-07-2026: use the consonant onset and the vowel onset; do not align to a
musical beat. Test the proposed method in which the clearer vowel nucleus may be detected
internally and a speaker-specific offset estimates the earlier consonant onset.

**Consequences.** The visible timestamp targets the first audible segment. The aligner may keep
nucleus locations as diagnostic features, but they are not display timestamps. Evaluation must
compare the predicted syllable onsets with human-approved onsets.

## D3 — Detect acoustic phrases automatically; use existing chandas knowledge

**Context.** Production will contain metrical ślokas, prose sūtras, and Vedic material, mainly
śloka. Sūtras do not come with supplied boundaries. For metrical material the application
already contains the Taylor-derived chandas/meter machinery; rebuilding that knowledge would
duplicate an existing asset.

**Options considered.**

- Require users to mark all phrase or sūtra boundaries before auto-alignment.
- Detect spoken phrases and pauses from audio, then constrain ślokas with existing
  chandas-derived pāda and mātrā expectations.
- Force every recording through the old four-equal-pāda fallback.

**Ruling.** MG, 18-07-2026: all three content types are in scope, mainly ślokas; there are no
manual boundaries for sūtras; pāda boundaries are detected per chandas; the existing Taylor
software must be reused. A real pause clears the red dot exactly as in `sample.mp4`.

**Consequences.** Phrase/pause segmentation is an internal audio-analysis stage, not an authoring
requirement. Śloka mode consumes the existing chandas result. Prose and Vedic modes may use
different constraints, but all modes must preserve monotonic one-to-one syllable order. A failed
four-pāda detector may flag a clip for review; equal-quarter splitting is not an accepted result.

## D4 — Learn from before/after JSON pairs; optimize for less than one minute of review

**Context.** Producing the approved 15.7-second sample required tapping every syllable, dragging
timestamps, and repeated listening for about ten minutes. The existing library contains JSONs
whose timings were corrected by a human, making it possible to compare the pre-edit automatic
result with the post-edit approved result. The reciter, microphone, and recording conditions are
expected to remain Usha-specific and stable.

**Options considered.**

- Continue tuning global RMS constants without retaining edit deltas.
- Treat approved JSONs only as render inputs.
- Build a comparison corpus from original audio + pre-edit JSON + approved post-edit JSON, and
  learn/evaluate Usha-specific onset behavior from those deltas.

**Ruling.** MG, 18-07-2026: draft the JSONs in comparison mode, compare what was before human
editing with what was after, and use the library to improve the algorithm. `sample.mp4` is the
perfect behavioral reference and should be followed in every way possible. The product target is
human review taking under one minute.

**Consequences.** Gold ingestion and a per-syllable delta report precede algorithm tuning. Keep
training and held-out evaluation recordings separate. Confidence must be calibrated against
approved timings, and a run with no gold cases must not pass. Retain ±50 ms onset accuracy as a
diagnostic, while human approval time under one minute is the product acceptance gate.

---

Decisions elicited and recorded 18-07-2026 by Codex, GPT-5 (exact service build not exposed).
