import json
from pathlib import Path

def create_mock_logs():
    log_file = Path("logs/llm_costs.jsonl")
    log_file.parent.mkdir(exist_ok=True)
    
    mocks = [
        {"timestamp": "2026-05-15T00:00:00", "provider": "google", "model": "gemini-1.5-flash", "prompt_tokens": 1000, "completion_tokens": 200, "total_tokens": 1200, "estimated_cost_usd": 0.0001, "metadata": {"verse_id": "bhg_2_47"}},
        {"timestamp": "2026-05-15T00:01:00", "provider": "anthropic", "model": "claude-3-5-sonnet-20241022", "prompt_tokens": 1500, "completion_tokens": 500, "total_tokens": 2000, "estimated_cost_usd": 0.012, "metadata": {"verse_id": "bhg_2_47"}},
        {"timestamp": "2026-05-15T00:05:00", "provider": "openrouter", "model": "google/gemma-2-27b-it", "prompt_tokens": 800, "completion_tokens": 300, "total_tokens": 1100, "estimated_cost_usd": 0.00003, "metadata": {"verse_id": "kum_1_1"}}
    ]
    
    with open(log_file, "w", encoding="utf-8") as f:
        for m in mocks:
            f.write(json.dumps(m) + "\n")
    print("Mock logs created successfully.")

if __name__ == "__main__":
    create_mock_logs()
