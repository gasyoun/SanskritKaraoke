import os
import json
import asyncio
import atexit
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
import sys
sys.path.append(os.getcwd())
from agents.teaching_pipeline.graph import pipeline

load_dotenv()

_executor = ThreadPoolExecutor(max_workers=2)
atexit.register(lambda: _executor.shutdown(wait=False))


def _normalize_state(state: dict) -> dict:
    """
    Normalize final_state for deterministic eval checks.
    Converts VerseData Pydantic objects to plain dicts so that
    check strings like state['verse']['translation']['ru'] work correctly.
    """
    normalized = dict(state)
    verse = normalized.get("verse")
    if verse is not None and hasattr(verse, "model_dump"):
        normalized["verse"] = verse.model_dump()
    return normalized


def _run_check(check: str, state: dict) -> tuple[bool, str]:
    """
    Run a single check string against the state using a restricted eval.
    Returns (passed: bool, error_message: str).
    Security: __builtins__ is restricted to prevent arbitrary code execution.
    Only 'state' is available in the eval scope.
    """
    try:
        result = eval(check, {"__builtins__": {}}, {"state": state})
        return bool(result), ""
    except Exception as e:
        return False, str(e)


async def run_eval():
    print("\n" + "="*60)
    print("PHASE 4: GOLDEN DATASET EVALUATION")
    print("="*60)

    cases_path = os.path.join("evals", "golden", "cases.json")
    with open(cases_path, "r", encoding="utf-8") as f:
        cases = json.load(f)

    from agents.teaching_pipeline.llm import call_llm

    has_any_key = bool(
        os.getenv("ANTHROPIC_API_KEY") or
        os.getenv("GEMINI_API_KEY") or
        os.getenv("OPENROUTER_API_KEY")
    )

    results = []

    for case in cases:
        if case.get("requires_api") and not has_any_key:
            print(f"\n[SKIP] {case['id']} - requires API key")
            results.append({"id": case['id'], "pass": None, "reason": "skipped: no API key"})
            continue

        print(f"\nRunning Case: {case['id']} - {case['description']}")

        try:
            config = {"configurable": {"thread_id": f"eval_{case['id']}"}}
            final_state = await pipeline.ainvoke(case['input'], config=config)
            normalized = _normalize_state(final_state)

            eval_result = {"pass": False, "reason": "Unknown"}

            if has_any_key:
                judge_prompt = (
                    f"You are an expert Sanskrit Philology Judge.\n"
                    f"Evaluate the agent's output for this test case.\n\n"
                    f"CASE DESCRIPTION: {case['description']}\n"
                    f"EXPECTED PHASE: {case['expected']['phase']}\n"
                    f"EXPECTED CHECKS: {case['expected']['checks']}\n\n"
                    f"ACTUAL FINAL STATE:\n{json.dumps(normalized, indent=2, ensure_ascii=False)}\n\n"
                    f"Is the output correct? "
                    f"Respond with JSON: {{\"pass\": true/false, \"reason\": \"...\"}}"
                )

                loop = asyncio.get_running_loop()
                response_content = await loop.run_in_executor(
                    _executor,
                    lambda: call_llm(judge_prompt, provider_preference=["anthropic", "openrouter", "gemini"])
                )

                import re
                match = re.search(r'\{.*\}', response_content, re.DOTALL)
                eval_result = json.loads(match.group()) if match else \
                    {"pass": False, "reason": "Judge returned no JSON"}

            else:
                # Deterministic fallback: phase check + restricted-eval checks
                phase_ok = normalized.get("current_phase") == case['expected']['phase']
                failed_checks = []

                for check in case['expected']['checks']:
                    passed, err = _run_check(check, normalized)
                    if not passed:
                        failed_checks.append(f"{check}" + (f" (Error: {err})" if err else ""))

                if phase_ok and not failed_checks:
                    eval_result = {"pass": True, "reason": "Deterministic checks passed"}
                else:
                    reasons = []
                    if not phase_ok:
                        reasons.append(
                            f"Expected phase '{case['expected']['phase']}', "
                            f"got '{normalized.get('current_phase')}'"
                        )
                    if failed_checks:
                        reasons.append(f"Failed checks: {failed_checks}")
                    eval_result = {"pass": False, "reason": "; ".join(reasons)}

            results.append({
                "id": case['id'],
                "pass": eval_result.get("pass"),
                "reason": eval_result.get("reason"),
                "phase": normalized.get("current_phase")
            })

            icon = "[PASS]" if eval_result.get("pass") else "[FAIL]"
            print(f"  Result: {icon} {eval_result.get('reason')}")

        except Exception as e:
            print(f"  [ERROR] {e}")
            results.append({"id": case['id'], "pass": False, "reason": str(e)})

    # Summary
    print("\n" + "="*60)
    print("EVALUATION SUMMARY")
    print("="*60)
    passed = sum(1 for r in results if r["pass"])
    skipped = sum(1 for r in results if r["pass"] is None)
    print(f"Total Cases : {len(results)}")
    print(f"Passed      : {passed}")
    print(f"Skipped     : {skipped}")
    print(f"Failed      : {len(results) - passed - skipped}")

    with open("evals/report.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    asyncio.run(run_eval())
