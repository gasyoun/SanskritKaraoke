"""Onset-anchored intra-token placement (H5223) — synthetic unit tests.

Contract under test (docs/DECISIONS_ALIGNMENT.md D2): akshara transitions
inside whisper token windows anchor to real detected onsets (consonant
attacks; peaks only for align_to=='peak' rules), never drift out of their
token window, stay globally monotonic, and fall back to the pure
mora-proportional prediction when a window has no acoustic evidence.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from align_chapter import (  # noqa: E402
    distribute_by_token_windows,
    onset_anchor_token_windows,
)

RULES = {
    "y": {"align_to": "peak", "offset_ms": 0},
    "v": {"align_to": "peak", "offset_ms": 0},
    "m": {"align_to": "onset", "offset_ms": -15},
    "default": {"align_to": "onset", "offset_ms": 0},
}
SNAP = {
    "confidence_bands_s": [0.03, 0.07, 0.12],
    "confidence_values": [1.0, 0.7, 0.4, 0.15],
    "no_candidate_confidence": 0.2,
}
ANCHOR = {"eps_s": 0.05, "reuse_penalty_s": 10.0, "interpolate": True}


def _syls(kinds: str) -> list[dict]:
    # kinds: 'l' laghu / 'g' guru; syllable text starts with 't' (default rule)
    return [{"syl": "ta", "type": "laghu" if k == "l" else "guru"} for k in kinds]


def test_two_anchors_and_interpolation_between_them():
    # One window [1.0, 2.0], 5 laghu syllables -> predictions 1.0/1.2/1.4/1.6/1.8.
    # Detected onsets sit near syl 0 (1.05) and syl 3 (1.61).
    syls = _syls("lllll")
    times, conf, n_anch = onset_anchor_token_windows(
        syls, [], ["tok"], [(1.0, 2.0)], [1.05, 1.61], [], RULES, SNAP, ANCHOR)
    t = times["s1"]
    assert n_anch == 2
    assert t[0] == 1.05 and t[3] == 1.61
    # Interpolation: syl 1, 2 between the two anchors; syl 4 between anchor 3
    # and the window-end edge anchor (we = 2.0)
    assert abs(t[1] - (1.05 + (1.61 - 1.05) * 1 / 3)) < 1e-9
    assert abs(t[2] - (1.05 + (1.61 - 1.05) * 2 / 3)) < 1e-9
    assert abs(t[4] - (1.61 + (2.0 - 1.61) * 1 / 2)) < 1e-9
    # Nothing leaves the window; globally monotonic
    assert all(1.0 <= x <= 2.0 for x in t)
    assert t == sorted(t)
    # Confidence from anchor distance (0.05 -> 0.7 band; 0.01 -> 1.0);
    # interpolated syllables carry no_candidate_confidence
    assert conf["s1"][0] == 0.7
    assert conf["s1"][3] == 1.0
    assert conf["s1"][1] == conf["s1"][2] == conf["s1"][4] == 0.2


def test_no_candidates_returns_proportional_predictions():
    syls = _syls("lllll")
    pred = distribute_by_token_windows(syls, [], ["tok"], [(1.0, 2.0)])
    times, conf, n_anch = onset_anchor_token_windows(
        syls, [], ["tok"], [(1.0, 2.0)], [], [], RULES, SNAP, ANCHOR)
    assert n_anch == 0
    assert times["s1"] == pred["s1"]
    assert all(c == 0.2 for c in conf["s1"])


def test_global_monotonicity_across_windows():
    # 4 tokens x 3 nasal syllables (offset -15 ms) with candidates at/near the
    # window edges (incl. one 1 ms past we inside eps, and one at we+eps) —
    # clamping + the forward pass must never produce a decreasing sequence.
    syls = [{"syl": "ma", "type": "laghu"} for _ in range(12)]
    windows = [(1.0, 1.5), (1.5, 2.0), (2.0, 2.5), (2.5, 3.0)]
    onsets = [1.05, 1.1, 1.499, 1.5, 1.55, 2.0, 2.55, 2.9, 3.001]
    times, _conf, n_anch = onset_anchor_token_windows(
        syls, [], ["tok"] * 4, windows, onsets, [], RULES, SNAP, ANCHOR)
    flat = times["s1"]
    assert flat == sorted(flat), flat
    assert n_anch > 0
    for k, (ws, we) in enumerate(windows):
        for x in flat[3 * k:3 * k + 3]:
            assert ws - 1e-9 <= x <= we + 1e-9


def test_candidate_just_outside_window_never_selected():
    # eps-extended boundary: 2.051 = we + eps + 1 ms is out of range even
    # though 1 ms past it (2.05) would be admissible
    syls = _syls("ll")  # predictions 1.0, 1.5
    times, _conf, n_anch = onset_anchor_token_windows(
        syls, [], ["tok"], [(1.0, 2.0)], [1.02, 2.051], [], RULES, SNAP, ANCHOR)
    assert n_anch == 1
    assert times["s1"][0] == 1.02
    assert times["s1"][1] == 1.51  # interpolated to the we edge, not 2.051

    # zero eps: a candidate 1 ms before ws is never selected
    a0 = dict(ANCHOR, eps_s=0.0)
    times, _conf, n_anch = onset_anchor_token_windows(
        syls, [], ["tok"], [(1.0, 2.0)], [0.999, 1.5], [], RULES, SNAP, a0)
    assert n_anch == 1
    assert times["s1"][0] == 1.25  # interpolated toward the in-window anchor
    assert times["s1"][1] == 1.5


def test_peak_target_rule_honored():
    # 'va' syllables carry align_to='peak' (phoneme_rules.json): the va
    # syllable must anchor to the peak, never to an onset
    syls = [{"syl": "va", "type": "laghu"}, {"syl": "ta", "type": "laghu"}]
    times, conf, n_anch = onset_anchor_token_windows(
        syls, [], ["tok"], [(1.0, 2.0)], [1.0, 1.9], [1.34], RULES, SNAP, ANCHOR)
    assert n_anch == 2
    assert times["s1"][0] == 1.34  # the peak, not onset 1.0
    assert times["s1"][1] == 1.9
    assert conf["s1"][0] == 0.15   # |1.34 - 1.0| = 0.34 > 0.12 -> last band
    assert conf["s1"][1] == 0.15   # |1.9 - 1.5| = 0.40 > 0.12 -> last band


def test_phoneme_offset_applied_to_anchor():
    # nasal 'ma' -> offset_ms -15: anchored time = candidate - 15 ms
    syls = [{"syl": "ma", "type": "laghu"}, {"syl": "ta", "type": "laghu"}]
    times, _conf, n_anch = onset_anchor_token_windows(
        syls, [], ["tok"], [(1.0, 2.0)], [1.2, 1.5], [], RULES, SNAP, ANCHOR)
    assert n_anch == 2
    assert times["s1"][0] == 1.185
    assert times["s1"][1] == 1.5
