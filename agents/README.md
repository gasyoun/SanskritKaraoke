# agents/ — Sanskrit Karaoke agent paths

_Created: 01-08-2026 · Last updated: 01-08-2026_

## Layout

| Path | Role |
|---|---|
| [`verse_agent_raw.py`](https://github.com/gasyoun/SanskritKaraoke/blob/main/agents/verse_agent_raw.py) | Phase 1 raw SDK verse-library agent (shell tools + optional paid LLM) |
| [`teaching_pipeline/`](https://github.com/gasyoun/SanskritKaraoke/tree/main/agents/teaching_pipeline) | Phase 2 LangGraph multi-agent teaching pipeline |
| [`docs/history/verse_agent_raw.py`](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/history/verse_agent_raw.py) | Earlier educational copy of the raw agent (pre-CLI) |
| [`docs/history/verse_agent_sdk.py`](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/history/verse_agent_sdk.py) | Claude Agent SDK rebuild (history) |
| [`docs/history/POSTMORTEM.md`](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/history/POSTMORTEM.md) | Raw vs SDK harness notes |

## `verse_agent_raw.py` — usage

From the **repo root**:

```bash
# Free dry path (default): list catalogue, read one verse, schema-validate
python agents/verse_agent_raw.py --help
python agents/verse_agent_raw.py --dry-run
python agents/verse_agent_raw.py --dry-run --verse-id bhg_2_47

# Paid path (needs ANTHROPIC_API_KEY / GEMINI_API_KEY) — not required for H2101
python agents/verse_agent_raw.py --live
```

**Tools (skills):** `list_verses`, `read_verse`, `write_verse` (schema-gated), `detect_meter` (Claude), `translate_verse` (Gemini), `build_index` (subprocess).

**Guardrail:** dry-run never calls paid APIs and never writes. Live demo also refuses write unless `--write` is passed.

Optional deps for schema validation / live LLM:

```bash
pip install jsonschema python-dotenv anthropic google-generativeai
```

`jsonschema` is required for dry-run schema checks; the rest only for `--live`.

_Dr. Mārcis Gasūns_
