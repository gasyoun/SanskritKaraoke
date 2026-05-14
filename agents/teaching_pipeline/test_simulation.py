import os
import asyncio
import json
from dotenv import load_dotenv

# Import the pipeline from our package
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from agents.teaching_pipeline.graph import pipeline

load_dotenv()

async def simulate_curation(thread_id="curation_test_1"):
    print("\n" + "="*50)
    print(f"SCENARIO: Verse Curation (Thread: {thread_id})")
    print("="*50)
    
    # 1. Check if thread already exists
    config = {"configurable": {"thread_id": thread_id}}
    state_now = await pipeline.aget_state(config)
    
    if state_now.values:
        print(f"-> RESUMING existing thread. Current phase: {state_now.values.get('current_phase')}")
        initial_input = None # Don't overwrite the verse if we are resuming
    else:
        print("-> STARTING new thread.")
        raw_verse = {
            "id": "test_verse_101",
            "s1": "śravaṇam kīrtanam viṣṇoḥ smaraṇam pādasevanam",
            "s2": "arcanam vandanam dāsyam sakhyamātmanivedanam",
            "encoding": "IAST"
        }
        initial_input = {
            "verse": raw_verse,
            "current_phase": "start",
            "errors": [],
            "messages": [],
            "is_published": False
        }
    
    async for event in pipeline.astream(initial_input, config=config):
        for node_name, output in event.items():
            print(f"\n[Node: {node_name}]")
            if "current_phase" in output:
                print(f"  Phase: {output['current_phase']}")
            if "errors" in output and output["errors"]:
                print(f"  Errors: {output['errors']}")
            if node_name == "enricher" and "verse" in output:
                # Pydantic object access
                v = output['verse']
                trans = v.translation.get('ru', 'No translation') if hasattr(v, 'translation') else 'N/A'
                print(f"  Gemini Update: {trans[:60]}...")

async def simulate_analysis():
    print("\n" + "="*50)
    print("SCENARIO 2: Student Analysis & Recommendation")
    print("="*50)
    
    history = [
        {"id": "bhg_2_47", "due": "2026-05-13", "difficulty": 1}, 
        {"id": "bhg_2_48", "due": "2026-05-20", "difficulty": 1}
    ]
    
    initial_state = {
        "student_id": "student_007",
        "student_history": history,
        "current_phase": "start",
        "errors": [],
        "messages": [],
        "recommendations": [],
        "is_published": False
    }
    
    config = {"configurable": {"thread_id": "student_test_1"}}
    
    async for event in pipeline.astream(initial_state, config=config):
        for node_name, output in event.items():
            print(f"\n[Node: {node_name}]")
            if "recommendations" in output:
                print(f"  Recommendations: {output['recommendations']}")

async def simulate_curator_failure():
    """Tests that a missing mandatory field stops the pipeline at the curator."""
    print("\n" + "="*50)
    print("SCENARIO 0: Curator Failure (missing s2)")
    print("="*50)

    broken_verse = {
        "id": "broken_test",
        "s1": "test line one",
        "encoding": "IAST"
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


async def main():
    print("\n[STEP 0] Testing curator failure short-circuit...")
    await simulate_curator_failure()

    print("\n[STEP 1] Initializing new curation thread (valid verse, no API key)...")
    # Use a unique thread ID to ensure we start fresh
    import time
    tid = f"curation_{int(time.time())}"
    await simulate_curation(thread_id=tid)

    print("\n[STEP 2] Verifying persistence: resuming same thread...")
    # This should now show "RESUMING existing thread"
    await simulate_curation(thread_id=tid)

    await simulate_analysis()

if __name__ == "__main__":
    asyncio.run(main())
