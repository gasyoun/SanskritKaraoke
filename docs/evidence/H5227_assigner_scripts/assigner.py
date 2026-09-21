"""H5227 design 1: global valley-attack assigner (DP over syllable x valley candidates)."""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from envtool import load, envelope, WT, SP
import align_chapter as ac

HOP = 0.005
STOPS = set('kgcjṭḍtdpb')
FRIC = set('śṣs')


def onset_class(syl):
    s = syl.lower()
    if not s:
        return 'vowel'
    c = s[0]
    if c in 'aāiīuūṛṝḷeo' or s.startswith('ai') or s.startswith('au'):
        # 'ṛ' as a vowel only when syllable starts with it and no consonant
        return 'vowel'
    if c in STOPS:
        return 'stop'
    if c in FRIC:
        return 'fric'
    return 'son'


def candidates(t, db, lo, hi, min_rise=4.0, look=0.08, sil_db=-26.0):
    """Valley candidates in [lo, hi]: (t_attack, depth_dB, post_silence)."""
    k = int(look / HOP)
    out = []
    n = len(db)
    for i in range(2, n - k):
        if not (lo <= t[i] <= hi):
            continue
        if db[i] <= db[i - 1] and db[i] <= db[i - 2] and db[i] < db[i + 1]:
            j = i + int(np.argmax(db[i:i + k]))
            rise = db[j] - db[i]
            if rise < min_rise or db[j] < -40:
                continue
            post_sil = db[i] < sil_db
            ta = t[i]
            if post_sil:
                # attack = where the envelope leaves the floor (min + 6 dB)
                r = i + int(np.argmax(db[i:j + 1] >= db[i] + 6.0))
                ta = t[max(i, r - 1)]
            out.append((float(ta), float(rise), bool(post_sil)))
    # merge candidates closer than 25 ms (keep the deeper)
    merged = []
    for c in out:
        if merged and c[0] - merged[-1][0] < 0.025:
            if c[1] > merged[-1][1]:
                merged[-1] = c
        else:
            merged.append(c)
    return merged


def silence_between(t, db, a, b, sil_db=-26.0):
    m = (t > a) & (t < b)
    return float(np.sum(db[m] < sil_db) * HOP)


class Verse:
    def __init__(self, vid):
        self.vid = vid
        cache = json.load(open(os.path.join(SP, 'cache', vid + '.json')))
        verse = json.load(open(os.path.join(WT, 'verses/data', vid + '.json')))
        s = ac.syllabify_verse(verse)
        self.syls = s['s1'] + s['s2']
        self.n1 = len(s['s1'])
        self.pred = cache['timing']['s1'] + cache['timing']['s2']
        self.lead = cache['lead_end_s'] or 0.0
        self.t, self.db = envelope(load(vid))
        w = cache['whisper'] or []
        self.region_end = (w[-1][2] + self.lead) if w else self.t[-1]
        self.cls = [onset_class(x['syl']) for x in self.syls]
        self.mora = [2 if x['type'] == 'guru' else 1 for x in self.syls]


DEFAULT = dict(wp=1.0, cap=0.35, a_skip=0.25, d0=5.0, b_un=1.2, wt=1.5,
               expect={'stop': 12.0, 'fric': 10.0, 'son': 6.0, 'vowel': 0.0},
               wc=0.6, K=4, L=14, pre_frac=0.2, sil_bonus=0.5)


def assign(V, P=DEFAULT):
    t, db = V.t, V.db
    C = candidates(t, db, V.lead - 0.3, V.region_end + 0.5)
    ct = [c[0] for c in C]
    n, m = len(V.syls), len(C)
    pred = V.pred
    # tempo: speech time / moras, over the predicted verse span
    span0, span1 = min(pred) - 0.2, max(pred) + 0.8
    speech = (span1 - span0) - silence_between(t, db, span0, span1)
    tau = speech / sum(V.mora)

    def skipc(j):
        d = C[j][1]
        return P['a_skip'] * max(0.0, d - P['d0']) / 10.0

    skip_pref = [0.0]
    for j in range(m):
        skip_pref.append(skip_pref[-1] + skipc(j))

    def unc(i):
        return P['b_un'] * (0.4 if V.cls[i] in ('son', 'vowel') else 1.0)

    un_pref = [0.0]
    for i in range(n):
        un_pref.append(un_pref[-1] + unc(i))

    def match(i, j):
        d = abs(ct[j] - pred[i])
        c = P['wp'] * min(d, P['cap']) / 0.1 * 0.3
        need = P['expect'][V.cls[i]]
        c += P['wc'] * max(0.0, need - C[j][1]) / 10.0
        if C[j][2]:  # post-silence onset: good for any syllable after a pause
            c -= P['sil_bonus'] * 0.5
        return c

    mora_pref = [0]
    for x in V.mora:
        mora_pref.append(mora_pref[-1] + x)

    sil_cache = {}

    def tempo(i0, j0, i1, j1):
        key = (j0, j1)
        if key not in sil_cache:
            sil_cache[key] = silence_between(t, db, ct[j0], ct[j1])
        eff = max(ct[j1] - ct[j0] - sil_cache[key], 0.03)
        exp = tau * (mora_pref[i1] - mora_pref[i0])
        return P['wt'] * abs(math.log(eff / exp))

    INF = float('inf')
    best = {}
    back = {}
    # start transitions: syllables < i unanchored, candidates < j skipped cheaply
    for i in range(min(n, P['K'] + 2)):
        for j in range(m):
            c = un_pref[i] + P['pre_frac'] * skip_pref[j] + match(i, j)
            best[(i, j)] = c
            back[(i, j)] = None
    for i in range(n):
        for j in range(m):
            if (i, j) not in best:
                continue
            base = best[(i, j)]
            for i2 in range(i + 1, min(n, i + P['K'] + 1)):
                for j2 in range(j + 1, min(m, j + P['L'] + 1)):
                    c = (base + (un_pref[i2] - un_pref[i + 1]) + (skip_pref[j2] - skip_pref[j + 1])
                         + tempo(i, j, i2, j2) + match(i2, j2))
                    if c < best.get((i2, j2), INF):
                        best[(i2, j2)] = c
                        back[(i2, j2)] = (i, j)
    # end: remaining syllables unanchored, remaining candidates skipped cheaply
    fin, arg = INF, None
    for (i, j), c in best.items():
        c2 = c + (un_pref[n] - un_pref[i + 1]) + P['pre_frac'] * (skip_pref[m] - skip_pref[j + 1])
        if c2 < fin:
            fin, arg = c2, (i, j)
    anch = {}
    node = arg
    while node is not None:
        anch[node[0]] = ct[node[1]]
        node = back[node]
    return fill(V, anch)


def fill(V, anch):
    """Unanchored syllables: mora-interpolate between anchors; ends use prediction offsets."""
    n = len(V.syls)
    out = [None] * n
    for i, x in anch.items():
        out[i] = x
    ks = sorted(anch)
    mp = [0]
    for x in V.mora:
        mp.append(mp[-1] + x)
    for i in range(n):
        if out[i] is not None:
            continue
        lk = max((k for k in ks if k < i), default=None)
        rk = min((k for k in ks if k > i), default=None)
        if lk is not None and rk is not None:
            f = (mp[i] - mp[lk]) / (mp[rk] - mp[lk])
            out[i] = anch[lk] + f * (anch[rk] - anch[lk])
        elif lk is not None:
            out[i] = anch[lk] + (V.pred[i] - V.pred[lk])
        elif rk is not None:
            out[i] = anch[rk] - (V.pred[rk] - V.pred[i])
        else:
            out[i] = V.pred[i]
    for i in range(1, n):
        if out[i] < out[i - 1]:
            out[i] = out[i - 1]
    return out, len(anch)
