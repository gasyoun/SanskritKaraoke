#!/usr/bin/env python3
"""
Auto-alignment CLI — port of the in-browser algorithm (ADR-0003).

Usage:
    python tools/align_chapter.py <audio_dir> [--verses verses/data] [--only id1,id2] [--write]

Audio files are matched to verse JSONs by filename stem (bhg_2_47.m4a → bhg_2_47.json).
By default, outputs sidecar patch JSONs (<id>_timing.json) next to the audio files.
With --write, writes the timing field directly into the verse JSONs.

Dependencies: ffmpeg (binary on PATH), numpy.
"""
import sys, os, json, argparse, subprocess, math

import numpy as np

# ── Windows UTF-8 ─────────────────────────────────────────────────────────────
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

# ── Script location helpers ───────────────────────────────────────────────────
TOOLS_DIR   = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT   = os.path.dirname(TOOLS_DIR)
PARAMS_FILE = os.path.join(TOOLS_DIR, 'alignment_params.json')
PHONEME_FILE = os.path.join(TOOLS_DIR, 'phoneme_rules.json')

def _load_params():
    with open(PARAMS_FILE, encoding='utf-8') as f:
        return json.load(f)

# ── Devanagari → IAST transliteration ────────────────────────────────────────
# Port of devToIast (app.js:48).  Table and logic are identical.
DEV_CONS = {
    'क':'k','ख':'kh','ग':'g','घ':'gh','ङ':'ṅ',
    'च':'c','छ':'ch','ज':'j','झ':'jh','ञ':'ñ',
    'ट':'ṭ','ठ':'ṭh','ड':'ḍ','ढ':'ḍh','ण':'ṇ',
    'त':'t','थ':'th','द':'d','ध':'dh','न':'n',
    'प':'p','फ':'ph','ब':'b','भ':'bh','म':'m',
    'य':'y','र':'r','ल':'l','व':'v',
    'श':'ś','ष':'ṣ','स':'s','ह':'h','ळ':'ḷ',
}
DEV_VOW_DEP = {
    'ा':'ā','ि':'i','ी':'ī','ु':'u','ू':'ū',
    'ृ':'ṛ','ॄ':'ṝ','ॢ':'ḷ','े':'e','ै':'ai','ो':'o','ौ':'au',
}
DEV_VOW_IND = {
    'अ':'a','आ':'ā','इ':'i','ई':'ī','उ':'u','ऊ':'ū',
    'ऋ':'ṛ','ॠ':'ṝ','ए':'e','ऐ':'ai','ओ':'o','औ':'au','ऌ':'ḷ',
}
VIRAMA = '्'  # ्
ANUSV  = 'ं'  # ं
VISARG = 'ः'  # ः

def dev_to_iast(text):
    """Convert Devanagari text to IAST. Port of devToIast (app.js:48)."""
    out = []
    chars = list(text)  # split by Unicode codepoints
    i = 0
    while i < len(chars):
        ch = chars[i]
        if ch in (' ', '\n'):
            out.append(' ')
            i += 1
            continue
        if ch in '।॥।॥':
            out.append(ch)
            i += 1
            continue
        if ch == 'ॐ':
            out.append('oṃ')
            i += 1
            continue
        if '०' <= ch <= '९':
            out.append(str(ord(ch) - 0x0966))
            i += 1
            continue
        if ch in DEV_VOW_IND:
            out.append(DEV_VOW_IND[ch])
            i += 1
            if i < len(chars) and chars[i] == ANUSV:
                out.append('ṃ')
                i += 1
            elif i < len(chars) and chars[i] == VISARG:
                out.append('ḥ')
                i += 1
            continue
        if ch in DEV_CONS:
            out.append(DEV_CONS[ch])
            i += 1
            if i < len(chars) and chars[i] == VIRAMA:
                i += 1
                continue  # pure consonant, no vowel
            if i < len(chars) and chars[i] in DEV_VOW_DEP:
                out.append(DEV_VOW_DEP[chars[i]])
                i += 1
            else:
                out.append('a')  # inherent 'a'
            if i < len(chars) and chars[i] == ANUSV:
                out.append('ṃ')
                i += 1
            elif i < len(chars) and chars[i] == VISARG:
                out.append('ḥ')
                i += 1
            continue
        i += 1  # skip unknown
    result = ''.join(out)
    # Collapse multiple spaces
    import re
    return re.sub(r'  +', ' ', result).strip()

# ── IAST syllabification ──────────────────────────────────────────────────────
# Port of syllabifyIast (app.js:101).  user_mode=True mirrors the browser default
# (syl-mode-std checkbox unchecked).
IAST_LONG_V  = ['ai','au','ā','ī','ū','ṝ','e','o']
IAST_SHORT_V = ['a','i','u','ṛ','ḷ']
IAST_ALL_V   = IAST_LONG_V + IAST_SHORT_V
IAST_CONS    = [
    'kh','gh','ch','jh','ṭh','ḍh','th','dh','ph','bh',
    'ṅ','ñ','ṇ','ś','ṣ','ṃ','ḥ',
    'k','g','c','j','ṭ','ḍ','t','d','p','b',
    'y','r','l','v','h','m','n','s',
]

def _starts_vowel(s):
    for v in IAST_ALL_V:
        if s.startswith(v):
            return v
    return None

def _starts_cons(s):
    for c in IAST_CONS:
        if s.startswith(c):
            return c
    return None

def _cluster_size(s):
    if s.startswith('ṃ') or s.startswith('ḥ'):
        return 0
    j, n = 0, 0
    while j < len(s):
        if _starts_vowel(s[j:]):
            return n
        if s[j:].startswith('ṃ') or s[j:].startswith('ḥ'):
            return n
        c = _starts_cons(s[j:])
        if not c:
            return n
        n += 1
        j += len(c)
    return n

def syllabify_iast(iast, user_mode=True):
    """
    Syllabify IAST text into a list of {'syl': str, 'type': 'guru'|'laghu'}.
    Port of syllabifyIast (app.js:101).
    user_mode=True matches the browser default (standard mode unchecked).
    """
    import re
    s = iast.lower()
    s = re.sub(r'\s+', ' ', s).strip()
    syls = []
    i = 0
    while i < len(s):
        if s[i] == ' ':
            i += 1
            continue
        if s[i] in '|.;।॥':
            i += 1
            continue

        # Leading consonants (cross word boundaries freely)
        cons1 = ''
        j = i
        while j < len(s):
            if s[j] == ' ':
                j += 1
                continue
            v = _starts_vowel(s[j:])
            if v:
                break
            c = _starts_cons(s[j:])
            if not c:
                break
            cons1 += c
            j += len(c)

        vow = _starts_vowel(s[j:])
        if not vow:
            i = j + 1
            continue
        is_long = vow in IAST_LONG_V
        j += len(vow)

        # Absorb ṃ/ḥ into vowel
        vow_suffix = ''
        if s[j:].startswith('ṃ'):
            vow_suffix = 'ṃ'
            j += len('ṃ')
        elif s[j:].startswith('ḥ'):
            vow_suffix = 'ḥ'
            j += len('ḥ')

        # Skip boundary marker before checking following consonants
        k = j
        while k < len(s) and s[k] == ' ':
            k += 1

        # Do not cross word boundary if a vowel follows immediately after it
        after_boundary = k > j
        next_is_vowel = _starts_vowel(s[k:]) is not None
        cons2 = ''
        if not after_boundary or not next_is_vowel:
            if k < len(s):
                c = _starts_cons(s[k:])
                if c:
                    cs = _cluster_size(s[k:])
                    if user_mode:
                        if not is_long and not vow_suffix and cs >= 2:
                            cons2 = c
                            k += len(c)
                    else:
                        if cs >= 2:
                            cons2 = c
                            k += len(c)

        # Word-final consonants
        while k < len(s):
            if s[k] == ' ':
                # Peek past boundary: if vowel follows, stop
                peek = k + 1
                while peek < len(s) and s[peek] == ' ':
                    peek += 1
                if peek < len(s) and _starts_vowel(s[peek:]):
                    break
                k += 1
                continue
            c = _starts_cons(s[k:])
            if not c:
                break
            after_c = s[k + len(c):]
            if _starts_vowel(after_c) or _cluster_size(after_c) > 0:
                break
            cons2 += c
            k += len(c)

        i = k
        heavy = is_long or len(vow_suffix) > 0 or len(cons2) > 0
        syls.append({'syl': cons1 + vow + vow_suffix + cons2, 'type': 'guru' if heavy else 'laghu'})

    return syls

def syllabify_verse(verse):
    """Return {'s1': [...], 's2': [...]} syllable lists from a verse JSON dict."""
    s1_dev = verse.get('s1', '')
    s2_dev = verse.get('s2', '')
    s1_iast = dev_to_iast(s1_dev)
    s2_iast = dev_to_iast(s2_dev)
    return {
        's1': syllabify_iast(s1_iast),
        's2': syllabify_iast(s2_iast),
    }

# ── Audio decode ──────────────────────────────────────────────────────────────
def decode_audio_ffmpeg(audio_path, sr=22050):
    """
    Decode audio file to float32 mono at sr Hz via ffmpeg subprocess.
    Returns (np.ndarray of float32, sample_rate).
    ffmpeg must be on PATH.
    """
    cmd = [
        'ffmpeg', '-i', audio_path,
        '-f', 'f32le', '-ac', '1', '-ar', str(sr),
        'pipe:1',
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0 and not result.stdout:
        stderr = result.stderr.decode('utf-8', errors='replace')
        raise RuntimeError(f'ffmpeg failed for {audio_path}:\n{stderr}')
    data = np.frombuffer(result.stdout, dtype=np.float32)
    return data, sr

# ── Onset / peak detection ────────────────────────────────────────────────────
# Port of detectOnsets (app.js:3688).
def detect_onsets(data, sr, params=None):
    """
    Detect onset and peak times in audio data (float32 mono).
    Returns (onsets, peaks) as lists of seconds.
    """
    if params is None:
        params = _load_params()['onset_detection']

    win_n = round(params['win_ms'] * 0.001 * sr)
    hop_n = round(params['hop_ms'] * 0.001 * sr)
    min_energy  = params['min_energy']
    onset_delta = params['onset_delta']
    min_gap_s   = params['min_gap_s']
    peak_min_e  = params['peak_min_energy']
    neighbors   = params['peak_neighbors']

    # Build RMS envelope
    n_frames = (len(data) - win_n) // hop_n
    if n_frames <= 0:
        return [], []

    times = np.arange(n_frames) * hop_n / sr
    energies = np.array([
        math.sqrt(np.sum(data[i*hop_n : i*hop_n + win_n] ** 2) / win_n)
        for i in range(n_frames)
    ])

    max_e = energies.max() if energies.max() > 0 else 1.0
    energies /= max_e

    onsets, peaks = [], []
    last_onset = -1.0

    for i in range(3, n_frames - 3):
        curr = energies[i]
        if curr < min_energy:
            continue
        rise = curr - energies[i - 3]

        # Onset: sharp positive rise, not too close to previous onset
        if rise > onset_delta and times[i] - last_onset > min_gap_s:
            onsets.append(float(times[i]))
            last_onset = float(times[i])

        # Peak: local maximum above noise floor
        nb = neighbors
        if (curr > energies[i-1] and curr > energies[i-2]
                and curr > energies[i+1] and curr > energies[i+2]
                and curr > peak_min_e):
            peaks.append(float(times[i]))

    return onsets, peaks

# ── Pada boundary detection ───────────────────────────────────────────────────
# Port of detectPadaBounds (app.js:4391).
def detect_pada_bounds(data, sr, params=None):
    """
    Detect 4 pada boundaries (4 x [t0, t1]) by iterative silence-threshold search.
    Returns list of [t0, t1] pairs, or None if detection fails (fallback to caller).
    """
    if params is None:
        params = _load_params()['pada_detection']

    frame_size = round(sr * params['frame_ms'] * 0.001)
    num_frames = len(data) // frame_size
    if num_frames < 8:
        return None

    frame_dur = frame_size / sr
    duration  = len(data) / sr

    # RMS per 10 ms frame
    rms = np.array([
        math.sqrt(np.sum(data[f*frame_size : (f+1)*frame_size] ** 2) / frame_size)
        for f in range(num_frames)
    ])

    max_rms = rms.max()
    if max_rms == 0:
        return None
    norm = rms / max_rms

    min_pada_dur = duration * params['min_pada_fraction']

    def try_thresh(thresh):
        sil = norm < thresh

        # Trim leading/trailing silence
        first = 0
        while first < num_frames and sil[first]:
            first += 1
        last = num_frames - 1
        while last >= 0 and sil[last]:
            last -= 1
        if first >= last:
            return None

        # Collect silence ranges inside [first..last]
        ranges = []
        i = first
        while i <= last:
            if sil[i]:
                s = i
                while i <= last and sil[i]:
                    i += 1
                ranges.append((s, i - 1, i - s))  # (start, end, len)
            else:
                i += 1

        if len(ranges) < 3:
            return None

        # Top 3 longest silence ranges, then sorted by time
        top3 = sorted(ranges, key=lambda r: -r[2])[:3]
        top3 = sorted(top3, key=lambda r: r[0])  # by start time

        padas = [
            (first * frame_dur,   top3[0][0] * frame_dur),
            (top3[0][1] * frame_dur, top3[1][0] * frame_dur),
            (top3[1][1] * frame_dur, top3[2][0] * frame_dur),
            (top3[2][1] * frame_dur, last * frame_dur),
        ]

        if all((p[1] - p[0]) >= min_pada_dur for p in padas):
            return padas
        return None

    t = params['silence_thresh_min']
    t_max = params['silence_thresh_max']
    t_step = params['silence_thresh_step']
    padas = None
    used_thresh = t
    while t <= t_max + 1e-9:
        result = try_thresh(t)
        if result:
            padas = result
            used_thresh = t
            break
        t = round(t + t_step, 6)

    if padas:
        return [[p[0], p[1]] for p in padas], used_thresh
    return None, None

# ── Mora-proportional timing ──────────────────────────────────────────────────
# Port of calcAutoTiming (app.js:4480).
def calc_auto_timing(syls_s1, syls_s2, pada_bounds, last_laghu_as_guru=False, params=None):
    """
    Distribute syllable timings proportionally by mora weight (guru=2, laghu=1).
    pada_bounds: list of 4 [t0, t1] pairs.
    Returns {'s1': [...], 's2': [...]} with per-syllable onset times.
    """
    if params is None:
        params = _load_params()['mora']

    half1 = math.ceil(len(syls_s1) / 2)
    half2 = math.ceil(len(syls_s2) / 2)

    padas = [
        {'syls': syls_s1[:half1],   't0': pada_bounds[0][0], 't1': pada_bounds[0][1], 'key': 's1', 'from': 0},
        {'syls': syls_s1[half1:],   't0': pada_bounds[1][0], 't1': pada_bounds[1][1], 'key': 's1', 'from': half1},
        {'syls': syls_s2[:half2],   't0': pada_bounds[2][0], 't1': pada_bounds[2][1], 'key': 's2', 'from': 0},
        {'syls': syls_s2[half2:],   't0': pada_bounds[3][0], 't1': pada_bounds[3][1], 'key': 's2', 'from': half2},
    ]

    g = params['guru']
    l = params['laghu']

    times = {
        's1': [0.0] * len(syls_s1),
        's2': [0.0] * len(syls_s2),
    }

    for pada in padas:
        syls = pada['syls']
        if not syls:
            continue
        t0, t1 = pada['t0'], pada['t1']
        key   = pada['key']
        frm   = pada['from']

        units = []
        for idx, syl in enumerate(syls):
            if syl['type'] == 'guru':
                units.append(g)
            elif last_laghu_as_guru and idx == len(syls) - 1 and syl['type'] == 'laghu':
                units.append(g)
            else:
                units.append(l)

        total_units = sum(units)
        unit_dur = (t1 - t0) / total_units if total_units > 0 else 0.0
        acc = 0.0
        for idx, syl in enumerate(syls):
            times[key][frm + idx] = t0 + acc * unit_dur
            acc += units[idx]

    return times

# ── Corpus-scaling ────────────────────────────────────────────────────────────
# Port of corpusScaleTiming (app.js:3780).
def corpus_scale_timing(meter, s1len, s2len, duration, verses_dir):
    """
    Find a verse in the corpus with the same meter and syllable count that has
    hand-timed timings, then scale its timings proportionally to match duration.
    Returns {'s1': [...], 's2': [...]} or None.
    """
    index_path = os.path.join(os.path.dirname(verses_dir), 'index.json')
    if not os.path.exists(index_path):
        return None
    try:
        with open(index_path, encoding='utf-8') as f:
            index = json.load(f)
    except Exception:
        return None

    candidates = [v for v in index.get('verses', []) if v.get('meter') == meter and v.get('id')]
    for candidate in candidates:
        vpath = os.path.join(verses_dir, f"{candidate['id']}.json")
        if not os.path.exists(vpath):
            continue
        try:
            with open(vpath, encoding='utf-8') as f:
                v = json.load(f)
        except Exception:
            continue
        timing = v.get('timing')
        if not timing:
            continue
        if len(timing.get('s1', [])) != s1len or len(timing.get('s2', [])) != s2len:
            continue
        ref_dur = v.get('audio', {}).get('duration_s')
        if not ref_dur:
            continue
        scale = duration / ref_dur
        return {
            's1': [t * scale for t in timing['s1']],
            's2': [t * scale for t in timing['s2']],
        }
    return None

# ── Phoneme rule snap ─────────────────────────────────────────────────────────
# Port of _getPhonemeRule / _snapToNearest / _snapConfidence (app.js:3737+3773).
def load_phoneme_rules(path=None):
    if path is None:
        path = PHONEME_FILE
    with open(path, encoding='utf-8') as f:
        return json.load(f)['rules']

def get_phoneme_rule(syl_iast, rules):
    first = syl_iast.strip()[:1] if syl_iast.strip() else ''
    return rules.get(first) or rules.get(first.lower()) or rules.get('default', {'align_to': 'onset', 'offset_ms': 0})

def snap_to_nearest(t, candidates, window_s):
    best, best_dist = None, window_s
    for c in candidates:
        d = abs(c - t)
        if d < best_dist:
            best = c
            best_dist = d
    return best, best_dist

def snap_confidence(dist, params=None):
    if params is None:
        params = _load_params()['snap']
    bands  = params['confidence_bands_s']
    values = params['confidence_values']
    for band, val in zip(bands, values):
        if dist <= band:
            return val
    return values[-1]

# ── Full alignment pipeline ───────────────────────────────────────────────────
def align_verse(audio_path, verse, verses_dir, params=None, verbose=False):
    """
    Run the full 4-layer alignment pipeline for a single verse.
    Returns {'timing': {...}, 'confidence': {...}, 'used_thresh': float, 'meta': {...}}
    or raises RuntimeError on failure (e.g. pada detection failed with no fallback).
    """
    if params is None:
        params = _load_params()

    decode_cfg = params.get('decode', {})
    sr = decode_cfg.get('sample_rate', 22050)

    # Decode audio
    data, sr = decode_audio_ffmpeg(audio_path, sr=sr)
    duration  = len(data) / sr

    if verbose:
        print(f'  audio: {duration:.2f}s  ({len(data)} samples @ {sr} Hz)', file=sys.stderr)

    # Syllabify verse text
    syllables = syllabify_verse(verse)
    syls_s1   = syllables['s1']
    syls_s2   = syllables['s2']

    if not syls_s1 and not syls_s2:
        raise RuntimeError('No syllables found in verse text')

    # Layer 1: Mora-proportional base (needs pada bounds first)
    pada_result, used_thresh = detect_pada_bounds(data, sr, params['pada_detection'])

    fallback_used = False
    if pada_result is None:
        # Fallback: uniform division (same as browser fallback)
        fallback_used = True
        pada_result = [[duration * i / 4, duration * (i + 1) / 4] for i in range(4)]
        used_thresh = None
        if verbose:
            print('  WARNING: pada detection failed, using uniform fallback', file=sys.stderr)

    times = calc_auto_timing(syls_s1, syls_s2, pada_result, params=params['mora'])

    # Layer 2: Corpus scaling (overwrite linear with scaled corpus timings if available)
    meter = verse.get('meter', '')
    scaled = corpus_scale_timing(meter, len(syls_s1), len(syls_s2), duration, verses_dir)
    if scaled:
        times = scaled
        if verbose:
            print(f'  corpus scale applied (meter={meter})', file=sys.stderr)

    # Layer 3: Onset / peak detection
    onsets, peaks = detect_onsets(data, sr, params['onset_detection'])
    if verbose:
        print(f'  onsets: {len(onsets)}  peaks: {len(peaks)}', file=sys.stderr)

    # Layer 4: Phoneme-rule snap
    rules      = load_phoneme_rules()
    snap_params = params['snap']
    window_s   = snap_params['window_s']
    no_cand_conf = snap_params.get('no_candidate_confidence', 0.2)

    confidence = {'s1': [], 's2': []}

    for key in ('s1', 's2'):
        syls  = syllables[key]
        tlist = times.get(key, [])
        conf  = []
        for i, syl in enumerate(syls):
            t0   = tlist[i] if i < len(tlist) else 0.0
            rule = get_phoneme_rule(syl['syl'], rules)
            candidates = peaks if rule.get('align_to') == 'peak' else onsets
            snapped, dist = snap_to_nearest(t0, candidates, window_s)
            offset_s = (rule.get('offset_ms', 0) or 0) / 1000.0
            if snapped is not None:
                times[key][i] = snapped + offset_s
                conf.append(snap_confidence(dist, snap_params))
            else:
                conf.append(no_cand_conf)
        confidence[key] = conf

    timing = {
        's1': times['s1'],
        's2': times['s2'],
        'confidence': confidence,
        'auto_generated': True,
        'generator': 'cli-v1',
    }

    uncertain_count = sum(
        1 for k in ('s1', 's2') for c in confidence[k] if c < 0.5
    )
    mean_conf = 0.0
    all_conf  = confidence['s1'] + confidence['s2']
    if all_conf:
        mean_conf = sum(all_conf) / len(all_conf)

    return {
        'timing':      timing,
        'confidence':  confidence,
        'used_thresh': used_thresh,
        'fallback':    fallback_used,
        'meta': {
            'mean_confidence':  round(mean_conf, 3),
            'uncertain_count':  uncertain_count,
            'total_syllables':  len(all_conf),
            'duration_s':       round(duration, 3),
        },
    }

# ── CLI entry point ───────────────────────────────────────────────────────────
AUDIO_EXTS = {'.m4a', '.mp3', '.wav', '.flac', '.ogg', '.aac', '.opus'}

def main():
    parser = argparse.ArgumentParser(description='Auto-align Sanskrit verse audio (ADR-0003)')
    parser.add_argument('audio_dir', help='Directory containing audio files')
    parser.add_argument('--verses', default=os.path.join(REPO_ROOT, 'verses', 'data'),
                        help='Verse data directory (default: verses/data)')
    parser.add_argument('--only', default='',
                        help='Comma-separated list of verse IDs to process')
    parser.add_argument('--write', action='store_true',
                        help='Write timing directly into verse JSON (default: sidecar patch)')
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='Verbose output')
    args = parser.parse_args()

    audio_dir  = args.audio_dir
    verses_dir = args.verses
    only_ids   = set(x.strip() for x in args.only.split(',') if x.strip())

    if not os.path.isdir(audio_dir):
        print(f'ERROR: audio_dir not found: {audio_dir}', file=sys.stderr)
        sys.exit(1)
    if not os.path.isdir(verses_dir):
        print(f'ERROR: verses dir not found: {verses_dir}', file=sys.stderr)
        sys.exit(1)

    params = _load_params()

    # Collect audio files
    audio_files = {}
    for fname in os.listdir(audio_dir):
        stem, ext = os.path.splitext(fname)
        if ext.lower() in AUDIO_EXTS:
            audio_files[stem] = os.path.join(audio_dir, fname)

    if only_ids:
        audio_files = {k: v for k, v in audio_files.items() if k in only_ids}

    if not audio_files:
        print('No matching audio files found.', file=sys.stderr)
        sys.exit(0)

    results   = []
    failed    = []
    had_failure = False

    for verse_id, audio_path in sorted(audio_files.items()):
        verse_path = os.path.join(verses_dir, f'{verse_id}.json')
        if not os.path.exists(verse_path):
            print(f'SKIP {verse_id}: no verse JSON at {verse_path}', file=sys.stderr)
            continue

        with open(verse_path, encoding='utf-8') as f:
            verse = json.load(f)

        print(f'{verse_id} …', end=' ', flush=True)
        if args.verbose:
            print(file=sys.stderr)

        try:
            result = align_verse(audio_path, verse, verses_dir, params=params, verbose=args.verbose)
        except Exception as e:
            print(f'ERROR: {e}', file=sys.stderr)
            failed.append(verse_id)
            had_failure = True
            continue

        timing = result['timing']
        meta   = result['meta']
        fallback = result['fallback']

        status = 'FALLBACK' if fallback else f'thresh={result["used_thresh"]:.2f}'
        print(
            f'conf={meta["mean_confidence"]:.2f}  '
            f'uncertain={meta["uncertain_count"]}/{meta["total_syllables"]}  '
            f'{status}'
        )

        if fallback:
            had_failure = True
            failed.append(verse_id)

        if args.write:
            verse['timing'] = timing
            with open(verse_path, 'w', encoding='utf-8') as f:
                json.dump(verse, f, ensure_ascii=False, indent=2)
            if args.verbose:
                print(f'  wrote timing to {verse_path}', file=sys.stderr)
        else:
            # Sidecar patch next to the audio file
            patch_path = os.path.join(audio_dir, f'{verse_id}_timing.json')
            with open(patch_path, 'w', encoding='utf-8') as f:
                json.dump({'id': verse_id, 'timing': timing}, f, ensure_ascii=False, indent=2)
            if args.verbose:
                print(f'  wrote sidecar {patch_path}', file=sys.stderr)

        results.append({'id': verse_id, **meta})

    print()
    print(f'Done: {len(results)} aligned, {len(failed)} failed/fallback.')
    if failed:
        print(f'Check manually: {", ".join(failed)}')

    sys.exit(1 if had_failure else 0)

if __name__ == '__main__':
    main()
