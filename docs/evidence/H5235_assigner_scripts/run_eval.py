"""Evaluate an assigner design on the gold set: in-sample default + leave-one-verse-out grid."""
import sys, os, json, itertools, copy, importlib, time
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from envtool import WT
sys.path.insert(0, os.path.join(WT, 'tools'))
from eval_gold_attacks import load_gold, score, pooled

mod = importlib.import_module(sys.argv[1] if len(sys.argv) > 1 else 'assigner')
gold = load_gold()
VS = {vid: mod.Verse(vid) for vid in gold}


def run(P, vids):
    res = {}
    for vid in vids:
        times, na = mod.assign(VS[vid], P)
        res[vid] = score(times, gold[vid]['labels'])
    return res


def obj(res):
    p = pooled(list(res.values()))
    worst = max(r['max_ms'] for r in res.values())
    return p['mean_ms'] + 0.1 * worst


if __name__ == '__main__':
    t0 = time.time()
    r = run(mod.DEFAULT, gold)
    for vid, x in r.items():
        print(f"default {vid} mean={x['mean_ms']} max={x['max_ms']} ≤100={x['within100']}/{x['n']} mono={x['monotonic']}")
    print('default pooled', pooled(list(r.values())), f'{time.time()-t0:.1f}s')
    if '--loo' not in sys.argv:
        sys.exit()
    grid = mod.GRID
    keys = list(grid)
    combos = list(itertools.product(*[grid[k] for k in keys]))
    print('grid size', len(combos))
    cache = {}
    for ci, vals in enumerate(combos):
        P = copy.deepcopy(mod.DEFAULT)
        for k, v in zip(keys, vals):
            P[k] = v
        cache[vals] = run(P, gold)
    held = {}
    for vid in gold:
        others = [v for v in gold if v != vid]
        bestv = min(combos, key=lambda vals: obj({o: cache[vals][o] for o in others}))
        held[vid] = cache[bestv][vid]
        print(f"LOO held-out {vid}: params={dict(zip(keys, bestv))} mean={held[vid]['mean_ms']} "
              f"max={held[vid]['max_ms']} ≤100={held[vid]['within100']}/{held[vid]['n']} mono={held[vid]['monotonic']}")
    print('LOO pooled', pooled(list(held.values())))
    json.dump({v: h for v, h in held.items()}, open(os.path.join(os.path.dirname(__file__), f'loo_{sys.argv[1]}.json'), 'w'))
