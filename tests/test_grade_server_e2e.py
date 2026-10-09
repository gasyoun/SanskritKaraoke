"""H6317 e2e — serve_grade.py over real HTTP on localhost.

Spawns the server as a subprocess (as systemd will on .92), polls /healthz,
POSTs a synthetic burst take (the same generator as test_grade_take) through
the endpoint and asserts the per-syllable grade JSON contract, CORS preflight
and error paths.
"""
from __future__ import annotations

import json
import math
import socket
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from grade_take import load_reference_timing, load_verse  # noqa: E402

SR = 22050


def synth_take_wav(path, onsets_s, lead_s=0.2):
    end = max(onsets_s) + 0.09 + 0.4
    n = int(end * SR)
    samples = [0.0] * n
    ramp_n = int(0.008 * SR)
    burst_n = int(0.09 * SR)
    for t in onsets_s:
        start = int((t + lead_s) * SR)
        for j in range(burst_n):
            env = 1.0
            if j < ramp_n:
                env = j / ramp_n
            elif j > burst_n - ramp_n:
                env = (burst_n - j) / ramp_n
            samples[start + j] += 0.5 * env * math.sin(
                2 * math.pi * 440.0 * j / SR)
    pcm = b''.join(
        struct.pack('<h', max(-32767, min(32767, int(s * 32767))))
        for s in samples)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm)
    return path


@pytest.fixture(scope='module')
def server():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
    proc = subprocess.Popen(
        [sys.executable, str(ROOT / 'tools' / 'serve_grade.py')],
        env={'PATH': '/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin',
             'SK_GRADE_HOST': '127.0.0.1',
             'SK_GRADE_PORT': str(port),
             'SK_GRADE_WHISPER': '0'},
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
    yield base
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
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode('utf-8'))


def test_healthz(server):
    with urllib.request.urlopen(server + '/healthz', timeout=5) as r:
        assert r.status == 200
        assert json.loads(r.read())['ok'] is True


def test_options_preflight_cors(server):
    req = urllib.request.Request(
        server + '/api/grade?verse=bhg_2_47', method='OPTIONS')
    with urllib.request.urlopen(req, timeout=5) as r:
        assert r.status in (200, 204)
        assert r.headers['Access-Control-Allow-Origin'] == '*'


def test_grade_endpoint_returns_per_syllable_json(server, tmp_path):
    timing = load_reference_timing(load_verse('bhg_2_47'))[0]
    onsets = list(timing['s1']) + list(timing['s2'])
    wav = synth_take_wav(tmp_path / 'take.wav', onsets)
    status, payload = _post(
        server, '/api/grade?verse=bhg_2_47',
        Path(wav).read_bytes(), 'audio/wav')
    assert status == 200, payload
    assert payload['verse_id'] == 'bhg_2_47'
    assert payload['rhythm_percent'] >= 85.0
    assert set(payload['per_syllable']) == {'s1', 's2'}
    row = payload['per_syllable']['s1'][0]
    assert {'index', 'syl', 'ref_s', 'student_s', 'delta_ms', 'grade'} <= set(row)
    assert len(payload['weakest3']) <= 3
    assert payload['reference_source'].startswith('fixture')


def test_grade_endpoint_subh_real_reference(server, tmp_path):
    timing = load_reference_timing(load_verse('subh_2745'))[0]
    onsets = list(timing['s1']) + list(timing['s2'])
    wav = synth_take_wav(tmp_path / 'subh.wav', onsets)
    status, payload = _post(
        server, '/api/grade?verse=subh_2745',
        Path(wav).read_bytes(), 'audio/wav')
    assert status == 200, payload
    assert payload['reference_source'] == 'verse.timing'
    assert payload['rhythm_percent'] >= 60.0


def test_grade_endpoint_errors(server):
    status, payload = _post(server, '/api/grade', b'', 'audio/wav')
    assert status == 400 and 'verse' in payload['error']
    status, payload = _post(
        server, '/api/grade?verse=no_such_verse', b'x', 'audio/wav')
    assert status == 422
    status, payload = _post(
        server, '/api/grade?verse=bhg_2_48', b'x', 'audio/wav')
    assert status == 422 and 'эталонного тайминга' in payload['error']
