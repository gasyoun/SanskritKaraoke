import json
import sys
import os

def check():
    report_path = os.path.join("evals", "report.json")
    if not os.path.exists(report_path):
        print("Error: report.json not found")
        sys.exit(1)
        
    with open(report_path, "r", encoding="utf-8") as f:
        results = json.load(f)
        
    failures = [r for r in results if r["pass"] is False]
    
    if failures:
        print(f"FAILED: {len(failures)} evaluation cases failed.")
        for f in failures:
            print(f"  - {f['id']}: {f['reason']}")
        sys.exit(1)
        
    print("SUCCESS: All evaluation cases passed (or skipped).")
    sys.exit(0)

if __name__ == "__main__":
    check()
