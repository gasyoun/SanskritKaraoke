"""H5227: one whisper pass per verse, cache everything the anchor step consumes."""
import sys, os, json
WT = os.environ.get('KARAOKE_WT', os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))
sys.path.insert(0, os.path.join(WT, 'tools'))
import numpy as np
import align_chapter as ac

AUDIO = os.environ.get('H5235_AUDIO', '/tmp/opencode/h5223check/audio_batch')
OUT = os.path.join(os.environ['H5235_SP'], 'cache')
os.makedirs(OUT, exist_ok=True)

orig_wwt = ac.whisper_word_times
captured = {}

def wwt(clip, sr, model_name='small'):
    r = orig_wwt(clip, sr, model_name)
    captured['wt'] = r
    captured['clip_len'] = len(clip)
    return r

ac.whisper_word_times = wwt

ids = sys.argv[1:] or sorted(f[:-4] for f in os.listdir(AUDIO) if f.endswith('.mp3'))
params = ac._load_params()
for vid in ids:
    captured.clear()
    verse = json.load(open(os.path.join(WT, 'verses/data', vid + '.json')))
    res = ac.align_verse(os.path.join(AUDIO, vid + '.mp3'), verse,
                         os.path.join(WT, 'verses/data'), params=params,
                         lead_strip=True, lead_word='subhāṣitam', whisper_cal=True)
    out = {
        'id': vid,
        'whisper': captured.get('wt'),
        'lead_end_s': res['meta']['lead_end_s'],
        'fallback': res['fallback'],
        'timing': {'s1': res['timing']['s1'], 's2': res['timing']['s2']},
        'baseline_json': {'s1': verse['timing']['s1'], 's2': verse['timing']['s2']},
    }
    json.dump(out, open(os.path.join(OUT, vid + '.json'), 'w'), ensure_ascii=False, indent=1)
    d = max(abs(a - b) for k in ('s1', 's2') for a, b in zip(out['timing'][k], out['baseline_json'][k]))
    print(vid, 'fallback' if res['fallback'] else 'padas', 'max|rerun-json| ms', round(d * 1000))
