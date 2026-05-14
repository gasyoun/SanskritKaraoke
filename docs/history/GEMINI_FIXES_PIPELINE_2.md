# Pipeline Fix — Part 2 of 3: Deepcopy + Unit Test
## For Gemini Flash

**Date:** 2026-05-14  
**Prerequisite:** Complete Part 1 (`GEMINI_FIXES_PIPELINE.md`) first.  
**Files to edit:** `agents/teaching_pipeline/nodes.py`  
**File to create:** `agents/teaching_pipeline/test_deepcopy.py`  
**Do NOT edit any other files in this part.**

---

## Step 1 — Fix in-place state mutation (`nodes.py`)

### Why

`content_enricher` gets `verse` from `state` and mutates it directly. LangGraph
checkpoints state between nodes. In-place mutation corrupts the checkpoint.

### What to do

In `agents/teaching_pipeline/nodes.py`, find the `content_enricher` function
(starts at line 90). Replace the **entire function** with:

```python
async def content_enricher(state: AgentState):
    """
    Uses LLM (Gemini/OpenRouter) to add missing translations, tags, and difficulty estimates.
    Returns a new state delta. Never mutates state in-place.
    """
    import copy
    from .llm import call_llm

    # CRITICAL: deepcopy prevents mutating the LangGraph checkpoint snapshot
    verse = copy.deepcopy(state.get("verse"))
    if not verse:
        return {"errors": ["No verse to enrich"]}

    # Check if translation is missing
    if not verse.get("translation") or not verse["translation"].get("ru"):
        prompt = (
            f"Provide a Russian translation and 3-5 tags for this Sanskrit verse:\n"
            f"s1: {verse['s1']}\n"
            f"s2: {verse['s2']}\n\n"
            f"Return JSON: {{\"translation_ru\": \"...\", \"tags\": [\"...\", \"...\"]}}"
        )
        try:
            response_text = call_llm(prompt, provider_preference=["gemini", "openrouter"])
            import re
            match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if match:
                data = json.loads(match.group())
                if not verse.get("translation"):
                    verse["translation"] = {}
                verse["translation"]["ru"] = data.get("translation_ru")
                existing_tags = verse.get("tags") or []
                verse["tags"] = list(set(existing_tags + data.get("tags", [])))
        except Exception as e:
            return {"errors": [f"Enrichment error: {str(e)}"]}

    return {
        "verse": verse,
        "current_phase": "enriched",
        "messages": [{"role": "system", "content": "Content enriched via LLM."}]
    }
```

**What changed (3 things):**
1. Added `import copy` at line 2
2. Changed `state.get("verse")` to `copy.deepcopy(state.get("verse"))` at line 5
3. Replaced `verse["tags"].extend(...)` with `list(set(existing_tags + ...))` near the end

---

## Step 2 — Create the unit test (`test_deepcopy.py`)

### Why

The deepcopy fix cannot be tested by `test_simulation.py` without an API key,
because the enricher fails before reaching the mutation lines. This test mocks
`call_llm` so the enricher runs its full code path.

### What to do

Create a **new file** `agents/teaching_pipeline/test_deepcopy.py` with this
exact content:

```python
"""
Unit test for deepcopy fix: proves content_enricher does not mutate state.
Mocks call_llm so no API key is needed.
"""
import asyncio
import copy
import json
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Mock call_llm BEFORE importing nodes
import agents.teaching_pipeline.llm as llm_module

def mock_call_llm(prompt, provider_preference=None):
    """Returns a known JSON response without calling any API."""
    return json.dumps({
        "translation_ru": "Test translation",
        "tags": ["test_tag_1", "test_tag_2"]
    })

# Replace the real function with our mock
llm_module.call_llm = mock_call_llm

from agents.teaching_pipeline.nodes import content_enricher


async def test_deepcopy():
    print("="*50)
    print("TEST: content_enricher does not mutate input state")
    print("="*50)

    original_verse = {
        "id": "deepcopy_test",
        "s1": "test line one",
        "s2": "test line two",
        "encoding": "IAST",
        "meter": "anushtubh",
        "version": 1,
        "created_at": "2026-01-01"
    }

    state = {
        "verse": original_verse,
        "current_phase": "curated",
        "errors": [],
        "messages": [],
        "is_published": False
    }

    # Save a snapshot BEFORE calling enricher
    snapshot = copy.deepcopy(original_verse)

    # Run the enricher (uses mocked call_llm)
    result = await content_enricher(state)

    # Check 1: enricher returned a translation
    returned_verse = result.get("verse", {})
    has_translation = returned_verse.get("translation", {}).get("ru") is not None
    print(f"\n[Check 1] Enricher returned translation: {has_translation}")
    assert has_translation, "Enricher did not produce a translation"

    # Check 2: original verse in state was NOT mutated
    original_unchanged = (state["verse"] == snapshot)
    print(f"[Check 2] Original state unchanged: {original_unchanged}")
    assert original_unchanged, f"MUTATION DETECTED! Before: {snapshot}, After: {state['verse']}"

    # Check 3: returned verse is a DIFFERENT object
    is_different_object = (result["verse"] is not state["verse"])
    print(f"[Check 3] Returned verse is new object: {is_different_object}")
    assert is_different_object, "Returned verse is same object as input (no deepcopy)"

    print("\n[RESULT] ALL CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(test_deepcopy())
```

**Important:** The mock must be set up BEFORE importing `content_enricher`.
Do not reorder the imports.

---

## Acceptance test for Part 2

Run from the project root:

```powershell
python agents/teaching_pipeline/test_deepcopy.py
```

Expected output:

```
==================================================
TEST: content_enricher does not mutate input state
==================================================

[Check 1] Enricher returned translation: True
[Check 2] Original state unchanged: True
[Check 3] Returned verse is new object: True

[RESULT] ALL CHECKS PASSED
```

**FAIL if** any check prints `False` or an `AssertionError` is raised.

When Part 2 passes, proceed to `GEMINI_FIXES_PIPELINE_3.md`.
