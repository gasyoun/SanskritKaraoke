# Pipeline Fix — Part 1 of 3: Reducer + Short-Circuit
## For Gemini Flash

**Date:** 2026-05-14  
**Files to edit:** `agents/teaching_pipeline/state.py`, `agents/teaching_pipeline/graph.py`  
**Do NOT edit any other files in this part.**

---

## Step 1 — Fix the errors reducer (`state.py`)

### Why

`errors` uses `operator.add` which appends new errors to old ones. When a thread
is re-invoked, errors duplicate: `["Missing s2", "Missing s2"]`.

### What to do

Replace the **entire file** `agents/teaching_pipeline/state.py` with:

```python
from typing import TypedDict, Annotated, List, Optional, Union
import operator


def replace_list(existing: list, new: list) -> list:
    """Replace the list entirely instead of appending.
    Prevents error/recommendation accumulation across re-runs."""
    return new


class VerseData(TypedDict):
    id: str
    title: dict  # {"ru": "...", "en": "..."}
    source: Union[str, dict]
    meter: str
    difficulty: int
    encoding: str
    s1: str
    s2: str
    translation: dict
    tags: List[str]
    created_at: str
    updated_at: Optional[str]


class AgentState(TypedDict):
    # The primary data being processed
    verse: Optional[VerseData]

    # Track the current status/phase
    current_phase: str

    # List of issues found by QualityGate or VerseCurator
    # Uses replace_list so re-running a thread does not duplicate errors
    errors: Annotated[List[str], replace_list]

    # History of agent messages (for the supervisor/enricher)
    messages: Annotated[List[dict], operator.add]

    # Metadata about the session
    student_id: Optional[str]
    student_history: Optional[List[dict]]  # SRS records
    recommendations: Annotated[List[str], replace_list]
    is_published: bool
```

---

## Step 2 — Add conditional edge after curator (`graph.py`)

### Why

When curator fails, the enricher and quality_gate still run on broken data.
A failed curator must stop the pipeline immediately.

### What to do

In `agents/teaching_pipeline/graph.py`, find this block (lines 33–36).
It is inside `create_teaching_pipeline()` — **keep 4-space indentation**:

```python
    # Curation Track
    workflow.add_edge("curator", "enricher")
    workflow.add_edge("enricher", "quality_gate")
    workflow.add_edge("quality_gate", END)
```

Replace with (same 4-space indentation):

```python
    # Curation Track — short-circuit on curator failure
    def route_after_curator(state: AgentState) -> str:
        if state.get("current_phase") == "curation_failed":
            return "end"
        return "enricher"

    workflow.add_conditional_edges(
        "curator",
        route_after_curator,
        {"end": END, "enricher": "enricher"}
    )
    workflow.add_edge("enricher", "quality_gate")
    workflow.add_edge("quality_gate", END)
```

`AgentState` is already imported at line 2. No new imports needed.

---

## Acceptance test for Part 1

Run from the project root:

```powershell
python agents/teaching_pipeline/test_simulation.py
```

Look at SCENARIO 1 output. You should see three nodes: `curator`, `enricher`,
`quality_gate`. The errors list in STEP 1 and STEP 2 must be **identical length**
(no duplicates like `['error', 'error']`).

**FAIL if** errors grow between STEP 1 and STEP 2 — reducer fix not working.

When Part 1 passes, proceed to `GEMINI_FIXES_PIPELINE_2.md`.
