# My Agent Engineering Roadmap

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
- [ ] `agents/verse_agent_raw.py` — raw SDK version (~200 lines)
- [ ] `agents/verse_agent_sdk.py` — Claude Agent SDK version (~80 lines)
- [ ] `agents/POSTMORTEM.md` — what the harness gave you for free

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
- [ ] `agents/teaching_pipeline/` — LangGraph multi-agent project
- [ ] LangSmith trace URL showing a full verse-to-catalogue run
- [ ] `agents/teaching_pipeline/README.md` — architecture diagram

**Key resource:** https://langchain-ai.github.io/langgraph/ (LangGraph 1.0 docs)

---

### Phase 3 — Custom Thin Harness `SPEEDRUN` · 4 weeks
*Compressed because goal is shipping, not framework archaeology.*

Instead of building a 1,500-line harness from scratch, study the Claude Code harness you are already inside:

- Read Claude Code's CLAUDE.md system, Skills mechanism, and hooks
- Identify the ten harness components and where each is implemented
- Write a gap analysis: what would you need to add to Claude Code to support the Sanskrit Karaoke teaching pipeline fully?

**Deliverable:**
- [ ] `docs/harness_gap_analysis.md` — ten-component audit of Claude Code vs. teaching pipeline needs
- [ ] At least one custom hook or skill added to the project (e.g., a `validate-verse` skill that runs `validate_library.py` before every commit)

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
- [ ] `evals/golden/` — ≥ 8 golden cases from documented bugs
- [ ] `evals/judge.py` — LLM-as-judge script
- [ ] `.github/workflows/evals.yml` — CI eval gate
- [ ] Benchmark baseline score for current Gemini Flash output

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

---

## Next Action

**Today:** Phase 5 core infrastructure complete. **Next:** Finalize Firebase data migration (moving all legacy LocalStorage SRS to Firestore) and implement mobile-first UX polish for the progress dashboard.

---

*Duration math: Phase 0 (1w SPEEDRUN) + Phase 1 (6w NORMAL) + Phase 2 (9w NORMAL) + Phase 3 (4w SPEEDRUN) + Phase 4 (10w DEEP) = 30 weeks at 5 h/week. Phase 5 is ongoing.*
