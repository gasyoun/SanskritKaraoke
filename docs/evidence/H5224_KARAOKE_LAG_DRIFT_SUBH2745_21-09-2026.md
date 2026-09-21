_Created: 21-09-2026 · Last updated: 21-09-2026_

# H5224 — karaoke lag from «tā»: root cause, drift table, residual (subh_2745)

MG, 21-09-2026, on the v7 clip `subh_2745_9x16` (landed in [e5194f8](https://github.com/gasyoun/SanskritKaraoke/commit/e5194f843c32e99f725a4fa7948e520f49759430)): «dā» is fine, but from «tā» onward the highlight runs slower than the voice. Executor: Claude Code, Opus 5 (`claude-opus-5`).

## Root cause (named, with evidence)

It sits in **stage 1 of the listed candidates: the token→syllable char-length cuts**. `_flat_token_placements` in [tools/align_chapter.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/align_chapter.py) decided which flat syllables belong to which whisper token window **by the token's share of characters**, not by its syllables. Consonant-heavy tokens got too many syllables, so their neighbours were pushed one syllable to the right.

| Token | Syllables it owns | Syllables the char-length cut gave it |
|---|---|---|
| adātā | a dā tā | a dā |
| puruṣastyāgī | pu ru ṣas tyā gī | **tā** pu ru ṣas tyā |
| svadhanaṃ | sva dha naṃ | **gī** sva dha |
| tyajya | tyaj ya | **naṃ** tyaj ya |
| mṛto | mṛ to | mṛ |
| pyarthaṃ | pyar thaṃ | **to** pyar thaṃ |

«tā» was placed inside the «puruṣastyāgī» window, «gī» inside «svadhanaṃ», and so on. Each syllable is highlighted only once the voice has reached the *next* word, which is exactly MG's «lag from tā onward». The lag recovers at «gacchati», where the cut happens to realign. Over the 20 re-aligned verses, 39 syllables in 13 verses sat outside their own word's audio window (by up to 1.98 s).

**Fix:** `token_syllable_cuts()`. Each token owns `len(syllabify_iast(token))` syllables. That is its vowel-nucleus count, which does not depend on how the line-level syllabifier splits consonants across word boundaries. The char-length cut stays as the fallback when the counts do not sum to the line's syllable count. Tests: [tests/test_token_syllable_cuts.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tests/test_token_syllable_cuts.py).

## Drift table — subh_2745, audio-referenced

Reference = consonant attacks (the energy rise after the closure dip), hand-read from the 20 ms RMS envelope of `subh_2745.mp3`. `?` = low-confidence label inside a nasal continuum, excluded from the summary. Δ = highlight onset − voice onset. "landed" = v7 (e5194f8); "fixed" = this PR's written timing.

| # | syl | voice s | landed t | landed Δms | fixed t | fixed Δms |
|---|---|---|---|---|---|---|
| 0 | a | 2.50 | 2.516 | +16 | 2.516 | +16 |
| 1 | dā | 2.73 | 2.818 | +88 | 2.670 | -60 |
| 2 | tā | 3.18 | 3.680 | +500 | 3.067 | -113 |
| 3 | pu | 3.67 | 4.001 | +331 | 3.680 | +10 |
| 4 | ru | 3.85 | 4.240 | +390 | 3.734 | -116 |
| 5 | ṣas | 4.11 | 4.594 | +484 | 4.001 | -109 |
| 6 | tyā | 4.57 | 5.035 | +465 | 4.594 | +24 |
| 7 | gī | 5.08 | 6.026 | +946 | 5.035 | -45 |
| 8 | sva | 6.01 | 6.100 | +90 | 6.026 | +16 |
| 9 | dha | 6.09 | 6.362 | +272 | 6.100 | +10 |
| 10 | naṃ | 6.32 | 6.698 | +378 | 6.285 | -35 |
| 11 | tyaj | 6.80 | 7.058 | +258 | 6.713 | -87 |
| 12 | ya | 7.27 | 7.471 | +201 | 7.325 | +55 |
| 13 | gac | 7.75 | 7.756 | +6 | 7.756 | +6 |
| 14 | cha | 8.42 | 8.435 | +15 | 8.435 | +15 |
| 15 | ti | 8.74 | 8.610 | -130 | 8.610 | -130 |
| 16 | dā | 9.74 | 9.774 | +34 | 9.774 | +34 |
| 17 | tā | 10.25 | 10.015 | -235 | 10.015 | -235 |
| 18 | raṃ | 10.70 | 10.331 | -369 | 10.331 | -369 |
| 19 | kṛ | 11.17 | 10.666 | -504 | 10.666 | -504 |
| 20 | pa | 11.41 | 10.877 | -533 | 10.877 | -533 |
| 21 | ṇaṃ | 11.61 | 11.326 | -284 | 11.326 | -284 |
| 22 | man? | 12.00 | 12.034 | +34 | 12.066 | +66 |
| 23 | ye? | 12.47 | 12.613 | +143 | 12.681 | +211 |
| 24 | mṛ | 13.40 | 13.401 | +1 | 13.401 | +1 |
| 25 | to | 13.66 | 13.974 | +314 | 13.481 | -179 |
| 26 | pyar | 14.27 | 14.345 | +75 | 13.974 | -296 |
| 27 | thaṃ | 14.75 | 14.703 | -47 | 14.479 | -271 |
| 28 | na | 15.15 | 15.143 | -7 | 15.143 | -7 |
| 29 | muñ | 15.31 | 15.310 | +0 | 15.327 | +17 |
| 30 | ca | 15.83 | 15.844 | +14 | 15.844 | +14 |
| 31 | ti | 16.07 | 16.083 | +13 | 16.083 | +13 |

1. **landed:** mean |Δ| 233 ms · max 946 ms · 13/30 within 100 ms · 14/30 within 150 ms.
2. **fixed:** mean |Δ| 120 ms · max 533 ms · 18/30 within 100 ms · 22/30 within 150 ms. Monotonic.
3. **MG's symptom region (padas 1–2, «adātā … gacchati»):** the lag is gone. Before, the highlight trailed by +90…+946 ms on 13 of 16 syllables. Now every syllable is within ±130 ms, and the residual errors are slightly *early*, never late.
4. Rendered proof: at 5.3 s, while «gī» is sung, the v7 clip still highlights «tyā» and the fixed clip highlights «gī».

## Other 19 verses — regression spot-check

"Misplaced" = syllables outside their own word's whisper window by >100 ms. Measured on one cached whisper pass per verse; a fresh whisper run differs by ≤68 ms.

| Verse | misplaced before | max err before ms | misplaced after | max err after ms | monotonic |
|---|---|---|---|---|---|
| subh_0292 | 8 | 905 | 0 | 0 | yes |
| subh_0448 | 2 | 1524 | 0 | 0 | yes |
| subh_0513 | 1 | 1460 | 0 | 0 | yes |
| subh_0605 | 3 | 1866 | 0 | 0 | yes |
| subh_1221 | 3 | 980 | 0 | 0 | yes |
| subh_1375 | 3 | 640 | 0 | 0 | yes |
| subh_1584 | 0 | 71 | 0 | 0 | yes |
| subh_1919 | 0 | 0 | 0 | 0 | yes |
| subh_2307 | 2 | 939 | 0 | 0 | yes |
| subh_2745 | 2 | 552 | 0 | 0 | yes |
| subh_2805 | 0 | 33 | 0 | 0 | yes |
| subh_4156 | 0 | 11 | 0 | 0 | yes |
| subh_4172 | 1 | 752 | 0 | 0 | yes |
| subh_4488 | 3 | 1980 | 0 | 0 | yes |
| subh_4693 | 0 | 0 | 0 | 0 | yes |
| subh_5864 | 4 | 543 | 0 | 0 | yes |
| subh_5883 | 6 | 1307 | 0 | 0 | yes |
| subh_5909 | 1 | 1733 | 0 | 0 | yes |
| subh_6114 | 1 | 751 | 0 | 0 | yes |
| subh_7377 | 0 | 0 | 0 | 0 | yes |

Pada detection is unchanged: the same 16/20 are detected and the same 4 (0292, 0605, 1919, 5909) fall back.

## Residual — PARTIAL on the ≤100 ms goal

The ≤ ~100 ms per-syllable target is **not met** for the whole verse. Pada 3 «dātāraṃ kṛpaṇaṃ» runs **early** by up to 533 ms (unchanged from v7), and «mṛto 'pyarthaṃ» runs early by up to 296 ms. The cause is a second, independent defect: **whisper word bounds**. faster-whisper heard «dātā | raṃkrapanama», so the «dātāraṃ» window ends at 10.59 s while «raṃ» is really sung at 10.70 s and «kṛ» at 11.17 s. The onset detector (`detect_onsets`) also fires inside sustained vowels, so window-internal anchoring lands on vowel ripples instead of consonant attacks.

Three root-cause attempts on this second defect, per the handoff's stop rule:

1. **Attempt 1:** fix the char-length cuts. Success on MG's symptom; it is what this PR ships.
2. **Attempt 2:** whole-verse monotonic anchoring onto energy-valley attacks (dip→rise) plus post-silence onsets. The valley detector itself is good: it hits every stop/tap consonant within ≤55 ms. But assignment under "maximise anchors, then minimise distance to the whisper prediction" shifted runs by one syllable. mean |Δ| 101–128 ms, max 438 ms.
3. **Attempt 3:** pada-constrained, offset-smooth DP. Whisper predictions were remapped into each detected pada span, the first syllable was pinned to the pada attack, and cost = offset change + λ per unanchored syllable. mean |Δ| 133–135 ms on the sweep, worse than attempt 1 alone. Not shipped.

Next: a gold-labelled set of 3–5 verses (not one hand-labelled verse) to tune a valley-attack assigner against. Tuning on 2745 alone overfits one voice sample.

## Checks

1. `pytest tests -q` → 14 passed.
2. `python tools/validate_library.py` → All 58 verse(s) valid, 232 warnings (baseline warn-only).
3. `node tools/test_core_modules.mjs` → passed.
4. `align_chapter.py /tmp/opencode/h5223check/audio_batch --lead-word subhāṣitam --whisper-align --write` → 20 aligned, 4 pada-fallback (unchanged set).
5. `render_chapter.js` → 20 rendered, 0 failed (`PUPPETEER_EXECUTABLE_PATH` = local Chrome for Testing; `~/.cache/puppeteer` is gone on this Mac). The MP4s stay in gitignored `dist/`.

_Гасунс_
