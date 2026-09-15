# H4719 — kosha mastery schedule onto the karaoke reader surface: execution report

_Created: 15-09-2026 · Last updated: 15-09-2026_

_Handoff: [H4719](https://github.com/gasyoun/Uprava/blob/main/handoffs/H4719-OxAlpha_SanskritKaraoke_xwalk-a15-mastery-schedule-reader_14.09.26.md) · Executor: OxAlpha (opencode/z-ai/glm-5.3-flash) · Effort: trivial_

## GATE 0 — data probe verdict

**FOUND — no fallback.** Dataset `kosha-mastery-schedule` (H3742) is registered in
[kosha data/manifest/datasets.json](https://github.com/gasyoun/kosha/blob/main/data/manifest/datasets.json)
as tier `public`, CC BY-SA 4.0, 35 517 rows, and lives at
[kosha data/mastery/combined_schedule.json](https://github.com/gasyoun/kosha/blob/main/data/mastery/combined_schedule.json):

- `families`: sandhi 396 · samasa 3 865 · morphology 12 000 · vocab 13 334 · thematic_vocab 5 922
- schema: one row per drill item `{family, id, ease 0..1, stability_days, due}`
- source sha256 pinned into the digest: `232de6d3cb0d0235182795976eeb9682a151ec00e59d9766a511f5ffe0496eea`

## What shipped

- **Generator** [tools/build_mastery_layer.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/build_mastery_layer.py) —
  reads the kosha schedule (sibling checkout `--source` or `--url` raw fetch),
  emits a compact per-family digest to
  [verses/mastery/schedule_summary.json](https://github.com/gasyoun/SanskritKaraoke/blob/main/verses/mastery/schedule_summary.json)
  with `_provenance` (repo/path/sha256/rows). Deterministic: no wall-clock stamps, reruns byte-identical.
- **Reader-surface render** [mastery.html](https://github.com/gasyoun/SanskritKaraoke/blob/main/mastery.html) —
  «Карта мастерства»: totals (35 517 units, mean ease 0.69, 5 families) + one card per family
  (count · mean ease · mean stability · 4-bucket ease distribution bar, ru-RU), linked from
  [progress.html](https://github.com/gasyoun/SanskritKaraoke/blob/main/progress.html) header
  («🗺 Карта мастерства» chip). Cross-links the campus map (gasyoun.github.io/mastery/, H4262).
- **Offline tests** [tests/test_mastery_layer.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tests/test_mastery_layer.py) —
  fixture aggregates, determinism, ease-range guard.
- **Edge registered** — kosha → SanskritKaraoke `feeds` row in Uprava `interlinks_edges.tsv` + prose.

Digest aggregates (derived, not stored): sandhi 0.78 / samasa 0.54 / morphology 0.71 / vocab 0.70 / thematic_vocab 0.75 mean ease; every family's `due` horizon = epoch 2026-09-01 (H3742 baseline, single start date).

## Checks

| Check | Command | Result |
|---|---|---|
| Generator idempotent | `python3 tools/build_mastery_layer.py` ×2 + sha256 | PASS (byte-identical) |
| Unit tests | `python3 -m pytest tests/ -q` | PASS (4 passed, incl. 3 new) |
| UI smoke, mastery.html | `python3 -m http.server` + headless browser | PASS — 5 family cards render, numbers match digest, console clean |
| UI smoke, progress.html | same | PASS — new chip present, no new console errors |
| Library regression | `tools/validate_library.py` | N/A here — pre-existing missing `jsonschema` in system python; untouched verses/data (CI env has it) |

## Delivery (five fields)

- **Changed:** `mastery.html` (new), `progress.html` (one nav chip), `verses/mastery/schedule_summary.json` (new digest), `tools/build_mastery_layer.py` (new), `tests/test_mastery_layer.py` (new), CHANGELOG.
- **Unchanged:** verse data, catalogue/student/teacher pages, pipeline, CI, version (v1.5.5).
- **Checks:** see table above — all green except pre-existing unrelated `jsonschema` env gap.
- **Risks:** digest snapshots today's kosha main; refresh = rerun the generator (or wire into CI later). Only aggregates are shipped — no personal data, no per-student state.
- **Inspect:** open `mastery.html` first; digest `verses/mastery/schedule_summary.json` second; generator `tools/build_mastery_layer.py` third.

_Гасунс_
