"""20-verse regression: H5224 'misplaced' count (syllable outside its own word's whisper
window by >100 ms) + monotonicity, for baseline vs an assigner; and for the gold labels."""
import sys, os, json, importlib
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from envtool import SP, WT
import align_chapter as ac
sys.path.insert(0, os.path.join(WT, 'tools'))
from eval_gold_attacks import load_gold

mod = importlib.import_module(sys.argv[1])
gold = load_gold()


def windows(V, cache, verse):
    toks = ac._verse_word_tokens(verse)
    tw = ac.whisper_token_windows(toks, [tuple(w) for w in cache['whisper']])
    if not tw:
        return None
    cuts = ac.token_syllable_cuts(toks, len(V.syls))
    win = [None] * len(V.syls)
    for k, (ws, we) in enumerate(tw):
        for i in range(cuts[k], cuts[k + 1]):
            win[i] = (ws + V.lead, we + V.lead)
    return win


def misplaced(times, win, tol=0.100):
    bad, worst = 0, 0.0
    for x, (a, b) in zip(times, win):
        e = max(a - x, x - b, 0.0)
        if e > tol:
            bad += 1
        worst = max(worst, e)
    return bad, round(worst * 1000)


tot = {'base': 0, 'new': 0}
for f in sorted(os.listdir(os.path.join(SP, 'cache'))):
    vid = f[:-5]
    cache = json.load(open(os.path.join(SP, 'cache', f)))
    verse = json.load(open(os.path.join(WT, 'verses/data', f)))
    V = mod.Verse(vid)
    win = windows(V, cache, verse)
    new, na = mod.assign(V, mod.DEFAULT)
    mb = misplaced(V.pred, win)
    mn = misplaced(new, win)
    mono = all(b >= a for a, b in zip(new, new[1:]))
    shift = max(abs(a - b) for a, b in zip(new, V.pred))
    tot['base'] += mb[0]
    tot['new'] += mn[0]
    g = ''
    if vid in gold:
        gt = [None] * len(V.syls)
        for l in gold[vid]['labels']:
            gt[l['i']] = l['t']
        gm = misplaced([x for x in gt], win)
        g = f'  gold-itself misplaced={gm[0]} worst={gm[1]}ms'
    print(f'{vid} base misplaced={mb[0]} | new misplaced={mn[0]} worst={mn[1]}ms mono={mono} '
          f'anchored={na}/32 max|new-base|={round(shift*1000)}ms{g}')
print('TOTAL misplaced base', tot['base'], 'new', tot['new'])
