"""H5227 labelling aid: 20 ms RMS envelope, valleys, per-window plots."""
import sys, os, json
sys.stdout.reconfigure(encoding='utf-8')
WT = os.environ.get('KARAOKE_WT', os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))
sys.path.insert(0, os.path.join(WT, 'tools'))
import numpy as np
import align_chapter as ac

SP = os.environ['H5235_SP']  # scratch dir: cache/, plots/
AUDIO = os.environ.get('H5235_AUDIO', '/tmp/opencode/h5223check/audio_batch')
SR = 22050
WIN, HOP = 0.020, 0.005


def load(vid):
    data, sr = ac.decode_audio_ffmpeg(os.path.join(AUDIO, vid + '.mp3'), sr=SR)
    return data


def envelope(data):
    w, h = int(WIN * SR), int(HOP * SR)
    n = (len(data) - w) // h
    fr = np.lib.stride_tricks.sliding_window_view(data, w)[::h][:n]
    rms = np.sqrt((fr.astype(np.float64) ** 2).mean(axis=1))
    t = np.arange(n) * HOP + WIN / 2
    db = 20 * np.log10(rms / rms.max() + 1e-6)
    return t, db


def valleys(t, db, min_rise=4.0, look=0.08, floor=-45):
    """Local minima followed by a >= min_rise dB rise within `look` s.
    Returns (t_min, depth_db, t_rise) where t_rise = first frame where the
    envelope is back half-way up the rise."""
    out = []
    k = int(look / HOP)
    for i in range(2, len(db) - k):
        if db[i] <= db[i - 1] and db[i] <= db[i - 2] and db[i] < db[i + 1]:
            j = i + int(np.argmax(db[i:i + k]))
            rise = db[j] - db[i]
            if rise >= min_rise and db[j] > floor:
                half = db[i] + rise / 2
                r = i + int(np.argmax(db[i:j + 1] >= half))
                out.append((round(float(t[i]), 3), round(float(rise), 1), round(float(t[r]), 3)))
    return out


def syl_list(vid):
    verse = json.load(open(os.path.join(WT, 'verses/data', vid + '.json')))
    s = ac.syllabify_verse(verse)
    return [x['syl'] for x in s['s1'] + s['s2']], verse


if __name__ == '__main__':
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    vid, t0, t1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    data = load(vid)
    t, db = envelope(data)
    cache = json.load(open(os.path.join(SP, 'cache', vid + '.json')))
    syls, _ = syl_list(vid)
    base = cache['baseline_json']['s1'] + cache['baseline_json']['s2']
    lead = cache['lead_end_s'] or 0.0
    m = (t >= t0) & (t <= t1)
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(18, 7), sharex=True,
                                 gridspec_kw={'height_ratios': [2, 1.3]})
    a1.plot(t[m], db[m], 'k', lw=1)
    a1.set_ylim(-60, 2)
    for tv, dep, tr in valleys(t, db):
        if t0 <= tv <= t1:
            a1.axvline(tv, color='tab:blue', lw=0.6, ls=':')
            a1.text(tv, -58, f'{tv:.2f}', rotation=90, fontsize=7, color='tab:blue')
    for i, (s, bt) in enumerate(zip(syls, base)):
        if t0 <= bt <= t1:
            a1.axvline(bt, color='tab:red', lw=0.8, alpha=0.6)
            a1.text(bt, -2 - 5 * (i % 3), f'{i}:{s}', color='tab:red', fontsize=9)
    for w, ws, we in (cache['whisper'] or []):
        ws += lead; we += lead
        if we >= t0 and ws <= t1:
            a1.axvspan(ws, we, color='tab:green', alpha=0.07)
            a1.text(max(ws, t0), -20, w, color='tab:green', fontsize=8)
    a1.set_xticks(np.arange(np.floor(t0 * 10) / 10, t1, 0.1), minor=True)
    a1.grid(which='both', axis='x', alpha=0.3)
    seg = data[int(t0 * SR):int(t1 * SR)]
    a2.specgram(seg, NFFT=512, Fs=SR, noverlap=448, xextent=(t0, t1), cmap='magma', vmin=-110)
    a2.set_ylim(0, 6000)
    a2.set_xticks(np.arange(np.ceil(t0 * 10) / 10, t1, 0.1), minor=True)
    a2.grid(which='both', axis='x', alpha=0.4, color='w')
    a1.set_xlim(t0, t1)
    out = os.path.join(SP, 'plots', f'{vid}_{t0:.1f}_{t1:.1f}.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    plt.tight_layout(); plt.savefig(out, dpi=80)
    print(out)
    print('valleys', [v for v in valleys(t, db) if t0 <= v[0] <= t1])
