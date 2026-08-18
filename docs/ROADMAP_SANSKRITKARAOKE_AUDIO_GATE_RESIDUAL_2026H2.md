# ROADMAP — Sanskrit Karaoke residual, 2026H2

_Created: 18-08-2026 · Last updated: 18-08-2026_

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

| # | Item | Source | Note |
|---|---|---|---|
| A1 | Add `audio.license`, `audio.rights_holder`, `audio.permission_ref` to the verse schema and backfill the 3 existing verses | Product roadmap Phase 0 | Schema work needs no audio. `validate_library.py` stays **warn-only** on `TODO` drive ids until real audio lands — that is a deliberate H1879 ruling, not a defect to "fix into a hard reject" |
| A2 | Add `translation.provenance: human\|gemini-flash\|claude` per language | Product roadmap Phase 0 | DH norm and increasingly platform policy. Machine translations must be marked |
| A3 | Narrow the Google OAuth scope from `drive` to `drive.file` | Product roadmap Phase 0 | Long-standing smell; cheapest security win in the repo |
| A4 | Consolidate Firebase auth into a shared `auth-state.js` | `.ai_state.md` Architecture | `index`, `student` and `progress` each wire auth differently — three code paths, one behaviour |
| A5 | Verify the Telang wording of BG 2.48 and 2.49 against SBE vol. 8, and settle whether the RU lines are verbatim Sementsov or paraphrase (attribution «пер.» vs «по мотивам») | `.ai_state.md` Data/schema | 2.47 is already fetch-confirmed. A text-critical check, not a code change |
| A6 | Extend the metre detector: Mālinī, Śārdūlavikrīḍita, Vasantatilaka, Sragdharā | `ROADMAP.md` Phase 4 | Pure analysis code, independent of both gates |
| A7 | Restore tapping mode (temporarily disabled) and fix Drive file replacement (old file is not deleted) | `ROADMAP.md` Backlog | Two small, well-understood defects |

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
