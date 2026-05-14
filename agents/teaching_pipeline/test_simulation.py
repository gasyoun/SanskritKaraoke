import os
import asyncio
import json
from dotenv import load_dotenv

# Import the pipeline from our package
# We use this trick to allow running the script directly from the agents/teaching_pipeline dir
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from agents.teaching_pipeline.graph import pipeline

load_dotenv()

async def simulate_curation():
    print("\n" + "="*50)
    print("SCENARIO 1: Verse Curation & Enrichment")
    print("="*50)
    
    # Mock a "raw" verse input from a teacher
    raw_verse = {
        "id": "test_verse_101",
        "s1": "śravaṇam kīrtanam viṣṇoḥ smaraṇam pādasevanam",
        "s2": "arcanam vandanam dāsyam sakhyamātmanivedanam",
        "encoding": "IAST"
    }
    
    initial_state = {
        "verse": raw_verse,
        "current_phase": "start",
        "errors": [],
        "messages": [],
        "is_published": False
    }
    
    # Run the graph
    # thread_id allows persistence in MemorySaver/PostgresSaver
    config = {"configurable": {"thread_id": "curation_test_1"}}
    
    async for event in pipeline.astream(initial_state, config=config):
        for node_name, output in event.items():
            print(f"\n[Node: {node_name}]")
            if "current_phase" in output:
                print(f"  Phase: {output['current_phase']}")
            if "errors" in output and output["errors"]:
                print(f"  Errors: {output['errors']}")
            if node_name == "enricher" and "verse" in output:
                print(f"  Gemini Update: {output['verse'].get('translation', {}).get('ru', 'No translation generated')[:60]}...")

async def simulate_analysis():
    print("\n" + "="*50)
    print("SCENARIO 2: Student Analysis & Recommendation")
    print("="*50)
    
    # Mock a student's SRS history
    # bhg_2_47 is overdue (due yesterday), bhg_2_48 is not due
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

async def main():
    # Verify environment
    if not os.getenv("GEMINI_API_KEY"):
        print("Warning: GEMINI_API_KEY not found. Scenario 1 might fail at enrichment.")
        
    print("\n[STEP 1] Initializing new curation thread...")
    await simulate_curation()
    
    print("\n[STEP 2] Verifying persistence: resuming same thread...")
    # This second run will load the existing state from the DB
    # and show that the agent 'remembers' the previous phase.
    await simulate_curation()
    
    await simulate_analysis()

if __name__ == "__main__":
    asyncio.run(main())
