# Harness Mental Model: Claude Code Audit

This document analyzes the **Claude Code** harness through the lens of the ten essential components of an agentic system, specifically how they are represented in this repository via `CLAUDE.md`.

## 1. Loop Control
**Definition:** The core execution loop that manages the turn-based interaction between the model, the user, and the tools.
**In this repo:** `CLAUDE.md` does not implement the loop itself (the harness does), but the `## Agent Engineering Roadmap` section guides the *long-term* loop of project development by defining what the next multi-session turns should focus on.

## 2. Tool Dispatch
**Definition:** The mechanism for invoking functions (file read/write, terminal commands) and feeding results back to the model.
**In this repo:** Sections like `## Reading / writing app.js` define the specific "Tool Protocol" required for this project (UTF-8 encoding, binary safety), ensuring that the tool dispatch doesn't corrupt the project's most sensitive file.

## 3. Context Management
**Definition:** Curating and updating the information within the model's limited context window.
**In this repo:** This is the strongest area of `CLAUDE.md`.
- `## Project`: Domain orientation.
- `## File structure`: Project map.
- `## Architecture`: Codebase mental model.
- `## Core data structures`: State orientation.
- `## Known incomplete features`: Constraint management.

## 4. Persistence
**Definition:** Long-term storage of state, artifacts, and memories across sessions.
**In this repo:** `CLAUDE.md` acts as a "Memory File." The `## Google Drive config` section also documents how the *application itself* handles persistence for student data.

## 5. Sub-agent Orchestration
**Definition:** Spawning and managing specialized sub-agents for discrete sub-tasks.
**In this repo:** Not explicitly defined in `CLAUDE.md`, but referenced in `MY_ROADMAP.md` Phase 2 (the `TeachingPipeline` agent). Currently, Claude Code manages this internally during `Explore` and `Plan` phases.

## 6. Skills
**Definition:** Encapsulated, reusable behaviors or scripts.
**In this repo:** `## Syntax check` (the `node --check` command) is a primary skill. Any script in the `tools/` directory (like `make_student.py`) is an external skill the agent is expected to use.

## 7. Hooks
**Definition:** Points in the lifecycle where custom logic is triggered.
**In this repo:** `## Versioning workflow` defines a manual hook. The agent is instructed to perform these steps as part of the "release hook" process.

## 8. Observability
**Definition:** Monitoring performance, cost, and agent trajectories.
**In this repo:** Currently a weakness. There is no telemetry or cost tracking documented. This is identified as a gap in `MY_ROADMAP.md` Phase 5.

## 9. Sandboxing
**Definition:** The secure, isolated environment where the agent executes code.
**In this repo:** `## Running locally` defines the sandbox constraints and setup instructions (port 8000).

## 10. Auth
**Definition:** Management of credentials and permissions for external APIs.
**In this repo:** `## Google Drive config` contains the client IDs and scopes necessary for the application to function, which the agent must preserve and use correctly.

---

### Gap Analysis
The current harness setup is excellent at **Context Management** but currently lacks **Observability** (no trajectory logs or cost tracking) and **Automated Hooks** (no pre-commit validation logic). These gaps are the primary focus of the upcoming Phase 4 (Evals) and Phase 5 (Production Hardening) of the roadmap.
