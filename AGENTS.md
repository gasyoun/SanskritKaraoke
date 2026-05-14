# AGENTS.md — Sanskrit Karaoke

This file is loaded by AI agent harnesses (Claude Code, Codex, Cursor, Copilot) to orient
any new agent session in this repository.

## Active roadmap

See **MY_ROADMAP.md** for the full 30-week agent engineering curriculum being practised
on this project.

**Current phase:** Phase 2 — Multi-Step Persistent Agent (LangGraph pipeline)

**Next action:**
> Finalize **Phase 2** documentation (architecture diagram) and begin **Phase 5** 
> (Observability). Implement cost logging for LLM calls and student session 
> telemetry in `student.html`.

## Platform context

- **Live URL:** https://samskrtam.ru/shloka-wave
- **Version:** v1.4.1
- **LLM Stack:** Anthropic (Sonnet 3.5), Gemini (Flash 1.5), OpenRouter (Fallback)
- **Student flow:** `catalogue.html` → `student.html?id=X` → `progress.html`
- **Content pipeline:** edit verse JSON → CI validates → `verses/index.json` auto-rebuilt
- **Evals:** Golden Dataset (8 cases) implemented in `evals/judge.py` with CI gate.

## Pending feature work

| Priority | Task |
|---|---|
| Done | Fix pipeline bugs: `v1.4.1` Pydantic refactor + persistence fix |
| Done | Phase 4 — `evals/golden/` + `evals/judge.py` (MY_ROADMAP.md) |
| Done | Phase 3 — `docs/harness_gap_analysis.md` (Custom skill audit) |
| Done | Auto-alignment implementation (GEMINI_ALIGNMENT_PLAN.md — Gemini Flash) |
| Backlog | Firebase auth + cloud SRS (ROADMAP.md Phase 1) |
| Done | Phase 0 — `docs/harness_mental_model.md` (ten-component audit) |
| Done | Phase 1 raw SDK — `docs/history/verse_agent_raw.py` |
| Done | Gemini Phases 1–5 (catalogue, student, mobile, Telegram, PWA) |
