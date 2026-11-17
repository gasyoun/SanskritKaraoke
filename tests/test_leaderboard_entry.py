"""Offline tests for the public leaderboard entry builder (ROADMAP.md Phase 3,
leaderboard checkbox — drained 17-11-2026).

Runs src/scripts/leaderboard.js under node — no network, no Firebase, no
browser. Also guards the firestore.rules leaderboard block so the shape the
JS builder emits and the shape the rules accept cannot drift apart.
"""
import json
import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
LEADERBOARD_JS = REPO / "src" / "scripts" / "leaderboard.js"
RULES = REPO / "firestore.rules"

NODE_PROBE = r"""
import { buildLeaderboardEntry, computeMasteredCount, LEADERBOARD_MASTERED_INTERVAL } from 'file:///SRC_LEADERBOARD_JS';

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };

// 1. mastered rule: interval >= 21, non-numeric / missing intervals are skipped
const recs = [
  { id: 'a', interval: 21 },
  { id: 'b', interval: 40 },
  { id: 'c', interval: 20.9 },
  { id: 'd', interval: '25' },      // numeric string counts (Number() coercion)
  { id: 'e' },                       // missing interval
  { id: 'f', interval: NaN },
  { id: 'g', interval: 'abc' },
];
assert(computeMasteredCount(recs) === 3, 'mastered count, got ' + computeMasteredCount(recs));
assert(computeMasteredCount([]) === 0, 'empty payload -> 0');
assert(computeMasteredCount(null) === 0, 'null payload -> 0');
assert(computeMasteredCount('junk') === 0, 'non-array payload -> 0');

// 2. exact rule shape: exactly 4 keys, right types, bounds enforced
const e = buildLeaderboardEntry(recs, 'Mārcis Āryāṣaṭ', 7, '2026-11-17T00:00:00Z');
assert(JSON.stringify(Object.keys(e)) === JSON.stringify(['displayName','mastered_count','streak_days','updated_at']), 'exact key set: ' + Object.keys(e));
assert(e.displayName === 'Mārcis Āryāṣaṭ', 'displayName passthrough');
assert(e.mastered_count === 3 && Number.isInteger(e.mastered_count), 'mastered_count integer');
assert(e.streak_days === 7 && Number.isInteger(e.streak_days), 'streak_days integer');

// 3. bounds: name capped at 120, streak clamped to non-negative integer
const long = buildLeaderboardEntry([], 'x'.repeat(500), 0, 't');
assert(long.displayName.length === 120, 'displayName cap 120, got ' + long.displayName.length);
assert(buildLeaderboardEntry([], 'n', -5, 't').streak_days === 0, 'negative streak clamps to 0');
assert(buildLeaderboardEntry([], 'n', 2.7, 't').streak_days === 3, 'fractional streak rounds');
assert(buildLeaderboardEntry([], undefined, 3, 't').displayName === '', 'missing name -> empty string');

console.log('ALL_LEADERBOARD_JS_TESTS_PASSED');
"""


def test_leaderboard_js():
    src = str(LEADERBOARD_JS)
    code = NODE_PROBE.replace("file:///SRC_LEADERBOARD_JS", "file://" + src)
    result = subprocess.run(
        ["node", "--input-type=module", "-e", code],
        capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, f"node probe failed:\n{result.stdout}\n{result.stderr}"
    assert "ALL_LEADERBOARD_JS_TESTS_PASSED" in result.stdout, result.stdout


def test_rules_leaderboard_block_matches_js_shape():
    rules = RULES.read_text(encoding="utf-8")
    match_block = re.search(r"match /leaderboard/\{uid\} \{(.*?)\}", rules, re.S)
    assert match_block, "firestore.rules must contain the leaderboard/{uid} match block"
    body = match_block.group(1)
    assert "allow read: if true;" in body, "leaderboard must be publicly readable"
    assert "isOwner(uid) && hasLeaderboardShape()" in body, "writes must be owner-only + shape-gated"
    assert "allow delete: if false;" in body, "deletes must stay closed"
    for key in ("displayName", "mastered_count", "streak_days", "updated_at"):
        assert f"'{key}'" in rules, f"hasLeaderboardShape must pin '{key}'"
    assert "displayName.size() <= 120" in rules, "rules must pin the 120-char name cap"
    fn = re.search(r"function hasLeaderboardShape\(\) \{(.*?)\n    \}", rules, re.S)
    assert fn and "hasAll" in fn.group(1) and "hasOnly" in fn.group(1), "shape fn needs hasAll+hasOnly"


def test_cloud_sync_wires_leaderboard_hooks():
    sync = (REPO / "src" / "scripts" / "cloud_sync.js").read_text(encoding="utf-8")
    assert "import { buildLeaderboardEntry } from './leaderboard.js';" in sync
    assert sync.count("syncLeaderboardRow(") >= 3, "writer + two call sites (srs_v1 save, login)"
    assert "dataType === 'srs_v1') syncLeaderboardRow(payload);" in sync
    assert "runtime.doc(runtime.db, 'leaderboard'" in sync


def test_nav_links_present():
    for page in ("index.html", "progress.html", "profile.html"):
        html = (REPO / page).read_text(encoding="utf-8")
        assert 'href="leaderboard.html"' in html, f"{page} must link to the leaderboard"


def test_leaderboard_page_smoke():
    html = (REPO / "leaderboard.html").read_text(encoding="utf-8")
    assert "collection(db, 'leaderboard')" in html, "page must read the leaderboard collection"
    assert "board-streak" in html and "board-mastered" in html, "two boards must exist"
    assert "<script type=\"module\">" in html, "page script must be a module (top-level await + import)"
