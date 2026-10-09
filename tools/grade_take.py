#!/usr/bin/env python3
"""grade_take — score a student recitation against reference timing (H6317).

Reuses tools/align_chapter.py internals (faster_whisper word times + H5223
onset anchoring when SK_GRADE_WHISPER/faster_whisper is available; always the
mora-proportional base + pada detection + phoneme-rule onset snap). The
student take is aligned exactly like a reference clip — layers 1, 3, 4 of
align_verse — then diffed per syllable against the verse's reference timing:

  reference timing source (first hit wins):
    1. verse.timing in verses/data/<id>.json   (human/whisper-aligned)
    2. tools/fixtures/<id>_timing.json         (synthetic dev fixture)

The corpus-scaling layer (align_verse layer 2) is deliberately NOT applied to
a student take: it would overwrite the student's actual pacing with corpus
pacing and flatten every delta to ~0.

Grading: a global least-squares tempo fit (student ~= a*ref + b) normalises
overall tempo/offset drift out of the per-syllable deltas, so a student who
recites uniformly 15% slower is graded on RHYTHM, not absolute speed.
grade_i = max(0, round(100 * (1 - |delta_s| / GRADE_ZERO_S))); a syllable the
snap step could not anchor to real audio gets grade 0 / delta null.

RU-first surface: the caller (serve_grade.py / record_grade.js) renders;
this module stays locale-free except syllable text.
"""
from __future__ import annotations

import json
import math
import os
import sys
import tempfile
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
ROOT = TOOLS_DIR.parent
sys.path.insert(0, str(TOOLS_DIR))

from align_chapter import (  # noqa: E402
    _load_params,
    _verse_word_tokens,
    calc_auto_timing,
    decode_audio_ffmpeg,
    detect_onsets,
    detect_pada_bounds,
    distribute_by_token_windows,
    get_phoneme_rule,
    load_phoneme_rules,
    snap_to_nearest,
    syllabify_verse,
    whisper_token_windows,
    whisper_word_times,
)

# 300 ms of normalised onset error -> 0 points (matches the default snap
# window_s in alignment_params.json: beyond it a "hit" is a neighbour's onset).
GRADE_ZERO_S = 0.30
GRADES_BANDS = ((80, 'ok'), (60, 'warn'), (40, 'bad'))  # upper bound -> heat class

class GradeError(Exception):
    """User-facing grading failure (bad input, no reference, undecodable)."""

class ReferenceTimingError(GradeError):
    """Verse has neither verse.timing nor a fixtures/<id>_timing.json."""


def load_verse(verse_id, verses_dir=None):
    verses_dir = Path(verses_dir) if verses_dir else ROOT / 'verses' / 'data'
    path = verses_dir / f'{verse_id}.json'
    if not path.is_file():
        raise GradeError(f'unknown verse: {verse_id}')
    return json.loads(path.read_text(encoding='utf-8'))


def load_reference_timing(verse, verses_dir=None, fixtures_dir=None):
    """Return (timing_dict, source_label) or raise ReferenceTimingError."""
    fixtures_dir = Path(fixtures_dir) if fixtures_dir else TOOLS_DIR / 'fixtures'
    timing = verse.get('timing')
    if timing and timing.get('s1') and timing.get('s2'):
        return timing, 'verse.timing'
    fid = verse.get('id', '')
    fpath = fixtures_dir / f'{fid}_timing.json'
    if fpath.is_file():
        ft = json.loads(fpath.read_text(encoding='utf-8'))
        if ft.get('s1') and ft.get('s2'):
            return ft, f'fixture:{fpath.name}'
    raise ReferenceTimingError(
        f"verse {fid} has no reference timing (no verse.timing, "
        f"no {fpath.relative_to(ROOT)} fixture)")


def _student_timing(data, sr, verse, params, use_whisper=False):
    """Per-syllable onset times for the student take (align_chapter layers).

    Mirrors align_verse's non-corpus path: pada bounds (uniform-quarter
    fallback), mora-proportional base, optional whisper token warp + H5223
    onset anchoring, then phoneme-rule onset/peak snap. Returns
    ({'s1':[...], 's2':[...]}, snapped_flags, meta).
    """
    syllables = syllabify_verse(verse)
    if not syllables['s1'] and not syllables['s2']:
        raise GradeError('no syllables in verse text')

    duration = len(data) / sr
    pada_result, used_thresh = detect_pada_bounds(data, sr, params['pada_detection'])
    pada_fallback = pada_result is None
    if pada_fallback:
        pada_result = [[duration * i / 4, duration * (i + 1) / 4] for i in range(4)]

    times = calc_auto_timing(syllables['s1'], syllables['s2'], pada_result,
                             params=params['mora'])

    warped = None
    if use_whisper:
        wt = whisper_word_times(data, sr)
        if wt:
            verse_tokens = _verse_word_tokens(verse)
            token_windows = whisper_token_windows(verse_tokens, wt)
            if token_windows:
                warped = distribute_by_token_windows(
                    syllables['s1'], syllables['s2'], verse_tokens, token_windows)
        if warped:
            times = {k: list(v) for k, v in warped.items()}

    onsets, peaks = detect_onsets(data, sr, params['onset_detection'])
    rules = load_phoneme_rules()
    snap_params = params['snap']
    window_s = snap_params['window_s']

    snapped_flags = {'s1': [], 's2': []}
    for key in ('s1', 's2'):
        syls = syllables[key]
        conf = []
        for i, syl in enumerate(syls):
            t0 = times[key][i] if i < len(times[key]) else 0.0
            rule = get_phoneme_rule(syl['syl'], rules)
            candidates = peaks if rule.get('align_to') == 'peak' else onsets
            snapped, dist = snap_to_nearest(t0, candidates, window_s)
            offset_s = (rule.get('offset_ms', 0) or 0) / 1000.0
            if snapped is not None:
                times[key][i] = snapped + offset_s
                conf.append(True)
            else:
                conf.append(False)
        snapped_flags[key] = conf

    meta = {
        'student_duration_s': round(duration, 3),
        'pada_fallback': pada_fallback,
        'onsets_detected': len(onsets),
        'whisper_warped': bool(warped),
    }
    return times, snapped_flags, meta, onsets, peaks


def _tempo_fit(ref_points, stu_points):
    """Least-squares stu ~= a*ref + b over paired onsets. Returns (a, b)."""
    n = len(ref_points)
    if n == 0:
        return 1.0, 0.0
    if n == 1:
        return 1.0, stu_points[0] - ref_points[0]
    mr = sum(ref_points) / n
    ms = sum(stu_points) / n
    num = sum((r - mr) * (s - ms) for r, s in zip(ref_points, stu_points))
    den = sum((r - mr) ** 2 for r in ref_points)
    if den <= 1e-9:
        return 1.0, ms - mr
    a = num / den
    if not (0.25 <= a <= 4.0):  # absurd tempo ratio -> no normalisation
        return 1.0, ms - mr
    b = ms - a * mr
    return a, b


def _heat_class(grade):
    for bound, cls in GRADES_BANDS:
        if grade >= bound:
            return cls
    return 'miss'


def _monotonic_assign(refs_norm, onsets, cap=0.30, unmatched_penalty=0.30):
    """Match each reference onset to at most one detected onset (strictly
    increasing, |onset - ref| <= cap), minimising total deviation + penalty
    for unmatched refs. DP over the two sorted lists; returns a list of
    onset indices (or None) parallel to refs_norm."""
    n, m = len(refs_norm), len(onsets)
    INF = float('inf')
    dp = [[INF] * (m + 1) for _ in range(n + 1)]
    pick = [[0] * (m + 1) for _ in range(n + 1)]  # 1=match 2=skip-onset 3=skip-ref
    for j in range(m + 1):
        dp[0][j] = 0.0
    for i in range(1, n + 1):
        dp[i][0] = i * unmatched_penalty
        pick[i][0] = 3
        for j in range(1, m + 1):
            best, choice = dp[i - 1][j] + unmatched_penalty, 3   # ref unmatched
            if dp[i][j - 1] < best:                               # onset unused
                best, choice = dp[i][j - 1], 2
            c = abs(onsets[j - 1] - refs_norm[i - 1])
            if c <= cap and dp[i - 1][j - 1] + c < best:          # match
                best, choice = dp[i - 1][j - 1] + c, 1
            dp[i][j], pick[i][j] = best, choice
    pairs = [None] * n
    i, j = n, m
    while i > 0:
        choice = pick[i][j]
        if choice == 1:
            pairs[i - 1] = j - 1
            i, j = i - 1, j - 1
        elif choice == 2:
            j -= 1
        else:
            i -= 1
    return pairs


def grade_take(audio_path, verse_id, verses_dir=None, use_whisper=None):
    """Grade a student take. Returns the grade JSON dict (see H6317 doc)."""
    verse = load_verse(verse_id, verses_dir)
    ref_timing, ref_source = load_reference_timing(verse, verses_dir)

    params = _load_params()
    if use_whisper is None:
        use_whisper = os.environ.get('SK_GRADE_WHISPER', '0') == '1'

    sr_cfg = params.get('decode', {}).get('sample_rate', 22050)
    data, sr = decode_audio_ffmpeg(audio_path, sr=sr_cfg)
    if len(data) < sr_cfg * 0.5:
        raise GradeError('audio too short (<0.5 s)')

    syllables = syllabify_verse(verse)
    stu_times, snapped, stu_meta, onsets, peaks = _student_timing(
        data, sr, verse, params, use_whisper=use_whisper)

    per_syllable = {}
    for key in ('s1', 's2'):
        syls = syllables[key]
        refs = ref_timing.get(key) or []
        stus = stu_times.get(key) or []
        flags = snapped.get(key) or []
        rows = []
        for i, syl in enumerate(syls):
            ref_t = refs[i] if i < len(refs) else None
            stu_t = stus[i] if i < len(stus) else None
            ok = bool(flags[i]) if i < len(flags) else False
            row = {
                'index': i,
                'syl': syl['syl'],
                'type': syl.get('type'),
                'ref_s': round(ref_t, 3) if ref_t is not None else None,
                'student_s': round(stu_t, 3) if stu_t is not None else None,
                'snapped': ok,
                'delta_ms': None,
                'grade': 0,
            }
            rows.append(row)
        if len(refs) not in (0, len(syls)):
            raise GradeError(
                f'{key}: reference timing has {len(refs)} onsets, '
                f'verse has {len(syls)} syllables ({ref_source})')
        per_syllable[key] = rows

    # rows as references (not copies) so assignment mutations land in
    # per_syllable
    gradable = [r for key in ('s1', 's2')
                for r in per_syllable[key] if r['ref_s'] is not None]

    # Seed tempo from span alignment: a student take starts at the first
    # syllable and ends at the last, so first/last detected onsets bracket the
    # reference span regardless of lead-in silence in the reference clip
    # (subh verse.timing is clip-relative and starts seconds in). The mora+snap
    # anchors are too noisy to seed this (double-claims, missed windows).
    ref_span = [r['ref_s'] for r in gradable]
    if onsets and len(ref_span) >= 2 and ref_span[-1] - ref_span[0] > 1e-6:
        a = (onsets[-1] - onsets[0]) / (ref_span[-1] - ref_span[0])
        a = min(4.0, max(0.25, a))
        b = onsets[0] - a * ref_span[0]
    else:
        a, b = 1.0, 0.0

    # Assignment pass: nearest-snapping double-claims onsets (two syllables
    # grab the same attack) — for SCORING the reference itself is the prior.
    # Match detected onsets to tempo-normalised reference positions by
    # monotonic one-to-one DP, refit tempo on inliers, repeat.
    for _iteration in range(3):
        refs_norm = [a * r['ref_s'] + b for r in gradable]
        pairs = _monotonic_assign(refs_norm, onsets, cap=0.30)
        for r, oi in zip(gradable, pairs):
            if oi is None:
                r['snapped'] = False
                r['student_s'] = None
            else:
                r['snapped'] = True
                r['student_s'] = round(onsets[oi], 3)
        matched = [(r['ref_s'], r['student_s']) for r in gradable if r['snapped']]
        if len(matched) < 2:
            break
        a, b = _tempo_fit([m[0] for m in matched], [m[1] for m in matched])
        # outlier-trimmed refit: one pass dropping |delta| outliers
        inliers = [(rf, st) for rf, st in matched
                   if abs(st - (a * rf + b)) <= 0.25]
        if len(inliers) >= 2:
            a, b = _tempo_fit([m[0] for m in inliers], [m[1] for m in inliers])

    all_grades = []
    for key in ('s1', 's2'):
        for row in per_syllable[key]:
            if row['ref_s'] is None or row['student_s'] is None:
                row['grade'] = 0
                row['snapped'] = False
                all_grades.append(row['grade'])
                continue
            if row['snapped']:
                delta = row['student_s'] - (a * row['ref_s'] + b)
                row['delta_ms'] = round(delta * 1000.0)
                row['grade'] = max(
                    0, round(100.0 * (1.0 - abs(delta) / GRADE_ZERO_S)))
            all_grades.append(row['grade'])
            row['heat'] = _heat_class(row['grade'])

    rhythm = round(sum(all_grades) / len(all_grades), 1) if all_grades else 0.0

    flat = [dict(r, pada=key) for key in ('s1', 's2') for r in per_syllable[key]]
    weakest = sorted(
        (r for r in flat if r['grade'] < 100),
        key=lambda r: (r['grade'], -(abs(r['delta_ms']) if r['delta_ms'] is not None else 0))
    )[:3]

    return {
        'verse_id': verse.get('id', verse_id),
        'rhythm_percent': rhythm,
        'tempo_scale': round(a, 4),
        'tempo_shift_s': round(b, 3),
        'reference_source': ref_source,
        'per_syllable': per_syllable,
        'weakest3': [
            {
                'pada': w['pada'],
                'index': w['index'],
                'syl': w['syl'],
                'delta_ms': w['delta_ms'],
                'grade': w['grade'],
                'hint': _hint_ru(w),
            }
            for w in weakest
        ],
        'meta': stu_meta,
    }


def _hint_ru(row):
    """RU drill hint for one weak syllable."""
    if row['delta_ms'] is None:
        return f"слог «{row['syl']}» не услышан — произнеси его чётче"
    d = row['delta_ms']
    if d > 40:
        return (f"слог «{row['syl']}» позже эталона на {d} мс — "
                f"не тяни предыдущий")
    if d < -40:
        return (f"слог «{row['syl']}» раньше эталона на {-d} мс — "
                f"дай предыдущему прозвучать")
    return f"слог «{row['syl']}» чуть мимо ритма ({d:+d} мс)"


def main():
    import argparse
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description='Grade a student take (H6317)')
    parser.add_argument('audio', help='audio file of the recitation')
    parser.add_argument('verse_id', help='verse id, e.g. bhg_2_47')
    parser.add_argument('--whisper', action='store_true',
                        help='enable faster_whisper warp (needs faster_whisper)')
    args = parser.parse_args()
    try:
        result = grade_take(args.audio, args.verse_id, use_whisper=args.whisper)
    except GradeError as e:
        print(f'ERROR: {e}', file=sys.stderr)
        sys.exit(2)
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    print()


if __name__ == '__main__':
    main()
