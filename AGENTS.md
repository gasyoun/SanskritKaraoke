# AGENTS.md — Sanskrit Karaoke

This file is loaded by AI agent harnesses (Claude Code, Codex, Cursor, Copilot) to orient
any new agent session in this repository.

## Active roadmap

See **MY_ROADMAP.md** for the full 30-week agent engineering curriculum being practised
on this project.

**Current phase:** Phase 0 — Mental Models (SPEEDRUN, 1–2 weeks)

**Next action:**
> Read the [context engineering post](https://www.anthropic.com/engineering/building-effective-agents) on the Anthropic blog.
> Then open `CLAUDE.md` in this repo and annotate which of the ten harness components each
> section covers. Save the result as `docs/harness_mental_model.md`. Time: ~2 hours.

## Platform context

- **Live URL:** https://samskrtam.ru/shloka-wave
- **Student flow:** `catalogue.html` → `student.html?id=X` → `progress.html`
- **Content pipeline:** edit verse JSON → CI validates → `verses/index.json` auto-rebuilt
- **Gemini Flash** implements features; review documented in `GEMINI_FIXES.md` and
  `GEMINI_ROADMAP.md`; evals will be built in Phase 4 of MY_ROADMAP.md

## Pending feature work

| Priority | Task |
|---|---|
| High | Phase 4 mobile optimisation (GEMINI_ROADMAP.md) |
| Medium | Phase 5 Telegram Mini App |
| Done | `docs/harness_mental_model.md` (Phase 0 deliverable) |
| Done | `agents/verse_agent_raw.py` (Phase 1 deliverable) |
