#!/usr/bin/env python3
"""import_subhashita_jsonl.py — H4178 wiring: batch import from the TRACKED
`indische-sprueche` dataset (kosha manifest row; SanskritLexicography
IndischeSprueche/data/indische_sprueche.jsonl, 7,537 public-domain sayings).

The sibling tool import_subhashita.py is self-contained: its curated verses are
embedded and it reads the 167 MB gitignored VisualDCS archive.sqlite only for
optional verification — the tracked JSONL mirror was never consumed repo-side.
This importer closes that gap: it reads the JSONL sibling read-only,
auto-screens sayings for clean anuṣṭubh shape (2 lines x 16 akṣaras, machine
syllable count on the IAST, matching deva line split), skips already-imported
nums, and emits schema-conformant verse files into verses/data/.

Honesty contract (matches the house import posture):
  * Sanskrit + Böhtlingk's German are public domain — imported verbatim;
  * NO Russian translation is fabricated (language_tags = ["de"]);
  * no per-verse human curation is claimed: import_meta records the
    auto-screened provenance, the saying id/page and the source pin;
  * the verse feed stays TEXT-ONLY (no audio block).

Usage:
    python tools/import_subhashita_jsonl.py --limit 20
    python tools/import_subhashita_jsonl.py --dry-run --limit 50
Then regenerate the catalogue and validate:
    python tools/build_index.py && python tools/validate_library.py
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
JSONL_REL = Path("SanskritLexicography") / "IndischeSprueche" / "data" / "indische_sprueche.jsonl"
CREATED = date.today().isoformat()
SRC_TEXT = "Indische Sprüche (Böhtlingk)"

RIGHTS_DE = {
    "rights_holder": "public domain (Otto von Böhtlingk, d. 1904)",
    "source": "Böhtlingk, O., Indische Sprüche, 2nd ed., St. Petersburg 1870–1873",
    "license": "public-domain",
    "status": "public-domain",
}

# IAST vowel graphemes, longest first (ai/au single akṣara; ṃ/ḥ are NOT vowels).
VOWELS = re.compile(r"au|ai|ā|ī|ū|ṝ|ḹ|ṛ|ḷ|a|i|u|e|o")


def github_root() -> Path:
    for candidate in (ROOT, *ROOT.parents):
        if (candidate / "SanskritLexicography").is_dir():
            return candidate
    raise SystemExit("SanskritLexicography sibling checkout not found above " + str(ROOT))


def sibling_commit() -> str | None:
    try:
        return subprocess.run(
            ["git", "log", "-1", "--format=%H", "--",
             "IndischeSprueche/data/indische_sprueche.jsonl"],
            cwd=github_root() / "SanskritLexicography",
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except (subprocess.CalledProcessError, OSError):
        return None


def aksharas(iast_line: str) -> int:
    """Count IAST akṣaras (vowel graphemes) in one line — avagraha/punct skip."""
    cleaned = re.sub(r"[0-9ṃḥ'’ .,;:!?/|\\\-–—]", "", iast_line)
    return len(VOWELS.findall(cleaned))


def screen(record: dict) -> list[str] | None:
    """Return the two anuṣṭubh lines (deva) when the saying passes, else None."""
    deva, iast = record.get("deva"), record.get("iast")
    if not deva or not iast:
        return None
    deva_lines = [ln.strip() for ln in deva.split("/") if ln.strip()]
    if len(deva_lines) != 2:
        return None
    iast_lines = [ln.strip(" |/") for ln in iast.split("/") if ln.strip(" |/")]
    if len(iast_lines) != 2:
        return None
    counts = [aksharas(ln) for ln in iast_lines]
    if counts != [16, 16]:
        return None
    if record.get("translation_de") is None:
        return None
    return deva_lines


def title_for(num: int, iast: str) -> str:
    flat = re.sub(r"\s+", " ", re.sub(r"[|/\\]+", " ", iast)).strip()
    words = flat.split(" ")
    head = " ".join(words[:4])
    return f"Субхашита №{num} ({head}…)"


def clean_de(raw: str) -> str:
    return re.sub(r"^\s*\d+\s*\.\s*", "", raw.strip()).strip()


def existing_nums() -> set[int]:
    nums: set[int] = set()
    for path in (ROOT / "verses" / "data").glob("subh_*.json"):
        m = re.fullmatch(r"subh_(\d+)", path.stem)
        if m:
            nums.add(int(m.group(1)))
    return nums


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=20,
                        help="max new verses to emit (default 20)")
    parser.add_argument("--dry-run", action="store_true",
                        help="screen and report, write nothing")
    args = parser.parse_args()

    jsonl = github_root() / JSONL_REL
    if not jsonl.is_file():
        raise SystemExit(f"source dataset not found: {jsonl}")
    pin = sibling_commit()

    seen = existing_nums()
    emitted, passed, scanned = [], 0, 0
    for line in jsonl.open(encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        scanned += 1
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        num = record.get("num")
        if not isinstance(num, int) or num in seen:
            continue
        lines = screen(record)
        if lines is None:
            continue
        passed += 1
        if passed > args.limit:
            continue

        vid = f"subh_{num:04d}"
        verse = {
            "id": vid,
            "version": 1,
            "title": {
                "ru": title_for(num, record["iast"]),
                "en": title_for(num, record["iast"]).replace("Субхашита", "Subhāṣita"),
            },
            "source": {
                "text": SRC_TEXT,
                "verse": num,
                "attribution": f"Böhtlingk, Indische Sprüche №{num}",
            },
            "meter": "anushtubh",
            "difficulty": 2,
            "language_tags": ["de"],
            "encoding": "DEV",
            "s1": lines[0],
            "s2": lines[1],
            "s1dev": lines[0],
            "s2dev": lines[1],
            "translation": {
                "de": clean_de(record["translation_de"]),
                "provenance": {"de": "public-domain"},
                "rights": {"de": RIGHTS_DE},
            },
            "tags": ["subhashita", "bohtlingk", "indische-sprueche"],
            "created_at": CREATED,
            "import_meta": {
                "source_jsonl": "SanskritLexicography/IndischeSprueche/data/indische_sprueche.jsonl",
                "dataset": "kosha manifest id indische-sprueche (7,537 sayings, public domain)",
                "source_file_commit": pin,
                "saying_id": record.get("saying_id"),
                "page": record.get("page"),
                "iast_reference": re.sub(r"\s+", " ", record["iast"]).strip(),
                "screen": "auto: 2 lines x 16 akṣaras on IAST (machine count), deva line split matched; NO per-verse human curation yet — treat as auto-imported until hand-verified",
                "note": "Text-only feed verse (no audio yet). Auto-batch import (H4178); "
                        "unlike the curated first drop, no OCR corrections applied.",
            },
        }
        emitted.append((vid, verse))

    print(f"scanned {scanned} sayings; passed anuṣṭubh screen: {passed}; "
          f"emitting: {len(emitted)} (already in library: {len(seen)})")

    if args.dry_run:
        for vid, verse in emitted:
            print(f"  would emit {vid}: {verse['title']['ru']}")
        return

    out_dir = ROOT / "verses" / "data"
    for vid, verse in emitted:
        path = out_dir / f"{vid}.json"
        path.write_text(json.dumps(verse, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")
        print(f"  wrote {path.relative_to(ROOT)}")
    if emitted:
        print(f"\nnext: python tools/build_index.py && python tools/validate_library.py")


if __name__ == "__main__":
    main()
