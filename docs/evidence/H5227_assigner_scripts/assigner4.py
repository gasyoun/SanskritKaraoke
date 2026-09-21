"""H5227 design 3: design 2b + high-band release-burst evidence + capped (robust) tempo cost."""
import math
import numpy as np
import assigner3 as base
from assigner3 import candidates2, silence_between, fill, SIL_DB, HOP
from envtool import load, SR, WIN

STOPCLS = ('stop',)


def hf_envelope(data, lo_hz=2500.0, hi_hz=8000.0):
    """High-band energy (dB) on the same 20 ms / 5 ms grid as envelope()."""
    w, h = int(WIN * SR), int(HOP * SR)
    n = (len(data) - w) // h
    fr = np.lib.stride_tricks.sliding_window_view(data, w)[::h][:n].astype(np.float64)
    spec = np.abs(np.fft.rfft(fr * np.hanning(w), axis=1)) ** 2
    f = np.fft.rfftfreq(w, 1.0 / SR)
    band = spec[:, (f >= lo_hz) & (f <= hi_hz)].sum(axis=1)
    return 10 * np.log10(band / band.max() + 1e-9)


class Verse(base.Verse):
    def __init__(self, vid):
        super().__init__(vid)
        self.hf = hf_envelope(load(vid))


def burst(V, ta):
    """HF rise at a candidate: max HF in [ta-10ms, ta+30ms] minus mean HF in [ta-60ms, ta-15ms]."""
    i = int(round((ta - WIN / 2) / HOP))
    a, b = max(0, i - 12), max(1, i - 3)
    c, d = max(0, i - 2), min(len(V.hf), i + 7)
    if d <= c or b <= a:
        return 0.0
    return float(V.hf[c:d].max() - V.hf[a:b].mean())


DEFAULT = dict(base.DEFAULT, wb=0.5, b0=6.0, tcap=1.0)
DEFAULT.update(wp=0.1, wt=1.0, a_skip=0.3, pada_bonus=0.5, cross_pen=0.75, pf=1.5)
GRID = dict(wp=[0.03, 0.1], wt=[0.75, 1.0, 1.5], a_skip=[0.3, 0.45],
            pada_bonus=[0.5, 1.0], cross_pen=[0.3, 0.75, 1.5], wb=[0.0, 0.5, 1.0], tcap=[0.7, 1.0, 9.0])


def assign(V, P=DEFAULT):
    t, db = V.t, V.db
    C = candidates2(t, db, V.lead - 0.4, V.region_end + 0.5)
    ct = [c[0] for c in C]
    bu = [burst(V, x) for x in ct]
    n, m = len(V.syls), len(C)
    pred = V.pred
    span0, span1 = min(pred) - 0.2, max(pred) + 0.8
    speech = (span1 - span0) - silence_between(t, db, span0, span1, SIL_DB)
    mw = [x * (P['pf'] if i in V.pada_end else 1.0) for i, x in enumerate(V.mora)]
    tau = speech / sum(mw)
    mora_pref = [0]
    for x in mw:
        mora_pref.append(mora_pref[-1] + x)
    skip_pref = [0.0]
    for k, c in enumerate(C):
        s = P['a_skip'] * max(0.0, c[1] - P['d0']) / 10.0
        s += P['a_skip'] * P['wb'] * max(0.0, bu[k] - P['b0']) / 10.0   # an unused burst must be explained too
        skip_pref.append(skip_pref[-1] + s)
    un_pref = [0.0]
    for i in range(n):
        un_pref.append(un_pref[-1] + P['b_un'] * (0.4 if V.cls[i] in ('son', 'vowel') else 1.0))

    def match(i, j):
        d = abs(ct[j] - pred[i])
        c = P['wp'] * min(d, P['cap']) / 0.1 * 0.3
        c += P['wc'] * max(0.0, P['expect'][V.cls[i]] - C[j][1]) / 10.0
        if V.cls[i] in STOPCLS:
            c -= P['wb'] * max(0.0, bu[j] - P['b0']) / 10.0
        if i in V.pada_start:
            c -= P['pada_bonus'] * min(1.0, C[j][2] / P['full_pause'])
        return c

    sil_cache = {}

    def trans(i0, j0, i1, j1):
        if (j0, j1) not in sil_cache:
            sil_cache[(j0, j1)] = silence_between(t, db, ct[j0], ct[j1], SIL_DB)
        s = sil_cache[(j0, j1)]
        eff = max(ct[j1] - ct[j0] - s, 0.03)
        exp = tau * (mora_pref[i1] - mora_pref[i0])
        c = P['wt'] * min(abs(math.log(eff / exp)), P['tcap'])
        if not any(k in V.pada_start for k in range(i0 + 1, i1 + 1)):
            c += P['cross_pen'] * min(1.0, s / P['full_pause'])
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
            b0 = best[(i, j)]
            for i2 in range(i + 1, min(n, i + P['K'] + 1)):
                u = un_pref[i2] - un_pref[i + 1]
                for j2 in range(j + 1, min(m, j + P['L'] + 1)):
                    c = b0 + u + (skip_pref[j2] - skip_pref[j + 1]) + trans(i, j, i2, j2) + match(i2, j2)
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
