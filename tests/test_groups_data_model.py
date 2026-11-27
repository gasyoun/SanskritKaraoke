"""Offline tests for the groups data model (H8416, MG ruling 18-11-2026).

Runs src/scripts/groups.js under node — no network, no Firebase, no browser.
Guards the firestore.rules groups block so the shapes/membership semantics
the JS module mirrors and the rules enforce cannot drift apart, and pins the
global leaderboard block so group work cannot change global-board behaviour.
"""

import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
GROUPS_JS = REPO / "src" / "scripts" / "groups.js"
RULES = REPO / "firestore.rules"

NODE_PROBE = r"""
import { validateGroupDoc, isGroupMember, filterLeaderboardByMembers,
         GROUP_NAME_MAX, GROUP_MEMBERS_MAX } from 'file:///SRC_GROUPS_JS';

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };
const ok = (doc) => validateGroupDoc(doc).ok;
const errs = (doc) => validateGroupDoc(doc).errors;

// 1. exact shape: exactly 3 keys, types and bounds mirroring hasGroupShape()
const valid = { name: 'Āryāṣaṭ 2026 cohort', members: ['uid-a', 'uid-b'], updated_at: '2026-11-27T00:00:00Z' };
assert(ok(valid), 'valid doc accepted, errors: ' + JSON.stringify(errs(valid)));
assert(GROUP_NAME_MAX === 120 && GROUP_MEMBERS_MAX === 500, 'bounds constants match rules');

// every bad variant is rejected
assert(!ok({}), 'missing keys rejected');
assert(!ok({ ...valid, extra: 1 }), 'extra key rejected');
assert(!ok({ name: '', members: [], updated_at: 't' }), 'empty name rejected');
assert(!ok({ name: 'x'.repeat(121), members: [], updated_at: 't' }), '121-char name rejected');
assert(ok({ name: 'x'.repeat(120), members: [], updated_at: 't' }), '120-char name accepted');
assert(!ok({ name: 'g', members: 'uid-a', updated_at: 't' }), 'members-as-string rejected');
assert(!ok({ name: 'g', members: Array(501).fill('u'), updated_at: 't' }), '501 members rejected');
assert(ok({ name: 'g', members: Array(500).fill('u'), updated_at: 't' }), '500 members accepted');
assert(!ok({ name: 'g', members: [], updated_at: 5 }), 'numeric updated_at rejected');
assert(!ok(null) && !ok('junk') && !ok([valid]), 'non-object doc rejected');
assert(errs({ name: 'g', members: 7, updated_at: 8 }).length === 2, 'collects multiple errors');

// 2. membership mirror of rules isGroupMember()
assert(isGroupMember('uid-a', valid) && isGroupMember('uid-b', valid), 'listed member -> true');
assert(!isGroupMember('uid-x', valid), 'non-member -> false');
assert(!isGroupMember(null, valid) && !isGroupMember(undefined, valid), 'anonymous -> false');
assert(!isGroupMember('uid-a', null) && !isGroupMember('uid-a', {}), 'missing members list -> false');

// 3. group board = public leaderboard rows filtered by own group members
const rows = [
  { id: 'uid-a', displayName: 'A', mastered_count: 30, streak_days: 5 },
  { id: 'uid-x', displayName: 'X', mastered_count: 99, streak_days: 9 },  // other group
  { id: 'uid-b', displayName: 'B', mastered_count: 10, streak_days: 1 },
];
const board = filterLeaderboardByMembers(rows, valid.members);
assert(board.length === 2 && board[0].id === 'uid-a' && board[1].id === 'uid-b',
  'only member rows survive, got ' + JSON.stringify(board.map(r => r.id)));
assert(filterLeaderboardByMembers(null, valid.members).length === 0, 'null rows -> empty board');
assert(filterLeaderboardByMembers(rows, null).length === 0, 'null members -> empty board');
assert(filterLeaderboardByMembers([{ nope: 1 }, null], ['u']).length === 0, 'malformed rows dropped');

console.log('ALL_GROUPS_JS_TESTS_PASSED');
"""


def test_groups_js():
    code = NODE_PROBE.replace("file:///SRC_GROUPS_JS", "file://" + str(GROUPS_JS))
    result = subprocess.run(
        ["node", "--input-type=module", "-e", code],
        capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, f"node probe failed:\n{result.stdout}\n{result.stderr}"
    assert "ALL_GROUPS_JS_TESTS_PASSED" in result.stdout, result.stdout


def test_rules_groups_block():
    rules = RULES.read_text(encoding="utf-8")
    match_block = re.search(r"match /groups/\{groupId\} \{(.*?)\}", rules, re.S)
    assert match_block, "firestore.rules must contain the groups/{groupId} match block"
    body = match_block.group(1)
    assert "allow read: if isTeacher() || isGroupMember();" in body, \
        "a student may read only their own group; teacher reads all"
    assert "allow create, update: if isTeacher() && hasGroupShape();" in body, \
        "membership writes must be teacher-only + shape-gated"
    assert "allow delete: if false;" in body, "deletes must stay closed"

    shape = re.search(r"function hasGroupShape\(\) \{(.*?)\n    \}", rules, re.S)
    assert shape, "hasGroupShape() must be defined"
    s = shape.group(1)
    assert "hasAll(['name', 'members', 'updated_at'])" in s and "hasOnly(['name', 'members', 'updated_at'])" in s, \
        "shape fn needs hasAll+hasOnly over the exact 3-key set"
    assert "name.size() > 0" in s and "name.size() <= 120" in s, "name bounds 1..120"
    assert "members is list" in s and "members.size() <= 500" in s, "members list cap 500"
    assert "updated_at is string" in s, "updated_at must be a string"

    member = re.search(r"function isGroupMember\(\) \{(.*?)\n    \}", rules, re.S)
    assert member, "isGroupMember() must be defined"
    assert "request.auth != null" in member.group(1), "membership requires an authenticated user"
    assert "request.auth.uid in resource.data.members" in member.group(1), \
        "membership = uid in the group doc's members list"


def test_rules_groups_fn_wired():
    rules = RULES.read_text(encoding="utf-8")
    assert rules.count("function hasGroupShape()") == 1, "hasGroupShape defined exactly once"
    assert rules.count("function isGroupMember()") == 1, "isGroupMember defined exactly once"
    groups_pos = rules.find("match /groups/{groupId}")
    leaderboard_pos = rules.find("match /leaderboard/{uid}")
    assert groups_pos > 0 and leaderboard_pos > 0 and groups_pos > leaderboard_pos, \
        "groups block sits beside (after) the leaderboard block in firestore.rules"


def test_rules_teacher_gate_pinned():
    """Council finding (H8416 verify): isTeacher() must stay a real email
    allowlist — if it ever drifted to `request.auth != null`, group writes
    would open to any authenticated user while every other guard still passed."""
    rules = RULES.read_text(encoding="utf-8")
    fn = re.search(r"function isTeacher\(\) \{(.*?)\n    \}", rules, re.S)
    assert fn, "isTeacher() must be defined"
    body = fn.group(1)
    assert "request.auth != null" in body, "teacher gate requires an authenticated user"
    assert "request.auth.token.email" in body, "teacher gate must check the verified email"
    assert "'gasyoun@gmail.com'" in body, "teacher allowlist must pin the actual email"


def test_global_leaderboard_unchanged():
    """H8416 step 3 second half: global boards must stay exactly as PR #232 shipped."""
    rules = RULES.read_text(encoding="utf-8")
    match_block = re.search(r"match /leaderboard/\{uid\} \{(.*?)\}", rules, re.S)
    assert match_block, "leaderboard/{uid} match block must still exist"
    body = match_block.group(1)
    assert "allow read: if true;" in body, "global leaderboard must stay publicly readable"
    assert "isOwner(uid) && hasLeaderboardShape()" in body, "writes stay owner-only + shape-gated"
    assert "allow delete: if false;" in body, "deletes stay closed"
    assert "group" not in body.lower(), "leaderboard block must not reference groups — global board is group-free"
    shape = re.search(r"function hasLeaderboardShape\(\) \{(.*?)\n    \}", rules, re.S)
    assert shape, "hasLeaderboardShape() must still be defined"
    s = shape.group(1)
    assert "hasAll(['displayName', 'mastered_count', 'streak_days', 'updated_at'])" in s, \
        "4-key row shape unchanged"
    assert "hasOnly(['displayName', 'mastered_count', 'streak_days', 'updated_at'])" in s, \
        "no extra keys leaked into the row shape"
