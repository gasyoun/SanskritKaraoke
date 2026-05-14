import json
import sys
from pathlib import Path
from collections import defaultdict
from datetime import datetime

def run_stats(file_path: str):
    path = Path(file_path)
    if not path.exists():
        print(f"Error: Telemetry file not found at {path}")
        return

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error reading JSON: {e}")
        return

    print("=" * 60)
    print(f" SANSKRIT KARAOKE — STUDENT TELEMETRY ANALYSIS")
    print("=" * 60)
    print(f"Entries processed: {len(data)}")
    
    verse_activity = defaultdict(int)
    mode_counts = defaultdict(int)
    srs_ratings = defaultdict(list)
    quiz_results = defaultdict(lambda: {"correct": 0, "total": 0})
    hard_verses = defaultdict(lambda: {"fail": 0, "total": 0})

    for entry in data:
        event = entry.get("event")
        vid = entry.get("verse_id")
        event_data = entry.get("data", {})
        
        if vid:
            verse_activity[vid] += 1
            
        if event == "mode_change":
            mode_counts[event_data.get("mode", "unknown")] += 1
        
        elif event == "srs_rating":
            quality = event_data.get("quality", 0)
            srs_ratings[vid].append(quality)
            if quality < 3: # 1 is 'forgot', 3 is 'hard'
                hard_verses[vid]["fail"] += 1
            hard_verses[vid]["total"] += 1
            
        elif event == "quiz_result":
            qtype = event_data.get("type", "unknown")
            is_success = event_data.get("success", False)
            if qtype == "beattap":
                # For beat tap, we use the percentage score
                score = event_data.get("percent", 0)
                is_success = score >= 70
            
            quiz_results[qtype]["total"] += 1
            if is_success:
                quiz_results[qtype]["correct"] += 1
            
            if not is_success and vid:
                hard_verses[vid]["fail"] += 1
            if vid:
                hard_verses[vid]["total"] += 1

    # Print Practice Stats
    print("\nMOST PRACTICED VERSES:")
    top_verses = sorted(verse_activity.items(), key=lambda x: x[1], reverse=True)[:5]
    for vid, count in top_verses:
        print(f" - {vid:<20}: {count} interactions")

    # Print Mode Distribution
    print("\nLEARNING MODES USED:")
    total_modes = sum(mode_counts.values())
    for mode, count in sorted(mode_counts.items(), key=lambda x: x[1], reverse=True):
        pct = (count / total_modes * 100) if total_modes > 0 else 0
        print(f" - {mode:<15}: {count:<3} ({pct:>4.1f}%)")

    # Print Quiz Results
    print("\nQUIZ ACCURACY:")
    for qtype, stats in quiz_results.items():
        acc = (stats["correct"] / stats["total"] * 100) if stats["total"] > 0 else 0
        print(f" - {qtype:<15}: {acc:>5.1f}% ({stats['correct']}/{stats['total']})")

    # Identify Hardest Verses
    print("\nHARDEST VERSES (High Fail Rate):")
    # Only consider verses with at least 2 quiz/SRS events
    filtered_hard = {k: v for k, v in hard_verses.items() if v["total"] >= 2}
    sorted_hard = sorted(filtered_hard.items(), key=lambda x: x[1]["fail"] / x[1]["total"], reverse=True)[:5]
    
    if not sorted_hard:
        print(" - (Insufficient data to determine difficulty outliers)")
    else:
        for vid, stats in sorted_hard:
            fail_rate = (stats["fail"] / stats["total"] * 100)
            avg_srs = sum(srs_ratings[vid]) / len(srs_ratings[vid]) if vid in srs_ratings else 0
            print(f" - {vid:<20}: {fail_rate:>5.1f}% fail rate (Avg SRS: {avg_srs:.1f}/5)")

    print("\n" + "=" * 60)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python tools/student_stats.py <telemetry_file.json>")
    else:
        run_stats(sys.argv[1])
