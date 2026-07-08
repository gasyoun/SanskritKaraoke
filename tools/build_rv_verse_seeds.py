"""Build the RV verse-seed table (H360) from the VedaWeb 2.0 metrical-data export.

Joins non-derived/vedaweb/metrical_data_2024.json (VedaWeb 2024 computer-generated
scansion + meter-type label, based on Van Nooten & Holland 1994) against
non-derived/vedaweb/accented_text_scarlata_widmer_lubotsky.json (H096, Zurich version
after Lubotsky) on the shared `location` key ("mandala.hymn.stanza").

Output is a lookup/seed table for verse SELECTION, not karaoke-ready verse records --
this only supplies meter label + accented text per RV stanza. Turning a seed row into
a full verses/data/<id>.json entry (translation, glosses, audio) is a separate,
per-verse editorial step; the audio gate at SanskritKaraoke still applies and is not
touched here.

Usage:
    python tools/build_rv_verse_seeds.py
"""
import json
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

VISUALDCS_VEDAWEB = "../VisualDCS/non-derived/vedaweb"
METRICAL_PATH = f"{VISUALDCS_VEDAWEB}/metrical_data_2024.json"
ACCENTED_PATH = f"{VISUALDCS_VEDAWEB}/accented_text_scarlata_widmer_lubotsky.json"
OUT_PATH = "src/data/rv_verse_seeds.json"

LOCATION_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


def load_contents(path):
    with open(path, encoding="utf-8") as f:
        doc = json.load(f)
    return doc, {row["location"]: row for row in doc["contents"]}


def meter_label(row):
    for c in row.get("comments", []) or []:
        m = re.match(r"Stanza Type:\s*(.+)", c.get("comment", ""))
        if m:
            return m.group(1).strip()
    return None


def main():
    metrical_doc, metrical_by_loc = load_contents(METRICAL_PATH)
    _, accented_by_loc = load_contents(ACCENTED_PATH)

    seeds = []
    missing_accented = 0
    for location, mrow in metrical_by_loc.items():
        m = LOCATION_RE.match(location)
        if not m:
            continue
        mandala, hymn, stanza = (int(x) for x in m.groups())
        arow = accented_by_loc.get(location)
        if arow is None:
            missing_accented += 1
        seeds.append(
            {
                "location": location,
                "mandala": mandala,
                "hymn": hymn,
                "stanza": stanza,
                "meter": meter_label(mrow),
                "scansion": mrow.get("text"),
                "accented_text": arow.get("text") if arow else None,
            }
        )

    seeds.sort(key=lambda r: (r["mandala"], r["hymn"], r["stanza"]))

    out = {
        "version": 1,
        "source": "H360 seed table (VedaWeb 2.0 metrical data x H096 accented text)",
        "license": "CC BY 4.0",
        "attribution": (
            "VedaWeb 2.0 – Universität zu Köln. Metrische Daten nach "
            "Van Nooten & Holland; accented text per Scarlata & Widmer (2017), "
            "after Lubotsky."
        ),
        "citation": metrical_doc.get("citation"),
        "count": len(seeds),
        "missing_accented_text": missing_accented,
        "verses": seeds,
    }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    print(f"wrote {len(seeds)} seed rows to {OUT_PATH} ({missing_accented} missing accented text)")


if __name__ == "__main__":
    main()
