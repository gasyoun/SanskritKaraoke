"""Render-diff harness for the gloss-box layer (H4734 verification).

Reproduces exactly what student.html's renderGlosses() displays for a set of
verses -- one "sa — ru" line per gloss word, or "(gloss-box hidden)" when the
verse has no gloss layer -- so a before/after bake diff is a render diff.

Usage:
    python tools/render_gloss_diff.py bhg_2_47 bhg_2_48 bhg_2_49 subh_0001 subh_0550
"""

import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")


def render(verse):
    glosses = verse.get("glosses") or []
    if not isinstance(glosses, list) or not glosses:
        return "(gloss-box hidden)"
    lines = []
    for g in glosses:
        if not isinstance(g, dict) or not g.get("sa"):
            continue
        lines.append("{} — {}".format(g["sa"], g.get("ru") or "—"))
    return "\n".join(lines) if lines else "(gloss-box hidden)"


def main():
    ids = sys.argv[1:]
    if not ids:
        print("usage: render_gloss_diff.py ID [ID...]", file=sys.stderr)
        sys.exit(2)
    for vid in ids:
        path = os.path.join("verses", "data", "{}.json".format(vid))
        with open(path, "r", encoding="utf-8") as f:
            verse = json.load(f)
        src = verse.get("gloss_source") or {}
        print("### {} ({} words, {})".format(vid, len(verse.get("glosses") or []), src.get("provenance", "-")))
        print(render(verse))
        print()


if __name__ == "__main__":
    main()
