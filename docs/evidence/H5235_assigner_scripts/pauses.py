"""List silent stretches (< SIL_DB for >= 120 ms) inside each gold verse, with the gold syllables
on either side: is the pause a pada boundary, a word boundary, or inside a word?"""
import sys, os, json
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from envtool import WT
sys.path.insert(0, os.path.join(WT, 'tools'))
from eval_gold_attacks import load_gold
import assigner as A
import align_chapter as ac

SIL_DB = -26.0
gold = load_gold()
for vid in (sys.argv[1:] or gold):
    V = A.Verse(vid)
    verse = json.load(open(os.path.join(WT, 'verses/data', vid + '.json')))
    toks = ac._verse_word_tokens(verse)
    cuts = ac.token_syllable_cuts(toks, len(V.syls))
    word_of = {}
    for k in range(len(toks)):
        for i in range(cuts[k], cuts[k + 1]):
            word_of[i] = k
    gt = {l['i']: l['t'] for l in gold[vid]['labels']}
    t, db = V.t, V.db
    sil = db < SIL_DB
    lo, hi = gt[0], gt[len(V.syls) - 1]
    i, rows = 0, []
    while i < len(t):
        if sil[i]:
            s = i
            while i < len(t) and sil[i]:
                i += 1
            a, b = t[s], t[i - 1]
            if b - a >= 0.12 and lo < a < hi:
                nxt = min((k for k in gt if gt[k] >= b - 0.05), default=None)
                if nxt is None:
                    continue
                pada = nxt in (V.n1 // 2, V.n1, V.n1 + (len(V.syls) - V.n1) // 2)
                kind = 'PADA' if pada else ('word' if word_of.get(nxt) != word_of.get(nxt - 1) else 'IN-WORD')
                rows.append(f'{a:5.2f}-{b:5.2f} ({1000 * (b - a):4.0f} ms) before {nxt}:{V.syls[nxt]["syl"]} [{kind}]')
        else:
            i += 1
    print(vid, *rows, sep='\n   ')
