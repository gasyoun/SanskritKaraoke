"""H5227 gold consonant-attack set: fixture integrity + scorer.

The fixture is the held-out reference for any future attack assigner
(docs/evidence/H5227_KARAOKE_GOLD_SET_VALLEY_ASSIGNER_21-09-2026.md): each
label must name the syllable the verse JSON actually has at that index, and
labels must run forward in time, or every score computed against it lies.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from align_chapter import syllabify_verse  # noqa: E402
from eval_gold_attacks import load_gold, pooled, score  # noqa: E402


def test_gold_labels_match_verse_syllables_and_run_forward():
    gold = load_gold()
    assert {"subh_2745", "subh_0292"} <= set(gold)
    assert len(gold) >= 3
    for vid, entry in gold.items():
        verse = json.loads((ROOT / "verses" / "data" / f"{vid}.json").read_text(encoding="utf-8"))
        s = syllabify_verse(verse)
        flat = s["s1"] + s["s2"]
        labels = entry["labels"]
        assert [l["i"] for l in labels] == sorted({l["i"] for l in labels}), vid
        for l in labels:
            assert l["syl"] == flat[l["i"]]["syl"], (vid, l)
            assert l["conf"] in ("high", "low"), (vid, l)
        ts = [l["t"] for l in labels]
        assert ts == sorted(ts), vid
        assert sum(l["conf"] == "high" for l in labels) >= 20, vid


def test_score_uses_only_high_confidence_labels():
    labels = [
        {"i": 0, "syl": "a", "t": 1.0, "conf": "high"},
        {"i": 1, "syl": "b", "t": 2.0, "conf": "low"},
        {"i": 2, "syl": "c", "t": 3.0, "conf": "high"},
    ]
    r = score([1.05, 9.0, 2.8], labels)
    assert r["n"] == 2
    assert r["max_ms"] == 200
    assert r["mean_ms"] == 125.0
    assert r["within100"] == 1
    assert r["monotonic"] is False
    p = pooled([r])
    assert p["n"] == 2
