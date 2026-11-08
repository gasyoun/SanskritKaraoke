"""H6455/Y23 — RU-label parse in sentiment_judge (H6474 residual).

The v1 EN-only parse silently dropped Russian verdicts («положительно»
etc., observed live from reasoning-style flash models in the H6474 pilot,
27-10-2026) to neutral. RU prefixes are valid labels now, and every row
carries the raw model answer so a neutral fallback stays auditable.
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))

import sentiment_judge  # noqa: E402


def _fake(content):
    return lambda prompt, text: {'choices': [{'message': {'content': content}}]}


def test_parse_label_en():
    for raw, want in ((' up\n', 'up'), ('DOWN', 'down'),
                      ('neutral', 'neutral'), ('', 'neutral')):
        assert sentiment_judge.parse_label(raw) == want, raw


def test_parse_label_ru_synonyms():
    # RU answers observed from gemini-3.x (H6474 pilot); prefixes cover
    # full word forms («положительно», «отрицательное», «нейтрально»).
    for raw, want in (('Положительно', 'up'), ('позитив', 'up'),
                      ('отрицательное отношение', 'down'),
                      ('негатив', 'down'), ('Нейтрально', 'neutral'),
                      ('нейтральный', 'neutral')):
        assert sentiment_judge.parse_label(raw) == want, raw


def test_parse_label_garbage_falls_back():
    assert sentiment_judge.parse_label('не знаю') == 'neutral'
    assert sentiment_judge.parse_label(None) == 'neutral'


def test_judge_one_carries_raw():
    verdict = sentiment_judge.judge_one('бот тупит', _fake('Положительно'))
    assert verdict == {'sentiment': 'up', 'model': verdict['model'],
                       'raw': 'Положительно'}


def test_judge_one_null_content_visible_not_silent():
    # gemini-3.6-flash at max_tokens=8 burns the whole budget on
    # reasoning and returns content=None (live probe 08-11-2026): the
    # verdict must stay 'neutral' BUT carry raw=None so it is auditable.
    verdict = sentiment_judge.judge_one('x', _fake(None))
    assert verdict['sentiment'] == 'neutral'
    assert verdict['raw'] is None


def test_judge_stream_ru_verdict_not_dropped():
    inp = io.StringIO(
        json.dumps({'id': '1', 'text': 'автопроверка нравится'}) + '\n')
    out = io.StringIO()
    n = sentiment_judge.judge_stream(inp, out, _fake('положительно'))
    assert n == 1
    row = json.loads(out.getvalue())
    assert row['sentiment'] == 'up'
    assert row['raw'] == 'положительно'
