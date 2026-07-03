#!/usr/bin/env python3
"""Import curated short subhāṣitas into the SanskritKaraoke verse feed.

Source: F. Böhtlingk, *Indische Sprüche* (2nd ed., St. Petersburg 1870–1873),
as ingested into VisualDCS `archive.sqlite` table `subhashita` (M9). Both the
Sanskrit and Böhtlingk's German rendering are public domain (Böhtlingk d. 1904).

This tool is SELF-CONTAINED: the ten first-drop verses were hand-selected and
hand-verified (metrical scansion checked against src/core/translit.js —
every verse is a clean 32-akṣara anuṣṭubh, 8/8/8/8), so the curated content is
embedded below and the JSON feed regenerates WITHOUT needing the 167 MB
gitignored archive.sqlite. Pass --verify-db PATH to cross-check the embedded
IAST against the database when it is available.

⚠ TEXT-ONLY FEED. These verses carry NO audio — audio is the biggest outstanding
gap for the karaoke pipeline (see .ai_state.md / the SanskritKaraoke pivot memo).
The `audio` block is intentionally omitted; validate_library.py will warn, which
correctly flags the audio need.

Rights: Sanskrit + German = public domain. No Russian/English translation is
fabricated here — the German is labelled explicitly as German (language_tags=["de"]).

Usage:
    python tools/import_subhashita.py                 # emit verses/data/subh_*.json
    python tools/import_subhashita.py --verify-db C:/.../archive.sqlite
"""
import argparse
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

TODAY = "2026-07-02"
SRC_TEXT = "Indische Sprüche (Böhtlingk)"
DB_TABLE = "subhashita"
DB_REL = "VisualDCS/src/DCS-data-2026/archive.sqlite"

RIGHTS_DE = {
    "rights_holder": "public domain (Otto von Böhtlingk, d. 1904)",
    "source": "Böhtlingk, O., Indische Sprüche, 2nd ed., St. Petersburg 1870–1873",
    "license": "public-domain",
    "status": "public-domain",
}

# Each curated verse. `deva` halves are hand-corrected (OCR fixes noted in
# `corrections`); `iast` is the reference IAST for the --verify-db cross-check.
CURATED = [
    {
        "num": 1249, "page": "1.237", "difficulty": 1,
        "tags": ["effort", "pancatantra"],
        "s1": "उद्यमेन हि सिध्यन्ति कार्याणि न मनोरथैः।",
        "s2": "नहि सुप्तस्य सिंहस्य प्रविशन्ति मुखे मृगाः॥",
        "iast": "udyamena hi sidhyanti kāryāṇi na manorathaiḥ | nahi suptasya siṃhasya praviśanti mukhe mṛgāḥ ||",
        "de": "Durch Anstrengung kommen ja Werke zu Stande, nicht durch Wünsche: es laufen ja die Gazellen nicht in den Rachen eines schlafenden Löwen.",
        "attribution": "Böhtlingk, Indische Sprüche №1249; Pañcatantra / Hitopadeśa",
        "corrections": [],
    },
    {
        "num": 6087, "page": "3.298", "difficulty": 1,
        "tags": ["knowledge", "hitopadesha"],
        "s1": "विद्या ददाति विनयं विनयाद्याति पात्रताम्।",
        "s2": "पात्रत्वाद्धनमाप्नोति धनाद्धर्मं ततः सुखम्॥",
        "iast": "vidyā dadāti vinayaṃ vinayādyāti pātratām | pātratvāddhanamāpnoti dhanāddharmaṃ tataḥ sukham ||",
        "de": "Wissen bringt gesittetes Benehmen, durch gesittetes Benehmen kommt man zur Würdigkeit, durch Würdigkeit erlangt man Schätze, durch Schätze moralisches Verdienst, durch moralisches Verdienst Freuden.",
        "attribution": "Böhtlingk, Indische Sprüche №6087; Hitopadeśa (prastāvikā)",
        "corrections": ["OCR: आप्न्नोति → आप्नोति (āpnnoti → āpnoti)"],
    },
    {
        "num": 550, "page": "1.102", "difficulty": 2,
        "tags": ["unity", "bhartrhari"],
        "s1": "अयं निजः परो वेति गणना लघुचेतसाम्।",
        "s2": "उदारचरितानां तु वसुधैव कुटुम्बकम्॥",
        "iast": "ayaṃ nijaḥ paro veti gaṇanā laghucetasām | udāracaritānāṃ tu vasudhaiva kuṭumbakam ||",
        "de": "«Dieser ist Einer von den Unsrigen oder ein Fremder», so rechnen Menschen von niederem Sinne; Männer von edler Handlungsweise dagegen betrachten die ganze Erde als ihre Familie.",
        "attribution": "Böhtlingk, Indische Sprüche №550; Bhartṛhari / Pañcatantra / Hitopadeśa",
        "corrections": ["German reconstructed from split translation_de + source_attribution fields in the DB"],
    },
    {
        "num": 648, "page": "1.121", "difficulty": 2,
        "tags": ["unity", "hitopadesha"],
        "s1": "अल्पानामपि वस्तूनां संहतिः कार्यसाधिका।",
        "s2": "तृणैर्गुणत्वमापन्नैर्बध्यन्ते मत्तदन्तिनः॥",
        "iast": "alpānāmapi vastūnāṃ saṃhatiḥ kāryasādhikā | tṛṇairguṇatvamāpannairbadhyante mattadantinaḥ ||",
        "de": "Das Zusammenwirken selbst unbedeutender Dinge führt zum Ziele: mit Gräsern, die zu Stricken zusammengefügt wurden, werden brünstige Elephanten gebunden.",
        "attribution": "Böhtlingk, Indische Sprüche №648; Hitopadeśa (mitralābha)",
        "corrections": [],
    },
    {
        "num": 3981, "page": "2.360", "difficulty": 2,
        "tags": ["paropakara"],
        "s1": "परोपकारः कर्तव्यः प्राणैः कण्ठगतैरपि।",
        "s2": "परोपकारजं पुण्यं तुल्यं क्रतुशतैरपि॥",
        "iast": "paropakāraḥ kartavyaḥ prāṇaiḥ kaṇṭhagatairapi | paropakārajaṃ puṇyaṃ tulyaṃ kratuśatairapi ||",
        "de": "Wir sollen Anderen helfen, selbst wenn die Lebensgeister uns schon in der Kehle stecken (d. h. selbst wenn wir dem Tode nahe sind): das Verdienst der Hilfeleistung kommt sogar hundert Opfern gleich.",
        "attribution": "Böhtlingk, Indische Sprüche №3981; Padmottarakhaṇḍa",
        "corrections": [],
    },
    {
        "num": 6665, "page": "3.420", "difficulty": 2,
        "tags": ["paropakara", "pancatantra"],
        "s1": "संक्षेपात्कथ्यते धर्मो जनाः किं विस्तरेण वः।",
        "s2": "परोपकारः पुण्याय पापाय परपीडनम्॥",
        "iast": "saṅkṣepātkathyate dharmo janāḥ kiṃ vistareṇa vaḥ | paropakāraḥ puṇyāya pāpāya parapīḍanam ||",
        "de": "In Kürze — und wozu bedürftet ihr vieler Worte? — lautet, o Leute, das Gesetz: Andern zu helfen bringt Verdienst, Andere zu peinigen — Sünde.",
        "attribution": "Böhtlingk, Indische Sprüche №6665; Pañcatantra",
        "corrections": [],
    },
    {
        "num": 1794, "page": "1.347", "difficulty": 3,
        "tags": ["paropakara"],
        "s1": "कुत्सितस्य शरीरस्य सारमस्ति गुणद्वयम्।",
        "s2": "परोपकारकरणं परमेश्वरपूजनम्॥",
        "iast": "kutsitasya śarīrasya sāramasti guṇadvayam | paropakārakaraṇaṃ parameśvarapūjanam ||",
        "de": "Das Beste am tadelhaften Körper sind zwei Vorzüge: die Andern erwiesene Hilfe und die Verehrung des höchsten Wesens.",
        "attribution": "Böhtlingk, Indische Sprüche №1794; Subhāṣitārṇava",
        "corrections": [],
    },
    {
        "num": 2852, "page": "2.131", "difficulty": 2,
        "tags": ["caution", "canakya"],
        "s1": "दुर्जनः प्रियवादी च नैतद्विश्वासकारणम्।",
        "s2": "मधु तिष्ठति जिह्वाग्रे हृदये तु हलाहलम्॥",
        "iast": "durjanaḥ priyavādī ca naitadviśvāsakāraṇam | madhu tiṣṭhati jihvāgre hṛdaye tu halāhalam ||",
        "de": "Wenn ein Bösewicht uns etwas Liebes sagt, so ist dieses kein Grund zum Vertrauen: auf der Zungenspitze ist Honig, im Herzen aber furchtbares Gift.",
        "attribution": "Böhtlingk, Indische Sprüche №2852; Cāṇakya / Hitopadeśa",
        "corrections": [
            "OCR: तिष्ठुति → तिष्ठति (tiṣṭhuti → tiṣṭhati)",
            "Reading: विश्वस → विश्वास (viśvasa → viśvāsa), per DB variant note and German 'Vertrauen'",
        ],
    },
    {
        "num": 6876, "page": "3.464", "difficulty": 3,
        "tags": ["character", "bhartrhari"],
        "s1": "संपत्सु महतां चित्तं भवत्युत्पलकोमलम्।",
        "s2": "आपत्सु च महाशैलशिलासंघातकर्कशम्॥",
        "iast": "saṃpatsu mahatāṃ cittaṃ bhavatyutpalakomalam | āpatsu ca mahāśailaśilāsaṅghātakarkaśam ||",
        "de": "Im Glück ist das Herz grosser Männer zart wie eine Lotusblüthe und im Unglück hart wie die Steinmasse eines grossen Berges.",
        "attribution": "Böhtlingk, Indische Sprüche №6876; Bhartṛhari, Nītiśataka",
        "corrections": [],
    },
    {
        "num": 6678, "page": "3.422", "difficulty": 3,
        "tags": ["unity", "kamandaki"],
        "s1": "संघातवान्यथा वेणुर्निबिडः कण्टकैर्वृतः।",
        "s2": "न शक्यते समुच्छेत्तुं भ्रातृसंघातवांस्तथा॥",
        "iast": "saṅghātavānyathā veṇurnibiḍaḥ kaṇṭakairvṛtaḥ | na śakyate samucchettuṃ bhrātṛsaṅghātavāṃstathā ||",
        "de": "Wie dichtes Bambusrohr, wenn es zusammen steht und von Dornen umgeben ist, nicht vernichtet werden kann, eben so wenig derjenige, der mit seinen Brüdern zusammen steht.",
        "attribution": "Böhtlingk, Indische Sprüche №6678; Kāmandakīya Nītisāra",
        "corrections": ["German OCR: 'umgehen' → 'umgeben'"],
    },
]


def build_verse(c):
    vid = f"subh_{c['num']:04d}"
    incipit = c["iast"].split("|")[0].strip()
    incipit_short = " ".join(incipit.split()[:3]) + "…"
    verse = {
        "id": vid,
        "version": 1,
        "title": {
            "ru": f"Субхашита №{c['num']} ({incipit_short})",
            "en": f"Subhāṣita №{c['num']} ({incipit_short})",
        },
        "source": {
            "text": SRC_TEXT,
            "verse": c["num"],
            "attribution": c["attribution"],
        },
        "meter": "anushtubh",
        "difficulty": c["difficulty"],
        "language_tags": ["de"],
        "encoding": "DEV",
        "s1": c["s1"],
        "s2": c["s2"],
        "s1dev": c["s1"],
        "s2dev": c["s2"],
        "translation": {
            "de": c["de"],
            "provenance": {"de": "public-domain"},
            "rights": {"de": dict(RIGHTS_DE)},
        },
        "tags": ["subhashita", "bohtlingk", *c["tags"]],
        "created_at": TODAY,
        "updated_at": TODAY,
        "import_meta": {
            "source_db": DB_REL,
            "source_table": DB_TABLE,
            "saying_id": f"Saying {c['num']}",
            "page": f"Page {c['page']}",
            "iast_reference": c["iast"],
            "corrections": c["corrections"],
            "note": "Text-only feed verse (no audio yet). Sanskrit + German are public domain; scansion verified as clean anuṣṭubh (8/8/8/8) via src/core/translit.js.",
        },
    }
    return vid, verse


def norm_iast(s):
    return re.sub(r"[\s|/]+", "", (s or "").lower())


def verify_db(db_path):
    import sqlite3
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    ok = True
    for c in CURATED:
        cur.execute(
            f"SELECT text_sa_iast FROM {DB_TABLE} WHERE saying_id=?",
            (f"Saying {c['num']}",),
        )
        row = cur.fetchone()
        if not row:
            print(f"  ✗ Saying {c['num']}: not found in DB")
            ok = False
            continue
        db_i = norm_iast(row[0])
        emb_i = norm_iast(c["iast"])
        # allow curated corrections to differ; report divergence for review
        if db_i == emb_i:
            print(f"  ✓ Saying {c['num']}: IAST matches DB")
        else:
            note = "; ".join(c["corrections"]) or "(no corrections recorded!)"
            print(f"  ~ Saying {c['num']}: differs from DB — {note}")
    con.close()
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify-db", metavar="PATH",
                    help="cross-check embedded IAST against archive.sqlite")
    ap.add_argument("--out", default=os.path.join("verses", "data"),
                    help="output directory (default: verses/data)")
    args = ap.parse_args()

    if args.verify_db:
        print(f"Verifying against {args.verify_db} ...")
        verify_db(args.verify_db)
        print()

    os.makedirs(args.out, exist_ok=True)
    written = 0
    for c in CURATED:
        vid, verse = build_verse(c)
        path = os.path.join(args.out, f"{vid}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(verse, f, ensure_ascii=False, indent=2)
            f.write("\n")
        written += 1
        print(f"wrote {path}")
    print(f"\n{written} subhāṣita verse(s) written to {args.out}/")


if __name__ == "__main__":
    main()
