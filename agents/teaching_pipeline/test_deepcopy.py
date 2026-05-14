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
