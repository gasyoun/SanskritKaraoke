import os
from dotenv import load_dotenv
import sys
from pathlib import Path

# Add project root to path
# __file__ is .../agents/teaching_pipeline/test_llm_cost.py
# .parent.parent.parent is .../
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(project_root))

from agents.teaching_pipeline.llm import call_llm

load_dotenv()

def test_gemma():
    print("Testing Gemma 2 27B via OpenRouter...")
    try:
        response = call_llm("Translate 'Dharma' to Russian in one word.", provider_preference=["gemma"])
        print(f"Response: {response}")
        
        log_file = project_root / "logs" / "llm_costs.jsonl"
        if log_file.exists():
            print("\nCost log entry found:")
            with open(log_file, "r", encoding="utf-8") as f:
                last_line = f.readlines()[-1]
                print(last_line)
        else:
            print(f"\nError: {log_file} not found!")
            
    except Exception as e:
        print(f"Test failed: {e}")

if __name__ == "__main__":
    test_gemma()
