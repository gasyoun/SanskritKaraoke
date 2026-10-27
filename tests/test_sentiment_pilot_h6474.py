"""Offline tests for the H6474 sentiment pilot (no network, no ML stack)."""
import importlib.util
import json
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, '..', 'tools', 'sentiment_pilot_h6474.py')
spec = importlib.util.spec_from_file_location('sentiment_pilot_h6474', TOOL)
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)

ITEMS = [{'id': 'a', 'text': 'хорошо'},
         {'id': 'b', 'text': 'плохо'},
         {'id': 'c', 'text': 'нормально'},
         {'id': 'd', 'text': 'отлично'}]


def fake_transport(prompt, txt):
    """Deterministic fake OpenRouter response shaped like the real one."""
    label = {'плохо': 'down'}.get(txt, 'up' if txt != 'нормально' else 'neutral')
    return {'choices': [{'message': {'content': label}}],
            'usage': {'prompt_tokens': 50, 'completion_tokens': 1}}


class TestJudge:
    def test_judge_rows_shape_and_usage_sink(self):
        sink = []
        transport = fake_transport
        # record usage the way the real transport does
        real = pilot.score_judge(ITEMS, transport)

        def wrapped(prompt, txt):
            sink.append({'usage': {'prompt_tokens': 50, 'completion_tokens': 1}})
            return transport(prompt, txt)
        rows = pilot.score_judge(ITEMS, wrapped)
        assert [r['system'] for r in rows] == ['judge'] * 4
        assert {r['sentiment'] for r in rows} <= {'up', 'down', 'neutral'}
        assert all(r['latency_s'] >= 0 for r in rows)
        assert sink and sink[0]['usage']['prompt_tokens'] == 50
        assert real[0]['id'] == 'a'

    def test_neutral_fallback_for_garbage(self):
        def bad(prompt, txt):
            return {'choices': [{'message': {'content': 'не знаю'}}]}
        rows = pilot.score_judge([ITEMS[0]], bad)
        assert rows[0]['sentiment'] == 'neutral'


class TestKappa:
    def test_perfect_agreement(self):
        assert pilot.kappa(['up', 'down'], ['up', 'down']) == 1.0

    def test_complete_disagreement_is_minus_one(self):
        assert pilot.kappa(['up', 'down'], ['down', 'up']) == -1.0

    def test_near_chance_is_close_to_zero(self):
        a = ['up', 'up', 'down', 'down']
        b = ['up', 'down', 'up', 'down']
        assert abs(pilot.kappa(a, b)) < 0.2

    def test_partial(self):
        a = ['up', 'up', 'down', 'neutral']
        b = ['up', 'up', 'down', 'down']
        assert 0.5 < pilot.kappa(a, b) < 1.0

    def test_mismatched_lengths_raise(self):
        with pytest.raises(ValueError):
            pilot.kappa(['up'], [])


class TestAgreement:
    def test_known_confusion(self):
        local = [{'id': 'a', 'sentiment': 'up', 'latency_s': 0.1},
                 {'id': 'b', 'sentiment': 'up', 'latency_s': 0.2},
                 {'id': 'c', 'sentiment': 'neutral', 'latency_s': 0.3}]
        judge = [{'id': 'a', 'sentiment': 'up', 'latency_s': 1.0},
                 {'id': 'b', 'sentiment': 'down', 'latency_s': 1.1},
                 {'id': 'c', 'sentiment': 'neutral', 'latency_s': 1.2}]
        m = pilot.agreement(local, judge)
        assert m['n'] == 3
        assert m['raw_agreement'] == pytest.approx(2 / 3, abs=1e-3)
        assert m['confusion_local_to_judge'] == {'up->up': 1, 'up->down': 1,
                                                 'neutral->neutral': 1}
        assert m['mean_latency_s_local'] == pytest.approx(0.2)
        assert m['mean_latency_s_judge'] == pytest.approx(1.1)

    def test_cost_estimation(self):
        rows = [{'usage': {'prompt_tokens': 1000, 'completion_tokens': 4}}] * 10
        cost = pilot.judge_cost(rows)
        assert cost['tokens_in'] == 10000 and cost['tokens_out'] == 40
        assert cost['usd_est'] == pytest.approx(
            10000 / 1e6 * 0.15 + 40 / 1e6 * 0.6, abs=1e-5)
        assert cost['local_model_usd_est'] == 0.0


class TestLocal:
    def test_score_local_rows(self):
        rows = pilot.score_local(ITEMS, lambda t: 'up', 'fake/model')
        assert all(r['system'] == 'local:fake/model' for r in rows)
        assert all(r['sentiment'] == 'up' for r in rows)

    def test_label_maps_cover_schemes(self):
        for scheme in pilot.LABEL_MAPS.values():
            assert set(scheme.values()) == {'up', 'down', 'neutral'}


class TestFixture:
    def test_committed_fixture_is_valid_and_nonempty(self):
        path = os.path.join(HERE, '..', 'data', 'sentiment', 'fixtures',
                            'tg_extracts_synthetic_h6474.jsonl')
        items = pilot.load_items(path)
        assert len(items) >= 20
        assert all(set(i) >= {'id', 'text'} for i in items)
        assert len({i['id'] for i in items}) == len(items)

    def test_end_to_end_metrics_on_fixture(self):
        path = os.path.join(HERE, '..', 'data', 'sentiment', 'fixtures',
                            'tg_extracts_synthetic_h6474.jsonl')
        items = pilot.load_items(path)
        jrows = pilot.score_judge(items, fake_transport)
        lrows = pilot.score_local(items, lambda t: 'up', 'fake/model')
        m = pilot.agreement(lrows, jrows)
        assert m['n'] == len(items)
        assert 0.0 <= m['raw_agreement'] <= 1.0
        assert -1.0 <= m['cohen_kappa_vs_judge'] <= 1.0
