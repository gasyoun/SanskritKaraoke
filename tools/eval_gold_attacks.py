#!/usr/bin/env python3
"""
Score syllable timings against the H5227 gold attack set
(tests/fixtures/h5227_gold_attacks.json).

Δ = highlight onset − gold consonant attack. Only conf == "high" labels count.
Reports per verse: mean |Δ|, max |Δ|, share within 100 / 150 ms, monotonicity.

Usage:
    python tools/eval_gold_attacks.py                 # score verses/data/*.json timing
    python tools/eval_gold_attacks.py --timing DIR    # score <DIR>/<id>_timing.json sidecars
"""
import sys, os, json, argparse

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TOOLS_DIR)
GOLD_PATH = os.path.join(REPO_ROOT, 'tests', 'fixtures', 'h5227_gold_attacks.json')


def load_gold(path=GOLD_PATH):
    with open(path, encoding='utf-8') as f:
        return json.load(f)['verses']


def score(flat_times, labels):
    """flat_times: s1+s2 onsets (s). labels: gold rows. Returns a metrics dict."""
    deltas = [flat_times[l['i']] - l['t'] for l in labels if l['conf'] == 'high']
    absd = [abs(d) for d in deltas]
    n = len(absd)
    return {
        'n': n,
        'mean_ms': round(1000 * sum(absd) / n, 1) if n else None,
        'max_ms': round(1000 * max(absd)) if n else None,
        'within100': sum(1 for d in absd if d <= 0.100),
        'within150': sum(1 for d in absd if d <= 0.150),
        'monotonic': all(b >= a for a, b in zip(flat_times, flat_times[1:])),
        'deltas_ms': [round(1000 * d) for d in deltas],
    }


def pooled(results):
    absd = [abs(d) for r in results for d in r['deltas_ms']]
    n = len(absd)
    return {'n': n, 'mean_ms': round(sum(absd) / n, 1) if n else None,
            'max_ms': max(absd) if n else None,
            'within100': sum(1 for d in absd if d <= 100)}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--verses', default=os.path.join(REPO_ROOT, 'verses', 'data'))
    ap.add_argument('--timing', default='', help='directory of <id>_timing.json sidecars')
    args = ap.parse_args()

    gold = load_gold()
    rows = []
    for vid, g in gold.items():
        if args.timing:
            with open(os.path.join(args.timing, f'{vid}_timing.json'), encoding='utf-8') as f:
                timing = json.load(f)['timing']
        else:
            with open(os.path.join(args.verses, f'{vid}.json'), encoding='utf-8') as f:
                timing = json.load(f)['timing']
        r = score(list(timing['s1']) + list(timing['s2']), g['labels'])
        rows.append(r)
        print(f"{vid}  n={r['n']:2d}  mean|Δ|={r['mean_ms']:6.1f} ms  max={r['max_ms']:5d} ms  "
              f"≤100={r['within100']}/{r['n']}  ≤150={r['within150']}/{r['n']}  "
              f"monotonic={'yes' if r['monotonic'] else 'NO'}")
    p = pooled(rows)
    print(f"pooled  n={p['n']}  mean|Δ|={p['mean_ms']} ms  max={p['max_ms']} ms  ≤100={p['within100']}/{p['n']}")


if __name__ == '__main__':
    main()
