_Created: 26-08-2026 · Last updated: 05-09-2026_

---
name: validate-verse
description: Validate verse JSON data against the project schema before committing, publishing, or building indexes — runs tools/validate_verse.py for a single file or tools/validate_library.py for the whole catalogue. Use whenever a verses/** file or verses/schema was edited, before any commit that includes verse data, and before drop/publish flows that consume the catalogue.
---

# validate-verse — verse data integrity

The integrity gate for the Sanskrit Karaoke verse library (the skills-row closure
of the ten-component audit in [docs/harness_gap_analysis.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/harness_gap_analysis.md)).

## Run it

```sh
# whole catalogue (schema + cross-file checks + lint warnings)
python tools/validate_library.py

# one file only
python tools/validate_verse.py verses/data/bhg_2_47.json
```

Requires `jsonschema` (quick path: `pip install langgraph langchain-anthropic google-generativeai pydantic jsonschema python-dotenv requests`; full: `pip install -r agents/teaching_pipeline/requirements.txt`). If your system python lacks the module, use a dedicated venv.

## Interpreting results

- Pass = `✓` per file, final line `All N verse(s) valid, M warning(s)`.
- Warnings are advisory lint (missing audio checksums, TODO placeholders, absent canonical URLs). Known baseline as of 26-08-2026: **13 verses valid, 52 warnings**. A NEW warning class deserves investigation before you wave it off.
- Schema failures are hard errors — fix the data or extend the schema additively, never weaken the schema to fit broken data.

## Automatic enforcement

[.githooks/pre-commit](https://github.com/gasyoun/SanskritKaraoke/blob/main/.githooks/pre-commit) runs `tools/validate_library.py` on any commit staging `verses/**`:

- validation failure → the commit is BLOCKED;
- python/jsonschema missing on the machine → loud WARNING, commit proceeds (run this skill manually);
- solo escape hatch: `ALLOW_VALIDATE_SKIP=1 git commit ...`.

Install once per clone: `git config core.hooksPath .githooks`.

Run this skill after editing verse JSON or the schema, before committing any staged `verses/**` change (the hook should catch it first), and before publish flows (drop runbook step: validate → build indexes → render).

_Dr. Mārcis Gasūns_
