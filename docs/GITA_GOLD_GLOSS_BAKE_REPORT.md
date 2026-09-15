# Gita gold word-by-word gloss+morphology bake — report (H4734)

_Created: 15-09-2026 · Last updated: 15-09-2026_

## Mission

Census C7. Extend `tools/build_glosses.py` to bake the hand-curated
gita-gold-master (9,092 gold words, all 18 adhyayas) word-by-word
glosses+morphology for Gita verses — the current corpus-lexicon glosses were
partial (e.g. 2.49 showed 8 fused words, 2.47 split mā/karma-phala-hetu
differently and carried weaker RU).

## What changed

- [tools/build_glosses.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/build_glosses.py) — new gold layer:
  `--gold PATH` (default `../kosha/data/gita/gita_gold_master.tsv`, env
  `KARAOKE_GITA_GOLD`), `--no-gold` legacy mode. Gita verses (source.text
  `Bhagavad Gita`) bake the hand-curated layer when the master has rows for the
  passage; everything else keeps the corpus-align path unchanged (which now
  degrades to a warning instead of a hard error when the sibling corpus clone
  is absent). Gold words carry `sa` (IAST), `dev` (Devanagari), `ru`, `gloss_en`,
  `lemma` and a `morph` object with 13 verbatim master columns (form_type, code,
  tense, pada, vclass, root, root_tr, prefix, stem_end, gender, compound, mark,
  rule; empty values dropped). `gloss_source.provenance` flips to
  `gita-gold-hand-curated`, corpus pins `kosha/data/gita/gita_gold_master.tsv`.
- [verses/schema/verse.schema.json](https://github.com/gasyoun/SanskritKaraoke/blob/main/verses/schema/verse.schema.json) —
  `glosses[]` items: `slp1` no longer required (it is a corpus-align artifact;
  gold entries have none), new optional `sa`/`gloss_en`/`dev`/`lemma`/`morph`
  props; `gloss_source.provenance` enum gains `gita-gold-hand-curated`.
- Rebuilt verse data: `verses/data/bhg_2_47.json` (13→15 words),
  `bhg_2_48.json` (12→12, richer splits+RU), `bhg_2_49.json` (8→11 words).
- New verification harness: [tools/render_gloss_diff.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/render_gloss_diff.py) —
  reproduces `renderGlosses()` output so a bake diff is a render diff.

## 5-verse render diff (before → after)

| Verse | Before | After | Verdict |
|---|---|---|---|
| bhg_2_47 | 13 words, corpus-align | 15 words, gita-gold-hand-curated | improved (право/безусловно/в плодах; mā split off) |
| bhg_2_48 | 12 words, corpus-align | 12 words, gold (samaḥ = уравновешенный, not равный) | improved |
| bhg_2_49 | 8 fused words, corpus-align | 11 words, gold (hi/avaram/karma/… split out) | improved |
| subh_0001 | (gloss-box hidden) | (gloss-box hidden) | canary: unchanged ✓ |
| subh_0550 | (gloss-box hidden) | (gloss-box hidden) | canary: unchanged ✓ |

Full before/after dumps: `gloss_before.txt` / `gloss_after.txt` (this diff is
reproducible via `git stash` + `tools/render_gloss_diff.py bhg_2_47 bhg_2_48
bhg_2_49 subh_0001 subh_0550`).

## Checks

- `python tools/validate_library.py` → **All 38 verse(s) valid** (152 pre-existing TODO-audio warnings, unchanged).
- Real-browser render receipt (headless Chromium over `python3 -m http.server`):
  `student.html?id=bhg_2_49` → gloss-box `display: block`, 11 `.gloss-w` words,
  text matches the harness byte-for-byte; `student.html?id=subh_0001` →
  gloss-box hidden. Console errors: local-serve font 404s only (pre-existing).

## Risks

- Gold-master word splits are the hand-curated segmentation (e.g. 2.49 `hi`
  gets its own card); if karaoke per-word highlighting is later wired to the
  gloss layer, its alignment baseline must match the gold split, not the
  Sementsov alignment.
- The gold RU glosses read as a study glossary (some entries carry trailing
  punctuation, e.g. 2.49 «…своего труда.») — faithful to the master; cosmetic
  trimming would be a separate register decision.

## Provenance

Source dataset: kosha `gita-gold-master`
([data/gita/gita_gold_master.tsv](https://github.com/gasyoun/kosha/blob/main/data/gita/gita_gold_master.tsv),
9,092 rows, CC BY-SA 4.0, hand-curated from SanskritGrammar/Concordance/Gita.xlsm
by Dr. Mārcis Gasūns). Edge registered in Uprava
[PROJECT_INTERLINKS.md](https://github.com/gasyoun/Uprava/blob/main/PROJECT_INTERLINKS.md)
+ `interlinks_edges.tsv` (kosha → SanskritKaraoke).

_Гасунс_
