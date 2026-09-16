"""Bake a per-word Russian gloss layer into the verse JSON files.

Source of truth: the Sa->Ru word-alignment corpus owned by SanskritLexicography
(`RussianTranslation/src/corpus_lexicon.jsonl`, ~1.09M word-aligned SLP1 keys).
That corpus is *verse-aligned* (each row = one word of one passage, with its SLP1
key, IAST form and Russian gloss), so we match by work + passage and copy the
per-word glosses straight in -- no sandhi segmentation needed.

This is a build-time generator, like build_index.py: the Karaoke app is a static
site and cannot read the sibling repo at runtime, so the gloss data is embedded
into each `verses/data/<id>.json` here.

H4734: Gita verses prefer the hand-curated gita-gold-master layer
(kosha/data/gita/gita_gold_master.tsv, 9,092 gold words, all 18 adhyayas) --
word-by-word glosses (RU+EN) with morphology -- falling back to the machine
corpus-alignment only when the master has no rows for the passage.

Usage:
    python tools/build_glosses.py                # all verses, default corpus path
    python tools/build_glosses.py --dry-run      # report only, write nothing
    python tools/build_glosses.py --corpus PATH  # override corpus location
    python tools/build_glosses.py --gold PATH    # override gita-gold-master path
    python tools/build_glosses.py --no-gold      # legacy corpus-align only
    python tools/build_glosses.py bhg_2_47       # a single verse id

The corpus location defaults to the sibling clone and can be overridden with
--corpus or the KARAOKE_CORPUS_LEXICON env var; the gold master with --gold or
KARAOKE_GITA_GOLD.
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

# H4734: hand-curated word-by-word gloss+morphology master for the Gita
# (kosha dataset `gita-gold-master`, 9,092 gold words, all 18 adhyayas).
# For Gita verses this takes precedence over the machine word-alignment:
# the gold glosses are hand-curated and carry morphology.
DEFAULT_GOLD = os.path.join("..", "kosha", "data", "gita", "gita_gold_master.tsv")

GOLD_RIGHTS_NOTE = (
    "Word-level glosses + morphology from the hand-curated Gita gold master "
    "(Dr. Mārcis Gasūns, Gita.xlsm), distributed as kosha dataset "
    "gita-gold-master (CC BY-SA 4.0)."
)

# Which corpus *work* (edition) supplies the glosses for a given verse source.
# The edition is chosen to match the licensed translation already cited in the
# verse JSON's translation.rights block (these Gita verses use Sementsov's RU).
# A verse may override this by pre-setting gloss_source.work in its JSON.
EDITION_BY_SOURCE = {
    "bhagavad gita": "bhagavadgita-sementsov",
}

# Which verses are covered by the gita-gold-master (H4734): source text ->
# gold master applies. Gita verses bake the hand-curated layer when the
# master has rows for the passage; everything else stays corpus-align.
GOLD_BY_SOURCE = {
    "bhagavad gita": "gita-gold-master",
}

# Morphology columns copied verbatim from the gold master into word.morph.
GOLD_MORPH_COLS = (
    "form_type",
    "code",
    "tense",
    "pada",
    "vclass",
    "root",
    "root_tr",
    "prefix",
    "stem_end",
    "gender",
    "compound",
    "mark",
    "rule",
)

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


def gold_key(verse):
    """Return the gold-master passage key for a verse, or None if not Gita."""
    src = verse.get("source") or {}
    chapter, vno = src.get("chapter"), src.get("verse")
    if chapter is None or vno is None:
        return None
    if norm(src.get("text")) not in GOLD_BY_SOURCE:
        return None
    return "{}.{}".format(chapter, vno)


def load_gold(gold_path, wanted):
    """One streaming pass over the gita-gold-master TSV.

    Returns {passage: [word, ...]} preserving file order, where each word is
    a baked glosses[] item: {sa, ru, gloss_en, lemma, dev, morph{...}} with
    empty values dropped.
    """
    found = {key: [] for key in wanted}
    with open(gold_path, "r", encoding="utf-8", newline="") as f:
        header = f.readline().rstrip("\n").split("\t")
        idx = {name: i for i, name in enumerate(header)}
        for line in f:
            cols = line.rstrip("\n").split("\t")
            if len(cols) < len(header):
                continue
            passage = cols[idx["verse"]].strip()
            if passage not in found:
                continue
            word = {}
            for field in ("iast", "gloss_ru", "gloss_en", "lemma", "devanagari"):
                val = cols[idx[field]].strip()
                if val:
                    key = {
                        "devanagari": "dev",
                        "iast": "sa",
                        "gloss_ru": "ru",
                    }.get(field, field)
                    word[key] = val
            morph = {}
            for col in GOLD_MORPH_COLS:
                val = cols[idx[col]].strip()
                if val:
                    morph[col] = val
            if morph:
                word["morph"] = morph
            if word.get("sa") and word.get("ru"):
                found[passage].append(word)
    return found


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("ids", nargs="*", help="verse ids to process (default: all)")
    ap.add_argument("--corpus", default=os.environ.get("KARAOKE_CORPUS_LEXICON", DEFAULT_CORPUS))
    ap.add_argument("--gold", default=os.environ.get("KARAOKE_GITA_GOLD", DEFAULT_GOLD))
    ap.add_argument(
        "--no-gold",
        action="store_true",
        help="skip the gita-gold-master layer (legacy corpus-align behaviour only)",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    have_corpus = os.path.exists(args.corpus)
    have_gold = (not args.no_gold) and os.path.exists(args.gold)
    if not have_corpus:
        print("Note: corpus not found at {} (corpus-align layer unavailable).".format(args.corpus))
    if not args.no_gold and not have_gold:
        print("Note: gita-gold-master not found at {} (gold layer unavailable).".format(args.gold))
    if not have_corpus and not have_gold:
        print("Error: no gloss source available (corpus and gold master both missing).")
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
    gold_keys = {}
    for path in files:
        with open(path, "r", encoding="utf-8") as f:
            verse = json.load(f)
        verses[path] = verse
        key = corpus_key(verse)
        keys[path] = key
        gold_keys[path] = gold_key(verse) if have_gold else None
        if key is None and gold_keys[path] is None:
            print("- {}: no corpus mapping (skipped)".format(os.path.basename(path)))

    wanted = {k for k in keys.values() if k is not None}
    glosses_by_key = load_glosses(args.corpus, wanted) if (wanted and have_corpus) else {}

    gold_wanted = {k for k in gold_keys.values() if k is not None}
    gold_by_key = load_gold(args.gold, gold_wanted) if gold_wanted else {}

    written = 0
    for path, verse in verses.items():
        name = os.path.basename(path)
        passage = gold_keys[path]
        gold_words = gold_by_key.get(passage, []) if passage else []
        if gold_words:
            verse["glosses"] = gold_words
            verse["gloss_source"] = {
                "corpus": "kosha/data/gita/gita_gold_master.tsv",
                "work": "gita-gold-master",
                "passage": passage,
                "provenance": "gita-gold-hand-curated",
                "rights_note": GOLD_RIGHTS_NOTE,
            }
        else:
            key = keys[path]
            if key is None:
                continue
            work, cpassage = key
            glosses = glosses_by_key.get(key, [])
            if not glosses:
                print("- {}: no rows in corpus or gold for {}:{}".format(name, work, cpassage))
                continue
            passage = cpassage
            verse["glosses"] = glosses
            verse["gloss_source"] = {
                "corpus": "SanskritLexicography/RussianTranslation/src/corpus_lexicon.jsonl",
                "work": work,
                "passage": passage,
                "provenance": "corpus-align",
                "rights_note": RIGHTS_NOTE,
            }
        src_label = "gita-gold-master" if gold_words else verse["gloss_source"]["work"]
        if args.dry_run:
            print(
                "~ {}: {} glosses from {}:{} (dry-run)".format(
                    name, len(verse["glosses"]), src_label, passage
                )
            )
            continue
        with open(path, "w", encoding="utf-8") as f:
            json.dump(verse, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print("✓ {}: {} glosses from {}:{}".format(name, len(verse["glosses"]), src_label, passage))
        written += 1

    if not args.dry_run:
        print("\nUpdated {} verse file(s).".format(written))


if __name__ == "__main__":
    main()
