_Created: 21-09-2026 · Last updated: 21-09-2026_

# H5227 — gold consonant-attack set + energy-valley attack assigner (PARTIAL)

Handoff H5227 (Opus 5, 🔴3 hard), executed by Claude Code Opus 5 (`claude-opus-5`). It follows up the H5224 residual: on subh_2745, pada 3 («dātāraṃ kṛpaṇaṃ») still runs up to 533 ms early ([H5224 evidence](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/evidence/H5224_KARAOKE_LAG_DRIFT_SUBH2745_21-09-2026.md)).

**Verdict: PARTIAL.** The gold set and its scorer are shipped. No assigner is shipped into [tools/align_chapter.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/align_chapter.py). All three assigner designs meet the held-out **mean** target (≤ 100 ms) when the five verses are pooled; the best is design 2b at 62.4 ms against the 306.6 ms baseline. None meets the held-out **max** target (≤ 250 ms) on every verse. The handoff's regression gate (20-verse "misplaced" count must stay 0) cannot be passed by correct timing, because the gold labels themselves fail it 25 times (§5).

## 1. What shipped

1. [tests/fixtures/h5227_gold_attacks.json](https://github.com/gasyoun/SanskritKaraoke/blob/main/tests/fixtures/h5227_gold_attacks.json) — 5 verses × 32 syllables. 160 labels, 143 of them high-confidence.
2. [tools/eval_gold_attacks.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/eval_gold_attacks.py) — scores `verses/data/*.json` timing (or `--timing DIR` sidecars) against the gold set. It reports mean/max |Δ|, the share within 100/150 ms, and monotonicity.
3. [tests/test_gold_attacks.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tests/test_gold_attacks.py) — checks that every label names the syllable the verse JSON has at that index, that labels run forward in time, and that the scorer excludes low-confidence labels.

## 2. Gold set — how it was read

| Verse | Why chosen | Pada detection | High-conf labels |
|---|---|---|---|
| subh_2745 | H5224 residual verse (required) | detected | 30 |
| subh_0292 | pada-fallback verse (required) | uniform fallback | 27 |
| subh_1375 | detected, text variants vs audio | detected | 26 |
| subh_4488 | clean detected verse | detected | 31 |
| subh_6114 | slowest recital (18 s) | detected | 29 |

1. Audio source: Уша Санка batch at `/tmp/opencode/h5223check/audio_batch` (mp3, 22.05 kHz mono).
2. Signal: the 20 ms RMS envelope on a 5 ms hop (dB re max), plotted with a 0–6 kHz spectrogram, over 5–6 s windows.
3. Label convention (the D2 contract in [docs/DECISIONS_ALIGNMENT.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/DECISIONS_ALIGNMENT.md)): the attack is where the envelope rises out of the syllable-onset consonant's dip. For stops this is the release, not the pre-voicing of voiced stops. For fricatives it is the end of the frication. For vowel-initial syllables it is the vowel onset. Times are in seconds from the clip start.
4. `conf: "low"` (17 labels) marks a nasal or approximant continuum with no dip, or an ambiguous count. Low labels are excluded from every score.
5. **Circularity caveat.** The labels were read with valley markers visible on the plots, so the valley-candidate recall (1 miss > 60 ms out of 144 at a 4 dB rise) is biased upward. Two labels were re-read after assigner runs:
   1. subh_0292 pada 2 had been shifted by one syllable. It was corrected on burst evidence: 6.16 s is the «bh» release.
   2. subh_0292 «kar» at 12.04 s was **kept** against the assigner, because there is a broadband burst at 12.03 s.

   Both re-reads are recorded here so the numbers below can be discounted accordingly.

## 3. Baseline v1.5.8 on the gold set

| Verse | mean \|Δ\| ms | max ms | ≤ 100 ms |
|---|---|---|---|
| subh_2745 | 120.2 | 533 | 18/30 |
| subh_0292 | 409.8 | 1041 | 5/27 |
| subh_1375 | 341.4 | 918 | 6/26 |
| subh_4488 | 321.7 | 1243 | 12/31 |
| subh_6114 | 356.1 | 1482 | 7/29 |
| **pooled** | **306.6** | **1482** | **48/143** |

subh_2745 reproduces the H5224 figure exactly (120 / 533 ms). The other four verses are 2.7–3.4× worse than 2745. The v1.5.8 timing is off on most of the library, not only in 2745 pada 3.

## 4. Assigner designs (leave-one-verse-out)

All designs share one frame. Candidates are energy valleys: a local minimum followed by a ≥ 4 dB rise within 80 ms, with the attack placed at the rise out of silence when the valley is silent. A global monotonic DP over (syllable, candidate) picks at most one candidate per syllable and never reuses one. Unanchored syllables are mora-interpolated. The v1.5.8 timing enters only as a soft, capped prediction pull.

**LOO protocol:** for each held-out verse, the parameters are grid-selected on the other four (objective: pooled mean + 0.1 × worst max) and then scored on the held-out verse. No parameter ever sees its test verse.

| Design | What it adds | 2745 | 0292 | 1375 | 4488 | 6114 | pooled mean | max | ≤ 100 |
|---|---|---|---|---|---|---|---|---|---|
| baseline v1.5.8 | — | 120/533 | 410/1041 | 341/918 | 322/1243 | 356/1482 | 306.6 | 1482 | 48/143 |
| 1 | DP: prediction pull + consonant-class depth + log-tempo | 25/119 | — | — | — | — | 180.9 (untuned, all 5) | — | — |
| 2 | + pada structure (pause bonus at pada start, pause penalty inside a pada), weaker pull | 20/40 | 231/1000 | 91/700 | 24/285 | 51/420 | 80.9 | 1000 | — |
| 2b | + silence-discounted tempo, pada-final lengthening, graded pause terms (after the 0292 relabel) | 31/200 | 202/1000 | 30/180 | 23/285 | 37/420 | **62.4** | 1000 | 123/143 |
| 3 | + 2.5–8 kHz release-burst evidence, capped tempo cost | 23/90 | 202/1000 | 214/830 | 15/75 | 38/420 | 92.6 | 1000 | 117/143 |

Cells are held-out mean/max in ms. The design 2 row was scored on the pre-relabel 0292 labels (28 high).

**Acceptance (handoff):** held-out mean ≤ 100 ms **and** max ≤ 250 ms. Pooled mean: met by designs 2, 2b and 3, but per verse 0292 (all designs) and 1375 (designs 2 and 3) stay above 100 ms. Max: not met by any design. Design 3 fixed 2745 (max 90 ms) and 4488 (max 75 ms), but the burst weight chosen without 1375 broke 1375: the parameters overfit on four verses, which is the generalisation risk in §5 in miniature. Design 2b is the best of the three. The failing syllables by verse:

1. **subh_0292, pada 3 onward, +230 to +1000 ms.** Уша breathes inside the word «kar|tavyo». The DP reads the breath as the pada boundary, and every later syllable in the pada lands one slot late. This is also the verse whose lead strip is wrong (§6.2).
2. **subh_6114 «vīṃ» +420 ms.** A 120 ms «gur» precedes it, and the DP merges the two onsets.
3. **subh_4488 «nye» +285 ms.** The n→y transition has no dip, so the nearest valley is the next syllable's.
4. **subh_2745 «ka» / «ṇaṃ» +185–200 ms** (design 2b only).

## 5. Regression gate — why "20-verse misplaced count stays 0" cannot hold

The H5224 metric counts a syllable as misplaced when it lies more than 100 ms outside its own word's **whisper** window. Scored against the gold labels themselves:

| Verse | gold labels "misplaced" by the whisper-window metric |
|---|---|
| subh_0292 | 6 |
| subh_1375 | 8 |
| subh_2745 | 1 |
| subh_4488 | 4 |
| subh_6114 | 6 |
| **total** | **25** |

Whisper's word bounds are themselves wrong by up to ~1 s on these clips. A timing that matches the audio therefore fails the gate, and the gate rewards staying inside wrong windows. Design 2b moves the 20-verse count from 0 to 178 (all outputs monotonic).

Worse: on verses **outside** the gold set, the assigner sometimes moves syllables by seconds:

1. subh_0605 and subh_5909 (fallback): up to 3.6 s.
2. subh_1584, subh_4693: up to about 2 s.
3. subh_0513 was spot-checked on the plots:
   1. The new start, 2.72 s, matches the whisper word start. The baseline's 3.60 s looks wrong.
   2. The new pada 4, «ak» at 15.60 s, sits on an unscripted phrase in the 15.57–17.4 s region. The baseline's 17.57 s is visibly correct.

   So the new timing is ~2 s early on pada 4.

Five gold verses are not enough to show generalisation, and shipping the assigner would visibly break at least subh_0513. That is the second reason for PARTIAL.

## 6. Side findings

1. **Audio ≠ text on two verses.** The whisper similarity to the verse text is 0.25 on subh_0448 and 0.40 on subh_1584. Either the recital is a different verse, or the JSON text is a different recension. subh_1375 and subh_5883 carry word variants.
2. **subh_0292 lead strip is wrong.** The verse starts at 2.49 s, but `detect_lead_end` returns 1.447 s: the «tam» of «subhāṣitam» is treated as verse. That is why 0292 is the worst verse for every design.
3. **Whisper instability.** A fresh faster-whisper run on subh_4693 differs from the committed timing by 4.6 s. The committed timings are not reproducible from a re-run.

## 7. The gate — RULED 21-09-2026

**Ruling (MG, 21-09-2026): «old rules do not work, let us try yes».** The recommended gate below is adopted and recorded as decision D5 in [docs/DECISIONS_ALIGNMENT.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/DECISIONS_ALIGNMENT.md). The whisper-window misplaced count is now a diagnostic only. The recommendation as it was put:

Before any assigner ships, the ship gate needs a new definition. The recommended definition: "held-out gold mean ≤ 100 ms and max ≤ 250 ms, and on every non-gold verse no syllable moves more than 300 ms from v1.5.8 unless a spot-check confirms it." This drops the whisper-window count, which §5 shows penalises correct timing. It would be reversed if whisper windows are later shown to be right to within 100 ms on a larger gold set.

## Reproduce

```bash
python tools/eval_gold_attacks.py
```

```bash
python -m pytest tests -q
```

The design scripts are preserved as reference source in [H5227_assigner_scripts/](https://github.com/gasyoun/SanskritKaraoke/tree/main/docs/evidence/H5227_assigner_scripts). `assigner.py`, `assigner2.py`, `assigner3.py` and `assigner4.py` are designs 1, 2, 2b and 3. `run_eval.py <module> --loo` runs the LOO grid. `regress20.py <module>` runs the §5 regression. The paths `WT`, `SP` and `AUDIO` in `envtool.py` are session-local and must be repointed before a re-run. `cache_pass.py` rebuilds the whisper cache with the faster_whisper venv.

_Гасунс_
