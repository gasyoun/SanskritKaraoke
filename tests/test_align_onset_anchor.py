"""H5223 — onset-anchored placement inside whisper token windows.

Covers: v6 mora-curve regression (distribute_by_token_windows unchanged),
window-constrained anchor snap, mora interpolation between anchors,
monotonicity enforcement, nasal offset, and an end-to-end align_verse smoke
with a canned whisper word list.
"""
import math
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))

import align_chapter as ac  # noqa: E402

PARAMS = ac._load_params()


def syl(text, kind):
    return {'syl': text, 'type': kind}


class TestTokenWindowCuts(unittest.TestCase):
    def test_distribute_by_token_windows_regression(self):
        """v6 behaviour is unchanged: char-length token cuts + mora spacing."""
        syls = [syl('ka', 'laghu'), syl('gha', 'guru'),
                syl('na', 'laghu'), syl('dha', 'guru')]
        toks = ['ab', 'cde']
        wins = [(1.0, 2.0), (2.0, 3.5)]
        out = ac.distribute_by_token_windows(syls[:2], syls[2:], toks, wins)
        # guru after 1 of 1+2=3 moras; laghu at frac 0, guru after 1/3 of span
        self.assertEqual(out['s1'], [1.0, 1.0 + 1 / 3])
        self.assertEqual(out['s2'], [2.0, 2.5])


class TestOnsetAnchorWarpedTimes(unittest.TestCase):
    def setUp(self):
        self.rules = ac.load_phoneme_rules()
        self.p = dict(PARAMS.get('onset_anchor', {}))

    def test_all_anchored_to_in_window_onsets(self):
        syls = [syl('ka', 'laghu'), syl('ga', 'guru'), syl('pa', 'laghu')]
        toks = ['kagapa']
        wins = [(1.0, 2.0)]
        pred = {'s1': [1.0, 1.5, 2.0], 's2': []}
        onsets = [1.02, 1.55, 1.98]
        times, conf, stats = ac.onset_anchor_warped_times(
            syls, [], toks, wins, pred, onsets, [], self.rules, self.p)
        self.assertEqual(times['s1'], [1.02, 1.55, 1.98])
        self.assertEqual(stats['anchored'], 3)
        self.assertEqual(stats['interpolated'], 0)
        self.assertTrue(all(c > 0 for c in conf['s1']))

    def test_interpolation_between_anchors(self):
        syls = [syl('ka', 'laghu'), syl('ga', 'guru'), syl('pa', 'laghu')]
        wins = [(1.0, 2.0)]
        pred = {'s1': [1.0, 1.5, 2.0], 's2': []}
        times, _, stats = ac.onset_anchor_warped_times(
            syls, [], ['kagapa'], wins, pred, [1.0, 2.0], [], self.rules, self.p)
        # middle guru: after the first laghu mora, 1 of 1+2=3 moras before
        # the next anchor's onset (right anchor's own weight excluded)
        self.assertAlmostEqual(times['s1'][1], 1.0 + 1.0 * (1 / 3), places=6)
        self.assertEqual(stats['anchored'], 2)
        self.assertEqual(stats['interpolated'], 1)

    def test_window_constraint_blocks_cross_word_onset(self):
        syls = [syl('ka', 'laghu'), syl('ga', 'laghu'),
                syl('pa', 'guru'), syl('ba', 'laghu')]
        toks = ['kaga', 'paba']
        wins = [(1.0, 1.7), (1.7, 3.0)]
        pred = {'s1': [1.0, 1.5], 's2': [2.0, 2.5]}
        p = dict(self.p, search_radius_s=0.6)
        # 2.05 is within radius of pred s1[1]=1.5 (0.55 ≤ 0.6) but OUTSIDE
        # window 0 (hi = 1.7 + 0.02): must NOT anchor syl 1. The same onset
        # IS inside window 1 and right next to pred s2[0]=2.0 → anchors it.
        onsets = [1.02, 2.05]
        times, _, stats = ac.onset_anchor_warped_times(
            syls[:2], syls[2:], toks, wins, pred, onsets, [], self.rules, p)
        self.assertEqual(times['s1'][0], 1.02)
        self.assertEqual(times['s2'][0], 2.05)
        self.assertGreater(times['s1'][1], 1.02)
        self.assertLess(times['s1'][1], 2.05)
        flat = times['s1'] + times['s2']
        self.assertTrue(all(a < b for a, b in zip(flat, flat[1:])))
        self.assertEqual(stats['anchored'], 2)

    def test_monotonicity_enforced_by_dropping_bad_anchor(self):
        syls = [syl('ka', 'laghu'), syl('ga', 'laghu'), syl('pa', 'laghu')]
        wins = [(1.0, 2.0)]
        pred = {'s1': [1.0, 1.5, 2.0], 's2': []}
        p = dict(self.p, search_radius_s=0.6)
        # all candidates cluster after syllable 0 — the 3rd would invert
        onsets = [1.5, 1.55, 1.6]
        times, _, stats = ac.onset_anchor_warped_times(
            syls, [], ['kagapa'], wins, pred, onsets, [], self.rules, p)
        flat = times['s1']
        self.assertTrue(all(a < b for a, b in zip(flat, flat[1:])))
        self.assertLessEqual(stats['anchored'], 2)

    def test_no_candidates_full_interpolation_over_window_bounds(self):
        syls = [syl('ka', 'laghu'), syl('ga', 'guru'), syl('pa', 'laghu')]
        wins = [(1.0, 2.0)]
        pred = {'s1': [1.0, 1.5, 2.0], 's2': []}
        times, conf, stats = ac.onset_anchor_warped_times(
            syls, [], ['kagapa'], wins, pred, [], [], self.rules, self.p)
        self.assertEqual(times['s1'][0], 1.0)
        self.assertAlmostEqual(times['s1'][1], 1.25, places=6)
        self.assertAlmostEqual(times['s1'][2], 1.75, places=6)
        self.assertEqual(stats['anchored'], 0)
        self.assertEqual(stats['interpolated'], 3)
        self.assertTrue(all(c == self.p['interpolated_confidence']
                            for c in conf['s1']))

    def test_nasal_offset_applied_after_anchor(self):
        syls = [syl('ma', 'laghu'), syl('ka', 'laghu'), syl('pa', 'laghu')]
        wins = [(1.0, 2.0)]
        pred = {'s1': [1.0, 1.5, 2.0], 's2': []}
        onsets = [1.0, 1.5, 2.0]
        times, _, _ = ac.onset_anchor_warped_times(
            syls, [], ['makapa'], wins, pred, onsets, [], self.rules, self.p)
        self.assertAlmostEqual(times['s1'][0], 0.985, places=6)  # -15 ms


class TestAlignVerseOnsetAnchorPath(unittest.TestCase):
    def test_end_to_end_generator_marker_and_monotonic(self):
        sr = PARAMS['decode']['sample_rate']
        # 4 pada bursts with silence gaps (pada detection needs them)
        burst, gap = 0.8, 0.3
        segs, t = [], 0.0
        starts = []
        for _ in range(4):
            starts.append(t)
            segs.append((t, t + burst))
            t += burst + gap
        dur = t
        data = np.zeros(int(dur * sr), dtype=np.float32)
        for s0, s1 in segs:
            i0, i1 = int(s0 * sr), int(s1 * sr)
            ramp = np.linspace(0.6, 0.1, i1 - i0)  # attack then decay
            data[i0:i1] = ramp * np.sin(2 * math.pi * 220 * np.arange(i1 - i0) / sr)
        verse = {
            'id': 't_e2e', 'meter': 'anushtubh',
            's1': 'दिवा पश्यति काको नक्तं', 's2': 'न पश्यति च दिवा काकः',
        }
        words = ['divā', 'paśyati', 'kāko', 'naktam', 'na', 'paśyati', 'ca',
                 'divā', 'kākaḥ']
        canned = [(w, s, s + 0.6) for w, s in zip(words, starts + [starts[3] + 0.1])]

        import tempfile
        tmp = tempfile.mkdtemp(prefix='h5223_e2e_')
        wav = os.path.join(tmp, 't_e2e.wav')
        import wave
        with wave.open(wav, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sr)
            w.writeframes((data * 32767).astype('<i2').tobytes())

        orig_wt = ac.whisper_word_times
        ac.whisper_word_times = lambda clip, srr, model_name='small': canned
        try:
            res = ac.align_verse(wav, verse, os.path.join(tmp, 'verses'),
                                 params=PARAMS, whisper_cal=True)
        finally:
            ac.whisper_word_times = orig_wt

        timing = res['timing']
        self.assertEqual(timing['generator'], 'cli-v3-onset-anchor')
        self.assertIsNotNone(res['meta']['onset_anchor'])
        flat = timing['s1'] + timing['s2']
        self.assertTrue(all(a <= b for a, b in zip(flat, flat[1:])))


if __name__ == '__main__':
    unittest.main()
