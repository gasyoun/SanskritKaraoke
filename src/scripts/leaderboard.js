// Leaderboard entry computation (ROADMAP.md Phase 3 — public leaderboard).
//
// Pure functions only: no DOM, no Firebase, no localStorage. Consumed by
// src/scripts/cloud_sync.js (writer hook) and tested by
// tests/test_leaderboard_entry.py via node.
//
// Firestore doc: leaderboard/{uid} — public read, owner-only write, exact
// shape enforced by hasLeaderboardShape() in firestore.rules. A row carries
// ONLY aggregated stats (name, mastered count, streak days) — never the
// verse list, intervals, or telemetry (those stay under users/{uid}/data/*,
// readable by owner and teacher only).

// A verse counts as mastered once its SRS interval reaches 21 days —
// the same rule profile.html and teacher.html already display.
export const LEADERBOARD_MASTERED_INTERVAL = 21;

export function computeMasteredCount(srsRecords) {
  if (!Array.isArray(srsRecords)) return 0;
  let count = 0;
  for (const record of srsRecords) {
    const interval = Number(record && record.interval);
    if (Number.isFinite(interval) && interval >= LEADERBOARD_MASTERED_INTERVAL) count++;
  }
  return count;
}

// Builds the exact 4-key row firestore.rules allows on leaderboard/{uid}.
// displayName is hard-capped at 120 chars to match the rule's size() bound;
// streakDays is clamped to a non-negative integer.
export function buildLeaderboardEntry(srsRecords, displayName, streakDays, nowIso) {
  return {
    displayName: String(displayName || '').slice(0, 120),
    mastered_count: computeMasteredCount(srsRecords),
    streak_days: Math.max(0, Math.round(Number(streakDays) || 0)),
    updated_at: String(nowIso || ''),
  };
}
