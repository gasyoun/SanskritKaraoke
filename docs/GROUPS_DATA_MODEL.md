# Groups data model for group-scoped leaderboard boards (H8416)

_Created: 27-11-2026 · Last updated: 27-11-2026_

_Dr. Mārcis Gasūns_

Executed by GLM-5.3-Flash (`zai-coding-plan/glm-5.3-flash`) under the DeepSeek handoff token per H3688 (provenance, not a gate). MG ruling 18-11-2026 (interactive card): mint the groups-data-model unit first, group-scoped boards follow.

## Outcome

A minimal groups data model that enables optional group-scoped leaderboard boards in [SanskritKaraoke](https://github.com/gasyoun/SanskritKaraoke) without touching the global boards shipped in PR [#232](https://github.com/gasyoun/SanskritKaraoke/pull/232). The roadmap's optional «only for one's own group» half was consciously NOT built earlier because the data model had no groups — this unit adds exactly the missing model, nothing more.

## Schema

New Firestore collection (project `sanskritkaraoke`, rules file [firestore.rules](https://github.com/gasyoun/SanskritKaraoke/blob/main/firestore.rules)):

```
groups/{groupId} = {
  name:       string,   // 1..120 chars
  members:    [uid...], // list of auth uids, ≤ 500 entries
  updated_at: string    // ISO timestamp
}
```

Unchanged collections:

| Collection | Access | Notes |
|---|---|---|
| `users/{uid}` | owner + teacher read; owner write | profile (email/displayName) |
| `users/{uid}/data/{srs_v1,telemetry,progress_meta}` | owner + teacher read; owner write | private SRS docs — untouched |
| `leaderboard/{uid}` | **public read; owner-only write** | exact 4-key row (`hasLeaderboardShape()`), unchanged by this unit |
| `groups/{groupId}` (new) | teacher + own-group members read; **teacher-only write** | deletes closed |

## Rules semantics

[firestore.rules](https://github.com/gasyoun/SanskritKaraoke/blob/main/firestore.rules) adds `hasGroupShape()` and `isGroupMember()`:

- `allow read: if isTeacher() || isGroupMember();` — a student can read **only** groups whose `members` list contains their uid (the membership list never leaks for groups they don't belong to).
- `allow create, update: if isTeacher() && hasGroupShape();` — membership writes are teacher-only and shape-gated (exact 3-key set, name 1..120, members list ≤ 500, string `updated_at`).
- `allow delete: if false;` — group history is never destroyed client-side.
- Global boards stay exactly as before: `leaderboard/{uid}` remains `allow read: if true` with owner-only 4-key writes (pinned by `test_global_leaderboard_unchanged`).

## Membership wiring

Teacher-managed by design (MG is the sole allowlisted teacher in `isTeacher()`):

1. **Write path:** MG creates/updates `groups/{groupId}` docs with the cohort's uid list — via Firebase console or a future teacher-UI unit. Client writes from students are rejected by rules.
2. **Read path:** the group-scoped board (follow-up UI unit) is a client-side filter, no new board collection: the signed-in student reads **their own group doc** (allowed because they are a member), takes `members`, fetches the already-public [leaderboard](https://github.com/gasyoun/SanskritKaraoke/blob/main/leaderboard.html) rows (doc id = uid), and keeps only rows whose id is in `members`. Pure helpers: [src/scripts/groups.js](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/scripts/groups.js) — `isGroupMember()`, `filterLeaderboardByMembers()`, `validateGroupDoc()` (1:1 mirror of the rules shape for teacher-side forms).

## Known limitations

- Firestore rules cannot assert every element of a `list` is a string; a malformed member entry would simply filter no rows. `validateGroupDoc()` catches this for teacher-side forms; console writes rely on care.
- Rules read (`isGroupMember`) uses `resource.data.members`, so it gates per-document reads, not queries — the follow-up UI reads the group doc directly, which is exactly the allowed shape.
- No deploy: rules are validated by tests only; production deploy needs the human Firebase-2FA step already tracked in Uprava GTD (the PR #232 deploy residual extends to this rules block).

## Checks

- `python -m pytest tests/test_groups_data_model.py -q` — 4 tests: node probe (shape matrix, membership matrix, board filter), groups rules-block guard, wiring guard, global-leaderboard-unchanged guard.
- Offline suite stays green (`python -m pytest -q`); no emulator needed — Java-based Firebase emulator rules tests are unavailable on this box, so the rules semantics are pinned by the shape-drift guards + the JS mirror.

## Follow-up

Group-scoped board UI (teacher group management + leaderboard.html group tab) is the minted follow-up unit — the data model above is its complete input contract.
