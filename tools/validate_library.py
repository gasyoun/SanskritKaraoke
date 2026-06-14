import sys
import os
import json
import jsonschema
from glob import glob

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

def main():
    schema_path = os.path.join("verses", "schema", "verse.schema.json")
    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)

    data_files = glob(os.path.join("verses", "data", "*.json"))
    if not data_files:
        print("No verse files found in verses/data/")
        sys.exit(1)

    errors = 0
    warnings = 0
    verses = {}  # id → instance, for cross-file checks

    for file_path in data_files:
        with open(file_path, "r", encoding="utf-8") as f:
            try:
                instance = json.load(f)
                jsonschema.validate(instance=instance, schema=schema)
                print(f"✓ {os.path.basename(file_path)}")
                warnings += lint_verse(os.path.basename(file_path), instance)
                verses[os.path.basename(file_path)] = instance
            except json.JSONDecodeError as e:
                print(f"✗ {os.path.basename(file_path)}: Invalid JSON ({e})")
                errors += 1
            except jsonschema.exceptions.ValidationError as e:
                print(f"✗ {os.path.basename(file_path)}: Schema validation failed")
                print(f"  {e.message}")
                errors += 1

    # Cross-file: permission_ref uniqueness
    seen_refs = {}  # ref → first filename
    for fname, instance in verses.items():
        ref = instance.get("audio", {}).get("permission_ref")
        if ref:
            if ref in seen_refs:
                print(f"✗ {fname}: audio.permission_ref {ref!r} duplicates {seen_refs[ref]}")
                errors += 1
            else:
                seen_refs[ref] = fname

    if errors == 0:
        suffix = f", {warnings} warning(s)" if warnings else ""
        print(f"All {len(data_files)} verse(s) valid{suffix}.")
        sys.exit(0)
    else:
        print(f"Failed: {errors} error(s) across {len(data_files)} verse(s).")
        sys.exit(1)


def lint_verse(name, v):
    """Non-fatal publication-readiness checks. Returns number of warnings."""
    warnings = 0

    def warn(msg):
        nonlocal warnings
        print(f"  ⚠ {name}: {msg}")
        warnings += 1

    audio = v.get("audio", {})
    if audio.get("drive_file_id") in (None, "", "TODO"):
        warn("audio.drive_file_id is a TODO placeholder — verse is not playable")
    if v.get("session", {}).get("drive_file_id") in (None, "", "TODO"):
        warn("session.drive_file_id is a TODO placeholder")
    if not audio.get("sha256"):
        warn("audio.sha256 missing — no integrity checksum for the canonical audio")
    if not audio.get("canonical_url"):
        warn("audio.canonical_url missing — audio exists only as a Drive working copy")

    tr = v.get("translation", {})
    prov = tr.get("provenance", {})
    rights = tr.get("rights", {})
    for lang in ("ru", "en"):
        if lang not in tr:
            continue
        if prov.get(lang) in (None, "unknown"):
            warn(f"translation.{lang} provenance is unknown — verify source before publication")
        status = (rights.get(lang) or {}).get("status")
        if status in (None, "unknown", "license-pending"):
            warn(f"translation.{lang} not cleared to publish (rights.status={status or 'missing'})")
    return warnings

if __name__ == "__main__":
    main()
