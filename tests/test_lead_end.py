"""detect_lead_end picks the lead-word gap, not a closure inside the lead word (H5235).

subh_0292: Уша's «subhāṣitam» holds a ~120 ms closure before «tam» (1.50–1.62 s),
then the real pause before pada 1 runs 1.66–2.50 s. The first-gap rule returned
1.45 s and aligned «tam» as verse; the longest-gap rule returns ~2.5 s.
Synthetic PCM reproduces that envelope shape.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from align_chapter import _load_params, detect_lead_end  # noqa: E402

SR = 22050


def _clip(speech: list[tuple[float, float]], dur: float) -> np.ndarray:
    rng = np.random.default_rng(0)
    x = rng.normal(0, 0.001, int(dur * SR)).astype(np.float32)  # room noise
    for a, b in speech:
        n = int((b - a) * SR)
        t = np.arange(n) / SR
        x[int(a * SR):int(a * SR) + n] += 0.5 * np.sin(2 * np.pi * 180 * t).astype(np.float32)
    return x


def _verse_body(start: float) -> list[tuple[float, float]]:
    # four padas of ~3.2 s with ~0.4 s pauses
    out, t = [], start
    for _ in range(4):
        out.append((t, t + 3.2))
        t += 3.6
    return out


PARAMS = _load_params()["pada_detection"]


def test_closure_inside_lead_word_is_not_the_lead_gap():
    # «subhāṣi» 0.93–1.48 | closure 1.48–1.63 | «tam» 1.63–1.69 | pause 1.69–2.50 | verse
    speech = [(0.93, 1.48), (1.63, 1.69)] + _verse_body(2.50)
    lead = detect_lead_end(_clip(speech, 18.2), SR, PARAMS)
    assert lead is not None
    assert abs(lead - 2.49) < 0.05, lead


def test_plain_lead_word_unchanged():
    # no internal closure: one lead gap, same answer as before the fix
    speech = [(0.90, 1.55)] + _verse_body(2.50)
    lead = detect_lead_end(_clip(speech, 18.2), SR, PARAMS)
    assert lead is not None
    assert abs(lead - 2.49) < 0.05, lead


def test_gap_past_lead_window_is_ignored():
    # the longest gap must still start inside lead_max_fraction of the clip
    speech = [(0.90, 1.55), (1.80, 6.0), (7.5, 18.0)]
    lead = detect_lead_end(_clip(speech, 18.2), SR, PARAMS)
    assert lead is not None
    assert abs(lead - 1.79) < 0.05, lead
