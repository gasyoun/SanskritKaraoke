# IMPLEMENTATION — Sanskrit Karaoke residual programme

_Created: 18-08-2026 · Last updated: 18-08-2026_

Index: [PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md) ·
Roadmap: [ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md) ·
Architecture: [ARCHITECTURE_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/ARCHITECTURE_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md) ·
Implementation: [IMPLEMENTATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/IMPLEMENTATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md) ·
Verification: [VERIFICATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/VERIFICATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md) ·
Metadoc: [PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.meta.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/PLAN_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.meta.md)

Ordered so the two cheapest security/DH wins land first and nothing depends on a
gate. Each unit names its acceptance; the full acceptance set is in
[VERIFICATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/VERIFICATION_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL.md).

## Step 1 — rights and provenance schema (A1 + A2)

1. Extend the verse schema with `audio.license`, `audio.rights_holder`,
   `audio.permission_ref` and `translation.provenance` (`human` \| `gemini-flash` \| `claude`).
2. Backfill all three existing verses. `permission_ref` stays empty-with-reason
   until G1 is signed — an empty field with a stated reason is honest; a fabricated
   reference is not.
3. Extend `validate_library.py` to read the new fields. **Keep the warn-only
   stance on `TODO` drive ids** — a hard reject breaks the pipeline before real
   audio lands (H1879 ruling, 29-07-2026).

*Accept:* schema documents the fields, three verses validate, the validator's
existing warn behaviour is unchanged.

## Step 2 — OAuth scope narrowing (A3)

Change the Drive scope from `drive` to `drive.file` and re-run the Drive path.
Do it in the same pass as any other Drive code touch.

*Accept:* the app authenticates and reads/writes only files it created; a
documented manual check, since there is no automated Drive test.

## Step 3 — shared auth state (A4)

Extract one `auth-state.js` and route `index.html`, `student.html` and
`progress.html` through it. Behaviour-preserving refactor: three pages must end
in the same observable auth states, including the signed-out path.

*Accept:* one auth implementation, three call sites, no behaviour delta.

## Step 4 — metre detector extension (A6)

Add Mālinī, Śārdūlavikrīḍita, Vasantatilaka and Sragdharā to the detector, with
fixture verses per metre and at least one near-miss per metre.

*Accept:* fixtures pass; a near-miss is rejected rather than snapped to the
nearest known metre.

## Step 5 — Telang / Sementsov text check (A5)

Verify BG 2.48 and 2.49 against SBE vol. 8 and record the result in the verse
JSON's provenance fields. Settle the RU attribution question («пер.» vs
«по мотивам»). If a source cannot be reached, record the failed attempt in
[SERVER_OUTAGES.md](https://github.com/gasyoun/Uprava/blob/main/SERVER_OUTAGES.md) rather than silently retrying.

*Accept:* both verses carry a cited verdict; the RU attribution is stated.

## Step 6 — two backlog defects (A7)

Restore tapping mode; make Drive file replacement delete the old file.

*Accept:* a regression test per defect, or a documented manual check where the
path is not testable.

## Gated work — do not start

Lane B and Lane C units are specified in [ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md).
When G2 lands, B1 executes the archived audio-drop runbook; B2 follows with the
comparison harness. Neither is a planning task at that point.

_Dr. Mārcis Gasūns_
