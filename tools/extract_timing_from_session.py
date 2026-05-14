#!/usr/bin/env python3
"""
Usage:
    python tools/extract_timing_from_session.py <session.json> <verse_id>

Example:
    python tools/extract_timing_from_session.py ~/Downloads/shloka_session.json bhg_2_47

Reads tapTimes from a Drive session, writes timing field to verses/data/<verse_id>.json.
"""
import sys, json, os

# Windows UTF-8 requirement
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

if len(sys.argv) != 3:
    print("Usage: extract_timing_from_session.py <session.json> <verse_id>")
    sys.exit(1)

session_path = sys.argv[1]
verse_id     = sys.argv[2]
verse_path   = os.path.join('verses', 'data', f'{verse_id}.json')

if not os.path.exists(session_path):
    print(f"ERROR: session file not found: {session_path}")
    sys.exit(1)
if not os.path.exists(verse_path):
    print(f"ERROR: verse file not found: {verse_path}")
    sys.exit(1)

try:
    with open(session_path, encoding='utf-8') as f:
        session = json.load(f)
    with open(verse_path, encoding='utf-8') as f:
        verse = json.load(f)
except Exception as e:
    print(f"ERROR: failed to read JSON files: {e}")
    sys.exit(1)

tap = session.get('tapTimes', {})
s1  = tap.get('s1', [])
s2  = tap.get('s2', [])

if not s1 and not s2:
    print("ERROR: no tapTimes found in session file")
    sys.exit(1)

verse['timing'] = {
    's1': s1,
    's2': s2,
    'auto_generated': False,
    'generator': 'manual'
}

try:
    with open(verse_path, 'w', encoding='utf-8') as f:
        json.dump(verse, f, ensure_ascii=False, indent=2)
except Exception as e:
    print(f"ERROR: failed to write verse file: {e}")
    sys.exit(1)

print(f"OK: wrote timing to {verse_path}  ({len(s1)} s1 timestamps, {len(s2)} s2 timestamps)")
