import json
import os
import sys
from pathlib import Path

import pytest
from dotenv import load_dotenv

# Add project root to path.
# __file__ is .../agents/teaching_pipeline/test_llm_cost.py
# .parent.parent.parent is .../
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(project_root))

from agents.teaching_pipeline.llm import call_llm

load_dotenv()


@pytest.mark.integration
def test_gemma_cost_logging():
    if os.getenv("RUN_LLM_INTEGRATION_TESTS") != "1":
        pytest.skip("Set RUN_LLM_INTEGRATION_TESTS=1 to run paid LLM integration tests.")
    if not os.getenv("OPENROUTER_API_KEY"):
        pytest.skip("OPENROUTER_API_KEY is required for this integration test.")

    response = call_llm(
        "Translate 'Dharma' to Russian in one word.",
        provider_preference=["gemma"],
        metadata={"test": "test_gemma_cost_logging"},
    )
    assert response.strip()

    log_file = project_root / "logs" / "llm_costs.jsonl"
    assert log_file.exists(), f"{log_file} not found; provider returned no usage log"

    with open(log_file, "r", encoding="utf-8") as f:
        last_line = f.readlines()[-1]
    entry = json.loads(last_line)
    assert entry["metadata"]["test"] == "test_gemma_cost_logging"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-m", "integration", "-s"]))
