# Metadoc — H6317_RECORD_SCORE_MVP_2026-10-09.md

_Created: 10-10-2026 · Last updated: 10-10-2026_

**What this documents:** the record-and-score loop shipped for H6317 —
endpoint contract, grading semantics (tempo-normalised per-syllable deltas),
dev/deploy runbooks (vps92 systemd + nginx), limits, test map.

**Audience & situation:** a developer extending the scorer (e.g. a Fable
improvement pass: whisper-on-by-default, lead-strip, mobile mic quirks) or an
operator redeploying the .92 service.

**Provenance:** executed 09/10-10-2026 by GLM 5.3 (ZCode
`account:zai-individual-coding-plan/GLM-5.3`); the handoff was minted for the
Fable lane (H6317-Fable_SanskritKaraoke_record-score-mvp_09.10.26.md) — GLM
built the MVP so Fable can improve after (user instruction, 09-10-2026).

**Source of truth for:** grade JSON shape ([grade_take.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/grade_take.py)
docstring mirrors it), endpoint env vars. Not source of truth for: the
reference timing corpora (verses/data/*.json, tools/fixtures), the alignment
params (tools/alignment_params.json).

**Review cadence:** touch when the endpoint contract or deploy topology
changes; the test files assert the contract mechanically.

_Dr. Mārcis Gasūns_
