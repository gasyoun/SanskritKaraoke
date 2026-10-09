"""H6317 grade_take — scoring engine tests on synthetic burst takes.

A "take" is a WAV of 90 ms sine bursts at given onset times (the onset
detector sees the same attack structure a real recitation has). Cases:
perfect take scores high; a shifted syllable is flagged into weakest3;
uniform tempo drift is normalised out (rhythm, not absolute speed, grades);
a subh verse with REAL verse.timing (Uṣā Saṅkā reference) grades end-to-end;
missing reference/unknown verse raise clean errors.
"""
from __future__ import annotations

import json
import math
import struct
import sys
import wave
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from grade_take import (  # noqa: E402
    GradeError,
    ReferenceTimingError,
    grade_take,
    load_reference_timing,
    load_verse,
)

SR = 22050
BURST_S = 0.09
RAMP_S = 0.008
FREQ = 440.0
AMP = 0.5


def synth_take_wav(path, onsets_s, lead_s=0.2):
    """Write a WAV of bursts at the given absolute onset times."""
    end = max(onsets_s) + BURST_S + 0.4
    n = int(end * SR)
    samples = [0.0] * n
    ramp_n = int(RAMP_S * SR)
    burst_n = int(BURST_S * SR)
    for t in onsets_s:
        start = int((t + lead_s) * SR)
        for j in range(burst_n):
            env = 1.0
            if j < ramp_n:
                env = j / ramp_n
            elif j > burst_n - ramp_n:
                env = (burst_n - j) / ramp_n
            samples[start + j] += AMP * env * math.sin(
                2 * math.pi * FREQ * j / SR)
    pcm = b''.join(
        struct.pack('<h', max(-32767, min(32767, int(s * 32767))))
        for s in samples)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm)
    return path


@pytest.fixture()
def bhg_ref():
    verse = load_verse('bhg_2_47')
    timing, source = load_reference_timing(verse)
    assert source.startswith('fixture')
    return timing


def _flat_onsets(timing):
    return list(timing['s1']) + list(timing['s2'])


def test_perfect_take_scores_high(tmp_path, bhg_ref):
    wav = synth_take_wav(tmp_path / 'perfect.wav', _flat_onsets(bhg_ref))
    res = grade_take(str(wav), 'bhg_2_47')
    snapped = sum(
        1 for k in ('s1', 's2') for r in res['per_syllable'][k] if r['snapped'])
    total = sum(len(res['per_syllable'][k]) for k in ('s1', 's2'))
    assert res['verse_id'] == 'bhg_2_47'
    assert res['reference_source'].startswith('fixture')
    assert total == 32
    assert snapped / total >= 0.9, f'only {snapped}/{total} syllables anchored'
    assert res['rhythm_percent'] >= 85.0, f"rhythm={res['rhythm_percent']}"


def test_shifted_syllable_is_flagged(tmp_path, bhg_ref):
    onsets = _flat_onsets(bhg_ref)
    n_s1 = len(bhg_ref['s1'])
    onsets[5] += 0.25  # syllable s1[5] lands 250 ms late
    wav = synth_take_wav(tmp_path / 'shifted.wav', onsets)
    res = grade_take(str(wav), 'bhg_2_47')
    row = res['per_syllable']['s1'][5]
    flagged = any(
        w['pada'] == 's1' and w['index'] == 5 for w in res['weakest3'])
    assert flagged, f"s1[5] not in weakest3: {res['weakest3']}"
    assert row['grade'] <= 70, f"s1[5] grade={row['grade']} (delta {row['delta_ms']} ms)"
    if row['delta_ms'] is not None:
        assert row['delta_ms'] >= 100


def test_uniform_tempo_drift_is_normalised(tmp_path, bhg_ref):
    onsets = [t * 1.15 + 0.35 for t in _flat_onsets(bhg_ref)]
    wav = synth_take_wav(tmp_path / 'slow.wav', onsets)
    res = grade_take(str(wav), 'bhg_2_47')
    assert 1.05 <= res['tempo_scale'] <= 1.25, res['tempo_scale']
    assert res['rhythm_percent'] >= 75.0, f"rhythm={res['rhythm_percent']}"


@pytest.mark.parametrize('verse_id', ['subh_2745', 'subh_1919'])
def test_subh_verse_with_real_reference(tmp_path, verse_id):
    """'On our data': subh verses carrying real Uṣā Saṅkā-aligned verse.timing."""
    verse = load_verse(verse_id)
    timing, source = load_reference_timing(verse)
    assert source == 'verse.timing'
    wav = synth_take_wav(tmp_path / 'subh.wav', _flat_onsets(timing))
    res = grade_take(str(wav), verse_id)
    assert res['reference_source'] == 'verse.timing'
    assert len(res['per_syllable']['s1']) == len(timing['s1'])
    assert len(res['per_syllable']['s2']) == len(timing['s2'])
    assert res['rhythm_percent'] >= 60.0, f"rhythm={res['rhythm_percent']}"


def test_missing_reference_timing_raises():
    with pytest.raises(ReferenceTimingError):
        load_reference_timing(load_verse('bhg_2_48'))


def test_unknown_verse_raises():
    with pytest.raises(GradeError):
        grade_take('/dev/null', 'no_such_verse')


def test_grade_json_contract_shape(tmp_path, bhg_ref):
    """The committed fixture sample must stay reproducible in shape."""
    wav = synth_take_wav(tmp_path / 'shape.wav', _flat_onsets(bhg_ref))
    res = grade_take(str(wav), 'bhg_2_47')
    for key in ('s1', 's2'):
        for row in res['per_syllable'][key]:
            assert set(row) >= {'index', 'syl', 'ref_s', 'student_s',
                                'snapped', 'delta_ms', 'grade'}
    assert len(res['weakest3']) <= 3
    for w in res['weakest3']:
        assert {'pada', 'index', 'syl', 'delta_ms', 'grade', 'hint'} <= set(w)
    # json round-trips (devanagari-free IAST syllables, no NaN)
    json.dumps(res, ensure_ascii=False)
