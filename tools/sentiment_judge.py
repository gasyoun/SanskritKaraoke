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

Verdict parse accepts the English words AND Russian synonyms (RU answers
observed live from reasoning-style flash models, H6474); every row carries
the raw model answer ('raw') so a neutral fallback is auditable, not silent.

Env: OPENROUTER_API_KEY, SK_SENTIMENT_MODEL (default google/gemini-2.5-flash).
Usage: python3 tools/sentiment_judge.py in.jsonl -o out.jsonl
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request

OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
# @DECIDE visa pending (MG, owner H6455): live-probed 08-11-2026 — the only
# probed slug returning a valid verdict under v1 params (max_tokens=8);
# google/gemini-flash-1.5 is retired (404), gemini-3.6-flash returns
# content=null at this budget (reasoning burn). Override anytime via
# SK_SENTIMENT_MODEL. Evidence: reports/SENTIMENT_JUDGE_MODEL_PROBE_2026-11-08.md
DEFAULT_MODEL = 'google/gemini-2.5-flash'
_VALID = ('up', 'down', 'neutral')
# RU synonym prefixes: reasoning-style flash models (gemini-3.x, observed
# live in the H6474 pilot) sometimes answer in Russian despite the strict
# one-word EN prompt; the v1 EN-only parse silently dropped those to
# neutral. Upstreamed from tools/sentiment_pilot_h6474.py RU_SYNONYMS
# (H6474 residual, Y23). «нейтрал» covers «нейтрально»/«нейтральный» etc.
_RU_SYNONYMS = (('положит', 'up'), ('позитив', 'up'),
                ('отрицат', 'down'), ('негатив', 'down'),
                ('нейтрал', 'neutral'))
PROMPT = (
    'Ты судья тональности. Оцени ОТНОШЕНИЕ автора текста к AI-функциям '
    'обучения санскриту (оценка произношения, боты, автопроверки). '
    'Ответь строго одним словом: up, down или neutral. Текст:')


def parse_label(content):
    """Verdict parse: EN word first, then RU synonym prefixes.

    Returns 'neutral' only as an explicit fallback — callers get the raw
    content alongside (judge_one puts it in the row), so a fallback is
    visible, not silent."""
    low = str(content).strip().lower() if content is not None else ''
    for v in _VALID:
        if v in low:
            return v
    for needle, v in _RU_SYNONYMS:
        if needle in low:
            return v
    return 'neutral'


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
    raw = resp['choices'][0]['message']['content']
    return {'sentiment': parse_label(raw), 'model': model, 'raw': raw}


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
