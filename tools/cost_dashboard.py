import json
from pathlib import Path
from collections import defaultdict
from datetime import datetime

def run_dashboard():
    project_root = Path(__file__).resolve().parent.parent
    log_file = project_root / "logs" / "llm_costs.jsonl"
    
    if not log_file.exists():
        print(f"Error: Log file not found at {log_file}")
        print("Run the teaching pipeline first to generate cost logs.")
        return

    total_spend = 0.0
    model_stats = defaultdict(lambda: {"cost": 0.0, "tokens": 0, "calls": 0})
    verse_costs = defaultdict(float)
    
    with open(log_file, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
                cost = entry.get("estimated_cost_usd", 0.0)
                model = entry.get("model", "unknown")
                tokens = entry.get("total_tokens", 0)
                verse_id = entry.get("metadata", {}).get("verse_id")
                
                total_spend += cost
                model_stats[model]["cost"] += cost
                model_stats[model]["tokens"] += tokens
                model_stats[model]["calls"] += 1
                
                if verse_id:
                    verse_costs[verse_id] += cost
            except Exception as e:
                print(f"Skipping malformed line: {e}")

    print("=" * 60)
    print(f" SANSKRIT KARAOKE — LLM COST DASHBOARD ({datetime.now().strftime('%Y-%m-%d')})")
    print("=" * 60)
    
    print(f"\nTOTAL SPEND: ${total_spend:.4f} USD")
    
    print("\nBREAKDOWN BY MODEL:")
    print(f"{'Model':<30} | {'Calls':<6} | {'Tokens':<10} | {'Cost':<10}")
    print("-" * 60)
    for model, stats in sorted(model_stats.items(), key=lambda x: x[1]['cost'], reverse=True):
        print(f"{model:<30} | {stats['calls']:<6} | {stats['tokens']:<10} | ${stats['cost']:.4f}")

    print("\nEFFICIENCY METRICS:")
    unique_verses = len(verse_costs)
    avg_cost = total_spend / unique_verses if unique_verses > 0 else total_spend
    
    print(f"Unique Verses Processed: {unique_verses}")
    print(f"Average Cost Per Verse:  ${avg_cost:.4f}")
    
    target = 0.10
    status = "[OK] PASS" if avg_cost <= target else "[!!] FAIL"
    print(f"Target (<${target:.2f}/verse):   {status}")

    if verse_costs:
        print("\nMOST EXPENSIVE VERSES:")
        top_verses = sorted(verse_costs.items(), key=lambda x: x[1], reverse=True)[:5]
        for vid, vcost in top_verses:
            print(f" - {vid:<20}: ${vcost:.4f}")

    print("\n" + "=" * 60)

if __name__ == "__main__":
    run_dashboard()
