#!/usr/bin/env python3
"""
Verse Library Agent — raw SDK path (Phase 1).

Shell-only tools over verses/data/*.json. Paid LLM calls (meter / translate)
are optional and gated behind --live; default --dry-run never hits the network.

Historical educational copy (pre-CLI): docs/history/verse_agent_raw.py
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

try:
    import jsonschema
except ImportError:  # pragma: no cover
    jsonschema = None

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover

    def load_dotenv(*_a, **_k):
        return False


# Paid SDK imports are lazy (see VerseAgent._ensure_llm) so --dry-run stays
# free of google.generativeai FutureWarning noise.

# Repo root = parent of agents/
_ROOT = Path(__file__).resolve().parent.parent
_VERSES = _ROOT / "verses"
_SCHEMA = _VERSES / "schema" / "verse.schema.json"
_INDEX = _VERSES / "index.json"
_DATA = _VERSES / "data"


def _utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconf = getattr(stream, "reconfigure", None)
        if callable(reconf):
            reconf(encoding="utf-8")


class VerseAgent:
    """Raw-SDK verse-library agent (list / read / write / meter / translate / index)."""

    def __init__(self, require_schema: bool = True, enable_llm: bool = False):
        load_dotenv()
        self.anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        self.gemini_key = os.getenv("GEMINI_API_KEY")
        self.claude = None
        self.gemini = None
        if enable_llm:
            self._ensure_llm()

        self.schema = None
        if _SCHEMA.is_file():
            with open(_SCHEMA, encoding="utf-8") as f:
                self.schema = json.load(f)
        elif require_schema:
            raise FileNotFoundError(f"verse schema missing: {_SCHEMA}")

    def _ensure_llm(self) -> None:
        """Lazy-import paid SDKs only when --live needs them."""
        if self.claude is None and self.anthropic_key:
            try:
                from anthropic import Anthropic
            except ImportError:
                Anthropic = None  # type: ignore[misc, assignment]
            if Anthropic is not None:
                self.claude = Anthropic(api_key=self.anthropic_key)

        if self.gemini is None and self.gemini_key:
            try:
                import google.generativeai as genai
            except ImportError:
                genai = None
            if genai is not None:
                genai.configure(api_key=self.gemini_key)
                self.gemini = genai.GenerativeModel("gemini-1.5-flash")

    def list_verses(self):
        """Return catalogue index entries."""
        with open(_INDEX, encoding="utf-8") as f:
            return json.load(f)["verses"]

    def read_verse(self, verse_id: str):
        """Load one verse JSON by id."""
        path = _DATA / f"{verse_id}.json"
        if not path.is_file():
            return {"error": f"Verse {verse_id} not found", "path": str(path)}
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    def write_verse(self, verse_id: str, data: dict):
        """Validate against schema and save; rebuild index on success."""
        if jsonschema is None:
            return {
                "status": "error",
                "type": "dependency",
                "message": "jsonschema not installed",
            }
        if self.schema is None:
            return {
                "status": "error",
                "type": "schema_missing",
                "message": str(_SCHEMA),
            }
        try:
            if "created_at" not in data:
                data["created_at"] = datetime.now().strftime("%Y-%m-%d")
            if "version" not in data:
                data["version"] = 1
            jsonschema.validate(instance=data, schema=self.schema)
            path = _DATA / f"{verse_id}.json"
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            self.build_index()
            return {"status": "success", "path": str(path)}
        except jsonschema.ValidationError as e:
            return {
                "status": "error",
                "type": "schema_violation",
                "message": e.message,
            }
        except OSError as e:
            return {"status": "error", "type": "io_error", "message": str(e)}

    def detect_meter(self, s1: str, s2: str) -> str:
        """Call Claude to name the meter (requires API key; not used in --dry-run)."""
        if not self.claude:
            return "unknown (no API key)"
        prompt = (
            f"Identify the Sanskrit meter for these two lines:\n"
            f"Line 1: {s1}\n"
            f"Line 2: {s2}\n\n"
            f"Return ONLY the name of the meter (e.g. anushtubh, indravajra, "
            f"mandakranta) in lowercase. If unsure, return 'unknown'."
        )
        try:
            message = self.claude.messages.create(
                model="claude-3-5-sonnet-20240620",
                max_tokens=50,
                messages=[{"role": "user", "content": prompt}],
            )
            return message.content[0].text.strip().lower()
        except Exception as e:  # noqa: BLE001 — surface API failures to caller
            return f"error: {e}"

    def translate_verse(self, s1: str, s2: str, target_lang: str = "ru") -> str:
        """Call Gemini Flash for translation (requires API key; not used in --dry-run)."""
        if not self.gemini:
            return "translation unavailable (no API key)"
        prompt = (
            f"Translate this Sanskrit verse into {target_lang.upper()}. "
            f"Provide a scholarly but poetic translation.\n\n"
            f"Sanskrit:\n{s1}\n{s2}\n\n"
            f"Translation:"
        )
        try:
            response = self.gemini.generate_content(prompt)
            return response.text.strip()
        except Exception as e:  # noqa: BLE001
            return f"error: {e}"

    def build_index(self):
        """Run tools/build_index.py as a subprocess."""
        script = _ROOT / "tools" / "build_index.py"
        try:
            result = subprocess.run(
                [sys.executable, str(script)],
                cwd=str(_ROOT),
                capture_output=True,
                text=True,
                check=True,
                encoding="utf-8",
            )
            return {"status": "success", "output": result.stdout.strip()}
        except subprocess.CalledProcessError as e:
            return {
                "status": "error",
                "message": (e.stderr or e.stdout or str(e)).strip(),
            }

    def validate_verse_data(self, data: dict) -> dict:
        """Schema-check without writing (dry path)."""
        if jsonschema is None:
            return {
                "status": "error",
                "type": "dependency",
                "message": "jsonschema not installed",
            }
        if self.schema is None:
            return {
                "status": "error",
                "type": "schema_missing",
                "message": str(_SCHEMA),
            }
        try:
            jsonschema.validate(instance=data, schema=self.schema)
            return {"status": "ok", "id": data.get("id")}
        except jsonschema.ValidationError as e:
            return {
                "status": "error",
                "type": "schema_violation",
                "message": e.message,
            }


def dry_run(verse_id: str | None) -> int:
    """
    One dry verse: list catalogue, read one file, schema-validate.
    No paid bulk, no writes, no LLM calls.
    """
    agent = VerseAgent(require_schema=True, enable_llm=False)
    verses = agent.list_verses()
    print(f"catalogue entries: {len(verses)}")
    if not verses:
        print("error: empty catalogue", file=sys.stderr)
        return 1

    if verse_id is None:
        first = verses[0]
        verse_id = first.get("id") if isinstance(first, dict) else str(first)

    print(f"dry verse id: {verse_id}")
    data = agent.read_verse(verse_id)
    if "error" in data:
        print(json.dumps(data, ensure_ascii=False), file=sys.stderr)
        return 1

    check = agent.validate_verse_data(data)
    print(f"schema: {check['status']}")
    if check["status"] != "ok":
        print(json.dumps(check, ensure_ascii=False), file=sys.stderr)
        return 1

    s1 = (data.get("s1") or "")[:48]
    s2 = (data.get("s2") or "")[:48]
    print(f"meter={data.get('meter')!r} difficulty={data.get('difficulty')}")
    print(f"s1[:48]={s1!r}")
    print(f"s2[:48]={s2!r}")
    print("dry-run OK (read + validate only; no API, no write)")
    return 0


def live_demo(verse_id: str) -> int:
    """Historical harness-loop demo: meter + translate + write (needs API keys)."""
    agent = VerseAgent(require_schema=True, enable_llm=True)
    print("--- Verse Library Agent (Raw SDK) — LIVE ---")
    data = agent.read_verse(verse_id)
    if "error" in data:
        # Synthetic fixture when verse missing
        s1 = "karmaṇyevādhikāraste mā phaleṣu kadācana"
        s2 = "mā karmaphalaheturbhūr mā te saṅgo'stvakarmaṇi"
    else:
        s1 = data.get("s1") or ""
        s2 = data.get("s2") or ""

    print(f"\n1. Detecting meter for: {s1[:20]}...")
    meter = agent.detect_meter(s1, s2)
    print(f"Result: {meter}")

    print("\n2. Translating to Russian...")
    translation_ru = agent.translate_verse(s1, s2, "ru")
    print(f"Result: {translation_ru[:50]}...")

    # Never overwrite a production library verse in live demo unless --write
    print("\n3. Live demo stops before write (pass --write to save).")
    print(f"Would write id={verse_id} meter={meter}")
    return 0


def main(argv: list[str] | None = None) -> int:
    _utf8_stdio()
    parser = argparse.ArgumentParser(
        prog="verse_agent_raw.py",
        description=(
            "Raw-SDK verse library agent. Default is a free dry-run over verses/."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Read + schema-validate one verse; no API, no write (default)",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Paid path: detect_meter + translate (requires API keys)",
    )
    parser.add_argument(
        "--verse-id",
        default=None,
        help="Verse id under verses/data/ (default: first catalogue entry)",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="With --live, allow write_verse (off by default)",
    )
    args = parser.parse_args(argv)

    # Ensure CWD-relative tools still work if invoked from elsewhere
    os.chdir(_ROOT)

    if args.live:
        return live_demo(args.verse_id or "bhg_2_47")
    return dry_run(args.verse_id)


if __name__ == "__main__":
    raise SystemExit(main())
