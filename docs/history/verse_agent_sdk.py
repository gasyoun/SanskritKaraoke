import os
import json
import subprocess
import jsonschema
import asyncio
from datetime import datetime
from dotenv import load_dotenv
from claude_agent_sdk import tool, create_sdk_mcp_server, query, ClaudeAgentOptions

# Note: Requires 'pip install claude-agent-sdk anthropic google-generativeai jsonschema python-dotenv'
load_dotenv()

# --- TOOL DEFINITIONS ---

@tool(
    name="list_verses",
    description="Read the catalogue index and return a list of verse metadata.",
    input_schema={}
)
async def list_verses():
    index_path = os.path.join("verses", "index.json")
    with open(index_path, "r", encoding="utf-8") as f:
        return json.load(f)["verses"]

@tool(
    name="read_verse",
    description="Load the full JSON data for a specific verse by its ID.",
    input_schema={"verse_id": str}
)
async def read_verse(verse_id: str):
    path = os.path.join("verses", "data", f"{verse_id}.json")
    if not os.path.exists(path):
        return {"error": f"Verse {verse_id} not found"}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

@tool(
    name="write_verse",
    description="Validate a verse object against the schema and save it to the library. Automatically rebuilds the index on success.",
    input_schema={"verse_id": str, "data": dict}
)
async def write_verse(verse_id: str, data: dict):
    schema_path = os.path.join("verses", "schema", "verse.schema.json")
    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)
        
    try:
        # Ensure mandatory fields
        if "created_at" not in data:
            data["created_at"] = datetime.now().strftime("%Y-%m-%d")
        if "version" not in data:
            data["version"] = 1
            
        jsonschema.validate(instance=data, schema=schema)
        
        path = os.path.join("verses", "data", f"{verse_id}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        # Rebuild index
        subprocess.run(["python", "tools/build_index.py"], check=True)
        return {"status": "success", "path": path}
    except jsonschema.exceptions.ValidationError as e:
        return {"status": "error", "type": "schema_violation", "message": e.message}
    except Exception as e:
        return {"status": "error", "type": "io_error", "message": str(e)}

@tool(
    name="detect_meter_claude",
    description="Use Claude to identify the Sanskrit meter of a verse.",
    input_schema={"s1": str, "s2": str}
)
async def detect_meter_claude(s1: str, s2: str):
    # In the SDK version, we could just ask the agent to do this directly 
    # since it IS Claude, but for the sake of parity with the raw SDK,
    # we provide a tool that specifically handles the prompt logic.
    prompt = (
        f"Identify the Sanskrit meter for these two lines:\n"
        f"Line 1: {s1}\n"
        f"Line 2: {s2}\n\n"
        f"Return ONLY the name of the meter in lowercase. If unsure, 'unknown'."
    )
    # The agent will use its own internal capability to respond to this if we just return the prompt,
    # or we can use another client. For the SDK rebuild, the agent can just be told
    # to "identify the meter" without a specific tool, but here we define the 'knowledge' of the prompt.
    return {"instruction": "Analyze the syllable pattern and return the meter name.", "prompt": prompt}

@tool(
    name="translate_gemini",
    description="Call Gemini Flash for high-speed Sanskrit-to-Russian/English translation.",
    input_schema={"s1": str, "s2": str, "target_lang": str}
)
async def translate_gemini(s1: str, s2: str, target_lang: str = "ru"):
    import google.generativeai as genai
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return "error: Gemini API key missing"
    
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-1.5-flash')
    
    prompt = (
        f"Translate this Sanskrit verse into {target_lang.upper()}. "
        f"Provide a scholarly but poetic translation.\n\n"
        f"Sanskrit:\n{s1}\n{s2}\n\n"
        f"Translation:"
    )
    
    try:
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        return f"error: {str(e)}"

# --- AGENT INITIALIZATION ---

# Bundle tools into an MCP server
verse_server = create_sdk_mcp_server(
    tools=[list_verses, read_verse, write_verse, detect_meter_claude, translate_gemini],
    name="verse_manager"
)

async def run_task(instruction: str):
    """
    Run a task through the Claude Agent SDK loop.
    Note how the loop, tool dispatch, and history are handled by the SDK.
    """
    options = ClaudeAgentOptions(
        mcpServers={"verse_manager": verse_server},
        # We pre-approve all our custom tools
        allowed_tools=[
            "mcp__verse_manager__list_verses",
            "mcp__verse_manager__read_verse",
            "mcp__verse_manager__write_verse",
            "mcp__verse_manager__detect_meter_claude",
            "mcp__verse_manager__translate_gemini"
        ]
    )
    
    print(f"Instruction: {instruction}\n")
    print("Agent is thinking and acting...")
    
    async for message in query(prompt=instruction, options=options):
        # The SDK yields progress messages, tool calls, and final responses
        print(f">> {message}")

if __name__ == "__main__":
    # Example task
    task = (
        "Add a new verse to the library. \n"
        "ID: bhg_2_47\n"
        "Text: karmaṇyevādhikāraste mā phaleṣu kadācana / mā karmaphalaheturbhūr mā te saṅgo'stvakarmaṇi\n"
        "Steps: \n"
        "1. Detect the meter using the claude tool.\n"
        "2. Translate to Russian using the gemini tool.\n"
        "3. Create a JSON object (Source: Bhagavad Gita 2.47, Title: 'Karma Yoga', Difficulty: 2) and save it."
    )
    
    asyncio.run(run_task(task))
