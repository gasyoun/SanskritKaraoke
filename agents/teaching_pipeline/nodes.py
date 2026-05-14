import os
import json
from datetime import datetime
from .state import AgentState

async def verse_curator(state: AgentState):
    """
    Validates, enriches, and prepares verse JSON for the library.
    Initial phase: Check if the verse exists and has mandatory fields.
    """
    verse = state.get("verse")
    if not verse:
        return {"errors": ["No verse data provided to curator"]}
    
    errors = []
    # Basic structural check
    required = ["id", "s1", "s2", "encoding"]
    for field in required:
        if not verse.get(field):
            errors.append(f"Missing mandatory field: {field}")
            
    if errors:
        return {"errors": errors, "current_phase": "curation_failed"}
        
    # Ensure metadata exists
    if not verse.get("created_at"):
        verse["created_at"] = datetime.now().strftime("%Y-%m-%d")
    if not verse.get("version"):
        verse["version"] = 1
        
    return {
        "verse": verse,
        "current_phase": "curated",
        "messages": [{"role": "system", "content": "Verse curated and basic validation passed."}]
    }

async def quality_gate(state: AgentState):
    """
    Refined Quality Gate: Performs deep schema and semantic validation.
    """
    from pathlib import Path
    verse = state.get("verse")
    if not verse:
        return {"is_published": False, "errors": ["No verse data found at Quality Gate"]}
        
    errors = []
    
    # 1. Deep Schema Validation — anchor path to project root, not cwd
    project_root = Path(__file__).resolve().parent.parent.parent
    schema_path = project_root / "verses" / "schema" / "verse.schema.json"
    if os.path.exists(schema_path):
        try:
            import jsonschema
            with open(schema_path, "r", encoding="utf-8") as f:
                schema = json.load(f)
            jsonschema.validate(instance=verse, schema=schema)
        except jsonschema.exceptions.ValidationError as e:
            errors.append(f"Schema violation: {e.message}")
        except Exception as e:
            errors.append(f"Validator error: {str(e)}")
            
    # 2. Semantic Checks
    # Meter check
    if not verse.get("meter") or verse["meter"].lower() == "unknown":
        errors.append("Semantic error: Meter must be identified before publication.")
        
    # Translation check
    trans = verse.get("translation") or {}
    if not trans.get("ru") and not trans.get("en"):
        errors.append("Semantic error: At least one translation (RU/EN) is required.")
        
    # ID Integrity
    if " " in verse.get("id", ""):
        errors.append("Semantic error: Verse ID must not contain spaces.")

    if errors:
        return {
            "errors": errors, 
            "is_published": False, 
            "current_phase": "rejected",
            "messages": [{"role": "system", "content": f"Quality Gate failed with {len(errors)} errors."}]
        }
    
    return {
        "is_published": True, 
        "current_phase": "validated",
        "messages": [{"role": "system", "content": "Quality Gate passed. Verse is ready for publication."}]
    }

async def content_enricher(state: AgentState):
    """
    Uses LLM (Gemini/OpenRouter) to add missing translations, tags, and difficulty estimates.
    """
    from .llm import call_llm
    verse = state.get("verse")
    if not verse:
        return {"errors": ["No verse to enrich"]}
        
    # Check if translation is missing
    if not verse.get("translation") or not verse["translation"].get("ru"):
        prompt = (
            f"Provide a Russian translation and 3-5 tags for this Sanskrit verse:\n"
            f"s1: {verse['s1']}\n"
            f"s2: {verse['s2']}\n\n"
            f"Return JSON: {{\"translation_ru\": \"...\", \"tags\": [\"...\", \"...\"]}}"
        )
        try:
            response_text = call_llm(prompt, provider_preference=["gemini", "openrouter"])
            # Simple extraction from JSON response
            import re
            match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if match:
                data = json.loads(match.group())
                if not verse.get("translation"): verse["translation"] = {}
                verse["translation"]["ru"] = data.get("translation_ru")
                if not verse.get("tags"): verse["tags"] = []
                verse["tags"].extend(data.get("tags", []))
                verse["tags"] = list(set(verse["tags"])) # Unique
        except Exception as e:
            return {"errors": [f"Enrichment error: {str(e)}"]}
            
    return {
        "verse": verse, 
        "current_phase": "enriched",
        "messages": [{"role": "system", "content": "Content enriched via LLM."}]
    }

async def student_analyzer(state: AgentState):
    """
    Analyzes student history (SRS) and recommends next verses.
    """
    history = state.get("student_history") or []
    recommendations = []
    
    # 1. Check for due verses (SRS)
    today = datetime.now().strftime("%Y-%m-%d")
    due_verses = [h["id"] for h in history if h.get("due") and h["due"] <= today]
    
    if due_verses:
        recommendations.extend(due_verses[:3]) # Top 3 due
        
    # 2. If no due verses or space left, recommend new verse
    if len(recommendations) < 3:
        # Load catalogue to find new verses
        try:
            index_path = os.path.join("verses", "index.json")
            with open(index_path, "r", encoding="utf-8") as f:
                catalogue = json.load(f)["verses"]
                
            learned_ids = {h["id"] for h in history}
            # Find max difficulty student has mastered
            max_diff = max([h.get("difficulty", 1) for h in history] or [1])
            
            available = [v for v in catalogue if v["id"] not in learned_ids and v["difficulty"] <= max_diff + 1]
            # Sort by difficulty
            available.sort(key=lambda x: x["difficulty"])
            
            for v in available:
                if len(recommendations) >= 5: break
                recommendations.append(v["id"])
        except Exception as e:
            return {"errors": [f"Recommendation error: {str(e)}"]}
            
    return {
        "recommendations": recommendations,
        "current_phase": "analyzed",
        "messages": [{"role": "system", "content": f"Analyzed history. Recommended: {', '.join(recommendations)}"}]
    }
