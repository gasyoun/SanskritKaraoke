#!/usr/bin/env python3
"""serve_grade — HTTP endpoint for student-take grading (H6317).

Stdlib only (ThreadingHTTPServer): the .92 box runs PHP/Laravel for Systema
and has no FastAPI; numpy is the single pip dependency (via align_chapter).

Routes:
  GET  /healthz            -> {"ok": true}
  POST /api/grade?verse=<id>  body = raw audio bytes (audio/webm|ogg|wav|mp4|mpeg)
                            -> grade JSON (tools/grade_take.py contract)
                            + event_id of the stored scoring event (H6455)
  POST /api/feedback?event=<id>&vote=up|down   (or JSON body {"event_id","vote"})
                            -> {"ok": true, ...} (H6455 sentiment signal)
CORS: open (student.html is served from GitHub Pages / Telegram WebApp;
the endpoint carries no auth and no PII — audio only, never stored;
the sentiment store holds verse ids + votes, never names or contacts).

Env: SK_GRADE_HOST (127.0.0.1), SK_GRADE_PORT (8791), SK_GRADE_WHISPER (0|1),
SK_GRADE_SENTIMENT_DB (data/sentiment/sentiment.db),
SK_GRADE_MAX_CONCURRENCY (2), SK_GRADE_QUEUE_TIMEOUT (0 seconds).
Run: python3 tools/serve_grade.py   (systemd unit: deploy/sk-grade.service)

Concurrency (H6500): every /api/grade POST must hold one of
SK_GRADE_MAX_CONCURRENCY slots (bounded semaphore) from body read to response,
so an unbounded ThreadingHTTPServer cannot fan out into N whisper jobs and
N x 12 MB buffers. Saturation answers 429 + Retry-After instead of queueing;
/healthz and /api/feedback never touch the gate, so the uptime probe and the
sentiment write stay responsive while the grader is busy. The edge throttle
that pairs with this lives in deploy/nginx-sk-grade.conf.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from grade_take import GradeError, ReferenceTimingError, grade_take  # noqa: E402
import sentiment_store  # noqa: E402

MAX_BODY = 12 * 1024 * 1024  # 12 MB ~ 2 min of opus
DEFAULT_MAX_CONCURRENCY = 2
DEFAULT_QUEUE_TIMEOUT = 0.0
CT_TO_EXT = {
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/aac': '.aac',
}
GRADING_BUSY_ERROR = (
    'слишком много одновременных записей — подожди пару секунд и повтори')


def _env_int(name, default, minimum=1):
    """Env int with a floor — a mis-set 0 must not wedge the grader shut."""
    try:
        value = int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default
    return max(minimum, value)


def _env_float(name, default, minimum=0.0):
    try:
        value = float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default
    return max(minimum, value)


class ConcurrencyGate:
    """Bounded slot pool: at most `limit` grading jobs in flight (H6500)."""

    def __init__(self, limit, queue_timeout=0.0):
        self.limit = max(1, int(limit))
        self.queue_timeout = max(0.0, float(queue_timeout))
        self._slots = threading.BoundedSemaphore(self.limit)

    @classmethod
    def from_env(cls):
        return cls(
            _env_int('SK_GRADE_MAX_CONCURRENCY', DEFAULT_MAX_CONCURRENCY),
            _env_float('SK_GRADE_QUEUE_TIMEOUT', DEFAULT_QUEUE_TIMEOUT),
        )

    def try_acquire(self):
        """True when a slot was taken; False when saturated (no unbounded wait)."""
        if self.queue_timeout <= 0:
            return self._slots.acquire(blocking=False)
        return self._slots.acquire(timeout=self.queue_timeout)

    def release(self):
        self._slots.release()


GRADE_GATE = ConcurrencyGate.from_env()


class GradeHandler(BaseHTTPRequestHandler):
    server_version = 'sk-grade/1.0'

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, code, payload, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self._cors()
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if urlparse(self.path).path == '/healthz':
            self._json(200, {'ok': True, 'service': 'sk-grade'})
        else:
            self._json(404, {'error': 'not found'})

    def _read_feedback(self, parsed):
        """Feedback contract: ?event=<id>&vote=up|down query OR JSON body."""
        q = parse_qs(parsed.query)
        event_id = (q.get('event') or [''])[0].strip()
        vote = (q.get('vote') or [''])[0].strip().lower()
        if not event_id or not vote:
            try:
                length = int(self.headers.get('Content-Length') or 0)
                if 0 < length <= 4096:
                    body = json.loads(self.rfile.read(length).decode('utf-8'))
                    event_id = str(body.get('event_id', event_id)).strip()
                    vote = str(body.get('vote', vote)).strip().lower()
            except (ValueError, json.JSONDecodeError):
                pass
        return event_id, vote

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/feedback':
            event_id, vote = self._read_feedback(parsed)
            if not event_id or not vote:
                self._json(400, {'error': 'нужны event (id события) и vote (up|down)'})
                return
            try:
                result = sentiment_store.record_feedback(event_id, vote)
            except ValueError as e:
                self._json(400, {'error': str(e)})
                return
            except Exception as e:  # noqa: BLE001
                self._json(500, {'error': f'store: {e}'})
                return
            self._json(200, {'ok': True, **result})
            return

        if parsed.path != '/api/grade':
            self._json(404, {'error': 'not found'})
            return

        verse = (parse_qs(parsed.query).get('verse') or [''])[0].strip()
        if not verse:
            self._json(400, {'error': 'пустой параметр verse (id стиха)'})
            return

        # H6500: bound concurrent grading jobs *before* the 12 MB body read, so
        # a burst cannot pin N buffers + N whisper processes. Saturated -> 429
        # with Retry-After; /healthz stays outside the gate on purpose.
        if not GRADE_GATE.try_acquire():
            self._json(429, {'error': GRADING_BUSY_ERROR},
                       {'Retry-After': '2'})
            return
        try:
            self._grade(verse)
        finally:
            GRADE_GATE.release()

    def _grade(self, verse):
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except (TypeError, ValueError):
            # a non-numeric Content-Length must not escape do_POST (bughunt 11.10 M2)
            self._json(400, {'error': 'некорректный Content-Length'})
            return
        if length <= 0:
            self._json(400, {'error': 'пустое тело — аудио записи обязательно'})
            return
        if length > MAX_BODY:
            self._json(413, {'error': 'аудио больше 12 МБ — запиши короче'})
            return

        audio = self.rfile.read(length)
        ext = CT_TO_EXT.get((self.headers.get('Content-Type') or '').split(';')[0].strip().lower(), '.webm')

        fd = None
        try:
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(audio)
                fd = tmp.name
            result = grade_take(fd, verse)
            try:
                result['event_id'] = sentiment_store.record_grade(
                    verse, result.get('rhythm_percent'))
            except Exception as e:  # noqa: BLE001 — storage failure must not fail grading
                sys.stderr.write(f'sentiment store write failed: {e}\n')
            self._json(200, result)
        except ReferenceTimingError as e:
            self._json(422, {'error': f'нет эталонного тайминга: {e}'})
        except GradeError as e:
            self._json(422, {'error': str(e)})
        except RuntimeError as e:
            self._json(422, {'error': f'аудио не разобрано: {e}'})
        except Exception as e:  # noqa: BLE001 — generic to the client, full detail server-side
            # bughunt 11.10 M3: ffmpeg stderr / temp paths are not public API.
            sys.stderr.write(f'grade failed: {e}\n')
            self._json(500, {'error': 'внутренняя ошибка сервера'})
        finally:
            if fd:
                try:
                    os.unlink(fd)
                except OSError:
                    pass

    def log_message(self, fmt, *args):
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8')
    host = os.environ.get('SK_GRADE_HOST', '127.0.0.1')
    port = int(os.environ.get('SK_GRADE_PORT', '8791'))
    try:
        sentiment_store.init()
    except Exception as e:  # noqa: BLE001 — boot loud, run anyway (grading must live)
        print(f'sentiment store init failed: {e}', flush=True)
    server = ThreadingHTTPServer((host, port), GradeHandler)
    print(f'sk-grade listening on http://{host}:{port} '
          f'(whisper={os.environ.get("SK_GRADE_WHISPER", "0")}, '
          f'max_concurrency={GRADE_GATE.limit})', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
