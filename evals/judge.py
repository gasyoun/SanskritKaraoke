import os
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
import sys
sys.path.append(os.getcwd())
from agents.teaching_pipeline.graph import pipeline

load_dotenv()
_executor = ThreadPoolExecutor(max_workers=2)

async def run_eval():
    print("\n" + "="*60)
    print("PHASE 4: GOLDEN DATASET EVALUATION")
    print("="*60)
    
    # Load cases
    cases_path = os.path.join("evals", "golden", "cases.json")
    with open(cases_path, "r", encoding="utf-8") as f:
        cases = json.load(f)
        
    # Initialize Judge LLM logic
    from agents.teaching_pipeline.llm import call_llm
    
    has_any_key = bool(
        os.getenv("ANTHROPIC_API_KEY") or 
        os.getenv("GEMINI_API_KEY") or 
        os.getenv("OPENROUTER_API_KEY")
    )
    
    results = []
    
    for case in cases:
        # Skip API-dependent cases when no keys are configured
        if case.get("requires_api") and not has_any_key:
            print(f"\n[SKIP] {case['id']} - requires API key")
            results.append({"id": case['id'], "pass": None, "reason": "skipped: no API key"})
            continue
            
        print(f"\nRunning Case: {case['id']} - {case['description']}")
        
        # 1. Run Pipeline
        try:
            config = {"configurable": {"thread_id": f"eval_{case['id']}"}}
            final_state = await pipeline.ainvoke(case['input'], config=config)
            
            # 2. Judge via LLM
            judge_prompt = (
                f"You are an expert Sanskrit Philology Judge. \n"
                f"Evaluate the agent's output for this test case.\n\n"
                f"CASE DESCRIPTION: {case['description']}\n"
                f"EXPECTED PHASE: {case['expected']['phase']}\n"
                f"EXPECTED CHECKS: {case['expected']['checks']}\n\n"
                f"ACTUAL FINAL STATE:\n{json.dumps(final_state, indent=2, ensure_ascii=False)}\n\n"
                f"Is the output correct according to the criteria? \n"
                f"Respond with a JSON object: {{\"pass\": true/false, \"reason\": \"...\"}}"
            )
            
            # Run synchronous call_llm in a thread to avoid blocking the event loop
            loop = asyncio.get_running_loop()
            response_content = await loop.run_in_executor(
                _executor,
                lambda: call_llm(judge_prompt, provider_preference=["anthropic", "openrouter", "gemini"])
            )
            
            # Simple extraction
            import re
            match = re.search(r'\{.*\}', response_content, re.DOTALL)
            if match:
                eval_result = json.loads(match.group())
            else:
                eval_result = {"pass": False, "reason": "Judge failed to provide JSON response"}
                
            results.append({
                "id": case['id'],
                "pass": eval_result.get("pass"),
                "reason": eval_result.get("reason"),
                "phase": final_state.get("current_phase")
            })
            
            icon = "[PASS]" if eval_result.get("pass") else "[FAIL]"
            print(f"  Result: {icon} {eval_result.get('reason')}")
            
        except Exception as e:
            print(f"  [ERROR] Error running case: {e}")
            results.append({"id": case['id'], "pass": False, "reason": str(e)})

    # Summary Report
    print("\n" + "="*60)
    print("EVALUATION SUMMARY")
    print("="*60)
    passed = sum(1 for r in results if r["pass"])
    print(f"Total Cases: {len(results)}")
    print(f"Passed: {passed}")
    print(f"Failed: {len(results) - passed}")
    
    # Save report
    with open("evals/report.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

if __name__ == "__main__":
    asyncio.run(run_eval())
