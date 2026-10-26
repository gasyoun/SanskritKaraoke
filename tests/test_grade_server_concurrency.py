"""H6500 — bounded concurrency on /sk-grade/api/grade.

Two layers of proof:
  1. ConcurrencyGate unit behaviour (slot accounting, saturation, release).
  2. Real HTTP over a spawned ThreadingHTTPServer with grade_take swapped for
     a blocking stub: a second simultaneous POST must answer 429 + Retry-After
     *without* reading a body, /healthz must stay 200 while the grader is busy,
     and the slot must be released on both success and 4xx paths.
"""
from __future__ import annotations

import json
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))

import serve_grade  # noqa: E402


def _post(base, url, data, content_type='audio/wav', timeout=30):
    req = urllib.request.Request(
        base + url, data=data, method='POST',
        headers={'Content-Type': content_type})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), json.loads(e.read().decode('utf-8'))


class _BlockingTake:
    """Stand-in for grade_take: signals entry, waits for the test to free it."""

    def __init__(self):
        self.entered = threading.Event()
        self.release = threading.Event()

    def __call__(self, path, verse):
        self.entered.set()
        assert self.release.wait(10), 'test stub never released'
        return {
            'verse_id': verse,
            'rhythm_percent': 97.0,
            'per_syllable': {},
            'weakest3': [],
            'reference_source': 'stub',
        }


@pytest.fixture()
def live_server(monkeypatch):
    """In-process ThreadingHTTPServer with a one-slot gate and a blocked grader."""
    take = _BlockingTake()
    monkeypatch.setattr(serve_grade, 'grade_take', take)
    monkeypatch.setattr(serve_grade, 'GRADE_GATE',
                        serve_grade.ConcurrencyGate(1, queue_timeout=0))
    server = ThreadingHTTPServer(('127.0.0.1', 0), serve_grade.GradeHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{server.server_address[1]}'
    try:
        yield base, take
    finally:
        take.release.set()
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_gate_saturates_and_releases():
    gate = serve_grade.ConcurrencyGate(2, queue_timeout=0)
    assert gate.try_acquire() is True
    assert gate.try_acquire() is True
    assert gate.try_acquire() is False, 'third slot must be refused non-blocking'
    gate.release()
    assert gate.try_acquire() is True
    gate.release()
    gate.release()


def test_gate_env_defaults_are_sane(monkeypatch):
    monkeypatch.delenv('SK_GRADE_MAX_CONCURRENCY', raising=False)
    monkeypatch.delenv('SK_GRADE_QUEUE_TIMEOUT', raising=False)
    gate = serve_grade.ConcurrencyGate.from_env()
    assert gate.limit == serve_grade.DEFAULT_MAX_CONCURRENCY >= 1
    assert gate.queue_timeout == 0.0
    monkeypatch.setenv('SK_GRADE_MAX_CONCURRENCY', '0')  # mis-set floor, not a lockout
    assert serve_grade.ConcurrencyGate.from_env().limit == 1
    monkeypatch.setenv('SK_GRADE_MAX_CONCURRENCY', 'garbage')
    assert serve_grade.ConcurrencyGate.from_env().limit == serve_grade.DEFAULT_MAX_CONCURRENCY


def test_second_post_gets_429_and_healthz_stays_up(live_server):
    base, take = live_server
    first = {}

    def run_first():
        first['result'] = _post(base, '/api/grade?verse=bhg_2_47', b'\0' * 64)

    worker = threading.Thread(target=run_first, daemon=True)
    worker.start()
    assert take.entered.wait(10), 'first POST never reached grade_take'

    with urllib.request.urlopen(base + '/healthz', timeout=5) as r:
        assert r.status == 200
        assert json.loads(r.read())['ok'] is True

    status, headers, payload = _post(
        base, '/api/grade?verse=bhg_2_48', b'\0' * 64, timeout=10)
    assert status == 429, payload
    assert headers.get('Retry-After') == '2'
    assert 'одновременных' in payload['error']
    # CORS must still be present on the throttled answer (student page reads it)
    assert headers.get('Access-Control-Allow-Origin') == '*'

    take.release.set()
    worker.join(timeout=10)
    assert not worker.is_alive()
    status, _, payload = first['result']
    assert status == 200, payload
    assert payload['verse_id'] == 'bhg_2_47'


def test_slot_released_after_4xx(live_server):
    base, take = live_server
    take.release.set()  # grading stub returns immediately here
    status, _, payload = _post(base, '/api/grade', b'', timeout=10)
    assert status == 400 and 'verse' in payload['error']
    status, _, payload = _post(
        base, '/api/grade?verse=bhg_2_47', b'\0' * 8, timeout=10)
    assert status == 200, payload
