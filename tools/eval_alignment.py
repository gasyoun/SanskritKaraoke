#!/usr/bin/env python3
"""
Gold-standard alignment harness (ADR-0003).

Compares CLI-generated timings against hand-timed reference verses.
Acceptance criterion: ≥90% of syllables within ±50 ms.

Usage:
    python tools/eval_alignment.py --audio <audio_dir> [--verses verses/data] [--tol 0.050]

Reference verses: verse JSONs with timing.auto_generated == False (produced by
extract_timing_from_session.py).  The harness skips verses with no matching audio
or no hand-timed reference.

Running without audio files just lists available references and exits.
"""
import sys, os, json, argparse

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT  = os.path.dirname(TOOLS_DIR)

# Import the alignment library from the same package
sys.path.insert(0, TOOLS_DIR)
from align_chapter import (
    align_verse, syllabify_verse, _load_params, AUDIO_EXTS
)

# ── Helpers ───────────────────────────────────────────────────────────────────
def load_references(verses_dir):
    """
    Return a list of verse dicts that have hand-timed timing (auto_generated != True).
    """
    refs = []
    for fname in sorted(os.listdir(verses_dir)):
        if not fname.endswith('.json'):
            continue
        vpath = os.path.join(verses_dir, fname)
        try:
            with open(vpath, encoding='utf-8') as f:
                v = json.load(f)
        except Exception:
            continue
        timing = v.get('timing')
        if not timing:
            continue
        if timing.get('auto_generated', False) is True:
            continue
        if not timing.get('s1') and not timing.get('s2'):
            continue
        refs.append(v)
    return refs

def find_audio(verse_id, audio_dir):
    for ext in AUDIO_EXTS:
        p = os.path.join(audio_dir, verse_id + ext)
        if os.path.exists(p):
            return p
    return None

def compare_timings(ref_times, gen_times, tol):
    """
    Compare reference and generated timing arrays.
    Returns (n_within_tol, n_total, per_syllable list of abs errors).
    """
    n_total     = min(len(ref_times), len(gen_times))
    errors      = [abs(ref_times[i] - gen_times[i]) for i in range(n_total)]
    n_within    = sum(1 for e in errors if e <= tol)
    return n_within, n_total, errors

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='Alignment gold-standard harness (ADR-0003)')
    parser.add_argument('--audio', required=True,
                        help='Directory containing audio files (m4a / mp3 / wav …)')
    parser.add_argument('--verses', default=os.path.join(REPO_ROOT, 'verses', 'data'),
                        help='Verse data directory (default: verses/data)')
    parser.add_argument('--tol', type=float, default=0.050,
                        help='Tolerance in seconds (default 0.050 = ±50 ms)')
    parser.add_argument('--accept', type=float, default=0.90,
                        help='Acceptance threshold 0–1 (default 0.90 = 90%%)')
    parser.add_argument('--verbose', '-v', action='store_true')
    args = parser.parse_args()

    verses_dir = args.verses
    audio_dir  = args.audio
    tol        = args.tol
    accept     = args.accept

    if not os.path.isdir(verses_dir):
        print(f'ERROR: verses dir not found: {verses_dir}', file=sys.stderr)
        sys.exit(1)
    if not os.path.isdir(audio_dir):
        print(f'ERROR: audio dir not found: {audio_dir}', file=sys.stderr)
        sys.exit(1)

    refs = load_references(verses_dir)
    if not refs:
        print('No hand-timed reference verses found.')
        print(f'Run: python tools/extract_timing_from_session.py <session.json> <verse_id>')
        print('to populate references from Drive session exports.')
        sys.exit(0)

    print(f'Reference verses with hand timings: {len(refs)}')
    for v in refs:
        apath = find_audio(v['id'], audio_dir)
        mark  = '✓' if apath else '✗ (no audio)'
        t = v.get('timing', {})
        print(f'  {v["id"]:20s}  s1={len(t.get("s1",[])):<3d} s2={len(t.get("s2",[])):<3d}  {mark}')
    print()

    params     = _load_params()
    usable     = [(v, find_audio(v['id'], audio_dir)) for v in refs if find_audio(v['id'], audio_dir)]

    if not usable:
        print('No audio found for any reference verse.')
        print(f'Put audio files in {audio_dir} named by verse ID (e.g. bhg_2_47.m4a).')
        sys.exit(0)

    print(f'Evaluating {len(usable)} verse(s)  tol=±{tol*1000:.0f}ms  accept={accept*100:.0f}%')
    print('─' * 72)

    total_within = 0
    total_syls   = 0
    all_results  = []

    for verse, audio_path in usable:
        vid = verse['id']
        ref_timing = verse['timing']
        print(f'{vid} … ', end='', flush=True)

        try:
            result = align_verse(audio_path, verse, verses_dir, params=params, verbose=args.verbose)
        except Exception as e:
            print(f'ERROR: {e}')
            continue

        gen = result['timing']
        verse_within = 0
        verse_total  = 0
        key_results  = {}

        for key in ('s1', 's2'):
            ref_t = ref_timing.get(key, [])
            gen_t = gen.get(key, [])
            if not ref_t:
                continue
            n_within, n_total, errors = compare_timings(ref_t, gen_t, tol)
            verse_within += n_within
            verse_total  += n_total
            key_results[key] = {
                'n_within': n_within, 'n_total': n_total,
                'mean_err_ms': (sum(errors) / len(errors) * 1000) if errors else 0,
                'max_err_ms':  (max(errors) * 1000) if errors else 0,
                'errors': errors,
            }

        if verse_total == 0:
            print('skipped (no overlapping timings)')
            continue

        pct = verse_within / verse_total
        pass_fail = 'PASS' if pct >= accept else 'FAIL'
        mean_err  = sum(
            key_results[k]['mean_err_ms'] for k in key_results
        ) / max(len(key_results), 1)

        print(
            f'{pass_fail}  {verse_within}/{verse_total} ({pct*100:.1f}%)  '
            f'mean={mean_err:.1f}ms'
        )

        if args.verbose:
            for key, kr in key_results.items():
                print(
                    f'    {key}: {kr["n_within"]}/{kr["n_total"]}  '
                    f'mean={kr["mean_err_ms"]:.1f}ms  max={kr["max_err_ms"]:.1f}ms'
                )
            for key, kr in key_results.items():
                bad = [(i, e*1000) for i, e in enumerate(kr['errors']) if e > tol]
                if bad:
                    print(f'    {key} outliers: ' + ', '.join(f'syl{i}={e:.1f}ms' for i, e in bad))

        total_within += verse_within
        total_syls   += verse_total
        all_results.append({'id': vid, 'pass': pct >= accept, 'pct': pct, 'n': verse_total})

    print('─' * 72)
    if total_syls == 0:
        print('No syllables evaluated.')
        sys.exit(1)

    overall_pct = total_within / total_syls
    overall_pass = overall_pct >= accept
    n_pass = sum(1 for r in all_results if r['pass'])
    n_fail = len(all_results) - n_pass

    print(
        f'Overall: {total_within}/{total_syls} ({overall_pct*100:.1f}%) within ±{tol*1000:.0f}ms'
    )
    print(f'Verses:  {n_pass} PASS  {n_fail} FAIL')
    print()
    if overall_pass:
        print(f'✓ ACCEPTED  ({overall_pct*100:.1f}% >= {accept*100:.0f}%)')
    else:
        print(f'✗ NOT ACCEPTED  ({overall_pct*100:.1f}% < {accept*100:.0f}%)')
        print('  Tune alignment_params.json constants and re-run.')

    sys.exit(0 if overall_pass else 1)

if __name__ == '__main__':
    main()
