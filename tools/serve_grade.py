#!/usr/bin/env python3
"""serve_grade — HTTP endpoint for student-take grading (H6317).

Stdlib only (ThreadingHTTPServer): the .92 box runs PHP/Laravel for Systema
and has no FastAPI; numpy is the single pip dependency (via align_chapter).

Routes:
  GET  /healthz            -> {"ok": true}
  POST /api/grade?verse=<id>  body = raw audio bytes (audio/webm|ogg|wav|mp4|mpeg)
                            -> grade JSON (tools/grade_take.py contract)
CORS: open (student.html is served from GitHub Pages / Telegram WebApp;
the endpoint carries no auth and no PII — audio only, never stored).

Env: SK_GRADE_HOST (127.0.0.1), SK_GRADE_PORT (8791), SK_GRADE_WHISPER (0|1).
Run: python3 tools/serve_grade.py   (systemd unit: deploy/sk-grade.service)
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from grade_take import GradeError, ReferenceTimingError, grade_take  # noqa: E402

MAX_BODY = 12 * 1024 * 1024  # 12 MB ~ 2 min of opus
CT_TO_EXT = {
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/aac': '.aac',
}


class GradeHandler(BaseHTTPRequestHandler):
    server_version = 'sk-grade/1.0'

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self._cors()
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

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != '/api/grade':
            self._json(404, {'error': 'not found'})
            return

        verse = (parse_qs(parsed.query).get('verse') or [''])[0].strip()
        if not verse:
            self._json(400, {'error': 'пустой параметр verse (id стиха)'})
            return

        length = int(self.headers.get('Content-Length') or 0)
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
            self._json(200, result)
        except ReferenceTimingError as e:
            self._json(422, {'error': f'нет эталонного тайминга: {e}'})
        except GradeError as e:
            self._json(422, {'error': str(e)})
        except RuntimeError as e:
            self._json(422, {'error': f'аудио не разобрано: {e}'})
        except Exception as e:  # noqa: BLE001 — surfaced to the client as JSON
            self._json(500, {'error': f'internal: {e}'})
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
    server = ThreadingHTTPServer((host, port), GradeHandler)
    print(f'sk-grade listening on http://{host}:{port} '
          f'(whisper={os.environ.get("SK_GRADE_WHISPER", "0")})', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
