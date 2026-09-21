"""Token → syllable ownership (H5224).

Each verse word token owns exactly as many flat syllables as it has vowel
nuclei. The old char-length proportional cut drifted one syllable late on
consonant-heavy tokens: on subh_2745 «tā» of adātā fell into the
puruṣastyāgī whisper window, «gī» into svadhanaṃ and «naṃ» into tyajya, so
the karaoke highlight lagged the voice from «tā» onward (MG 21-09-2026).
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from align_chapter import (  # noqa: E402
    _verse_word_tokens,
    distribute_by_token_windows,
    syllabify_verse,
    token_syllable_cuts,
)

VERSE_2745 = {
    "s1": "अदाता पुरुषस्त्यागी स्वधनं त्यज्य गच्छति ॥",
    "s2": "दातारं कृपणं मन्ये मृतो ऽप्यर्थं न मुञ्चति ।",
}


def _owned(verse):
    syl = syllabify_verse(verse)
    flat = [s["syl"] for s in syl["s1"] + syl["s2"]]
    toks = _verse_word_tokens(verse)
    cuts = token_syllable_cuts(toks, len(flat))
    return {t: flat[cuts[k]:cuts[k + 1]] for k, t in enumerate(toks)}


def test_2745_each_token_owns_its_own_syllables():
    owned = _owned(VERSE_2745)
    assert owned["adātā"] == ["a", "dā", "tā"]
    assert owned["puruṣastyāgī"] == ["pu", "ru", "ṣas", "tyā", "gī"]
    assert owned["svadhanaṃ"] == ["sva", "dha", "naṃ"]
    assert owned["tyajya"] == ["tyaj", "ya"]
    assert owned["mṛto"] == ["mṛ", "to"]
    assert owned["pyarthaṃ"] == ["pyar", "thaṃ"]


def test_consonant_final_token_owns_one_syllable_per_nucleus():
    # «tat api»: ownership is by nucleus count — tat owns one syllable, api
    # two — however the line-level syllabifier splits the boundary.
    verse = {"s1": "तत् अपि", "s2": ""}
    syl = syllabify_verse(verse)
    toks = _verse_word_tokens(verse)
    assert len(syl["s1"]) == 3
    assert token_syllable_cuts(toks, len(syl["s1"])) == [0, 1, 3]


def test_count_mismatch_falls_back_to_char_length_cut():
    cuts = token_syllable_cuts(["aaaa", "bb"], 7)
    assert cuts[0] == 0 and cuts[-1] == 7
    assert cuts == sorted(cuts)


def test_2745_syllables_land_in_their_own_token_window():
    syl = syllabify_verse(VERSE_2745)
    toks = _verse_word_tokens(VERSE_2745)
    windows = [(float(k), float(k + 1)) for k in range(len(toks))]
    times = distribute_by_token_windows(syl["s1"], syl["s2"], toks, windows)
    flat = times["s1"] + times["s2"]
    # «tā» (index 2) belongs to adātā = window 0, «gī» (7) to window 1
    assert 0.0 <= flat[2] < 1.0
    assert 1.0 <= flat[7] < 2.0
    assert 2.0 <= flat[8] < 3.0  # «sva» opens svadhanaṃ
