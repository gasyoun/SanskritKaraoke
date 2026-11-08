"""H7850/Y23 — DEFAULT_MODEL visa lock for sentiment_judge.

The default slug is prod behavior behind an @DECIDE visa (MG, owner
H6455): this test locks the visa'd value so a regression back to a
retired/unprobed slug cannot land silently.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))

import sentiment_judge  # noqa: E402


def test_default_model_is_the_live_probed_slug():
    # Live-probed 08-11-2026 (reports/SENTIMENT_JUDGE_MODEL_PROBE_2026-11-08.md):
    # google/gemini-2.5-flash is the only probed slug returning a valid
    # one-word verdict under v1 params (max_tokens=8, 0 reasoning tokens).
    assert sentiment_judge.DEFAULT_MODEL == 'google/gemini-2.5-flash'
    # the retired slug must never come back as the default
    assert sentiment_judge.DEFAULT_MODEL != 'google/gemini-flash-1.5'


def test_env_override_still_wins(monkeypatch):
    monkeypatch.setenv('SK_SENTIMENT_MODEL', 'some/custom-slug')

    def fake(prompt, text):
        return {'choices': [{'message': {'content': 'up'}}]}

    verdict = sentiment_judge.judge_one('x', fake)
    assert verdict['model'] == 'some/custom-slug'
    monkeypatch.delenv('SK_SENTIMENT_MODEL')
    assert sentiment_judge.judge_one('x', fake)['model'] \
        == 'google/gemini-2.5-flash'
