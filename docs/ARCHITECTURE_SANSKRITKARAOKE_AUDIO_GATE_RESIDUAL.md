# ARCHITECTURE — Sanskrit Karaoke residual programme

_Created: 18-08-2026 · Last updated: 18-08-2026_

Index: [PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md) ·
Roadmap: [ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md) ·
Architecture: [ARCHITECTURE_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/ARCHITECTURE_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md) ·
Implementation: [IMPLEMENTATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/IMPLEMENTATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md) ·
Verification: [VERIFICATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/VERIFICATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md) ·
Metadoc: [PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.meta.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.meta.md)

## What already exists (reuse, do not rebuild)

| Piece | Role | Verdict |
|---|---|---|
| [docs/KARAOKE_PRODUCT_ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/KARAOKE_PRODUCT_ROADMAP.md) | The product roadmap; batch-drop funnel model, ADR pointers | Canonical — extend, never duplicate |
| `adr/0001`–`adr/0003` | Rendering-core extraction · headless batch renderer · `align_chapter.py` | The technical design is already locked in ADRs. New design belongs in an ADR, not in a roadmap |
| `validate_library.py` | Publication gate on `translation.rights` | Reuse for A1/A2; extend its field set, keep its warn-only stance on `TODO` drive ids |
| `tools/post_kit.py` | UTM CTAs to samskrtam.ru | Reuse for B3 |
| [.ai_state.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/.ai_state.md) | The only surface that states the real blocking picture | The authority this replan is built on |

## Why lanes and not phases

A phase-ordered roadmap encodes **sequence**. This repo's problem is not
sequence, it is **blocking**: its first phase's first unit is a legal act, so a
reader who honours phase order stops at item one and concludes nothing can move.
Lanes encode the blocker instead, which makes the seven genuinely-open Lane-A
items visible. The phases stay in the product roadmap; the lanes live here.

## Contract for the gate

1. A gate is named by **who can clear it**, never by what remains technically.
2. A gated item stays **fully specified**. The gate clearing must lead straight
   into execution, not into a planning session.
3. A gate is never restated as engineering debt in any roadmap in this repo.
4. Lane A never waits on a gate. If an item cannot start today, it is not Lane A.

## Data flow, unchanged

```
chapter audio (G2) + verse JSON
        → align_chapter.py            (ADR-0003)
        → per-syllable timings        (ADR-0004 recalibrates this step)
        → headless batch render       (ADR-0002, feed_v1)
        → post_kit CTAs + schedule.yaml
        → Telegram (G3) → IG/TikTok/YT (parked, platform review)
```

Lane A touches only the schema/validation and analysis edges of this flow, which
is exactly why it can proceed while the pipeline's input is missing.

_Dr. Mārcis Gasūns_
