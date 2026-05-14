# AGENTS.md — Sanskrit Karaoke

This file is loaded by AI agent harnesses (Claude Code, Codex, Cursor, Copilot) to orient
any new agent session in this repository.

## Active roadmap

See **MY_ROADMAP.md** for the full 30-week agent engineering curriculum being practised
on this project.

**Current phase:** Phase 1 — First Tool-Using Agent (weeks 4–6: Claude Agent SDK rebuild)

**Next action:**
> Phase 4 — Evals. Build the **Golden Dataset** from `GEMINI_FIXES.md` and 
> `GEMINI_ROADMAP.md`. Implement the **Claude-as-judge** evaluator in 
> `evals/judge.py` to automate quality control.

## Platform context

- **Live URL:** https://samskrtam.ru/shloka-wave
- **Version:** v1.4.0
- **LLM Stack:** Anthropic (Sonnet 3.5), Gemini (Flash 1.5), OpenRouter (Fallback)
- **Student flow:** `catalogue.html` → `student.html?id=X` → `progress.html`
- **Content pipeline:** edit verse JSON → CI validates → `verses/index.json` auto-rebuilt
- **Gemini Flash** implements features; review documented in `GEMINI_FIXES.md` and
  `GEMINI_ROADMAP.md`; evals will be built in Phase 4 of MY_ROADMAP.md
- **Auto-alignment** plan in `GEMINI_ALIGNMENT_PLAN.md` — assigned to Gemini Flash

## Pending feature work

| Priority | Task |
|---|---|
| **CRITICAL** | Fix pipeline bugs: `GEMINI_FIXES_PIPELINE.md` → `_2.md` → `_3.md` (do in order) |
| Done | Phase 4 completion: `evals/golden/` + `evals/judge.py` (MY_ROADMAP.md) |
| Done | Phase 3 — `docs/harness_gap_analysis.md` (Custom skill audit) |
| Done | Auto-alignment implementation (GEMINI_ALIGNMENT_PLAN.md — Gemini Flash) |
| Backlog | Firebase auth + cloud SRS (ROADMAP.md Phase 1) |
| Done | Phase 0 — `docs/harness_mental_model.md` (ten-component audit) |
| Done | Phase 1 raw SDK — `agents/verse_agent_raw.py` |
| Done | Gemini Phases 1–5 (catalogue, student, mobile, Telegram, PWA) |
