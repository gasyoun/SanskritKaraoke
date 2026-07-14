# rv_verse_seeds.json — Rig-Veda verse-selection seed table

_Created: 08-07-2026 · Last updated: 08-07-2026_

[`rv_verse_seeds.json`](rv_verse_seeds.json) is a **seed/lookup table for verse
selection**, not karaoke-ready content — it is not part of the
[`verses/`](../../verses/README.md) catalogue and carries no `has_audio`/`has_session`
gate itself. It exists so a future editorial pass choosing new Rig-Veda stanzas for
Sanskrit Karaoke can pick by meter without re-deriving scansion from scratch.

## Contents

10,551 Rig-Veda stanzas (maṇḍalas 1–10), one row per `location` (`mandala.hymn.stanza`):

- `meter` — VedaWeb's computer-generated meter-type label (e.g. `"Gāyatrī"`), `null`
  where VedaWeb assigned none (irregular/mixed stanzas).
- `scansion` — per-pada long/short (`—`/`◡`) syllable marks + syllable count.
- `accented_text` — udātta-accented Rigveda-saṁhitā text (Zurich version, Scarlata &
  Widmer 2017, after Lubotsky).

## Source & method

Built by [`tools/build_rv_verse_seeds.py`](../../tools/build_rv_verse_seeds.py), joining
two VedaWeb 2.0 exports already landed in the sibling `VisualDCS` repo on the shared
`location` key:

- `VisualDCS/non-derived/vedaweb/metrical_data_2024.json` — VedaWeb 2024 metrical
  analysis (Kiss & Kölligan), computer-generated via
  [`viracitapada`](https://github.com/VedaWebProject/viracitapada), based on the edition
  of Van Nooten & Holland (1994). Exported 08-07-2026 via the async
  `/resources/{id}/export` → `pickupKey` → `/platform/tasks/download` flow
  (resource `67615e6bb20f4c1a9fb8a040`; see
  [FINDINGS.md §48](https://github.com/gasyoun/SanskritLexicography/blob/master/FINDINGS.md)
  for the API shape).
- `VisualDCS/non-derived/vedaweb/accented_text_scarlata_widmer_lubotsky.json` — landed by
  [H096](https://github.com/gasyoun/Uprava/blob/main/handoffs/archive/H096-Sonnet_VisualDCS_vedaweb_feed_export_03.07.26.md).

All 10,551 metrical-data rows joined against an accented-text row on the first attempt
(0 misses).

## License & attribution

**CC BY 4.0.** Rights confirmed by Prof. Daniel Kölligan (writing also on behalf of
Prof. Uta Reinöhl), 08-07-2026 — see
[`Uprava/handoffs/outreach/OUTREACH_2026-07-08_vedaweb_kolligan_reinohl_rights.md`](https://github.com/gasyoun/Uprava/blob/main/handoffs/outreach/OUTREACH_2026-07-08_vedaweb_kolligan_reinohl_rights.md).
Attribute **"VedaWeb 2.0 – Universität zu Köln"** plus the specific resource citation
(embedded in the file's `citation` field):

> Kiss, Börge, & Daniel Kölligan. 2024. Computer-generated metrical analysis of the
> Rigveda saṁhitā text based on the edition of Van Nooten & Holland (1994). Cologne.
> Curated and hosted by VedaWeb – Online Research Platform for Old Indic texts.
> University of Cologne.

Accented text additionally credits Scarlata & Widmer (2017), after Lubotsky — see
[`VisualDCS/non-derived/vedaweb/README.md`](https://github.com/gasyoun/VisualDCS/blob/main/non-derived/vedaweb/README.md)
for that layer's full citation.

## Not in scope here

- **No audio.** The SanskritKaraoke audio-rights gate is unchanged and still applies to
  any verse eventually promoted from this seed table into `verses/data/*.json`.
- **No automatic promotion.** Turning a seed row into a full karaoke verse entry
  (translation, glosses, difficulty rating, melody/audio) remains a per-verse editorial
  decision, not a bulk action from this table.

_Dr. Mārcis Gasūns_
