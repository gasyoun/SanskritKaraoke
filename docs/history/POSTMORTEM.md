# Post-Mortem: Raw SDK vs. Claude Agent SDK

This document compares two implementations of the **Verse Library Agent** for Phase 1 of the Sanskrit Karaoke roadmap.

## 1. Quantitative Comparison

| Metric | Raw SDK (`verse_agent_raw.py`) | Claude Agent SDK (`verse_agent_sdk.py`) |
|---|---|---|
| **Line Count** | ~170 lines | ~110 lines |
| **Boilerplate** | High (manual loops, client init) | Low (decorators, `query` loop) |
| **Logic Focus** | 50% Harness / 50% Tools | 10% Harness / 90% Tools |
| **Complexity** | Linear sequence (hard to branch) | Fully autonomous (agent decides path) |

## 2. What the SDK gave for "Free"

Using the `claude-agent-sdk` provided several architectural components that had to be manually managed in the raw version:

### Autonomous Agent Loop
In `verse_agent_raw.py`, I had to simulate a harness loop in the `__main__` block by calling methods in a fixed order. In the SDK version, the `query()` function handles the **model-act-observe** loop. I simply give an instruction, and the agent decides which tools to call, in what order, and how to handle failures.

### Context & History Management
The SDK automatically maintains the conversation history and injects tool results back into the context window. In the raw version, you have to manually append `tool_use` and `tool_result` blocks to a list of messages, ensuring correct role alternating and ID matching.

### Tool Protocol (MCP)
The SDK leverages the **Model Context Protocol (MCP)**. By using the `@tool` decorator and `create_sdk_mcp_server`, tools are exposed in a standardized format. This makes the tools "portable"—the same `verse_manager` server could theoretically be exposed to other agents or even external MCP-compatible clients (like the Claude Desktop app).

### Error Resilience
The SDK's internal loop has built-in mechanisms for handling tool failures and model retries, which I didn't even attempt to implement in the raw version.

## 3. The "Manual" Cost
While the SDK saves on harness logic, it still requires:
- **Explicit Schema Definition:** You still need to define the `input_schema` for every tool so the model knows how to call it.
- **Async Execution:** The SDK is built on `asyncio` / `anyio`, requiring a shift in the programming model for developers used to synchronous scripts.

## 4. Conclusion

The **Claude Agent SDK** shifts the developer's job from **"writing a loop"** to **"designing an interface."** 

In the raw SDK, I was an engineer building a remote-controlled car (telling it exactly when to turn). In the Agent SDK, I was a city planner building the roads and signs (the tools and descriptions) and letting the self-driving car (the agent) navigate the task autonomously. For a project like the **Sanskrit Karaoke Teaching Pipeline**, the SDK approach is significantly more scalable as the number of specialized tools grows.
