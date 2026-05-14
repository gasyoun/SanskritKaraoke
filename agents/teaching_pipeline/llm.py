import os
import json
import requests

def call_llm(prompt: str, provider_preference: list = ["gemini", "anthropic", "openrouter"]):
    """
    Generic LLM caller that tries multiple providers based on availability.
    """
    last_error = None
    for provider in provider_preference:
        if provider == "gemini":
            api_key = os.getenv("GEMINI_API_KEY")
            if api_key:
                try:
                    import google.generativeai as genai
                    genai.configure(api_key=api_key)
                    model = genai.GenerativeModel('gemini-1.5-flash')
                    return model.generate_content(prompt).text.strip()
                except Exception as e:
                    last_error = f"gemini: {e}"
                    continue
                
        elif provider == "anthropic":
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if api_key:
                try:
                    from anthropic import Anthropic
                    client = Anthropic(api_key=api_key)
                    message = client.messages.create(
                        model="claude-3-5-sonnet-20241022",
                        max_tokens=1024,
                        messages=[{"role": "user", "content": prompt}]
                    )
                    return message.content[0].text
                except Exception as e:
                    last_error = f"anthropic: {e}"
                    continue
                
        elif provider == "openrouter":
            api_key = os.getenv("OPENROUTER_API_KEY")
            if api_key:
                try:
                    response = requests.post(
                        url="https://openrouter.ai/api/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {api_key}",
                            "Content-Type": "application/json"
                        },
                        data=json.dumps({
                            "model": "google/gemini-flash-1.5",
                            "messages": [{"role": "user", "content": prompt}]
                        })
                    )
                    return response.json()['choices'][0]['message']['content'].strip()
                except Exception as e:
                    last_error = f"openrouter: {e}"
                    continue
                
    raise Exception(f"No LLM provider available. Last error: {last_error}")
