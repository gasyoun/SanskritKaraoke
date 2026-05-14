import os
import copy
import json
import re
import asyncio
from pathlib import Path
from datetime import datetime
from .state import AgentState, VerseData
from .llm import call_llm

# Module-level constants — computed once, not per function call
_project_root = Path(__file__).resolve().parent.parent.parent
_iast_pattern = re.compile(
    r"^[a-zA-Z0-9\s.,'?!āīūṛṝḷḹṅñṭḍṇśṣḥṁĀĪŪṚṜḶḸṄÑṬḌṆŚṢḤṀ\-\(\)\[\]]+$"
)


def _to_verse_data(raw) -> VerseData:
    """Coerce a raw dict or existing VerseData to a VerseData model."""
    if isinstance(raw, VerseData):
        return raw
    return VerseData(**raw)


async def verse_curator(state: AgentState):
    """
    Validates and prepares a verse for the pipeline.
    Handles both fresh dicts (first run) and VerseData objects (checkpoint resume).
    """
    raw_verse = state.get("verse")
    if not raw_verse:
        return {"errors": ["No verse data provided to curator"]}

    # On checkpoint resume, LangGraph may deserialize back to a VerseData or dict.
    # If it's already a valid VerseData, skip re-validation.
    if isinstance(raw_verse, VerseData):
        return {
            "verse": raw_verse,
            "current_phase": "curated",
            "messages": [{"role": "system", "content": "Verse resumed from checkpoint."}]
        }

    # Structural check BEFORE Pydantic instantiation (raw_verse is dict here)
    errors = []
    required = ["id", "s1", "s2", "encoding"]
    for field in required:
        if not raw_verse.get(field):
            errors.append(f"Missing mandatory field: {field}")

    if errors:
        return {"errors": errors, "current_phase": "curation_failed"}

    try:
        verse = VerseData(**raw_verse)
        if not verse.created_at:
            verse.created_at = datetime.now().strftime("%Y-%m-%d")

        return {
            "verse": verse,
            "current_phase": "curated",
            "messages": [{"role": "system", "content": "Verse curated and basic validation passed."}]
        }
    except Exception as e:
        return {"errors": [f"Data validation error: {str(e)}"], "current_phase": "curation_failed"}


async def quality_gate(state: AgentState):
    """
    Business-rule validation gate.
    Note: Pydantic enforces schema on construction in verse_curator — no double validation here.
    This gate enforces semantic rules: meter, translation, ID uniqueness, script validity.
    """
    raw_verse = state.get("verse")
    if not raw_verse:
        return {"is_published": False, "errors": ["No verse data found at Quality Gate"]}

    try:
        verse = _to_verse_data(raw_verse)
    except Exception as e:
        return {"is_published": False, "errors": [f"Schema violation: {e}"], "current_phase": "rejected"}

    errors = []

    # 1. Meter check
    if not verse.meter or verse.meter.lower() == "unknown":
        errors.append("Semantic error: Meter must be identified before publication.")

    # 2. Translation check — null is also treated as missing
    trans = verse.translation or {}
    if not trans.get("ru") and not trans.get("en"):
        errors.append("Semantic error: At least one translation (RU/EN) is required.")

    # 3. ID integrity
    if " " in verse.id:
        errors.append("Semantic error: Verse ID must not contain spaces.")

    # 4. Duplicate check
    index_path = _project_root / "verses" / "index.json"
    if os.path.exists(index_path):
        try:
            with open(index_path, "r", encoding="utf-8") as f:
                index_data = json.load(f)
            existing_ids = [v["id"] for v in index_data.get("verses", [])]
            if verse.id in existing_ids:
                errors.append(f"Semantic error: Verse ID '{verse.id}' already exists in index.")
        except Exception as e:
            print(f"Warning: could not check duplicates: {e}")

    # 5. Script validation (IAST)
    if verse.encoding == "IAST":
        for field in ["s1", "s2"]:
            content = getattr(verse, field, "")
            if content and not _iast_pattern.match(content):
                errors.append(f"Semantic error: Invalid characters found in {field} (expected IAST).")

    if errors:
        return {"errors": errors, "is_published": False, "current_phase": "rejected"}

    return {"is_published": True, "current_phase": "validated"}


async def content_enricher(state: AgentState):
    """
    Uses LLM (Gemini/OpenRouter) to add missing translations and tags.
    Returns a new state delta — never mutates state in-place (deepcopy guard).
    Runs LLM call in a thread executor to avoid blocking the async event loop.
    """

    raw_verse = state.get("verse")
    if not raw_verse:
        return {"errors": ["No verse to enrich"]}

    # deepcopy a proper VerseData — protects the LangGraph checkpoint snapshot
    verse = copy.deepcopy(_to_verse_data(raw_verse))

    # Check if translation is missing or explicitly null
    translation_ru = (verse.translation or {}).get("ru")
    if not translation_ru:
        prompt = (
            f"Provide a Russian translation and 3-5 tags for this Sanskrit verse:\n"
            f"s1: {verse.s1}\n"
            f"s2: {verse.s2}\n\n"
            f"Return JSON: {{\"translation_ru\": \"...\", \"tags\": [\"...\", \"...\"]}}"
        )
        try:
            # Use call_llm in a thread executor (since it might use requests/sync SDK internally)
            loop = asyncio.get_running_loop()
            response_text = await loop.run_in_executor(
                None,
                lambda: call_llm(prompt, provider_preference=["gemini", "anthropic"], metadata={"verse_id": verse.id})
            )
            match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if match:
                data = json.loads(match.group())
                if not verse.translation:
                    verse.translation = {}
                verse.translation["ru"] = data.get("translation_ru")
                existing_tags = verse.tags or []
                verse.tags = list(dict.fromkeys(existing_tags + data.get("tags", [])))
        except Exception as e:
            return {"errors": [f"Enrichment error: {str(e)}"]}

    return {"verse": verse, "current_phase": "enriched"}


async def student_analyzer(state: AgentState):
    """
    Analyzes student SRS history and recommends next verses.
    Path is anchored to project root — safe to run from any directory.
    """
    history = state.get("student_history") or []
    recommendations = []

    # 1. Due verses (SRS)
    today = datetime.now().strftime("%Y-%m-%d")
    due_verses = [h["id"] for h in history if h.get("due") and h["due"] <= today]
    if due_verses:
        recommendations.extend(due_verses[:3])

    # 2. New verse recommendations
    if len(recommendations) < 3:
        try:
            index_path = _project_root / "verses" / "index.json"
            if os.path.exists(index_path):
                with open(index_path, "r", encoding="utf-8") as f:
                    catalogue = json.load(f)["verses"]

                learned_ids = {h["id"] for h in history}
                max_diff = max([h.get("difficulty", 1) for h in history] or [1])
                available = [
                    v for v in catalogue
                    if v["id"] not in learned_ids and v["difficulty"] <= max_diff + 1
                ]
                available.sort(key=lambda x: x["difficulty"])
                for v in available:
                    if len(recommendations) >= 5:
                        break
                    recommendations.append(v["id"])
        except Exception as e:
            return {"errors": [f"Recommendation error: {str(e)}"]}

    return {"recommendations": recommendations, "current_phase": "analyzed"}
