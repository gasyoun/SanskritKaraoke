"""Generate assigner6.py (H5235 revision 2) from assigner5.py by source patching, so the diff
between revisions stays reviewable: `python make_assigner6.py`."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'assigner5.py'), encoding='utf-8').read()


def sub(old, new):
    global src
    assert old in src, old
    src = src.replace(old, new)


sub('"""H5235 revision 1 of design 2b:', '''"""H5235 revision 2 = revision 1 plus:
3. At a pada crossing a fraction `keep_sil` of the silence counts as the pada-final
   syllable's duration (pada-final lengthening surfaces as a pause: 0292 «yuḥ» is voiced
   short and the 185 ms pause carries the lengthening, which the silence-free tempo term
   read as "too short" and so preferred the 650 ms in-word breath as the pada boundary).
4. The grid also tunes the prediction-pull cap (0513: whisper had pada 4 right, the
   0.6 s cap let the DP pull it 1.9 s early at negligible cost).

Revision 1 was:''')
sub("ins_max=2.5, ins_pen=0.5)", "ins_max=2.5, ins_pen=0.5, keep_sil=0.6)")
sub("""GRID = dict(wp=[0.03, 0.1, 0.2], wt=[0.5, 1.0, 1.5], pada_bonus=[0.5, 1.0, 2.0],
            cross_pen=[0.3, 0.75, 1.5], full_pause=[0.15, 0.25, 0.4], ins_pen=[0.3, 0.8, 99.0])""",
    """GRID = dict(wp=[0.03, 0.1, 0.2], cap=[0.6, 1.5, 3.0], wt=[0.5, 1.0, 1.5],
            cross_pen=[0.3, 0.75, 1.5], keep_sil=[0.0, 0.6, 1.0], ins_pen=[0.3, 0.8, 99.0])""")
sub("""        s = sil(j0, j1)
        eff = max(ct[j1] - ct[j0] - s, 0.03)
        exp = tau * (mora_pref[i1] - mora_pref[i0])
        crosses_pada = any(k in V.pada_start for k in range(i0 + 1, i1 + 1))""",
    """        s = sil(j0, j1)
        crosses_pada = any(k in V.pada_start for k in range(i0 + 1, i1 + 1))
        eff = max(ct[j1] - ct[j0] - s * (1.0 - P['keep_sil'] if crosses_pada else 1.0), 0.03)
        exp = tau * (mora_pref[i1] - mora_pref[i0])""")
open(os.path.join(HERE, 'assigner6.py'), 'w', encoding='utf-8').write(src)
print('wrote assigner6.py')
