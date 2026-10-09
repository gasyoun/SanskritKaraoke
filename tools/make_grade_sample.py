import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from grade_take import grade_take, load_reference_timing, load_verse  # noqa: E402
sys.path.insert(0, str(ROOT.parent / 'tests'))
from test_grade_take import synth_take_wav  # noqa: E402

t = load_reference_timing(load_verse('subh_2745'))[0]
onsets = [x * 1.06 + 0.3 for x in (list(t['s1']) + list(t['s2']))]
onsets[9] += 0.19   # one syllable clearly late
onsets[24] -= 0.16  # one clearly early
wav = synth_take_wav(ROOT.parent / 'tests' / '_tmp_sample_take.wav', onsets)
res = grade_take(str(wav), 'subh_2745')
res['comment'] = (
    'H6317 grade-sample fixture: synthetic take (burst onsets x1.06 +0.3 s, '
    'syl idx9 +190 ms, idx24 -160 ms) graded against the REAL Uska Sanka '
    'verse.timing of subh_2745. Regenerate: python tools/make_grade_sample.py')
res['generator'] = 'h6317-sample'
out = ROOT / 'fixtures' / 'subh_2745_grade_sample.json'
out.write_text(json.dumps(res, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('rhythm:', res['rhythm_percent'], '| weakest3:',
      [(w['pada'], w['index'], w['delta_ms'], w['grade']) for w in res['weakest3']])
print('written:', out)
