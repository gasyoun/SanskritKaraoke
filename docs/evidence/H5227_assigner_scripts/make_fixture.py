"""Write tests/fixtures/h5227_gold_attacks.json from labels.py + syllabifier."""
import sys, os, json
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, '.')
from envtool import syl_list, WT
from labels import parse

AUDIO_SRC = 'faster_whisper audio batch, H5223: /tmp/opencode/h5223check/audio_batch/<id>.mp3'
out = {
    '_about': ('H5227 gold set: per-syllable consonant-attack times (seconds, absolute clip time), '
               'hand-read from the 20 ms RMS envelope (5 ms hop) + spectrogram of each clip. '
               'Convention (same as the H5224 subh_2745 table): the attack is where the envelope '
               'starts rising out of the syllable-onset consonant dip — the stop/tap release, the end '
               'of a fricative, the release (not the prevoicing) of a voiced stop; vowel-initial '
               'syllables take the vowel onset. conf "low" = nasal/approximant continuum or an '
               'ambiguous consonant count; excluded from every summary. Syllable index = flat s1+s2 '
               'order of syllabify_verse(); the karaoke text is fixed, so a reciter\'s textual variant '
               '(subh_1375 pada 2-4) is labelled by syllable POSITION.'),
    '_audio': AUDIO_SRC,
    'verses': {},
}
for vid, rows in parse().items():
    syls, verse = syl_list(vid)
    assert len(syls) == 32 and len(rows) == 32, (vid, len(syls), len(rows))
    assert [r[0] for r in rows] == list(range(32)), vid
    ts = [r[1] for r in rows]
    assert all(b > a for a, b in zip(ts, ts[1:])), vid
    out['verses'][vid] = {
        'audio': f'{vid}.mp3',
        'labels': [{'i': i, 'syl': syls[i], 't': t, 'conf': c} for i, t, c in rows],
    }
dst = os.path.join(WT, 'tests', 'fixtures', 'h5227_gold_attacks.json')
os.makedirs(os.path.dirname(dst), exist_ok=True)
json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(dst, {v: sum(1 for l in d['labels'] if l['conf'] == 'high') for v, d in out['verses'].items()})
