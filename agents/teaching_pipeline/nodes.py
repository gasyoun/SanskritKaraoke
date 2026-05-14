import os
import json
from datetime import datetime
from .state import AgentState, VerseData

async def verse_curator(state: AgentState):
    """
    Validates, enriches, and prepares verse JSON for the library.
    Initial phase: Check if the verse exists and has mandatory fields.
    """
    raw_verse = state.get("verse")
    if not raw_verse:
        return {"errors": ["No verse data provided to curator"]}
    
    errors = []
    # 1. Structural check before Pydantic instantiation
    required = ["id", "s1", "s2", "encoding"]
    for field in required:
        if not raw_verse.get(field):
            errors.append(f"Missing mandatory field: {field}")
            
    if errors:
        return {"errors": errors, "current_phase": "curation_failed"}
        
    try:
        # 2. Pydantic instantiation (handles defaults for version, difficulty, etc.)
        if isinstance(raw_verse, dict):
            # Clean up empty strings that should be Nones if any, 
            # but VerseData has good defaults.
            verse = VerseData(**raw_verse)
        else:
            verse = raw_verse

        # Ensure metadata
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
    Refined Quality Gate: Performs deep schema and semantic validation.
    """
    from pathlib import Path
    verse = state.get("verse")
    if not verse:
        return {"is_published": False, "errors": ["No verse data found at Quality Gate"]}
        
    errors = []
    project_root = Path(__file__).resolve().parent.parent.parent
    
    # 1. Deep Schema Validation
    schema_path = project_root / "verses" / "schema" / "verse.schema.json"
    if os.path.exists(schema_path):
        try:
            import jsonschema
            with open(schema_path, "r", encoding="utf-8") as f:
                schema = json.load(f)
            # jsonschema needs a dict, not a Pydantic object
            instance_data = verse.model_dump() if hasattr(verse, "model_dump") else verse
            jsonschema.validate(instance=instance_data, schema=schema)
        except jsonschema.exceptions.ValidationError as e:
            errors.append(f"Schema violation: {e.message}")
        except Exception as e:
            errors.append(f"Validator error: {str(e)}")
            
    # 2. Semantic Checks
    # Meter check
    if not verse.meter or verse.meter.lower() == "unknown":
        errors.append("Semantic error: Meter must be identified before publication.")
        
    # Translation check
    trans = verse.translation or {}
    if not trans.get("ru") and not trans.get("en"):
        errors.append("Semantic error: At least one translation (RU/EN) is required.")
        
    # ID Integrity
    if " " in verse.id:
        errors.append("Semantic error: Verse ID must not contain spaces.")

    # Duplicate Check
    index_path = project_root / "verses" / "index.json"
    if os.path.exists(index_path):
        try:
            with open(index_path, "r", encoding="utf-8") as f:
                index_data = json.load(f)
            existing_ids = [v["id"] for v in index_data.get("verses", [])]
            if verse.id in existing_ids:
                errors.append(f"Semantic error: Verse ID '{verse.id}' already exists in index.")
        except Exception as e:
            print(f"Warning: could not check duplicates: {e}")

    # 3. Script Validation (IAST)
    if verse.encoding == "IAST":
        import re
        iast_pattern = re.compile(r"^[a-zA-Z0-9\s.,'?!āīūṛṝḷḹṅñṭḍṇśṣḥṁĀĪŪṚṜḶḸṄÑṬḌṆŚṢḤṀ\-\(\)\[\]]+$")
        for field in ["s1", "s2"]:
            content = getattr(verse, field, "")
            if content and not iast_pattern.match(content):
                errors.append(f"Semantic error: Invalid characters found in {field} (expected IAST).")

    if errors:
        return {
            "errors": errors, 
            "is_published": False, 
            "current_phase": "rejected"
        }
    
    return {
        "is_published": True, 
        "current_phase": "validated"
    }

async def content_enricher(state: AgentState):
    """
    Uses LLM (Gemini/OpenRouter) to add missing translations, tags, and difficulty estimates.
    Returns a new state delta. Never mutates state in-place.
    """
    import copy
    from .llm import call_llm

    # CRITICAL: deepcopy prevents mutating the LangGraph checkpoint snapshot
    verse = copy.deepcopy(state.get("verse"))
    if not verse:
        return {"errors": ["No verse to enrich"]}

    # Check if translation is missing
    if not verse.translation or not verse.translation.get("ru"):
        prompt = (
            f"Provide a Russian translation and 3-5 tags for this Sanskrit verse:\n"
            f"s1: {verse.s1}\n"
            f"s2: {verse.s2}\n\n"
            f"Return JSON: {{\"translation_ru\": \"...\", \"tags\": [\"...\", \"...\"]}}"
        )
        try:
            response_text = call_llm(prompt, provider_preference=["gemini", "openrouter"])
            import re
            match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if match:
                data = json.loads(match.group())
                if not verse.translation:
                    verse.translation = {}
                verse.translation["ru"] = data.get("translation_ru")
                existing_tags = verse.tags or []
                verse.tags = list(set(existing_tags + data.get("tags", [])))
        except Exception as e:
            return {"errors": [f"Enrichment error: {str(e)}"]}

    return {
        "verse": verse,
        "current_phase": "enriched"
    }

async def student_analyzer(state: AgentState):
    """
    Analyzes student history (SRS) and recommends next verses.
    """
    from pathlib import Path
    history = state.get("student_history") or []
    recommendations = []
    project_root = Path(__file__).resolve().parent.parent.parent
    
    # 1. Check for due verses (SRS)
    today = datetime.now().strftime("%Y-%m-%d")
    due_verses = [h["id"] for h in history if h.get("due") and h["due"] <= today]
    
    if due_verses:
        recommendations.extend(due_verses[:3])
        
    # 2. Recommend new verses
    if len(recommendations) < 3:
        try:
            index_path = project_root / "verses" / "index.json"
            if os.path.exists(index_path):
                with open(index_path, "r", encoding="utf-8") as f:
                    catalogue = json.load(f)["verses"]
                    
                learned_ids = {h["id"] for h in history}
                max_diff = max([h.get("difficulty", 1) for h in history] or [1])
                
                available = [v for v in catalogue if v["id"] not in learned_ids and v["difficulty"] <= max_diff + 1]
                available.sort(key=lambda x: x["difficulty"])
                
                for v in available:
                    if len(recommendations) >= 5: break
                    recommendations.append(v["id"])
        except Exception as e:
            return {"errors": [f"Recommendation error: {str(e)}"]}
            
    return {
        "recommendations": recommendations,
        "current_phase": "analyzed"
    }
