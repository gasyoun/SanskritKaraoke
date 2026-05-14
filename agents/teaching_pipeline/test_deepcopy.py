"""
Unit test for deepcopy fix: proves content_enricher does not mutate state.
Tests the production code path: state['verse'] is a VerseData Pydantic object,
not a raw dict (which is what the pipeline actually stores after verse_curator runs).
Mocks call_llm so no API key is needed.
"""
import asyncio
import copy
import json
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Mock call_llm BEFORE importing nodes (import order matters)
import agents.teaching_pipeline.llm as llm_module

def mock_call_llm(prompt, provider_preference=None):
    """Returns a known JSON response without calling any API."""
    return json.dumps({
        "translation_ru": "Test translation",
        "tags": ["test_tag_1", "test_tag_2"]
    })

llm_module.call_llm = mock_call_llm

from agents.teaching_pipeline.nodes import content_enricher
from agents.teaching_pipeline.state import VerseData


async def test_deepcopy():
    print("="*50)
    print("TEST: content_enricher does not mutate input state")
    print("="*50)

    # Use a real VerseData object — this is what the pipeline stores after verse_curator
    original_verse = VerseData(
        id="deepcopy_test",
        s1="test line one",
        s2="test line two",
        encoding="IAST",
        meter="anushtubh",
        version=1,
        created_at="2026-01-01"
    )

    state = {
        "verse": original_verse,
        "current_phase": "curated",
        "errors": [],
        "messages": [],
        "is_published": False
    }

    # Save a snapshot of the model's data BEFORE calling enricher
    snapshot = original_verse.model_dump()

    # Run the enricher (uses mocked call_llm, runs in executor)
    result = await content_enricher(state)

    # Check 1: enricher returned a verse with a translation
    returned_verse = result.get("verse")
    has_translation = (
        returned_verse is not None and
        (returned_verse.translation or {}).get("ru") is not None
    )
    print(f"\n[Check 1] Enricher returned translation: {has_translation}")
    assert has_translation, f"Enricher did not produce a translation. Result: {result}"

    # Check 2: original VerseData object was NOT mutated
    current_data = state["verse"].model_dump()
    original_unchanged = (current_data == snapshot)
    print(f"[Check 2] Original state unchanged: {original_unchanged}")
    assert original_unchanged, (
        f"MUTATION DETECTED!\n"
        f"  Before: {snapshot}\n"
        f"  After:  {current_data}"
    )

    # Check 3: returned verse is a DIFFERENT object
    is_different_object = (result["verse"] is not state["verse"])
    print(f"[Check 3] Returned verse is new object: {is_different_object}")
    assert is_different_object, "Returned verse is the same object as input (no deepcopy)"

    print("\n[RESULT] ALL CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(test_deepcopy())
