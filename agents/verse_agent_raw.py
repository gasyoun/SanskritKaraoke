import os
import json
import subprocess
import jsonschema
from datetime import datetime
from dotenv import load_dotenv

# Note: These imports require 'pip install anthropic google-generativeai jsonschema python-dotenv'
try:
    from anthropic import Anthropic
    import google.generativeai as genai
except ImportError:
    Anthropic = None
    genai = None

load_dotenv()

class VerseAgent:
    """
    A raw SDK implementation of the Verse Library Agent (Phase 1 Deliverable).
    This agent manages the lifecycle of verse JSON files in the library.
    """
    
    def __init__(self):
        self.anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        self.gemini_key = os.getenv("GEMINI_API_KEY")
        
        if Anthropic and self.anthropic_key:
            self.claude = Anthropic(api_key=self.anthropic_key)
        else:
            self.claude = None
            
        if genai and self.gemini_key:
            genai.configure(api_key=self.gemini_key)
            self.gemini = genai.GenerativeModel('gemini-1.5-flash')
        else:
            self.gemini = None
            
        schema_path = os.path.join("verses", "schema", "verse.schema.json")
        with open(schema_path, "r", encoding="utf-8") as f:
            self.schema = json.load(f)

    # --- TOOLS (SKILLS) ---

    def list_verses(self):
        """Read the catalogue index."""
        index_path = os.path.join("verses", "index.json")
        with open(index_path, "r", encoding="utf-8") as f:
            return json.load(f)["verses"]

    def read_verse(self, verse_id):
        """Load a specific verse JSON file."""
        path = os.path.join("verses", "data", f"{verse_id}.json")
        if not os.path.exists(path):
            return {"error": f"Verse {verse_id} not found"}
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def write_verse(self, verse_id, data):
        """Validate against schema and save a verse JSON file."""
        try:
            # Ensure mandatory fields
            if "created_at" not in data:
                data["created_at"] = datetime.now().strftime("%Y-%m-%d")
            if "version" not in data:
                data["version"] = 1
                
            jsonschema.validate(instance=data, schema=self.schema)
            
            path = os.path.join("verses", "data", f"{verse_id}.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            
            # Rebuild index after successful write
            self.build_index()
            return {"status": "success", "path": path}
        except jsonschema.exceptions.ValidationError as e:
            return {"status": "error", "type": "schema_violation", "message": e.message}
        except Exception as e:
            return {"status": "error", "type": "io_error", "message": str(e)}

    def detect_meter(self, s1, s2):
        """Call Claude (Sonnet) to identify the meter from syllable text."""
        if not self.claude:
            return "unknown (no API key)"
            
        prompt = (
            f"Identify the Sanskrit meter for these two lines:\n"
            f"Line 1: {s1}\n"
            f"Line 2: {s2}\n\n"
            f"Return ONLY the name of the meter (e.g. anushtubh, indravajra, mandakranta) "
            f"in lowercase. If unsure, return 'unknown'."
        )
        
        try:
            message = self.claude.messages.create(
                model="claude-3-5-sonnet-20240620",
                max_tokens=50,
                messages=[{"role": "user", "content": prompt}]
            )
            return message.content[0].text.strip().lower()
        except Exception as e:
            return f"error: {str(e)}"

    def translate_verse(self, s1, s2, target_lang="ru"):
        """Call Gemini Flash for high-speed RU/EN translation."""
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
        except Exception as e:
            return f"error: {str(e)}"

    def build_index(self):
        """Execute the index rebuild subprocess."""
        try:
            result = subprocess.run(
                ["python", "tools/build_index.py"], 
                capture_output=True, text=True, check=True
            )
            return {"status": "success", "output": result.stdout.strip()}
        except subprocess.CalledProcessError as e:
            return {"status": "error", "message": e.stderr.strip()}

# --- HARNESS LOOP SIMULATION ---

if __name__ == "__main__":
    # This section demonstrates how a harness would use this agent.
    # In a real tool-use loop, the LLM would decide which of these methods to call.
    
    agent = VerseAgent()
    print("--- Verse Library Agent (Raw SDK) ---")
    
    # Mocking a task: "Add Bhagavad Gita 2.47"
    verse_id = "bhg_2_47"
    s1 = "karmaṇyevādhikāraste mā phaleṣu kadācana"
    s2 = "mā karmaphalaheturbhūr mā te saṅgo'stvakarmaṇi"
    
    print(f"\n1. Detecting meter for: {s1[:20]}...")
    meter = agent.detect_meter(s1, s2)
    print(f"Result: {meter}")
    
    print(f"\n2. Translating to Russian...")
    translation_ru = agent.translate_verse(s1, s2, "ru")
    print(f"Result: {translation_ru[:50]}...")
    
    new_verse = {
        "id": verse_id,
        "title": {"ru": "Карма-йога", "en": "Yoga of Action"},
        "source": {"text": "Bhagavad Gita", "chapter": 2, "verse": 47},
        "meter": meter,
        "difficulty": 2,
        "encoding": "IAST",
        "s1": s1,
        "s2": s2,
        "translation": {"ru": translation_ru, "en": "Thy right is to work only..."},
        "tags": ["gita", "karma"]
    }
    
    print(f"\n3. Saving to library...")
    save_result = agent.write_verse(verse_id, new_verse)
    print(f"Result: {save_result}")
