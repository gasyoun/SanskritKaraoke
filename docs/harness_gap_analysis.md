# Harness Gap Analysis: Claude Code vs. Teaching Pipeline

This document analyzes the architectural gaps between the current development harness (Claude Code) and the requirements for the production **Sanskrit Karaoke Teaching Pipeline**.

## 1. Audit Table: The Ten Components

| Component | Claude Code (Current) | Teaching Pipeline (Needs) | Gap / Action |
|---|---|---|---|
| **Loop Control** | Internal (Turn-based) | LangGraph (Autonomous) | **Partial**: Pipeline is autonomous but needs a trigger. |
| **Tool Dispatch** | CLI / Local File Ops | API / Verse Manager Tools | **Done**: Implemented in Phase 2. |
| **Context** | Project-wide (CLAUDE.md) | Per-Verse / Per-Student | **Large**: Needs dynamic context injection for students. |
| **Persistence** | Session-based (Memory) | Durable (Postgres) | **Done**: Implemented in Phase 2. |
| **Orchestration** | Single Agent | Multi-Agent (LangGraph) | **Done**: Implemented in Phase 2. |
| **Skills** | Custom Python/JS scripts | Automated Schema Validation | **Gap**: Needs a `validate-verse` hook. |
| **Hooks** | Manual | Pre-commit / Pre-publish | **Gap**: Automate `build_index.py` on change. |
| **Observability** | Terminal Output | LangSmith / Trace Logs | **Large**: No visibility into agent decision-making. |
| **Sandboxing** | Local Workspace | Isolated Execution | **Gap**: Pipeline needs secure sandbox for tools. |
| **Auth** | GDrive / Local Keys | Multi-user / Student Auth | **Critical**: Needs Firebase/Auth integration. |

## 2. Identified Critical Gaps

### A. The "Human-in-the-Loop" (HITL) Gap
The current `QualityGate` in our LangGraph pipeline is a simple logic check. In production, a teacher must be able to "intercept" the pipeline to manually edit a Gemini-generated translation before it is published to the library.
**Solution:** Implement a `breakpoint` in the LangGraph curation track.

### B. The Observability Gap
While I can run the simulation and show you the output, there is no dashboard for you to see *why* an agent made a specific recommendation.
**Solution:** Integrate **LangSmith** environment variables to enable full trajectory tracing.

### C. The Integration Gap
Currently, the authoring tool (`index.html`) and the teaching pipeline (`agents/`) are disconnected. The teacher has to manually run a Python script.
**Solution:** Create a lightweight FastAPI bridge that allows the UI to trigger the LangGraph pipeline via a simple POST request.

## 3. Next Step: Custom Skill Implementation
To bridge the **Skills** gap, I will now implement a `validate-verse` skill that ensures 100% data integrity for the library.
