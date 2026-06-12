"""One-off backfill: rights metadata (Agreement SK-LIC-2026-001) + translation provenance.

Run from repo root: python tools/backfill_rights.py
Idempotent — skips verses that already carry permission_ref.
"""
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

RECORDING_IDS = {
    'bhg_2_47': 'USK-2026-001',
    'bhg_2_48': 'USK-2026-002',
    'bhg_2_49': 'USK-2026-003',
}
AGREEMENT = 'SK-LIC-2026-001'
TODAY = '2026-06-12'

for vid, rec_id in RECORDING_IDS.items():
    path = os.path.join('verses', 'data', f'{vid}.json')
    with open(path, 'r', encoding='utf-8') as f:
        v = json.load(f)

    if v.get('audio', {}).get('permission_ref'):
        print(f'= {vid}: already has permission_ref, skipped')
        continue

    audio = v.get('audio', {})
    audio['rights_holder'] = 'Usha Sanka'
    audio['license'] = AGREEMENT
    audio['permission_ref'] = f'{AGREEMENT}/{rec_id}'
    v['audio'] = audio

    tr = v.get('translation', {})
    prov = {lang: 'unknown' for lang in ('ru', 'en') if lang in tr}
    if prov:
        tr['provenance'] = prov
        v['translation'] = tr

    v['version'] = v.get('version', 1) + 1
    v['updated_at'] = TODAY

    with open(path, 'w', encoding='utf-8') as f:  # utf-8, never utf-8-sig (BOM pitfall)
        json.dump(v, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'+ {vid}: {audio["permission_ref"]}')
