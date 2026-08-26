# ROADMAP — Sanskrit Karaoke residual, 2026H2

_Created: 18-08-2026 · Last updated: 26-08-2026_

Index: [PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md) ·
Roadmap: [ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md) ·
Architecture: [ARCHITECTURE_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/ARCHITECTURE_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md) ·
Implementation: [IMPLEMENTATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/IMPLEMENTATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md) ·
Verification: [VERIFICATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/VERIFICATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md) ·
Metadoc: [PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.meta.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.meta.md)

Every open item across the repo's living roadmaps and
[.ai_state.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/.ai_state.md), sorted by **what blocks it** rather than by
phase number. Source phases are cited so this table can be checked against them.

## Lane A — unblocked, agent-doable today

> **Truth-pass 26-08-2026 (OxAlpha `stealth/ox-alpha`, bare `/drain` pick).**
> Closer read re-verdicts five of the seven rows: A1, A2 and A4 were **already
> shipped before this table was written** (schema commit [`3a31711`](https://github.com/gasyoun/SanskritKaraoke/commit/3a31711)
> — all three audio-rights fields backfilled on the BG verses; per-language
> `translation.provenance` present in every verse JSON; [`src/scripts/cloud_sync.js`](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/scripts/cloud_sync.js)
> is exactly the shared auth-state module A4 asked for — one runtime,
> `window.onAuthUpdate`, identical script tags on student/progress/teacher
> since v1.4.2). A6 verified as already implemented in `METER_DATA.samavritta`
> with a committed headless test. A3 carries a hidden product gate — see its
> row. Remaining truly open Lane-A work: A5, A7.

| # | Item | Source | Note |
|---|---|---|---|
| A1 | ✅ Add `audio.license`, `audio.rights_holder`, `audio.permission_ref` to the verse schema and backfill the 3 existing verses — **SHIPPED** (commit [`3a31711`](https://github.com/gasyoun/SanskritKaraoke/commit/3a31711), verified 26-08-2026) | Product roadmap Phase 0 | All three BG verses carry `SK-LIC-2026-001` refs; validator warn-only stance preserved |
| A2 | ✅ Add `translation.provenance: human\|gemini-flash\|claude` per language — **SHIPPED** (same commit; present in all 13 verse JSONs) | Product roadmap Phase 0 | DH norm and increasingly platform policy. Machine translations must be marked |
| A3 | ⛔ Narrow OAuth scope `drive` → `drive.file` — **GATED, not agent-doable** (re-verdict 26-08-2026) | Product roadmap Phase 0 | The load path (`gdriveLoad`, app.js:6190+) lists a shared folder and downloads files OTHERS created (`session.json` + reciter audio); under `drive.file`, `files.list` returns nothing for non-app-owned files — narrowing breaks the documented teacher workflow («пользователи видят расшаренную папку», WAVE spec:80 «не drive.file!»). A function-preserving narrowing means migrating file pickup to the Google Picker API — which needs an owner Cloud-Console act (enable Picker API) plus a live acceptance test at the 2FA screen. Not "the cheapest security win" as originally scoped |
| A4 | ✅ Consolidate Firebase auth into shared auth-state — **ALREADY DONE**: [`src/scripts/cloud_sync.js`](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/scripts/cloud_sync.js) is that module (verified 26-08-2026); row was stale, citing pre-v1.4.2 `.ai_state.md` text | `.ai_state.md` Architecture | index.html intentionally has no Firebase wiring |
| A5 | Verify the Telang wording of BG 2.48 and 2.49 against SBE vol. 8, and settle whether the RU lines are verbatim Sementsov or paraphrase (attribution «пер.» vs «по мотивам») | `.ai_state.md` Data/schema | 2.47 is already fetch-confirmed. A text-critical check, not a code change. Still open |
| A6 | ✅ Extend the metre detector: Mālinī, Śārdūlavikrīḍita, Vasantatilaka, Sragdharā — **VERIFIED ALREADY IMPLEMENTED** (26-08-2026): all four registered in `METER_DATA.samavritta`, round-trip + unique identification asserted by [tools/test_meter_detector.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/test_meter_detector.py) | `ROADMAP.md` Phase 4 | Checkbox ticked in ROADMAP.md with evidence |
| A7 | Restore tapping mode (temporarily disabled) and fix Drive file replacement (old file is not deleted) | `ROADMAP.md` Backlog | Two small, well-understood defects. Still open — next agent-doable unit after A5/A6 |

## Lane B — specified, waiting on an artefact (G2/G3)

| # | Item | Waiting on | Ready to start when |
|---|---|---|---|
| B1 | First real end-to-end render | G2 | Chapter audio lands as `<verse_id>.<ext>`; then run the audio-drop runbook |
| B2 | ADR-0004 — ingest original audio + automatic-before JSON + human-approved-after JSON in comparison mode, per-syllable deltas, held-out evaluation recordings, then Usha-calibrated monotonic alignment replacing independent snapping | G2 | MG supplies the original audio and session JSON behind the approved `sample.mp4`. **Product gate: human review under 1 minute per clip**; ±50 ms stays a diagnostic, never the acceptance test |
| B3 | Telegram publisher live | G3 | Credentials in `.env`. IG/TikTok/YT stay parked pending platform app review |

## Lane C — one human act (G1)

| # | Item | Note |
|---|---|---|
| C1 | Written permission from Уша Санка | No agent-shaped part exists. Until it is signed and referenced in the repo, nothing built on her audio may be published |

## Deliberately not scheduled

| Item | Why |
|---|---|
| TTS integration (`ROADMAP.md` Phase 2 first open unit) | K5 — a product-premise decision, not a drain unit |
| `student.html` hidden-bridge removal | Genuinely blocked on the remaining ADR-0001 DOM dependencies (opt-wave-scale, opt-dots, `getComputedStyle` colours); listed here so it is not mistaken for Lane A |
| Everything in [MY_ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/MY_ROADMAP.md) | K1 — a learning curriculum, not product backlog |

_Dr. Mārcis Gasūns_
