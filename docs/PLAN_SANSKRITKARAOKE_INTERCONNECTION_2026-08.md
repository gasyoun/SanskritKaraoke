# Plan — SanskritKaraoke interconnection, 2026-08

_Created: 26-08-2026 · Last updated: 26-08-2026_

SanskritKaraoke's slice of the spine-interconnection programme. Programme index:
[PLAN_SPINE_INTERCONNECTION_2026H2.md](https://github.com/gasyoun/Uprava/blob/main/docs/PLAN_SPINE_INTERCONNECTION_2026H2.md).

Architecture and verification are **not** restated here (ruling F13) — they are identical for
all fourteen repos and live once in Uprava:

- [ARCHITECTURE_SPINE_INTERCONNECTION.md](https://github.com/gasyoun/Uprava/blob/main/docs/ARCHITECTURE_SPINE_INTERCONNECTION.md) — the five attachment points and the rules governing them
- [IMPLEMENTATION_SPINE_INTERCONNECTION_W1.md](https://github.com/gasyoun/Uprava/blob/main/docs/IMPLEMENTATION_SPINE_INTERCONNECTION_W1.md) — execution order, per-handoff steps, isolation, risks
- [VERIFICATION_SPINE_INTERCONNECTION.md](https://github.com/gasyoun/Uprava/blob/main/docs/VERIFICATION_SPINE_INTERCONNECTION.md) — the five gates and what "done" means

**Nothing here has executed.** The handoff below is 🟡 queued and runs only when a human
launches it.

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

- [H3570 (Opus 5) — interconnect karaoke timing caption family](https://github.com/gasyoun/Uprava/blob/main/handoffs/H3570-Opus_SanskritKaraoke_interconnect-karaoke-timing-caption-family_26.08.26.md) · medium · 🟡 queued

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
