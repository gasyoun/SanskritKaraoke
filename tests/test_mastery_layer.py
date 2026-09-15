"""Offline tests for tools/build_mastery_layer.py (H4719).

Runs the generator's build_digest() over a tiny synthetic schedule fixture —
no network, no sibling checkout needed.
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))

import build_mastery_layer as bml  # noqa: E402


def _fixture_raw():
    data = {
        "_doc": "fixture",
        "epoch": "2026-09-01T00:00:00Z",
        "families": {"sandhi": 2, "vocab": 3},
        "rows": [
            {"family": "sandhi", "id": "SD-0001", "ease": 0.9, "stability_days": 5.5, "due": "2026-09-01T00:00:00Z"},
            {"family": "sandhi", "id": "SD-0002", "ease": 1.0, "stability_days": 6.0, "due": "2026-09-01T00:00:00Z"},
            {"family": "vocab", "id": "V-0001", "ease": 0.0, "stability_days": 1.0, "due": "2026-09-01T00:00:00Z"},
            {"family": "vocab", "id": "V-0002", "ease": 0.5, "stability_days": 2.0, "due": "2026-09-02T00:00:00Z"},
            {"family": "vocab", "id": "V-0003", "ease": 0.74, "stability_days": 3.0, "due": "2026-09-02T00:00:00Z"},
        ],
    }
    return json.dumps(data).encode("utf-8")


def test_digest_aggregates():
    d = bml.build_digest(_fixture_raw())
    assert d["total_items"] == 5
    assert set(d["families"]) == {"sandhi", "vocab"}
    s = d["families"]["sandhi"]
    assert s["count"] == 2
    assert s["mean_ease"] == 0.95
    assert s["ease_buckets"]["0.75-1"] == 2
    v = d["families"]["vocab"]
    # 0.0 -> bucket 0, 0.5 -> bucket 2, 0.74 -> bucket 2
    assert v["ease_buckets"] == {"0-0.25": 1, "0.25-0.5": 0, "0.5-0.75": 2, "0.75-1": 0}
    assert v["due_min"] == "2026-09-01T00:00:00Z"
    assert v["due_max"] == "2026-09-02T00:00:00Z"
    assert d["_provenance"]["source_rows"] == 5
    assert len(d["_provenance"]["source_sha256"]) == 64


def test_digest_is_deterministic():
    raw = _fixture_raw()
    assert json.dumps(bml.build_digest(raw), sort_keys=True) == \
        json.dumps(bml.build_digest(raw), sort_keys=True)


def test_digest_rejects_out_of_range_ease():
    data = json.loads(_fixture_raw())
    data["rows"][0]["ease"] = 1.5
    raw = json.dumps(data).encode("utf-8")
    try:
        bml.build_digest(raw)
    except ValueError:
        pass
    else:
        raise AssertionError("ease 1.5 must raise ValueError")
