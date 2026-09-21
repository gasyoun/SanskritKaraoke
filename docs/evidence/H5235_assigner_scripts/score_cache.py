"""Score the cached pipeline re-run (cache/<id>.json 'timing') and the committed v1.5.9 JSON
('baseline_json') against the gold set; also the max shift re-run vs committed on every verse."""
import sys, os, json
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from envtool import SP, WT
sys.path.insert(0, os.path.join(WT, 'tools'))
from eval_gold_attacks import load_gold, score, pooled

gold = load_gold()
rb, rn = [], []
for f in sorted(os.listdir(os.path.join(SP, 'cache'))):
    vid = f[:-5]
    c = json.load(open(os.path.join(SP, 'cache', f)))
    base = c['baseline_json']['s1'] + c['baseline_json']['s2']
    new = c['timing']['s1'] + c['timing']['s2']
    shift = max(abs(a - b) for a, b in zip(base, new))
    line = f"{vid} lead={c['lead_end_s']} shift_vs_committed={round(shift * 1000)}ms"
    if vid in gold:
        b = score(base, gold[vid]['labels'])
        n = score(new, gold[vid]['labels'])
        rb.append(b)
        rn.append(n)
        line += (f"  GOLD committed {b['mean_ms']}/{b['max_ms']}  rerun {n['mean_ms']}/{n['max_ms']}"
                 f" ≤100 {n['within100']}/{n['n']}")
    print(line)
print('pooled committed', pooled(rb))
print('pooled rerun    ', pooled(rn))
