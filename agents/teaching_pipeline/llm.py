import os
import json
import requests
from typing import List, Optional
from datetime import datetime
from pathlib import Path

# Singleton-like cache for model clients to avoid re-initialization
_clients = {}

# Project root calculation for logging
_project_root = Path(__file__).resolve().parent.parent.parent

def log_cost(provider: str, model: str, prompt_tokens: int, completion_tokens: int):
    """
    Logs the token usage and estimated cost of an LLM call to logs/llm_costs.jsonl.
    Costs are estimated in USD per 1M tokens.
    """
    # Cost per 1M tokens (Input, Output)
    rates = {
        "gemini-1.5-flash": (0.075, 0.30),
        "claude-3-5-sonnet-20241022": (3.00, 15.00),
        "google/gemma-2-27b-it": (0.03, 0.03),
        "google/gemini-flash-1.5": (0.075, 0.30), # OpenRouter fallback
    }
    
    rate_in, rate_out = rates.get(model, (0.0, 0.0))
    cost = (prompt_tokens * rate_in / 1_000_000) + (completion_tokens * rate_out / 1_000_000)
    
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "provider": provider,
        "model": model,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": prompt_tokens + completion_tokens,
        "estimated_cost_usd": round(cost, 6)
    }
    
    log_dir = _project_root / "logs"
    log_dir.mkdir(exist_ok=True)
    
    with open(log_dir / "llm_costs.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(log_entry) + "\n")

def call_llm(prompt: str, provider_preference: Optional[List[str]] = None):
    """
    Generic LLM caller that tries multiple providers based on availability.
    Includes cost logging and support for Gemini, Anthropic, and Gemma (via OpenRouter).
    """
    if provider_preference is None:
        provider_preference = ["gemini", "anthropic", "gemma", "openrouter"]
        
    last_error = None
    for provider in provider_preference:
        if provider == "gemini":
            api_key = os.getenv("GEMINI_API_KEY")
            if api_key:
                try:
                    import google.generativeai as genai
                    if "gemini" not in _clients:
                        genai.configure(api_key=api_key)
                        _clients["gemini"] = genai.GenerativeModel('gemini-1.5-flash')
                    
                    model = _clients["gemini"]
                    response = model.generate_content(prompt)
                    
                    # Log cost
                    usage = getattr(response, "usage_metadata", None)
                    if usage:
                        log_cost("google", "gemini-1.5-flash", 
                                 usage.prompt_token_count, usage.candidates_token_count)
                                 
                    return response.text.strip()
                except Exception as e:
                    last_error = f"gemini: {e}"
                    continue
                
        elif provider == "anthropic":
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if api_key:
                try:
                    from anthropic import Anthropic
                    if "anthropic" not in _clients:
                        _clients["anthropic"] = Anthropic(api_key=api_key)
                    
                    client = _clients["anthropic"]
                    model_name = "claude-3-5-sonnet-20241022"
                    message = client.messages.create(
                        model=model_name,
                        max_tokens=1024,
                        messages=[{"role": "user", "content": prompt}]
                    )
                    
                    # Log cost
                    usage = message.usage
                    log_cost("anthropic", model_name, 
                             usage.input_tokens, usage.output_tokens)
                             
                    return message.content[0].text
                except Exception as e:
                    last_error = f"anthropic: {e}"
                    continue
                
        elif provider in ["gemma", "openrouter"]:
            api_key = os.getenv("OPENROUTER_API_KEY")
            if api_key:
                try:
                    # Map 'gemma' to the requested Gemma 2 27B model
                    model_id = "google/gemma-2-27b-it" if provider == "gemma" else "google/gemini-flash-1.5"
                    
                    response = requests.post(
                        url="https://openrouter.ai/api/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {api_key}",
                            "Content-Type": "application/json",
                            "HTTP-Referer": "https://samskrtam.ru/shloka-wave", # Optional, for OpenRouter analytics
                        },
                        data=json.dumps({
                            "model": model_id,
                            "messages": [{"role": "user", "content": prompt}]
                        })
                    )
                    res_json = response.json()
                    content = res_json['choices'][0]['message']['content'].strip()
                    
                    # Log cost
                    usage = res_json.get("usage")
                    if usage:
                        log_cost("openrouter", model_id, 
                                 usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0))
                                 
                    return content
                except Exception as e:
                    last_error = f"{provider}: {e}"
                    continue
                
    raise Exception(f"No LLM provider available. Last error: {last_error}")
