import sys, json
sys.path.insert(0,'.')
from envtool import syl_list, SP
import os
for vid in sys.argv[1:]:
    syls, v = syl_list(vid)
    c = json.load(open(os.path.join(SP,'cache',vid+'.json')))
    b = c['baseline_json']['s1']+c['baseline_json']['s2']
    print(vid, 'lead', c['lead_end_s'], 'fallback', c['fallback'], 'n', len(syls))
    print('  whisper', [(w, round(a+c['lead_end_s'],2), round(e+c['lead_end_s'],2)) for w,a,e in c['whisper']])
    print('  ', ' '.join(f'{i}:{s}@{t:.2f}' for i,(s,t) in enumerate(zip(syls,b))))
