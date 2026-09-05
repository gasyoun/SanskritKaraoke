# My Agent Engineering Roadmap

_Created: 12-05-2026 · Last updated: 02-09-2026_

> **Truth-pass 18-08-2026 (H3000).** This is a **personal agent-engineering
> curriculum** that uses this repo as its practice vehicle. It is **not product
> backlog**: its open checkboxes must not be counted in any product census, and
> no drain or `/fruit` run should pick a unit from here as repo work.

*Personalized from https://github.com/codejunkie99/agent-roadmap-2026 on 2026-05-12.*  
*Practice vehicle: Sanskrit Karaoke edutech platform.*

---

## Profile

- **Level:** Built simple ones (using Claude Code and Gemini Flash as orchestrators)
- **Time:** 5 h/week (learning time, separate from feature work)
- **Stack:** Python + Claude + Gemini Flash (multi-provider)
- **Goal:** Both — grow as an agent engineer AND ship real features into the platform
- **Total estimated duration:** ~30 weeks

---

## Phase Plan

### Phase 0 — Mental Models `SPEEDRUN` · 1–2 weeks
*3 days of reading, 1 week of reflection.*

You are already running Claude Code — which IS the reference harness this roadmap is built around. Your Phase 0 is not about learning what a harness is; it's about making the implicit explicit.

**What to do:**
- Read Anthropic's engineering blog posts on context engineering and the augmented LLM concept
- Map the four context primitives onto what you already do in Claude Code:
  - **Write** → `.ai_state.md`, `CLAUDE.md`, `GEMINI_HANDOFF.md`
  - **Select** → `system-reminder` injections, Memory files
  - **Compress** → auto-compaction at context limit
  - **Isolate** → the `Explore` and `Plan` sub-agents you already spawn
- Note where your current harness is weak (no cost tracking, no evals, no sandboxing)

**Deliverable:** `docs/harness_mental_model.md` — a 2-page note explaining the Claude Code harness through the lens of the ten harness components: loop control, tool dispatch, context management, persistence, sub-agent orchestration, skills, hooks, observability, sandboxing, auth.

**Key resource:** https://www.anthropic.com/engineering (filter to agent posts)

---

### Phase 1 — First Tool-Using Agent `NORMAL` · 6 weeks
*Build the verse-library agent twice: raw SDK, then Claude Agent SDK.*

**Project:** A verse-processing agent that manages `verses/data/*.json`.

**Week 1–3 (raw Anthropic SDK + Gemini SDK):**  
Build an agent with these tools:
- `read_verse(id)` — load a verse JSON
- `write_verse(id, data)` — save a verse JSON (validates against schema first)
- `list_verses()` — return the catalogue index
- `detect_meter(s1, s2)` — call Claude to identify the meter from syllable text
- `translate_verse(s1, s2, target_lang)` — call Gemini Flash for RU↔EN translation
- `build_index()` — run `tools/build_index.py` as a subprocess

The agent's task: given raw Sanskrit text and source info, produce a complete, valid `verse.schema.json`-compliant file and add it to the catalogue.

**Week 4–6 (Claude Agent SDK rebuild):**  
Rebuild the same agent using Claude Agent SDK. Note what the SDK provides vs. what you wrote manually. Write the post-mortem as a comment in the code.

**Deliverable:**
- [x] `agents/verse_agent_raw.py` — raw SDK version (~200 lines) — live dry-run CLI restored 01-08-2026 (H2101): `python agents/verse_agent_raw.py --dry-run` exit 0 over `verses/`; historical educational copy remains at [docs/history/verse_agent_raw.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/history/verse_agent_raw.py) (commit `8eca6ec`)
- [x] `agents/verse_agent_sdk.py` — Claude Agent SDK version (~80 lines) — shipped, later relocated to [docs/history/verse_agent_sdk.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/history/verse_agent_sdk.py) (commit `8eca6ec`)
- [x] `agents/POSTMORTEM.md` — what the harness gave you for free — shipped, later relocated to [docs/history/POSTMORTEM.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/history/POSTMORTEM.md) (commit `8eca6ec`)
- [x] `agents/README.md` — usage for raw agent + layout pointer (H2101)

**Key resource:** https://docs.anthropic.com/en/docs/agents (Claude Agent SDK docs)

---

### Phase 2 — Multi-Step Persistent Agent `NORMAL` · 9 weeks
*Build a Sanskrit teaching pipeline on LangGraph 1.0 + Deep Agents.*

**Project:** A teaching pipeline agent that orchestrates the full student journey.

**Sub-agents:**
| Sub-agent | Task |
|---|---|
| `VerseCurator` | Validates, enriches, and publishes verse JSON files |
| `StudentAnalyzer` | Reads `localStorage` SRS dumps, recommends next verses per difficulty curve |
| `ContentEnricher` | Uses Gemini Flash to add missing translations, tags, and difficulty estimates |
| `QualityGate` | Runs `validate_library.py` and blocks malformed verses |

**Persistence:** PostgresSaver via LangGraph — the pipeline remembers which verses are in-progress, which need translation, which students are due for review.

**Deliverable:**
- [x] `agents/teaching_pipeline/` — LangGraph multi-agent project — shipped (commit `ad09b87`, four-node graph: VerseCurator/ContentEnricher/QualityGate/StudentAnalyzer, `PostgresSaver`-backed with `SqliteSaver`/`MemorySaver` fallback); re-verified 01-08-2026 (A02): `pytest agents/teaching_pipeline/` passes, `python agents/teaching_pipeline/test_simulation.py` runs a full curation+analysis simulation end-to-end
- [x] LangSmith trace URL showing a full verse-to-catalogue run — **repo-side done 29-08-2026 (OxAlpha `z-ai/glm-5.3-flash`, via `/drain`; earlier 19-08-2026 pass proved the row human-gated on the missing key)**: tracing is env-native, plumbing + probe shipped — [`agents/teaching_pipeline/trace_probe.py`](https://github.com/gasyoun/SanskritKaraoke/blob/main/agents/teaching_pipeline/trace_probe.py) (verifies `LANGSMITH_*` from `.env`, runs [`test_simulation.py`](https://github.com/gasyoun/SanskritKaraoke/blob/main/agents/teaching_pipeline/test_simulation.py), points to the trace), `.env.example` §LangSmith, [README tracing section](https://github.com/gasyoun/SanskritKaraoke/blob/main/agents/teaching_pipeline/README.md). **Остаток — за М.Г. (human-gate, ≈10 мин):** создать бесплатный LangSmith-токен (smith.langchain.com → Settings → Personal Access Tokens) → вписать `.env` §LangSmith (`LANGSMITH_TRACING=true` + ключ) → `python agents/teaching_pipeline/trace_probe.py` → вписать trace URL в эту строку.
- [x] `agents/teaching_pipeline/README.md` — architecture diagram — **already shipped** (truth-pass 19-08-2026, Sonnet 5 `claude-sonnet-5`): [`agents/teaching_pipeline/README.md`](https://github.com/gasyoun/SanskritKaraoke/blob/main/agents/teaching_pipeline/README.md) carries a Mermaid graph of all four nodes + two routers, a node-by-node description table, and test/eval run instructions.

**Key resource:** https://langchain-ai.github.io/langgraph/ (LangGraph 1.0 docs)

---

### Phase 3 — Custom Thin Harness `SPEEDRUN` · 4 weeks
*Compressed because goal is shipping, not framework archaeology.*

Instead of building a 1,500-line harness from scratch, study the Claude Code harness you are already inside:

- Read Claude Code's CLAUDE.md system, Skills mechanism, and hooks
- Identify the ten harness components and where each is implemented
- Write a gap analysis: what would you need to add to Claude Code to support the Sanskrit Karaoke teaching pipeline fully?

**Deliverable:**
- [x] `docs/harness_gap_analysis.md` — ten-component audit of Claude Code vs. teaching pipeline needs — **already shipped** (truth-pass tick 26-08-2026, OxAlpha `stealth/ox-alpha`, via `/drain`): authored by Gemini Flash in commit `ad09b87` alongside the Phase-2 LangGraph deliverable but never ticked. [`docs/harness_gap_analysis.md`](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/harness_gap_analysis.md) carries the full ten-component table (Loop Control, Tool Dispatch, Context, Persistence, Orchestration, Skills, Hooks, Observability, Sandboxing, Auth) plus three critical-gap sections (HITL breakpoint, observability, FastAPI UI↔pipeline bridge); companion mental model in [`docs/harness_mental_model.md`](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/harness_mental_model.md).
- [x] At least one custom hook or skill added to the project — **shipped** (OxAlpha `stealth/ox-alpha`, 26-08-2026, via `/drain`): project skill [`.claude/skills/validate-verse/SKILL.md`](https://github.com/gasyoun/SanskritKaraoke/blob/main/.claude/skills/validate-verse/SKILL.md) (single-file + full-library validation, jsonschema ergonomics, warning-baseline interpretation) AND the automation half of this example realised — [`.githooks/pre-commit`](https://github.com/gasyoun/SanskritKaraoke/blob/main/.githooks/pre-commit) now runs `tools/validate_library.py` whenever `verses/**` is staged: real failures BLOCK the commit, a python-without-jsonschema machine degrades to a loud WARNING, `ALLOW_VALIDATE_SKIP=1` is the solo escape. Closes the *Skills* row of the gap analysis ("needs a `validate-verse` hook").

---

### Phase 4 — Evals `DEEP` · 10 weeks
*Highest priority for this project — you are already reviewing Gemini Flash output manually. Automate it.*

**The core problem:** Gemini Flash implements features, you review the code, you find 8–16 bugs each round. This is expensive and error-prone. Evals replace the manual review with a repeatable gate.

**Week 1–3: Golden dataset**  
Build a golden dataset from GEMINI_FIXES.md and GEMINI_ROADMAP.md bugs:
```
evals/
  golden/
    bug_01_mode_blind_css.json      ← input: student.html, expected: .wave-svg-wrap class
    bug_02_beattap_highlight.json   ← input: quizzes.js, expected: _mainHighlightStart() call
    bug_09_make_student_injection.json
    ...  (one file per documented bug)
```
Each golden case: `{ "input": "<file content>", "check": "<thing that must be true>", "expected_pass": true }`

**Week 4–6: LLM-as-judge**  
Write a Claude-as-judge evaluator:
```python
# evals/judge.py
# For each golden case:
#   1. Run the Gemini-produced file through the check
#   2. Ask Claude: "Does this file satisfy the check? Answer YES/NO + reason."
#   3. Record pass/fail + reason
```

**Week 7–8: CI regression gate**  
GitHub Actions workflow that:
- Runs the eval suite on every PR from Gemini Flash
- Posts a score to the PR as a comment: `Eval: 14/16 checks passed ✓`
- Blocks merge if score drops below 80%

**Week 9–10: Trajectory evals**  
For multi-step tasks (e.g., "add a verse end-to-end"), record the agent's tool calls as a trajectory and eval whether it took a reasonable path, not just whether the output is correct.

**Deliverable:**
- [x] `evals/golden/` — ≥ 8 golden cases from documented bugs — **already shipped** (truth-pass tick 27-08-2026, OxAlpha via `/drain`): [`evals/golden/cases.json`](https://github.com/gasyoun/SanskritKaraoke/blob/main/evals/golden/cases.json) carries exactly 8 golden cases (translation, meter gate, id format, tags, curator validation, duplicate id, script validation, version type).
- [x] `evals/judge.py` — LLM-as-judge script — **already shipped** (truth-pass tick 27-08-2026, OxAlpha via `/drain`): [`evals/judge.py`](https://github.com/gasyoun/SanskritKaraoke/blob/main/evals/judge.py) drives the real LangGraph pipeline ([agents/teaching_pipeline/graph.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/agents/teaching_pipeline/graph.py)) over every golden case, normalizes Pydantic state, and evaluates check strings in a builtins-restricted eval sandbox; LLM-dependent checks degrade to explicit «skipped: no API key» instead of silently passing. Companion verifier [`evals/check_report.py`](https://github.com/gasyoun/SanskritKaraoke/blob/main/evals/check_report.py) gates the report.
- [x] `.github/workflows/evals.yml` — CI eval gate — **already shipped** (truth-pass tick 27-08-2026, OxAlpha via `/drain`): [`.github/workflows/evals.yml`](https://github.com/gasyoun/SanskritKaraoke/blob/main/.github/workflows/evals.yml) triggers on push/PR touching `agents/teaching_pipeline/**` or `evals/**`, runs [`evals/judge.py`](https://github.com/gasyoun/SanskritKaraoke/blob/main/evals/judge.py) in deterministic mode (no keys in CI) and fails the job through [`evals/check_report.py`](https://github.com/gasyoun/SanskritKaraoke/blob/main/evals/check_report.py).
- [x] Benchmark baseline score for current Gemini Flash output — **already shipped** (truth-pass tick 27-08-2026, OxAlpha via `/drain`): baseline recorded in [`evals/report.json`](https://github.com/gasyoun/SanskritKaraoke/blob/main/evals/report.json) — 6/8 pass, 2 explicitly skipped pending a provisioned Gemini/LangSmith key (same credential residual as Phase-2 line above).

---

### Phase 5 — Production Hardening `DEEP` · ongoing

**Cost discipline:**  
Track Claude and Gemini API spend per feature. Add token-count logging to both agents.
Target: < $0.10 per verse processed end-to-end.

**Observability:**  
Add structured logging to the teaching pipeline agent. Every student session: verse loaded, mode used, quiz result, SRS rating. Feed to a simple JSONL log file and a weekly summary script.

**Resilience:**  
- Drive API failures: cache session JSON locally, serve stale if Drive is down
- Gemini Flash failures: fall back to Claude for translation tasks
- SRS data loss: export localStorage to Drive on each session end

**Deliverable:**
- [x] Cost dashboard (even a simple script that reads API logs)
- [x] Student session logging in `student.html`
- [x] Drive-failure fallback in `loadStudentData`
- [x] Provider expansion (Gemma 2 27B)
- [x] Firebase Cloud Sync (Auth + Firestore)

---

### Phase 6 — Autonomous Production Run `DEEP` · gated on content

The capstone: everything Phases 0–5 built (agents, harness knowledge, evals, cost/observability)
executes a **real product deliverable unattended** — the first chapter drop.

**The task:** given a folder of Уша Санка's chapter audio, one agent session runs
[docs/archive/H132-Sonnet_SanskritKaraoke_AUDIO_DROP_RUNBOOK_02.07.26.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/archive/H132-Sonnet_SanskritKaraoke_AUDIO_DROP_RUNBOOK_02.07.26.md)
end-to-end: align → render `feed_v1` MP4s → post-kits → posting plan → (creds permitting)
live Telegram posts — with the human touching only QA sign-off.

**What makes it a curriculum phase, not just ops:**
- **Trajectory discipline** (Phase 4 week 9–10 payoff): the run is logged as a tool-call
  trajectory; a post-run judge pass evaluates whether the agent took a reasonable path.
- **Eval activation:** original audio plus automatic-before and human-approved-after JSONs activate
  the ADR-0004 comparison corpus. Report held-out ±50 ms accuracy, but accept the product only when
  human review takes under one minute per clip.
- **Cost discipline** (Phase 5 payoff): per-verse end-to-end cost measured against the
  < $0.10 target.

**Gate check 02-09-2026 (Sonnet 5 `claude-sonnet-5`, H3776):** all five boxes below share ONE
named gate — Уша Санка's chapter audio has not been recorded/supplied yet (`.ai_state.md`
§ Current WIP: "gated on M.G., not on code" — batch audio + Telegram credentials). No box here
is mechanically actionable; none was ticked or fabricated. See
[docs/archive/H132-Sonnet_SanskritKaraoke_AUDIO_DROP_RUNBOOK_02.07.26.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/archive/H132-Sonnet_SanskritKaraoke_AUDIO_DROP_RUNBOOK_02.07.26.md)
for the runbook that fires the moment audio lands.

**Deliverable:**
- [ ] First real `build_chapter.py` run on session audio — MP4s + post-kits produced — **gate: chapter audio (human:MG/Уша Санка)**
- [ ] Alignment eval report on real audio (`eval_alignment.py`) — **gate: chapter audio (human:MG/Уша Санка)**
- [ ] Run trajectory log + post-run judge assessment in `logs/` — **gate: chapter audio (human:MG/Уша Санка)**
- [ ] ≥1 live post published via `schedule_drops.py --live` (Telegram) — **gate: chapter audio + Telegram credentials (human:MG)**
- [ ] Postmortem: measured cost/verse and human-minutes/verse vs the **<1 min** QA target — **gate: chapter audio (human:MG/Уша Санка)**

**Pre-work done before audio lands (02-07-2026):** runbook written; `npm install --prefix tools`
executed for the first time; dry-run path verified earlier (2026-06-14).

---

## Curated Resources for This Profile

| Phase | Resource | Why |
|---|---|---|
| 0 | [Anthropic engineering blog](https://www.anthropic.com/engineering) | Primary source on harness engineering |
| 0 | [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code) | The harness you're already inside |
| 1 | [Anthropic SDK Python](https://github.com/anthropic-ai/anthropic-sdk-python) | Raw SDK for Phase 1 week 1–3 |
| 1 | [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents) | Phase 1 week 4–6 |
| 1 | [Google GenAI Python SDK](https://github.com/google-gemini/generative-ai-python) | Gemini Flash tool use |
| 2 | [LangGraph 1.0 docs](https://langchain-ai.github.io/langgraph/) | Phase 2 multi-agent |
| 2 | [Deep Agents](https://deepagents.ai) | Runtime with PostgresSaver + OTEL |
| 4 | [Inspect eval framework](https://inspect.ai) | Phase 4 evals |
| 4 | [LangSmith](https://smith.langchain.com) | Trace storage + LLM-as-judge |
| 5 | Anthropic cost dashboard | Phase 5 cost discipline |

*Multi-provider note: both Claude and Gemini Flash are used. Phase 1 exercises both SDKs. Phase 4 uses Claude-as-judge to evaluate Gemini output — this is intentional; a different model makes a more independent reviewer.*

---

## Project Deliverables Checklist

- [x] **Phase 0** — `docs/harness_mental_model.md` (ten-component Claude Code audit)
- [x] **Phase 1** — verse agent (raw & SDK versions) + `POSTMORTEM.md` (moved to `docs/history/`)
- [x] **Phase 2** — LangGraph teaching pipeline (v1.4.1 Pydantic refactored)
- [x] **Phase 3** — `docs/harness_gap_analysis.md` + one custom skill/hook
- [x] **Phase 4** — golden dataset (8 cases) + LLM-as-judge + CI eval gate
- [x] **Phase 5** — cost logging + student session observability + Drive fallback + Cloud Sync
- [ ] **Phase 6** — autonomous chapter-drop run + trajectory judge + cost postmortem — **gate: chapter audio (human:MG/Уша Санка)**

---

## Next Action

**Today (02-07-2026):** Phases 0–5 complete; Phase 6 defined. **Next:** when chapter audio
lands, execute [docs/archive/H132-Sonnet_SanskritKaraoke_AUDIO_DROP_RUNBOOK_02.07.26.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/archive/H132-Sonnet_SanskritKaraoke_AUDIO_DROP_RUNBOOK_02.07.26.md)
as the Phase 6 run. Until then: keep pre-flight green (Puppeteer installed, validator clean).

---

*Duration math: Phase 0 (1w SPEEDRUN) + Phase 1 (6w NORMAL) + Phase 2 (9w NORMAL) + Phase 3 (4w SPEEDRUN) + Phase 4 (10w DEEP) = 30 weeks at 5 h/week. Phase 5 is ongoing.*

_Dr. Mārcis Gasūns_
