# Pipeline Fix — Part 3 of 3: Full Test Suite + Final Verification
## For Gemini Flash

**Date:** 2026-05-14  
**Prerequisite:** Complete Part 1 and Part 2 first.  
**File to edit:** `agents/teaching_pipeline/test_simulation.py`  
**Do NOT edit any other files in this part.**

---

## Step 1 — Add curator failure test (`test_simulation.py`)

### Why

The current test has no verse that triggers `curation_failed`. Without it, the
short-circuit fix from Part 1 is never verified.

### What to do

In `agents/teaching_pipeline/test_simulation.py`, find `async def main():`
(line 79). Add this new function **before** `main()`, at line 78:

```python
async def simulate_curator_failure():
    """Tests that a missing mandatory field stops the pipeline at the curator."""
    print("\n" + "="*50)
    print("SCENARIO 0: Curator Failure (missing s2)")
    print("="*50)

    broken_verse = {
        "id": "broken_test",
        "s1": "test line one",
        "encoding": "IAST"
        # s2 is intentionally missing
    }

    initial_state = {
        "verse": broken_verse,
        "current_phase": "start",
        "errors": [],
        "messages": [],
        "is_published": False
    }

    config = {"configurable": {"thread_id": "failure_test_1"}}

    async for event in pipeline.astream(initial_state, config=config):
        for node_name, output in event.items():
            print(f"\n[Node: {node_name}]")
            if "current_phase" in output:
                print(f"  Phase: {output['current_phase']}")
            if "errors" in output and output["errors"]:
                print(f"  Errors: {output['errors']}")

```

Then **replace** the existing `main()` function with:

```python
async def main():
    print("\n[STEP 0] Testing curator failure short-circuit...")
    await simulate_curator_failure()

    print("\n[STEP 1] Initializing new curation thread (valid verse, no API key)...")
    await simulate_curation()

    print("\n[STEP 2] Verifying persistence: resuming same thread...")
    await simulate_curation()

    await simulate_analysis()
```

---

## Final acceptance — run the full suite

```powershell
python agents/teaching_pipeline/test_simulation.py
```

### SCENARIO 0 — expected output:

```
SCENARIO 0: Curator Failure (missing s2)

[Node: curator]
  Phase: curation_failed
  Errors: ['Missing mandatory field: s2']
```

**FAIL if** `[Node: enricher]` or `[Node: quality_gate]` appears.

### SCENARIO 1 — expected output:

```
SCENARIO 1: Verse Curation & Enrichment

[Node: curator]
  Phase: curated

[Node: enricher]
  Errors: ['Enrichment error: No LLM provider available. Last error: None']

[Node: quality_gate]
  Phase: rejected
  Errors: [...]
```

### STEP 2 — expected:

Same output as STEP 1. Errors must be **identical**, not doubled.

### SCENARIO 2 — expected output:

```
SCENARIO 2: Student Analysis & Recommendation

[Node: analyzer]
  Recommendations: ['bhg_2_47', 'bhg_2_49']
```

---

## Final diff check

```powershell
git diff agents/teaching_pipeline/state.py
git diff agents/teaching_pipeline/graph.py
git diff agents/teaching_pipeline/nodes.py
git diff agents/teaching_pipeline/test_simulation.py
git status agents/teaching_pipeline/test_deepcopy.py
```

Confirm:
- `state.py`: added `replace_list`, changed `errors` and `recommendations` reducers
- `graph.py`: `add_edge("curator","enricher")` replaced with `add_conditional_edges`
- `nodes.py`: added `import copy` and `copy.deepcopy(...)` in `content_enricher`
- `test_simulation.py`: new `simulate_curator_failure()` and updated `main()`
- `test_deepcopy.py`: new untracked file
- **No other files modified**

---

## What NOT to fix (separate session)

These are real issues but out of scope. They will be in `GEMINI_FIXES_PIPELINE_4.md`.

| # | File | Issue |
|---|---|---|
| 3 | `state.py` | `VerseData` TypedDict has no runtime enforcement |
| 4 | `llm.py` | Gemini client re-initialized per call; mutable default arg |
| 5 | `nodes.py` | Relative path in `student_analyzer` |
| 6 | `judge.py` | Sync LLM dispatch in async context |
| 7 | `test_simulation.py` | Persistence test doesn't verify checkpoint reload |
