"""Golden SRT/VTT from committed bhg_2_47 timing fixture (H3261)."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tools" / "fixtures"


def test_export_captions_matches_golden(tmp_path: Path) -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    cmd = [
        "node",
        str(ROOT / "tools" / "export_captions.mjs"),
        str(ROOT / "verses" / "data" / "bhg_2_47.json"),
        "--timing",
        str(FIXTURES / "bhg_2_47_timing.json"),
        "--out",
        str(tmp_path),
    ]
    subprocess.run(cmd, check=True, cwd=ROOT, encoding="utf-8")
    got_srt = (tmp_path / "bhg_2_47.srt").read_text(encoding="utf-8")
    got_vtt = (tmp_path / "bhg_2_47.vtt").read_text(encoding="utf-8")
    want_srt = (FIXTURES / "bhg_2_47.srt").read_text(encoding="utf-8")
    want_vtt = (FIXTURES / "bhg_2_47.vtt").read_text(encoding="utf-8")
    assert got_srt == want_srt
    assert got_vtt == want_vtt
    assert got_vtt.startswith("WEBVTT")
    assert "kar" in got_srt
    assert " --> " in got_srt
