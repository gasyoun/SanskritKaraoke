"""H6455 e2e — sentiment signal on sk-grade: store, feedback endpoint,
grade-event capture, LLM-judge (offline fake transport), TG-gate refusal.

Spawns serve_grade.py exactly as test_grade_server_e2e does, but with
SK_GRADE_SENTIMENT_DB pointed at a tmp store.
"""
from __future__ import annotations

import json
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))

import sentiment_store  # noqa: E402
import sentiment_judge  # noqa: E402
import tg_mine_curators  # noqa: E402


@pytest.fixture()
def store(tmp_path, monkeypatch):
    db = str(tmp_path / 'sentiment.db')
    monkeypatch.setenv('SK_GRADE_SENTIMENT_DB', db)
    sentiment_store.init(db)
    yield db


def test_store_three_events_three_rows(store):
    ids = [sentiment_store.record_grade('bhg_2_47', 90.0 + i) for i in range(3)]
    assert len(set(ids)) == 3
    assert sentiment_store.count('grade') == 3
    # up + down on the first event: one feedback row each (stop-condition shape)
    sentiment_store.record_feedback(ids[0], 'up')
    sentiment_store.record_feedback(ids[0], 'down')
    assert sentiment_store.count('feedback') == 2
    grade_rows = [r for r in sentiment_store.rows() if r[2] == 'grade']
    first = next(r for r in grade_rows if r[0] == ids[0])
    assert first[5] == 'down'  # sentiment column mirrored, last vote wins


def test_store_vote_validation(store):
    with pytest.raises(ValueError):
        sentiment_store.record_feedback('ev-1', 'meh')


@pytest.fixture(scope='module')
def server(tmp_path_factory):
    db = tmp_path_factory.mktemp('sent') / 'server.db'
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
    proc = subprocess.Popen(
        [sys.executable, str(ROOT / 'tools' / 'serve_grade.py')],
        env={'PATH': '/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin',
             'SK_GRADE_HOST': '127.0.0.1',
             'SK_GRADE_PORT': str(port),
             'SK_GRADE_WHISPER': '0',
             'SK_GRADE_SENTIMENT_DB': str(db)},
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    base = f'http://127.0.0.1:{port}'
    deadline = time.time() + 20
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(base + '/healthz', timeout=2) as r:
                if r.status == 200:
                    break
        except Exception:
            if proc.poll() is not None:
                raise RuntimeError(
                    'server died: ' + proc.stderr.read().decode('utf-8', 'replace'))
            time.sleep(0.3)
    else:
        proc.kill()
        raise RuntimeError('server did not come up in 20 s')
    yield base, str(db)
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def _post(base, url, data, content_type):
    req = urllib.request.Request(
        base + url, data=data, method='POST',
        headers={'Content-Type': content_type})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode('utf-8'))


def test_feedback_endpoint_three_events_three_rows(server):
    base, db = server
    for i, vote in enumerate(('up', 'down', 'up')):
        status, payload = _post(
            base, f'/api/feedback?event=h6455-canary-{i}&vote={vote}',
            b'', 'application/json')
        assert status == 200 and payload['ok'] is True, payload
        assert payload['vote'] == vote
    assert sentiment_store.count('feedback', db) == 3  # 3 events -> 3 rows
    # JSON-body form also works
    status, payload = _post(
        base, '/api/feedback', json.dumps(
            {'event_id': 'h6455-canary-0', 'vote': 'down'}).encode(),
        'application/json')
    assert status == 200 and payload['vote'] == 'down'


def test_feedback_endpoint_errors(server):
    base, _ = server
    status, payload = _post(base, '/api/feedback?event=x&vote=sideways', b'',
                            'application/json')
    assert status == 400
    status, _ = _post(base, '/api/feedback', b'', 'application/json')
    assert status == 400


def test_grade_event_recorded(server, tmp_path):
    from test_grade_server_e2e import synth_take_wav  # noqa: F401
    from grade_take import load_reference_timing, load_verse
    base, db = server
    timing = load_reference_timing(load_verse('bhg_2_47'))[0]
    onsets = list(timing['s1']) + list(timing['s2'])
    wav = synth_take_wav(tmp_path / 'take.wav', onsets)
    status, payload = _post(
        base, '/api/grade?verse=bhg_2_47',
        Path(wav).read_bytes(), 'audio/wav')
    assert status == 200, payload
    assert payload.get('event_id')
    rows = [r for r in sentiment_store.rows(db) if r[2] == 'grade']
    assert any(r[0] == payload['event_id'] and r[3] == 'bhg_2_47'
               for r in rows)


def test_judge_offline_fake_transport():
    def fake(prompt, text):
        assert 'санскрит' in prompt
        return {'choices': [{'message': {'content': ' down\n'}}]}
    verdict = sentiment_judge.judge_one('боты бесполезны', fake)
    assert verdict['sentiment'] == 'down'
    assert verdict['model']
    import io
    inp = io.StringIO(json.dumps({'id': '1', 'text': 'нравится оценка'})
                      + '\n' + json.dumps({'id': '2', 'text': 'ужас'}) + '\n')
    out = io.StringIO()
    n = sentiment_judge.judge_stream(inp, out, fake)
    assert n == 2
    lines = [json.loads(l) for l in out.getvalue().splitlines()]
    assert all(l['sentiment'] in ('up', 'down', 'neutral') for l in lines)


def test_tg_anonymizer_contract():
    safe = tg_mine_curators.anonymize_text(
        'Пишите @ivan и +7 999 123-45-67 или https://t.me/ivan')
    assert safe is not None
    assert '@ivan' not in safe and '999' not in safe and 't.me' not in safe
    assert tg_mine_curators.anonymize_text('Иван Петров сказал что-то') is None
    assert tg_mine_curators.anonymize_text('Оценка произношения нравится!') is not None
    messages = [{'date': 1, 'text': 'бот тупит'},
                {'date': 2, 'text': 'Мария Иванова недовольна'},
                {'date': 3, 'text': ''}]
    digest = tg_mine_curators.anonymize_messages(messages)
    assert len(digest) == 1 and digest[0]['text'] == 'бот тупит'


def test_tg_gate_refusal(tmp_path, monkeypatch):
    monkeypatch.delenv('SK_TG_MINING_GATE', raising=False)
    monkeypatch.setenv('SK_TG_GATE_FILE', str(tmp_path / 'gate'))
    export = tmp_path / 'msgs.jsonl'
    export.write_text(json.dumps({'date': 1, 'text': 'нравится'}) + '\n')
    # negative control: gate closed -> --enable must refuse (exit 3)
    rc = subprocess.call(
        [sys.executable, str(ROOT / 'tools' / 'tg_mine_curators.py'),
         '--enable', '--from-export', str(export)],
        env={**dict(__import__('os').environ),
             'SK_TG_GATE_FILE': str(tmp_path / 'gate')},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    assert rc == 3
    # gate open (env + file) -> same command proceeds
    (tmp_path / 'gate').write_text('APPROVED H6473')
    monkeypatch.setenv('SK_TG_MINING_GATE', 'APPROVED')
    rc = subprocess.call(
        [sys.executable, str(ROOT / 'tools' / 'tg_mine_curators.py'),
         '--enable', '--from-export', str(export)],
        env={**dict(__import__('os').environ),
             'SK_TG_MINING_GATE': 'APPROVED',
             'SK_TG_GATE_FILE': str(tmp_path / 'gate')},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    assert rc == 0
