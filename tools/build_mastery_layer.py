#!/usr/bin/env python3
"""Build the karaoke reader-surface mastery layer from kosha's combined schedule.

Consumes kosha-mastery-schedule (H3742: one row per drill item across the five
drill families, ease 0..1) and emits a compact per-family digest that
``mastery.html`` renders. Deterministic: output contains no wall-clock stamps,
so two runs over the same source are byte-identical.

Usage:
    python tools/build_mastery_layer.py                     # sibling kosha checkout
    python tools/build_mastery_layer.py --source PATH.json  # explicit source
    python tools/build_mastery_layer.py --url RAW_URL       # fetch from GitHub raw

Output: verses/mastery/schedule_summary.json
"""
import argparse
import hashlib
import json
import os
import sys
import urllib.request

DEFAULT_SOURCE = os.path.join(
    os.path.expanduser("~"), "Documents", "GitHub", "kosha", "data",
    "mastery", "combined_schedule.json")

FAMILY_LABELS = {
    "sandhi": "Сандхи",
    "samasa": "Композиты (самасы)",
    "morphology": "Морфология",
    "vocab": "Словарь",
    "thematic_vocab": "Тематический словарь",
}

SOURCE_REPO = "https://github.com/gasyoun/kosha"
SOURCE_PATH = "data/mastery/combined_schedule.json"
DATASET_ID = "kosha-mastery-schedule"


def load_source(args):
    if args.url:
        with urllib.request.urlopen(args.url, timeout=60) as resp:
            return resp.read()
    path = args.source
    if not os.path.exists(path):
        sys.exit(f"source not found: {path} (use --source or --url)")
    with open(path, "rb") as f:
        return f.read()


def build_digest(raw):
    sha = hashlib.sha256(raw).hexdigest()
    data = json.loads(raw.decode("utf-8"))
    rows = data["rows"]
    families = {}

    for fam, declared in sorted(data["families"].items()):
        fr = [r for r in rows if r["family"] == fam]
        if len(fr) != declared:
            raise ValueError(
                f"family {fam}: {len(fr)} rows, header declares {declared}")
        buckets = [0, 0, 0, 0]
        ease_sum = 0.0
        stab_sum = 0.0
        due_min = due_max = None
        for r in fr:
            ease = float(r["ease"])
            if not 0.0 <= ease <= 1.0:
                raise ValueError(f"{fam}/{r['id']}: ease {ease} out of 0..1")
            buckets[min(3, int(ease * 4))] += 1
            ease_sum += ease
            stab_sum += float(r["stability_days"])
            due = r["due"]
            if due_min is None or due < due_min:
                due_min = due
            if due_max is None or due > due_max:
                due_max = due
        n = len(fr)
        families[fam] = {
            "label": FAMILY_LABELS.get(fam, fam),
            "count": n,
            "mean_ease": round(ease_sum / n, 4),
            "ease_buckets": {
                "0-0.25": buckets[0],
                "0.25-0.5": buckets[1],
                "0.5-0.75": buckets[2],
                "0.75-1": buckets[3],
            },
            "mean_stability_days": round(stab_sum / n, 2),
            "due_min": due_min,
            "due_max": due_max,
        }

    total = sum(f["count"] for f in families.values())
    mean_ease = round(
        sum(f["mean_ease"] * f["count"] for f in families.values()) / total, 4)

    return {
        "version": 1,
        "dataset": DATASET_ID,
        "epoch": data.get("epoch"),
        "total_items": total,
        "mean_ease": mean_ease,
        "families": families,
        "_provenance": {
            "source_repo": SOURCE_REPO,
            "source_path": SOURCE_PATH,
            "source_sha256": sha,
            "source_rows": len(rows),
            "generator": "tools/build_mastery_layer.py",
            "note": "ease is the shared 0..1 mastery weight (higher = easier); "
                    "see kosha data/MASTERY_WEIGHTS_SPEC.md",
        },
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", default=DEFAULT_SOURCE)
    ap.add_argument("--url", default=None,
                    help="fetch the source JSON from a raw URL instead")
    args = ap.parse_args()

    digest = build_digest(load_source(args))

    out_path = os.path.join("verses", "mastery", "schedule_summary.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(digest, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{out_path} written ({digest['total_items']} items, "
          f"{len(digest['families'])} families, "
          f"mean ease {digest['mean_ease']}, source sha256 "
          f"{digest['_provenance']['source_sha256'][:12]}…)")


if __name__ == "__main__":
    main()
