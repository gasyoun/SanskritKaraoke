"""Per-syllable diagnostic: gold vs pipeline prediction vs assigner output for one verse.
Usage: python diag.py <assigner module> <vid> [<vid> ...]   (prints rows with |Δ| > 100 ms, marked)"""
import sys, os, importlib
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from envtool import WT
sys.path.insert(0, os.path.join(WT, 'tools'))
from eval_gold_attacks import load_gold

mod = importlib.import_module(sys.argv[1])
gold = load_gold()
for vid in sys.argv[2:]:
    V = mod.Verse(vid)
    out, na = mod.assign(V, mod.DEFAULT)
    g = {l['i']: l for l in gold[vid]['labels']}
    print(f'== {vid} lead={V.lead:.2f} n1={V.n1} anchored={na}')
    for i, s in enumerate(V.syls):
        l = g.get(i)
        gt = f"{l['t']:.2f}{'' if l['conf'] == 'high' else '?'}" if l else '   -  '
        d = round(1000 * (out[i] - l['t'])) if l else 0
        flag = ' <<' if l and l['conf'] == 'high' and abs(d) > 100 else ''
        print(f"  {i:2d} {s['syl']:>5} gold={gt:>6} pred={V.pred[i]:6.2f} out={out[i]:6.2f} Δ={d:+5d}{flag}")
