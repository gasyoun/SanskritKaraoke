# VERIFICATION — Sanskrit Karaoke residual programme

_Created: 18-08-2026 · Last updated: 18-08-2026_

Index: [PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md) ·
Roadmap: [ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md) ·
Architecture: [ARCHITECTURE_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/ARCHITECTURE_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md) ·
Implementation: [IMPLEMENTATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/IMPLEMENTATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md) ·
Verification: [VERIFICATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/VERIFICATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md) ·
Metadoc: [PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.meta.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.meta.md)

## Programme-level acceptance

| # | Claim | How it is proven |
|---|---|---|
| V1 | No roadmap in this repo describes a human gate as engineering debt | Grep the three living roadmaps for the Phase-0 permission item; it must be marked as a human act, not a task |
| V2 | Lane A is genuinely unblocked | Each Lane-A unit shipped without any reference to chapter audio, permission, or publisher credentials |
| V3 | No third-generation planning doc was created | This repo had **zero** PLAN/ARCHITECTURE/IMPLEMENTATION/VERIFICATION documents before this set; the count goes 0 → 1 |
| V4 | The product roadmap stayed canonical | [docs/KARAOKE_PRODUCT_ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/KARAOKE_PRODUCT_ROADMAP.md) is referenced, not superseded, and its phases are unchanged |
| V5 | `GEMINI_ROADMAP.md` is archived, not merely bannered | The file is under `archive/`, the old path holds a tombstone with a full blob URL, and no in-repo link points at a dead path |

## Per-step acceptance

| Step | Accept | Fail |
|---|---|---|
| 1 — schema | Three verses validate with the new fields; validator warn-behaviour unchanged | Turning the `TODO`-drive-id warning into a hard reject before audio lands |
| 2 — OAuth | App works with `drive.file` | Silently keeping the broad `drive` scope "for now" |
| 3 — auth | One implementation, three call sites, no behaviour delta | A fourth auth path added while the other three remain |
| 4 — metre | Fixtures pass; near-misses rejected | A detector that assigns the nearest known metre to anything |
| 5 — text | Both verses carry a cited verdict | An uncited "looks right" |
| 6 — defects | Regression test or documented manual check per defect | A fix with neither |

## Standing anti-acceptance

- **Never** accept a Lane-B unit as done because its *planning* is done.
- **Never** let ±50 ms stand in for the ADR-0004 product gate. The binding
  target is **under 1 minute of human review per clip**; the millisecond figure
  is a diagnostic.
- **Never** publish anything built on Уша Санка's audio before G1 is signed and
  referenced in the repo.

_Dr. Mārcis Gasūns_
