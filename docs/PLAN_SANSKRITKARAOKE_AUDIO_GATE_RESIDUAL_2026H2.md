# PLAN — Sanskrit Karaoke residual programme behind the audio gate, 2026H2

_Created: 18-08-2026 · Last updated: 18-08-2026_

Index: [PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md) ·
Roadmap: [ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md) ·
Architecture: [ARCHITECTURE_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/ARCHITECTURE_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md) ·
Implementation: [IMPLEMENTATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/IMPLEMENTATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md) ·
Verification: [VERIFICATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/VERIFICATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md) ·
Metadoc: [PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.meta.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.meta.md)

Programme parent: [H3000 (Opus 5) — Stale-roadmap slice 2: full /ask replan of stale Tier-0 roadmaps](https://github.com/gasyoun/Uprava/blob/main/handoffs/H3000-Opus_multi_stale-roadmap-s2-tier0-ask-replan_17.08.26.md),
under [PLAN_UPRAVA_STALE_ROADMAP_ASK_BATCH_2026-08.md](https://github.com/gasyoun/Uprava/blob/main/docs/PLAN_UPRAVA_STALE_ROADMAP_ASK_BATCH_2026-08.md).

## Why this document exists

This repo had **four roadmaps and zero planning documents**. Its three living
roadmaps — [ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/ROADMAP.md) (01-08-2026),
[MY_ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/MY_ROADMAP.md) (01-08-2026) and
[docs/KARAOKE_PRODUCT_ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/KARAOKE_PRODUCT_ROADMAP.md) (29-07-2026)
each open with phases that read as sequential engineering work, and a reader
scanning them concludes the product is stalled on engineering. **It is not.**
[.ai_state.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/.ai_state.md) records the real position: the browser app
shipped at **v1.4.8**, Pages-deployed, mobile-accepted and tagged, and every
remaining *product* step is waiting on two artefacts only a human can supply.

The replan below does not invent new scope. It **re-sorts the existing open
items by what is actually blocking them**, which is the one thing three
phase-ordered roadmaps cannot show.

## The gate, stated once

| Gate | What it is | Who can clear it | What it blocks |
|---|---|---|---|
| **G1 — permission** | One short written agreement with Уша Санка covering redistribution of her recordings inside derivative karaoke videos, all platforms, commercial context (free videos funnelling paid courses) | A human. Not an agent, at any tier | Public release of any video built on her audio |
| **G2 — audio** | Her chapter recorded in one sitting, files named `<verse_id>.<ext>`, plus the original audio and Timing Editor session JSON behind the approved `sample.mp4` | A human | First real end-to-end render; ADR-0004 alignment calibration |
| **G3 — publisher credentials** | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` in `.env` | A human | Scheduled posting. IG/TikTok/YT additionally need platform app review and stay parked by standing GTD ruling |

G1 and G2 are **not** engineering debt and must never be re-described as such
in this repo's roadmaps. The failure mode this programme exists to prevent is a
future session reading "Phase 0 — Rights & data hygiene, 21 items open" and
starting to *work* the list, when its first unit is a legal act.

## The three lanes

- **Lane A — unblocked.** Work that needs neither gate. This is the whole of
  what an agent may do here today, and it is bigger than it looks: schema and
  provenance fields, OAuth scope narrowing, the metre detector, a text-critical
  verification, and the cross-page auth consolidation.
- **Lane B — gated on G2/G3 artefacts.** Fully specified, zero-ambiguity work
  that starts the day the files land. Kept specified precisely so the gate
  clears into execution rather than into planning.
- **Lane C — gated on G1.** One human act. Nothing agent-shaped exists here.

Lane assignment for every open item: [ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md).

## Decisions this plan locks

| # | Question | Ruling |
|---|---|---|
| K1 | Is `MY_ROADMAP.md` in product scope? | **No.** It is a personal agent-engineering curriculum that happens to use this repo as its practice vehicle. It stays, it is not replanned as product work, and its open checkboxes must not be counted as product backlog |
| K2 | What happens to `GEMINI_ROADMAP.md`? | **Archived.** It has carried an `АРХИВ (29-07-2026)` banner since H1879 and its bug list targets code paths that no longer exist. A banner at a live path is not archiving — moved to `archive/` with a tombstone, per the batch's R2 mechanic |
| K3 | Do we write a new product roadmap? | **No.** [docs/KARAOKE_PRODUCT_ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/KARAOKE_PRODUCT_ROADMAP.md) is the product roadmap and stays canonical. This set is the *residual* programme layered over it |
| K4 | Does the audio gate stop Lane A? | **No.** Treating the gate as a full stop is how five agent-doable items sat untouched for six weeks |
| K5 | TTS integration (`ROADMAP.md` Phase 2, first open unit) | **Out of scope for this programme and explicitly fenced.** Generating synthetic audio while waiting for a named human reciter's recordings changes the product's premise; that is a human product decision, not a drain unit |

## Non-goals

- Executing any product checkbox in [docs/KARAOKE_PRODUCT_ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/KARAOKE_PRODUCT_ROADMAP.md) Phase 0 — its first unit is a legal agreement.
- TTS integration (K5).
- Rewriting [ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/ROADMAP.md) into a second product roadmap.
- Reopening the H1879 drift sweep.

_Dr. Mārcis Gasūns_
