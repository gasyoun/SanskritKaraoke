"""Bake a per-word Russian gloss layer into the verse JSON files.

Source of truth: the Sa->Ru word-alignment corpus owned by SanskritLexicography
(`RussianTranslation/src/corpus_lexicon.jsonl`, ~1.09M word-aligned SLP1 keys).
That corpus is *verse-aligned* (each row = one word of one passage, with its SLP1
key, IAST form and Russian gloss), so we match by work + passage and copy the
per-word glosses straight in -- no sandhi segmentation needed.

This is a build-time generator, like build_index.py: the Karaoke app is a static
site and cannot read the sibling repo at runtime, so the gloss data is embedded
into each `verses/data/<id>.json` here.

Usage:
    python tools/build_glosses.py                # all verses, default corpus path
    python tools/build_glosses.py --dry-run      # report only, write nothing
    python tools/build_glosses.py --corpus PATH  # override corpus location
    python tools/build_glosses.py bhg_2_47       # a single verse id

The corpus location defaults to the sibling clone and can be overridden with
--corpus or the KARAOKE_CORPUS_LEXICON env var.
"""

import argparse
import json
import os
import sys
from glob import glob

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

DEFAULT_CORPUS = os.path.join(
    "..", "SanskritLexicography", "RussianTranslation", "src", "corpus_lexicon.jsonl"
)

# Which corpus *work* (edition) supplies the glosses for a given verse source.
# The edition is chosen to match the licensed translation already cited in the
# verse JSON's translation.rights block (these Gita verses use Sementsov's RU).
# A verse may override this by pre-setting gloss_source.work in its JSON.
EDITION_BY_SOURCE = {
    "bhagavad gita": "bhagavadgita-sementsov",
}

RIGHTS_NOTE = (
    "Word-level RU glosses are a machine word-alignment over the source "
    "translation; they inherit that translation's rights (see translation.rights)."
)


def norm(s):
    return (s or "").strip().lower()


def corpus_key(verse):
    """Return (work, passage) for a verse, or None if it can't be mapped."""
    gs = verse.get("gloss_source") or {}
    work = gs.get("work")
    src = verse.get("source") or {}
    chapter, vno = src.get("chapter"), src.get("verse")
    if chapter is None or vno is None:
        return None
    passage = "{}.{}".format(chapter, vno)
    if not work:
        work = EDITION_BY_SOURCE.get(norm(src.get("text")))
    if not work:
        return None
    return work, passage


def load_glosses(corpus_path, wanted):
    """One streaming pass: collect translation rows for the wanted (work,passage) pairs.

    Returns {(work, passage): [ {slp1, sa, ru}, ... ] } preserving file order.
    """
    found = {key: [] for key in wanted}
    with open(corpus_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            key = (row.get("work"), row.get("passage"))
            if key not in found:
                continue
            if row.get("kind") != "translation":
                continue  # skip commentary glosses; keep the verse-translation layer
            found[key].append(
                {"slp1": row.get("slp1", ""), "sa": row.get("sa", ""), "ru": row.get("ru", "")}
            )
    return found


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("ids", nargs="*", help="verse ids to process (default: all)")
    ap.add_argument("--corpus", default=os.environ.get("KARAOKE_CORPUS_LEXICON", DEFAULT_CORPUS))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(args.corpus):
        print("Error: corpus not found at {}".format(args.corpus))
        print("Pass --corpus PATH or set KARAOKE_CORPUS_LEXICON.")
        sys.exit(1)

    files = sorted(glob(os.path.join("verses", "data", "*.json")))
    if args.ids:
        wanted_ids = set(args.ids)
        files = [f for f in files if os.path.splitext(os.path.basename(f))[0] in wanted_ids]
        if not files:
            print("No matching verse files for: {}".format(", ".join(args.ids)))
            sys.exit(1)

    verses = {}
    keys = {}
    for path in files:
        with open(path, "r", encoding="utf-8") as f:
            verse = json.load(f)
        verses[path] = verse
        key = corpus_key(verse)
        keys[path] = key
        if key is None:
            print("- {}: no corpus mapping (skipped)".format(os.path.basename(path)))

    wanted = {k for k in keys.values() if k is not None}
    if not wanted:
        print("Nothing to do.")
        return

    glosses_by_key = load_glosses(args.corpus, wanted)

    written = 0
    for path, verse in verses.items():
        key = keys[path]
        if key is None:
            continue
        work, passage = key
        glosses = glosses_by_key.get(key, [])
        name = os.path.basename(path)
        if not glosses:
            print("- {}: no rows in corpus for {}:{}".format(name, work, passage))
            continue
        verse["glosses"] = glosses
        verse["gloss_source"] = {
            "corpus": "SanskritLexicography/RussianTranslation/src/corpus_lexicon.jsonl",
            "work": work,
            "passage": passage,
            "provenance": "corpus-align",
            "rights_note": RIGHTS_NOTE,
        }
        if args.dry_run:
            print("~ {}: {} glosses from {}:{} (dry-run)".format(name, len(glosses), work, passage))
            continue
        with open(path, "w", encoding="utf-8") as f:
            json.dump(verse, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print("✓ {}: {} glosses from {}:{}".format(name, len(glosses), work, passage))
        written += 1

    if not args.dry_run:
        print("\nUpdated {} verse file(s).".format(written))


if __name__ == "__main__":
    main()
