// Groups data model (H8416, MG ruling 18-11-2026) — pure helpers mirroring
// the groups block in firestore.rules. No DOM, no Firebase, no localStorage.
// Tested by tests/test_groups_data_model.py via node.
//
// Firestore doc: groups/{groupId} — teacher-managed cohort:
//   { name: string(1..120), members: [uid, ...](≤500), updated_at: string }
//
// The members list IS the membership wiring: a signed-in student may read
// only groups whose members list contains their uid (rules isGroupMember()),
// and the group-scoped board (follow-up UI unit) is the already-public
// leaderboard collection filtered by that member list client-side. Global
// leaderboard/{uid} behaviour is unchanged — public read, owner-only write,
// exact 4-key shape (see src/scripts/leaderboard.js).

export const GROUP_NAME_MAX = 120;
export const GROUP_MEMBERS_MAX = 500;

// Mirrors hasGroupShape() in firestore.rules 1:1 — keep both in sync (the
// shape-drift guard in tests/test_groups_data_model.py fails if the rules
// block drifts from these bounds). Returns { ok, errors[] } instead of
// throwing so a teacher-side group form can render all problems at once.
export function validateGroupDoc(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, errors: ['doc must be an object'] };
  }
  const keys = Object.keys(doc).sort();
  const required = ['members', 'name', 'updated_at']; // sorted
  if (keys.length !== required.length || keys.some((k, i) => k !== required[i])) {
    errors.push('doc must have exactly keys ' + required.join(', ') + ', got [' + keys.join(', ') + ']');
    return { ok: false, errors };
  }
  if (typeof doc.name !== 'string' || doc.name.length === 0) {
    errors.push('name must be a non-empty string');
  } else if (doc.name.length > GROUP_NAME_MAX) {
    errors.push('name must be at most ' + GROUP_NAME_MAX + ' chars');
  }
  if (!Array.isArray(doc.members)) {
    errors.push('members must be a list of uids');
  } else if (doc.members.length > GROUP_MEMBERS_MAX) {
    errors.push('members must have at most ' + GROUP_MEMBERS_MAX + ' entries');
  }
  if (typeof doc.updated_at !== 'string') {
    errors.push('updated_at must be a string');
  }
  return { ok: errors.length === 0, errors };
}

// Mirrors isGroupMember() in firestore.rules: true when uid appears in the
// group doc's members list. Anonymous (null/undefined uid) is never a member.
export function isGroupMember(uid, groupDoc) {
  if (!uid || !groupDoc || !Array.isArray(groupDoc.members)) return false;
  return groupDoc.members.indexOf(uid) !== -1;
}

// The group-scoped board, per H8416: rows = docs of the already-public
// leaderboard collection (doc id = uid, the same id syncLeaderboardRow
// writes); returns only rows whose id is in the reader's group members list.
// Non-member rows never pass through — the filter happens before rendering.
export function filterLeaderboardByMembers(rows, members) {
  const set = new Set(Array.isArray(members) ? members : []);
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => row && typeof row.id === 'string' && set.has(row.id));
}
