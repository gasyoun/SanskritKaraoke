# CLAUDE.md

_Created: 12-05-2026 · Last updated: 27-08-2026_

**Sanskrit Karaoke** (Волновая нотация санскрита) is a single-page web app
that visualises the metrical structure of Sanskrit ślokas as interactive
wave diagrams, with audio timing and karaoke MP4 export. Live:
[gasyoun.github.io/SanskritKaraoke](https://gasyoun.github.io/SanskritKaraoke/).

Org conventions live in [`../CLAUDE.md`](https://github.com/gasyoun/github-spine/blob/main/CLAUDE.md).
Before encodings or corpus data, read the
[Sanskrit context primer](https://github.com/gasyoun/github-spine/blob/main/SANSKRIT_CONTEXT_PRIMER.md).
Gotchas from this repo: infra and process →
[Uprava/FINDINGS.md](https://github.com/gasyoun/Uprava/blob/main/FINDINGS.md);
Sanskrit data →
[SanskritLexicography/FINDINGS.md](https://github.com/gasyoun/SanskritLexicography/blob/master/FINDINGS.md).
This repo keeps no registries of its own (ruling F1).

## How to run

```sh
python -m http.server 8000
node --check src/scripts/app.js
python tools/validate_verse.py <file_path>
python tools/validate_library.py
python tools/build_index.py
python tools/make_student.py
node tools/export_captions.mjs verses/data/bhg_2_47.json --timing tools/fixtures/bhg_2_47_timing.json --out dist
node tools/test_core_modules.mjs
pytest tests/test_export_captions.py
```

No bundler and no unit-test suite — QA is in-browser. Evals
(`python evals/judge.py`) need API keys in a root `.env`
(`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, optional `OPENROUTER_API_KEY`).
Push to `main` deploys GitHub Pages via `pages.yml`. A flaky deploy is
re-dispatched with `gh workflow run pages.yml` — never rerun only the
failed job.

## Version string — five places

Bump **all** of these together:

1. [`index.html`](https://github.com/gasyoun/SanskritKaraoke/blob/main/index.html)
   — `<title>` and the header `v1.N.N` span.
2. [`tools/templates/student.html`](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/templates/student.html)
   — same two places plus `strings.js?v=`; then `python tools/make_student.py`.
3. [`sw.js`](https://github.com/gasyoun/SanskritKaraoke/blob/main/sw.js)
   — `CACHE_NAME` (invalidates the service-worker cache).
4. [`CHANGELOG.md`](https://github.com/gasyoun/SanskritKaraoke/blob/main/CHANGELOG.md)
   — `[Unreleased]`.
5. Syntax-check `app.js`.

## Key files

| Path | Role |
|---|---|
| `index.html` | Teacher UI |
| `tools/templates/student.html` | Source of the student player |
| `student.html` | **Generated** by `tools/make_student.py` |
| `src/scripts/app.js` | Application logic (UTF-8; open/write with explicit encoding) |
| `src/core/*.js` | ADR-0001 strangler-fig modules — no DOM/globals |
| `src/scripts/srs.js` · `quizzes.js` · `strings.js` | Student SRS / quizzes / i18n |
| `src/data/apte_meters.json` | Lazy-loaded Apte prosody |

`app.js` is a monolith; extracted pure modules live under `src/core/`. Do
not re-inline them.

## Do not touch

- `student.html` — regenerate, do not hand-edit.
- Do not leave the five version loci drifted.
- Do not treat `ver_info.txt` as current — it no longer exists.
- Google Drive `clientId` / `apiKey` in `app.js` are public OAuth client
  credentials for the browser app, not org secrets; do not rotate them
  here without a product change.

Danger facts:
[Uprava DANGER_FACTS.md](https://github.com/gasyoun/Uprava/blob/main/DANGER_FACTS.md)
and the generated block of
[AGENTS.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/AGENTS.md).
Hand-authored content above the generated block in AGENTS.md is the
agent-engineering phase note — keep it outside the markers.

_Dr. Mārcis Gasūns_
