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
import sys, os, json, argparse, subprocess, math, re

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
    Operates on the VERSE-ONLY audio region — the caller strips a spoken header
    word first (see detect_lead_end) and shifts returned times back.
    Returns ([t0,t1] pairs, used_thresh) or (None, None) on failure.
    """
    if params is None:
        params = _load_params()['pada_detection']

    frame_size = round(sr * params['frame_ms'] * 0.001)
    num_frames = len(data) // frame_size
    if num_frames < 8:
        return None, None

    frame_dur = frame_size / sr

    # RMS per 10 ms frame
    rms = np.array([
        math.sqrt(np.sum(data[f*frame_size : (f+1)*frame_size] ** 2) / frame_size)
        for f in range(num_frames)
    ])

    max_rms = rms.max()
    if max_rms == 0:
        return None, None
    norm = rms / max_rms

    duration  = len(data) / sr
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


def detect_lead_end(data, sr, params=None):
    """
    Detect the end of a spoken header word before pada 1 (e.g. Usha reciting
    «subhāṣitam» first): the first silence gap ≥ lead_gap_min_ms whose start
    lies within the first lead_max_fraction of the audio; micro-pauses inside
    the header word itself are shorter and are skipped. The silence-threshold
    range is scanned and the MEDIAN candidate gap-end is returned (robust to
    threshold jitter). Returns seconds, or None when no candidate exists.
    """
    if params is None:
        params = _load_params()['pada_detection']

    lead_gap_min_s = params.get('lead_gap_min_ms', 120) / 1000.0

    frame_size = round(sr * params['frame_ms'] * 0.001)
    num_frames = len(data) // frame_size
    if num_frames < 8:
        return None

    frame_dur = frame_size / sr
    duration  = len(data) / sr
    lead_gap_max_start = duration * params.get('lead_max_fraction', 0.25)

    rms = np.array([
        math.sqrt(np.sum(data[f*frame_size : (f+1)*frame_size] ** 2) / frame_size)
        for f in range(num_frames)
    ])
    max_rms = rms.max()
    if max_rms == 0:
        return None
    norm = rms / max_rms

    candidates = []
    t = params['silence_thresh_min']
    t_max = params['silence_thresh_max']
    t_step = params['silence_thresh_step']
    while t <= t_max + 1e-9:
        sil = norm < t
        first = 0
        while first < num_frames and sil[first]:
            first += 1
        last = num_frames - 1
        while last >= 0 and sil[last]:
            last -= 1
        if first < last:
            i = first
            while i <= last:
                if sil[i]:
                    s = i
                    while i <= last and sil[i]:
                        i += 1
                    gap_len  = (i - s) * frame_dur
                    gap_start = s * frame_dur
                    if gap_len >= lead_gap_min_s and gap_start <= lead_gap_max_start:
                        candidates.append((i - 1) * frame_dur)  # gap end = verse start
                        break
                else:
                    i += 1
        t = round(t + t_step, 6)

    if not candidates:
        return None
    candidates.sort()
    return candidates[len(candidates) // 2]


def detect_tail_start(data, sr, params=None):
    """
    Detect the start of a closing phrase after the last pada (e.g. Usha's
    «śubhaṃ bhūyāt»): the LAST silence gap ≥ lead_gap_min_ms whose FOLLOWING
    speech block is shorter than min_pada_dur — a tail phrase, not a pada.
    The silence-threshold range is scanned and the MEDIAN candidate gap-start
    is returned. Returns seconds, or None when no candidate exists.
    """
    if params is None:
        params = _load_params()['pada_detection']

    lead_gap_min_s = params.get('lead_gap_min_ms', 120) / 1000.0

    frame_size = round(sr * params['frame_ms'] * 0.001)
    num_frames = len(data) // frame_size
    if num_frames < 8:
        return None

    frame_dur = frame_size / sr
    duration  = len(data) / sr
    min_pada_dur = duration * params['min_pada_fraction']

    rms = np.array([
        math.sqrt(np.sum(data[f*frame_size : (f+1)*frame_size] ** 2) / frame_size)
        for f in range(num_frames)
    ])
    max_rms = rms.max()
    if max_rms == 0:
        return None
    norm = rms / max_rms

    candidates = []
    t = params['silence_thresh_min']
    t_max = params['silence_thresh_max']
    t_step = params['silence_thresh_step']
    while t <= t_max + 1e-9:
        sil = norm < t
        first = 0
        while first < num_frames and sil[first]:
            first += 1
        last = num_frames - 1
        while last >= 0 and sil[last]:
            last -= 1
        if first < last:
            ranges = []
            i = first
            while i <= last:
                if sil[i]:
                    s = i
                    while i <= last and sil[i]:
                        i += 1
                    ranges.append((s, i - 1, i - s))
                else:
                    i += 1
            for r in reversed(ranges):
                gap_len       = r[2] * frame_dur
                speech_resume = (r[1] + 1) * frame_dur
                speech_after  = duration - speech_resume
                if gap_len >= lead_gap_min_s and speech_after < min_pada_dur:
                    candidates.append(r[0] * frame_dur)  # gap start = verse end
                    break
        t = round(t + t_step, 6)

    if not candidates:
        return None
    candidates.sort()
    return candidates[len(candidates) // 2]


_WHISPER_CACHE = {}

def _get_whisper_model(name='small'):
    from faster_whisper import WhisperModel
    if name not in _WHISPER_CACHE:
        _WHISPER_CACHE[name] = WhisperModel(name, device='cpu', compute_type='int8')
    return _WHISPER_CACHE[name]


def whisper_word_times(clip_f32, sr, model_name='small'):
    """
    Transcribe the verse-region audio with faster_whisper word timestamps
    (optional dependency — lazy import). Input: float32 mono at sr Hz.
    Returns ordered [(iast_word, start_s, end_s), ...], or None when
    faster_whisper is unavailable / too few words.
    """
    try:
        model = _get_whisper_model(model_name)
        audio = np.asarray(clip_f32, dtype=np.float32)
        target = 16000
        if sr != target and len(audio):
            dur_s = len(audio) / sr
            audio = np.interp(
                np.linspace(0.0, dur_s, int(dur_s * target)),
                np.arange(len(audio)) / sr, audio).astype(np.float32)
        segments, _info = model.transcribe(
            audio, language='hi', beam_size=1, word_timestamps=True)
        words = []
        for seg in segments:
            for w in (seg.words or []):
                wt_text = re.sub(r'[^a-zāīūṛḷṝḹṅñṭḍṇśṣḥṃ]',
                                 '', dev_to_iast(w.word).lower())
                if wt_text:
                    words.append((wt_text, float(w.start), float(w.end)))
    except Exception:
        return None
    return words if len(words) >= 3 else None


def whisper_warp_times(syls_s1, syls_s2, word_times):
    """
    Usha-calibrated pacing (ADR-0004 v1): build a monotonic time curve through
    the heard word boundaries and place each syllable onset on it by cumulative
    mora weight (guru=2, laghu=1). Robust to whisper merge/split — boundaries
    act as positional anchors, so her real pacing (e.g. a fast final «gacchati»)
    is honoured where the uniform mora base lags. Returns {'s1': [...], 's2':
    [...]} or None when unusable.
    """
def _verse_word_tokens(verse):
    """Whitespace/hyphen word tokens of s1+s2 (transliterated to IAST),
    lowercased, punctuation-stripped."""
    text = dev_to_iast(f"{verse.get('s1', '')} {verse.get('s2', '')}")
    toks = [t for t in re.split(r'[\s\-–—|/]+', text) if t]
    out = []
    for t in toks:
        t = re.sub(r'[।॥.,;:!?]', '', t).lower()
        if t:
            out.append(t)
    return out


def whisper_token_windows(verse_tokens, heard_words):
    """
    Monotonic text-aware alignment of heard (whisper) words to verse word
    tokens. Each heard word maps to a run of 1..3 consecutive verse tokens
    (scored by string similarity — whisper merges like «सन्त्यज्यगज्च्छती» =
    saṃtyajya+gacchati are handled) or to noise (small penalty); every verse
    token is covered exactly once. Returns per-verse-token (start_s, end_s)
    windows (heard spans split proportionally by token char length), or None.
    """
    import difflib
    N, M = len(heard_words), len(verse_tokens)
    if N < 2 or M < 2:
        return None
    INF = float('-inf')
    dp = [[INF] * (M + 1) for _ in range(N + 1)]
    back = [[None] * (M + 1) for _ in range(N + 1)]
    dp[0][0] = 0.0
    for i in range(1, N + 1):
        h = heard_words[i - 1][0]
        for j in range(M + 1):
            if dp[i - 1][j] == INF:
                continue
            if dp[i][j] < dp[i - 1][j] - 0.05:  # noise: no verse tokens
                dp[i][j] = dp[i - 1][j] - 0.05
                back[i][j] = (i - 1, j, j)
            for j2 in range(j + 1, min(M, j + 3) + 1):
                v = ''.join(verse_tokens[j:j2])
                sc = difflib.SequenceMatcher(None, h, v).ratio()
                val = dp[i - 1][j] + sc
                if val > dp[i][j2]:
                    dp[i][j2] = val
                    back[i][j2] = (i - 1, j, j2)
    if dp[N][M] == INF:
        return None

    spans = [None] * M
    i, j = N, M
    while i > 0:
        if back[i][j] is None:
            return None
        pi, pj, j2 = back[i][j]
        j_prev = pj
        if j2 > pj:
            hs, he = heard_words[i - 1][1], heard_words[i - 1][2]
            toks = verse_tokens[pj:j]
            total_chars = sum(len(t) for t in toks) or 1
            acc = hs
            for t in toks:
                d = (he - hs) * (len(t) / total_chars)
                spans[pj] = (acc, acc + d)
                acc += d
                pj += 1
        i, j = pi, j_prev
    if any(s is None for s in spans):
        return None
    return spans


def _flat_token_placements(syls_s1, syls_s2, verse_tokens, token_windows):
    """
    Shared mora-proportional intra-token placement arithmetic (H5223): token
    sizes by char length (mapped to flat syllable indices proportionally),
    syllables inside a token window spaced by mora weight (guru=2, laghu=1).
    Yields (global_index, ws, we, t, syl) in flat s1+s2 order — exactly the
    placement distribute_by_token_windows returns.
    """
    syls = list(syls_s1) + list(syls_s2)
    M = len(syls)
    n_tok = len(verse_tokens)
    approx = [max(1, len(t)) for t in verse_tokens]
    total_a = sum(approx)

    cuts = [0]
    acc = 0.0
    for k in range(n_tok):
        acc += approx[k]
        cuts.append(min(M, int(round(acc / total_a * M))))
    cuts[-1] = M

    for k in range(n_tok):
        i0, i1 = cuts[k], cuts[k + 1]
        if i1 <= i0:
            continue
        ws, we = token_windows[k]
        span = max(we - ws, 0.05)
        seg = syls[i0:i1]
        weights, acc_w = [], 0.0
        for s in seg:
            w = 2 if s['type'] == 'guru' else 1
            weights.append(w)
            acc_w += w
        c = 0.0
        for off, s in enumerate(seg):
            frac = (c / acc_w) if acc_w else 0.0
            t = ws + span * frac
            gi = i0 + off
            yield gi, ws, we, t, s
            c += weights[off]


def distribute_by_token_windows(syls_s1, syls_s2, verse_tokens, token_windows):
    """
    Distribute flat syllable onsets over per-token windows: tokens sized by
    char length (mapped to flat syllable indices proportionally), syllables
    inside a token window spaced by mora weight (guru=2, laghu=1).
    Returns {'s1': [...], 's2': [...]}.
    """
    n1 = len(syls_s1)
    times = {'s1': [], 's2': []}
    for gi, ws, we, t, s in _flat_token_placements(
            syls_s1, syls_s2, verse_tokens, token_windows):
        (times['s1'] if gi < n1 else times['s2']).append(t)
    return times


def onset_anchor_token_windows(syls_s1, syls_s2, verse_tokens, token_windows,
                               onsets, peaks, rules, snap_params=None,
                               anchor_params=None):
    """
    Onset-anchored intra-token placement (H5223; alignment contract D2,
    18-07-2026: the highlight begins at the earliest audible syllable onset —
    the consonant attack, or the vowel onset for vowel-initial syllables).

    The mora-proportional placement (_flat_token_placements) is kept as the
    PREDICTION. Every syllable whose token window [ws, we] contains a detected
    acoustic onset (or energy peak, when its phoneme rule says align_to ==
    'peak') within ±eps_s of the window edges is re-anchored to it by a
    monotonic, order-preserving DP assignment over the window's candidate
    timeline: lexicographic cost — maximise the number of anchored syllables
    first, then minimise the total |candidate − prediction| drift. Candidate
    reuse is forbidden outright (two syllables must never share one onset).
    The anchored time is candidate + rule offset_ms, clamped to the window.

    Syllables left unanchored interpolate linearly between their nearest
    anchored neighbours inside the same window (window edges count as anchors
    at ws/we); a window with no anchors at all keeps its pure predictions.
    A final forward pass keeps the flat s1+s2 result monotonic across windows,
    and nothing ever leaves its token window.

    All inputs and outputs must be in ONE time frame: the caller feeds onsets
    detected on the same audio region the token_windows are relative to.
    Returns (times, confidence, n_anchored); times/confidence are
    {'s1': [...], 's2': [...]}.
    """
    if snap_params is None:
        snap_params = _load_params()['snap']
    if anchor_params is None:
        anchor_params = _load_params().get('onset_anchor', {})

    eps          = float(anchor_params.get('eps_s', 0.05))
    interpolate  = bool(anchor_params.get('interpolate', True))
    no_cand_conf = snap_params.get('no_candidate_confidence', 0.2)

    n1 = len(syls_s1)
    placements = list(_flat_token_placements(
        syls_s1, syls_s2, verse_tokens, token_windows))

    by_win = {}
    for item in placements:
        by_win.setdefault((item[1], item[2]), []).append(item)

    flat_t = [None] * len(placements)
    flat_c = [None] * len(placements)
    n_anchored = 0

    for (ws, we), items in by_win.items():
        n = len(items)

        # Candidate timeline for the window: onsets + peaks within
        # [ws − eps, we + eps], deduplicated, kind-tagged.
        cand_map = {}
        for t in onsets:
            if ws - eps <= t <= we + eps:
                cand_map.setdefault(round(t, 6), set()).add('onset')
        for t in peaks:
            if ws - eps <= t <= we + eps:
                cand_map.setdefault(round(t, 6), set()).add('peak')
        cands = sorted((t, kinds) for t, kinds in cand_map.items())
        C = len(cands)

        # Per-syllable rule target and candidate admissibility
        kinds_need, offsets = [], []
        for gi, w0, w1, pred, syl in items:
            rule = get_phoneme_rule(syl['syl'], rules)
            kinds_need.append('peak' if rule.get('align_to') == 'peak' else 'onset')
            offsets.append((rule.get('offset_ms', 0) or 0) / 1000.0)
        ok = [[kinds_need[i] in cands[j][1] for j in range(C)] for i in range(n)]

        # DP over (syllables processed, last-used candidate index + 1; column
        # 0 = nothing used yet). Cost is a lexicographic tuple (−anchors,
        # distance): more anchors always win, then shorter total drift.
        # Transitions: leave the syllable unanchored (stay at jc), or anchor
        # it to candidate j ≥ last (order preserved; strict — no reuse).
        INF = (float('inf'), float('inf'))
        dp  = [[INF] * (C + 1) for _ in range(n + 1)]
        par = [[None] * (C + 1) for _ in range(n + 1)]
        dp[0][0] = (0, 0.0)
        for i in range(n):
            pred_i = items[i][3]
            for jc in range(C + 1):
                cur = dp[i][jc]
                if cur == INF:
                    continue
                if cur < dp[i + 1][jc]:              # leave syllable i unanchored
                    dp[i + 1][jc] = cur
                    par[i + 1][jc] = (jc, None)
                for j in range(jc, C):               # anchor to candidate j > last (strict — no reuse)
                    if not ok[i][j]:
                        continue
                    val = (cur[0] - 1, cur[1] + abs(cands[j][0] - pred_i))
                    if val < dp[i + 1][j + 1]:
                        dp[i + 1][j + 1] = val
                        par[i + 1][j + 1] = (jc, j)

        end_jc = min(range(C + 1), key=lambda j: dp[n][j])
        anchored = {}
        jc = end_jc
        for i in range(n, 0, -1):
            p = par[i][jc]
            if p is None:
                break
            jc_prev, j_used = p
            if j_used is not None:
                anchored[i - 1] = cands[j_used][0]
            jc = jc_prev
        n_anchored += len(anchored)

        if not anchored:
            # No acoustic evidence in this window: keep the pure predictions
            for i in range(n):
                gi = items[i][0]
                flat_t[gi] = items[i][3]
                flat_c[gi] = no_cand_conf
            continue

        vals = {}
        for i, cand_t in anchored.items():
            # candidate + rule offset, never leaving the token window
            vals[i] = min(max(cand_t + offsets[i], ws), we)

        akeys = sorted(vals)
        for i in range(n):
            if i in vals:
                continue
            if not interpolate:
                vals[i] = items[i][3]
                continue
            lk = next((k for k in reversed(akeys) if k < i), None)
            rk = next((k for k in akeys if k > i), None)
            ki = lk if lk is not None else -1
            kr = rk if rk is not None else n
            lt = vals[lk] if lk is not None else ws
            rt = vals[rk] if rk is not None else we
            vals[i] = lt + (rt - lt) * (i - ki) / (kr - ki)

        for i in range(n):
            gi = items[i][0]
            flat_t[gi] = vals[i]
            flat_c[gi] = (snap_confidence(abs(anchored[i] - items[i][3]),
                                          snap_params)
                          if i in anchored else no_cand_conf)

    # Global monotonicity across windows (windows share edges, so a single
    # forward pass over the flat s1+s2 sequence suffices)
    for i in range(1, len(flat_t)):
        if flat_t[i] < flat_t[i - 1]:
            flat_t[i] = flat_t[i - 1]

    times = {'s1': flat_t[:n1], 's2': flat_t[n1:]}
    conf  = {'s1': flat_c[:n1], 's2': flat_c[n1:]}
    return times, conf, n_anchored

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
def align_verse(audio_path, verse, verses_dir, params=None, verbose=False,
                lead_strip=False, lead_word='', whisper_cal=False):
    """
    Run the full 4-layer alignment pipeline for a single verse.
    lead_strip: skip a spoken header word (e.g. «subhāṣitam») before pada 1 —
    the verse's speech region starts after the first in-speech silence gap.
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

    # Layer 0: spoken frame phrases — «subhāṣitam» before pada 1 and (on some
    # clips) «śubhaṃ bhūyāt» after the last pada. Detect both bounds, then
    # align the verse-only region. Arbiter: prefer the tail-framed region;
    # if pada detection fails there, retry without the tail — a false-positive
    # tail must not truncate pada 4.
    lead_end  = detect_lead_end(data, sr, params['pada_detection']) if lead_strip else None
    tail_start = detect_tail_start(data, sr, params['pada_detection']) if lead_strip else None
    region_start = lead_end or 0.0

    def _region_padas(t_end):
        end_sample = int(t_end * sr) if t_end else len(data)
        clip = data[int(region_start * sr): end_sample]
        pr, ut = detect_pada_bounds(clip, sr, params['pada_detection'])
        if pr:
            pr = [[p0 + region_start, p1 + region_start] for p0, p1 in pr]
        return pr, ut, clip

    pada_result, used_thresh, verse_data = None, None, None
    if tail_start and tail_start > region_start:
        pada_result, used_thresh, verse_data = _region_padas(tail_start)
    if pada_result is None:
        tail_start = None
        pada_result, used_thresh, verse_data = _region_padas(None)

    verse_dur = len(verse_data) / sr
    region_end = tail_start

    if verbose and lead_end:
        print(f'  lead word stripped: verse starts at {lead_end:.2f}s', file=sys.stderr)
    if verbose and region_end:
        print(f'  tail phrase stripped: verse ends at {region_end:.2f}s', file=sys.stderr)

    # Layer 1: Mora-proportional base (needs pada bounds first)
    fallback_used = False
    if pada_result is None:
        # Fallback: uniform division over the VERSE span (same as browser fallback)
        fallback_used = True
        pada_result = [[region_start + verse_dur * i / 4,
                        region_start + verse_dur * (i + 1) / 4] for i in range(4)]
        used_thresh = None
        if verbose:
            print('  WARNING: pada detection failed, using uniform fallback over the verse span', file=sys.stderr)

    times = calc_auto_timing(syls_s1, syls_s2, pada_result, params=params['mora'])

    # Layer 1.5: whisper word-timing warp (Usha-calibrated pacing, ADR-0004 v1) —
    # replaces the mora base when real word boundaries are usable; monotonic.
    # Word times are verse-region-relative — shifted back by region_start.
    warped = None
    anchor_conf = None
    n_anchored = 0
    if whisper_cal:
        wt = whisper_word_times(verse_data, sr)
        if wt:
            verse_tokens = _verse_word_tokens(verse)
            token_windows = whisper_token_windows(verse_tokens, wt)
            if token_windows:
                warped = distribute_by_token_windows(
                    syls_s1, syls_s2, verse_tokens, token_windows)
        if warped:
            # H5223 onset anchoring (D2 contract: transitions land on real
            # sound-change onsets, not mora-proportional guesses).
            # FRAME TRAP: token_windows and the mora-proportional predictions
            # are verse-region-relative (verse_data starts at region_start),
            # so onsets MUST come from detect_onsets(verse_data, ...) in the
            # SAME frame — detect_onsets(data, ...) returns ABSOLUTE times
            # and would silently shift every anchor by region_start.
            onsets_v, peaks_v = detect_onsets(verse_data, sr,
                                              params['onset_detection'])
            assert not onsets_v or max(onsets_v) <= verse_dur + 0.05, (
                'onset frame mismatch: onsets exceed the verse region — '
                'detect_onsets must run on verse_data (region-relative)')
            warped, anchor_conf, n_anchored = onset_anchor_token_windows(
                syls_s1, syls_s2, verse_tokens, token_windows,
                onsets_v, peaks_v, load_phoneme_rules(),
                snap_params=params['snap'],
                anchor_params=params.get('onset_anchor'))
            times = {k: [t + region_start for t in v] for k, v in warped.items()}
            if verbose:
                total = len(syls_s1) + len(syls_s2)
                print(f'  whisper token-alignment applied ({len(wt)} heard words; '
                      f'onset-anchored {n_anchored}/{total})', file=sys.stderr)

    # Layer 2: Corpus scaling (overwrite linear with scaled corpus timings if available).
    # Skipped when a lead word was stripped or the whisper warp applied — both
    # corpus variants would ignore the actual audio framing.
    meter = verse.get('meter', '')
    scaled = None if (lead_end or warped) else corpus_scale_timing(
        meter, len(syls_s1), len(syls_s2), duration, verses_dir)
    if scaled:
        times = scaled
        if verbose:
            print(f'  corpus scale applied (meter={meter})', file=sys.stderr)

    if warped:
        # Layers 3+4 (H5223): REPLACED for onset-anchored runs. The global
        # ±window_s snap is "средний по больнице" — it can drag a syllable
        # onto a neighbour's onset, merge two syllables onto one, or leave
        # the proportional time untouched. The anchor step above is
        # window-constrained; confidence derives from the anchor distance
        # (same snap bands) and unanchored syllables get no_candidate_conf.
        confidence = anchor_conf if anchor_conf is not None else {'s1': [], 's2': []}
    else:
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
        'generator': 'cli-v2-whisper' if warped else 'cli-v1',
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
            'lead_stripped':    bool(lead_strip and lead_end is not None),
            'lead_end_s':       round(lead_end, 3) if lead_end is not None else None,
            'lead_word':        lead_word or None,
            'whisper_warped':   bool(warped),
            'onset_anchored':   (f'{n_anchored}/{len(all_conf)}') if warped else None,
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
    parser.add_argument('--lead-word', default='',
                        help='Spoken header word before pada 1 (e.g. "subhāṣitam"). '
                             'Any non-empty value strips the leading header-word '
                             'speech block before pada detection (and the closing '
                             'phrase after the last pada, via the tail arbiter).')
    parser.add_argument('--whisper-align', action='store_true',
                        help='Calibrate syllable pacing with faster_whisper word '
                             'timestamps (Usha-calibrated monotonic warp, ADR-0004 '
                             'v1); falls back to the mora base when unusable. '
                             'Requires the faster_whisper package.')
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
            result = align_verse(audio_path, verse, verses_dir, params=params,
                                 verbose=args.verbose,
                                 lead_strip=bool(args.lead_word),
                                 lead_word=args.lead_word,
                                 whisper_cal=bool(args.whisper_align))
        except Exception as e:
            print(f'ERROR: {e}', file=sys.stderr)
            failed.append(verse_id)
            had_failure = True
            continue

        timing = result['timing']
        meta   = result['meta']
        fallback = result['fallback']

        status = 'FALLBACK' if fallback else f'thresh={result["used_thresh"]:.2f}'
        lead_note = (f'  lead@{meta["lead_end_s"]:.2f}s' if meta.get('lead_stripped') else '')
        print(
            f'conf={meta["mean_confidence"]:.2f}  '
            f'uncertain={meta["uncertain_count"]}/{meta["total_syllables"]}  '
            f'{status}{lead_note}'
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
