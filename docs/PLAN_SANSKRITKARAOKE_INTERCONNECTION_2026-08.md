# Plan — SanskritKaraoke interconnection, 2026-08

_Created: 26-08-2026 · Last updated: 27-08-2026_

SanskritKaraoke's slice of the spine-interconnection programme. Programme index:
[PLAN_SPINE_INTERCONNECTION_2026H2.md](https://github.com/gasyoun/Uprava/blob/main/docs/PLAN_SPINE_INTERCONNECTION_2026H2.md).

Architecture and verification are **not** restated here (ruling F13) — they are identical for
all fourteen repos and live once in Uprava:

- [ARCHITECTURE_SPINE_INTERCONNECTION.md](https://github.com/gasyoun/Uprava/blob/main/docs/ARCHITECTURE_SPINE_INTERCONNECTION.md) — the five attachment points and the rules governing them
- [IMPLEMENTATION_SPINE_INTERCONNECTION_W1.md](https://github.com/gasyoun/Uprava/blob/main/docs/IMPLEMENTATION_SPINE_INTERCONNECTION_W1.md) — execution order, per-handoff steps, isolation, risks
- [VERIFICATION_SPINE_INTERCONNECTION.md](https://github.com/gasyoun/Uprava/blob/main/docs/VERIFICATION_SPINE_INTERCONNECTION.md) — the five gates and what "done" means

**Executed 27-08-2026** by Opus 5 (`claude-opus-5`) — see *Outcome* below. The plan is kept as the
record of what was intended and what actually happened.

## Why SanskritKaraoke is in scope

Zero SHARED_CODE rows and zero README back-links, while owning a verse-timing to caption exporter any repo showing timed Sanskrit verse would otherwise rebuild.

## Measured baseline and target

| | Value |
|---|---|
| Wiring score, 26-08-2026 | **46** / 100 |
| Target after this plan | **56** / 100 |
| How the target is reached | +8 for README hub links, ~+2 for the SHARED_CODE row. |

Measured by [`tools/interconnection_audit.py`](https://github.com/gasyoun/Uprava/blob/main/tools/interconnection_audit.py); full row in
[data/interconnection_audit_2026-08-26.json](https://github.com/gasyoun/Uprava/blob/main/data/interconnection_audit_2026-08-26.json);
report [AUDIT_REPO_INTERCONNECTION_2026-08-26.md](https://github.com/gasyoun/Uprava/blob/main/docs/AUDIT_REPO_INTERCONNECTION_2026-08-26.md).

The score counts artefacts, not whether they are true. It is **report-only** by ruling F2 and no
handoff closes on it — verification Gates 2 to 4 are what actually decide, and Gate 4 is read by
a human.

## Rulings that apply here

| Fork | Ruling |
|---|---|
| F8 | The csl-corrections bridge, the SanskritKaraoke exporter and the RuWritingStyles pipeline all become SHARED_CODE families. |
| F1 | Local `FINDINGS.md` in exactly four repos; the other eight get a `CLAUDE.md` pointer line. No repo gains the other seven registries. |
| F11 | Every repo with no spine back-links gains a "How this repo is wired" README section. |

Full rulings table with every fork:
[ASK_BATCH_STAGING_REPO_INTERCONNECTION_2026-08.md](https://github.com/gasyoun/Uprava/blob/main/ASK_BATCH_STAGING_REPO_INTERCONNECTION_2026-08.md) Phase 2.

## What this plan does

1. Register the verse-timing JSON to SRT/VTT exporter as a SHARED_CODE family (F8). **Check prior art first** — a queued handoff for exactly this export already exists; register the existing work, do not write a second exporter.
2. Add the `CLAUDE.md` pointer line (F1, no registry files) and the README wiring section (F11).
3. Guarded main-tree repo: work in a worktree and remove it the same pass.

## Handoff

- [H3570 (Opus 5, 🟡2 medium) — SanskritKaraoke verse-timing to SRT/VTT exporter registered as a SHARED_CODE family](https://github.com/gasyoun/Uprava/blob/main/handoffs/archive/H3570-Opus_SanskritKaraoke_interconnect-karaoke-timing-caption-family_26.08.26.md) · medium · ✅ done 27-08-2026

## Outcome — 27-08-2026

Two of the three intended changes landed as planned; the third turned out to be already done by a sibling handoff.

| Planned | What happened |
|---|---|
| Register the exporter as an F8 SHARED_CODE family | **Already landed** as row 28 by [H3561](https://github.com/gasyoun/github-spine/pull/127), which a human launched ahead of the wave-2 handoffs. The duplicate row authored here was dropped at rebase — the keep-both rule covers adjacent rows, not two rows for the same canonical source. Only the fact row 28 lacked was contributed: the committed timing fixture is synthetic even onsets, never citable as attested alignment ([#128](https://github.com/gasyoun/github-spine/pull/128), v1.84.1). |
| Ruling-F1 `CLAUDE.md` pointer line, no registry files | Shipped ([#106](https://github.com/gasyoun/SanskritKaraoke/pull/106)). |
| Default-F11 README wiring section | Shipped ([#106](https://github.com/gasyoun/SanskritKaraoke/pull/106)); the Gate-4 cold read caught it naming family 27 instead of 28, fixed in [#108](https://github.com/gasyoun/SanskritKaraoke/pull/108). |

The plan's own instruction to **check prior art first** is what kept a second SRT/VTT exporter from being written: `hub_grep` returned no hits, but a handoff-filename scan and this repo's `git log` both found [H3261](https://github.com/gasyoun/Uprava/blob/main/handoffs/archive/H3261-Grok_SanskritKaraoke_captions-srt-vtt-export_21.08.26.md) already merged as [#105](https://github.com/gasyoun/SanskritKaraoke/pull/105) hours earlier.

## Autonomy contract

The launching agent may create the files named above, add hub rows, open and merge its PR,
remove its worktree and close its handoff row — without asking.

It must stop and ask if a local `FINDINGS.md` cannot be given two genuine findings (the
documented fallback is to drop the file and take the pointer line, recorded not silent), if a
corpus row would carry an unmasked snapshot or quote a sample, or if a second speculative edge
becomes necessary. It must never turn the wiring score into a failing gate, commit to
`csl-orig`, or add the seven non-FINDINGS registries.

## Open @DECIDE

None. Every fork touching SanskritKaraoke was ruled in sitting 1 on 26-08-2026, so the autonomy gate
passes and nothing in the wave-1 path stalls on a human.

_Dr. Mārcis Gasūns_
