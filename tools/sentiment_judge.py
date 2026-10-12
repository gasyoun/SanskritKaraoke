#!/usr/bin/env python3
"""sentiment_judge — sentiment v1 = LLM-судья via OpenRouter (H6455, карта К6).

Scores ALREADY-ANONYMIZED free-text items ({id, text} JSONL) into
up|down|neutral via the estate's existing OpenRouter stack (the same
provider/model family as agents/teaching_pipeline/llm.py, default
google/gemini-flash-1.5). Third-party sentiment MODELS stay behind an
@DECIDE visa (урок H6213) — the local-RU-model pilot is H6474 and adopts
only via @DECIDE; this module is the v1 baseline it pilots against.

152-ФЗ contract: the judge never receives names/contacts/personalia —
run this ONLY on output of tools/tg_mine_curators.py (or other already
de-identified text). Nothing is stored here; output JSONL goes to stdout.

Env: OPENROUTER_API_KEY, SK_SENTIMENT_MODEL (default google/gemini-flash-1.5).
Usage: python3 tools/sentiment_judge.py in.jsonl -o out.jsonl
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request

OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
DEFAULT_MODEL = 'google/gemini-flash-1.5'
_VALID = ('up', 'down', 'neutral')
PROMPT = (
    'Ты судья тональности. Оцени ОТНОШЕНИЕ автора текста к AI-функциям '
    'обучения санскриту (оценка произношения, боты, автопроверки). '
    'Ответь строго одним словом: up, down или neutral. Текст:')


def judge_one(text, transport=None, model=None):
    """Return {'sentiment': up|down|neutral, 'model': ..., 'raw': ...}.

    transport = callable(prompt, text) -> dict OpenRouter response; inject
    a fake in tests (offline, no network)."""
    model = model or os.environ.get('SK_SENTIMENT_MODEL', DEFAULT_MODEL)
    if transport is None:
        def default_transport(prompt, txt):
            key = os.environ.get('OPENROUTER_API_KEY', '')
            if not key:
                raise RuntimeError('OPENROUTER_API_KEY не задан')
            req = urllib.request.Request(
                OPENROUTER_URL, method='POST',
                headers={'Authorization': f'Bearer {key}',
                         'Content-Type': 'application/json'},
                data=json.dumps({
                    'model': model,
                    'messages': [{'role': 'user',
                                  'content': f'{prompt} {txt}'}],
                    'max_tokens': 8, 'temperature': 0,
                }).encode('utf-8'))
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode('utf-8'))
        transport = default_transport
    resp = transport(PROMPT, text)
    label = str(resp['choices'][0]['message']['content']).strip().lower()
    label = next((v for v in _VALID if v in label), 'neutral')
    return {'sentiment': label, 'model': model}


def judge_stream(inp, out, transport=None, model=None):
    n = 0
    for line in inp:
        line = line.strip()
        if not line:
            continue
        item = json.loads(line)
        verdict = judge_one(item.get('text', ''), transport, model)
        item.update(verdict)
        out.write(json.dumps(item, ensure_ascii=False) + '\n')
        n += 1
    return n


def main(argv):
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__)
        return 2
    src = open(argv[0], encoding='utf-8')
    dst = open(argv[argv.index('-o') + 1], 'w', encoding='utf-8') \
        if '-o' in argv else sys.stdout
    try:
        n = judge_stream(src, dst)
        if dst is not sys.stdout:
            dst.close()
        print(f'judged {n} items', file=sys.stderr)
        return 0
    except Exception as e:  # noqa: BLE001
        print(f'judge failed: {e}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
