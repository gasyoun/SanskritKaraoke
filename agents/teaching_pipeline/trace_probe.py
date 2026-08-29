"""LangSmith tracing probe for the teaching pipeline.

Repo-side half of the MY_ROADMAP.md Phase 2 "LangSmith trace URL" checkbox:
verifies the LANGSMITH_* environment (repo-root .env is honoured), runs the
full verse-to-catalogue simulation once, and points to where the trace lands.

Without a key the probe exits 0 and reports exactly what to set.
"""

import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
SIMULATION = Path(__file__).resolve().parent / "test_simulation.py"


def main() -> int:
    load_dotenv(REPO_ROOT / ".env")
    api_key = os.getenv("LANGSMITH_API_KEY", "").strip()
    tracing = os.getenv("LANGSMITH_TRACING", "").strip().lower() in {"1", "true", "yes", "on"}
    project = os.getenv("LANGSMITH_PROJECT", "").strip() or "(default project)"

    if not api_key or not tracing:
        print("LangSmith tracing: OFF")
        if not tracing:
            print('  -> set LANGSMITH_TRACING=true in .env')
        if not api_key:
            print("  -> set LANGSMITH_API_KEY in .env (token: smith.langchain.com -> Settings -> Personal Access Tokens)")
        print("  template: .env.example, section LANGSMITH")
        return 0

    print(f"LangSmith tracing: ACTIVE (project: {project})")
    print("Running the full verse-to-catalogue simulation...")
    result = subprocess.run([sys.executable, str(SIMULATION)])
    if result.returncode != 0:
        print(f"simulation exited {result.returncode} — traces up to the failure are still in LangSmith")
    print(f"Open https://smith.langchain.com -> Projects -> '{project}' -> latest run -> copy the trace URL into MY_ROADMAP.md Phase 2.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
