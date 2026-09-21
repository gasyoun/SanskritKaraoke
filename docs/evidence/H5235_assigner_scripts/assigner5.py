"""H5235 revision 1 of design 2b: breath-tolerant pada pauses + unscripted-insert allowance.

Changes vs assigner3 (2b), both from the 10-verse gold diagnosis:
1. Pada credit saturates at `full_pause` (grid 0.15-0.4 s) and the in-pada pause penalty at
   `cross_full`, so a short real pada pause and a long in-word breath (0292 «kar|tav» 650 ms,
   0605 «mar|ji» 510 ms) earn the same credit; tempo and prediction then pick the boundary
   instead of pause length alone.
2. At a pada crossing, time beyond 1.5x the expected span (an unscripted phrase, 0513
   15.6-17.4 s) is forgiven up to `ins_max` s at `ins_pen` per second instead of the full
   log-tempo penalty."""
import math
import numpy as np
from assigner import Verse as _V, fill, silence_between, onset_class, HOP  # noqa

SIL_DB = -26.0


def candidates2(t, db, lo, hi, min_rise=4.0, look=0.08):
    """(t_attack, depth_dB, pause_before_s)."""
    k = int(look / HOP)
    sil = db < SIL_DB
    out = []
    for i in range(2, len(db) - k):
        if not (lo <= t[i] <= hi):
            continue
        if db[i] <= db[i - 1] and db[i] <= db[i - 2] and db[i] < db[i + 1]:
            j = i + int(np.argmax(db[i:i + k]))
            rise = db[j] - db[i]
            if rise < min_rise or db[j] < -40:
                continue
            ta = t[i]
            pause = 0.0
            if sil[i]:
                r = i + int(np.argmax(db[i:j + 1] >= db[i] + 6.0))
                ta = t[max(i, r - 1)]
                q = i
                while q > 0 and (sil[q] or db[q] < SIL_DB + 3):
                    q -= 1
                pause = (i - q) * HOP
            out.append((float(ta), float(rise), float(pause)))
    merged = []
    for c in out:
        if merged and c[0] - merged[-1][0] < 0.025:
            if c[1] + 10 * c[2] > merged[-1][1] + 10 * merged[-1][2]:
                merged[-1] = c
        else:
            merged.append(c)
    return merged


class Verse(_V):
    def __init__(self, vid):
        super().__init__(vid)
        n2 = len(self.syls) - self.n1
        self.pada_start = {0, self.n1 // 2, self.n1, self.n1 + n2 // 2}
        self.pada_end = {k - 1 for k in self.pada_start if k > 0} | {len(self.syls) - 1}


DEFAULT = dict(wp=0.1, cap=0.6, a_skip=0.3, d0=5.0, b_un=1.2, wt=1.0,
               expect={'stop': 12.0, 'fric': 10.0, 'son': 6.0, 'vowel': 0.0},
               wc=0.6, K=4, L=16, pre_frac=0.2, pada_bonus=1.0, min_pause=0.2,
               cross_pen=0.75, full_pause=0.25, cross_full=0.25, pf=1.4,
               ins_max=2.5, ins_pen=0.5)

GRID = dict(wp=[0.03, 0.1, 0.2], wt=[0.5, 1.0, 1.5], pada_bonus=[0.5, 1.0, 2.0],
            cross_pen=[0.3, 0.75, 1.5], full_pause=[0.15, 0.25, 0.4], ins_pen=[0.3, 0.8, 99.0])


def assign(V, P=DEFAULT):
    t, db = V.t, V.db
    C = candidates2(t, db, V.lead - 0.4, V.region_end + 0.5)
    ct = [c[0] for c in C]
    n, m = len(V.syls), len(C)
    pred = V.pred
    span0, span1 = min(pred) - 0.2, max(pred) + 0.8
    speech = (span1 - span0) - silence_between(t, db, span0, span1, SIL_DB)
    tau = speech / sum(V.mora)

    skip_pref = [0.0]
    for c in C:
        skip_pref.append(skip_pref[-1] + P['a_skip'] * max(0.0, c[1] - P['d0']) / 10.0)
    un_pref = [0.0]
    for i in range(n):
        un_pref.append(un_pref[-1] + P['b_un'] * (0.4 if V.cls[i] in ('son', 'vowel') else 1.0))
    mw = [x * (P['pf'] if i in V.pada_end else 1.0) for i, x in enumerate(V.mora)]
    tau = speech / sum(mw)
    mora_pref = [0]
    for x in mw:
        mora_pref.append(mora_pref[-1] + x)

    def match(i, j):
        d = abs(ct[j] - pred[i])
        c = P['wp'] * min(d, P['cap']) / 0.1 * 0.3
        c += P['wc'] * max(0.0, P['expect'][V.cls[i]] - C[j][1]) / 10.0
        if i in V.pada_start:
            c -= P['pada_bonus'] * min(1.0, C[j][2] / P['full_pause'])
        return c

    sil_cache = {}

    def sil(j0, j1):
        if (j0, j1) not in sil_cache:
            sil_cache[(j0, j1)] = silence_between(t, db, ct[j0], ct[j1], SIL_DB)
        return sil_cache[(j0, j1)]

    def trans(i0, j0, i1, j1):
        s = sil(j0, j1)
        eff = max(ct[j1] - ct[j0] - s, 0.03)
        exp = tau * (mora_pref[i1] - mora_pref[i0])
        crosses_pada = any(k in V.pada_start for k in range(i0 + 1, i1 + 1))
        c = 0.0
        if crosses_pada and eff > 1.5 * exp:
            ins = min(P['ins_max'], eff - 1.5 * exp)
            c += P['ins_pen'] * ins
            eff -= ins
        c += P['wt'] * abs(math.log(eff / exp))
        # a long pause inside a pada (no pada start in (i0, i1]) is unlikely
        if not crosses_pada:
            c += P['cross_pen'] * min(1.0, s / P['cross_full'])
        return c

    INF = float('inf')
    best, back = {}, {}
    for i in range(min(n, P['K'] + 2)):
        for j in range(m):
            best[(i, j)] = un_pref[i] + P['pre_frac'] * skip_pref[j] + match(i, j)
            back[(i, j)] = None
    for i in range(n):
        for j in range(m):
            if (i, j) not in best:
                continue
            base = best[(i, j)]
            for i2 in range(i + 1, min(n, i + P['K'] + 1)):
                u = un_pref[i2] - un_pref[i + 1]
                for j2 in range(j + 1, min(m, j + P['L'] + 1)):
                    c = base + u + (skip_pref[j2] - skip_pref[j + 1]) + trans(i, j, i2, j2) + match(i2, j2)
                    if c < best.get((i2, j2), INF):
                        best[(i2, j2)] = c
                        back[(i2, j2)] = (i, j)
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
