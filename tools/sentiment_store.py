#!/usr/bin/env python3
"""sentiment_store — sk-grade sentiment signal storage (H6455).

SQLite (stdlib only, same constraint as serve_grade.py) backing the
student-sentiment signal: every scoring event and every 👍/👎 feedback
lands as a row. The single `sentiment` column on a scoring-event row is
mirrored from the latest feedback for that event; each feedback POST also
appends its own audit row (kind='feedback'), so "3 test events -> 3 rows"
and "curl up + curl down -> one row each" both hold literally.

Env: SK_GRADE_SENTIMENT_DB (default: data/sentiment/sentiment.db, relative
to the server CWD /opt/sk-grade/SanskritKaraoke on .92; unit UMask=0077
keeps it deploy-only readable — no PII by design: verse id + vote only).
"""
from __future__ import annotations

import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone

DEFAULT_DB = os.path.join('data', 'sentiment', 'sentiment.db')
_LOCK = threading.Lock()
_VOTES = ('up', 'down')
_MAX_EVENT_ID = 128


def db_path() -> str:
    return os.environ.get('SK_GRADE_SENTIMENT_DB', DEFAULT_DB)


def valid_vote(vote) -> bool:
    return vote in _VOTES


def valid_event_id(event_id) -> bool:
    return bool(event_id) and isinstance(event_id, str) \
        and len(event_id) <= _MAX_EVENT_ID \
        and all(c.isalnum() or c in '-_.' for c in event_id)


def _connect(path=None) -> sqlite3.Connection:
    path = path or db_path()
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    conn = sqlite3.connect(path, timeout=5)
    conn.execute('PRAGMA busy_timeout=5000')
    return conn


def init(path=None):
    with _LOCK:
        conn = _connect(path)
        conn.execute(
            'CREATE TABLE IF NOT EXISTS events('
            ' event_id TEXT PRIMARY KEY,'
            ' ts TEXT NOT NULL,'
            ' kind TEXT NOT NULL,'              # 'grade' | 'feedback'
            ' verse TEXT NOT NULL DEFAULT "",'
            ' score REAL,'
            ' sentiment TEXT,'                  # the one 👍/👎 column
            ' event_ref TEXT NOT NULL DEFAULT "")')
        conn.commit()
        conn.close()


def _now() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def record_grade(verse, score, path=None) -> str:
    """Insert a scoring-event row; returns its event_id."""
    event_id = 'ev-' + uuid.uuid4().hex[:16]
    with _LOCK:
        conn = _connect(path)
        conn.execute(
            'INSERT INTO events(event_id, ts, kind, verse, score) '
            'VALUES(?,?,?,?,?)',
            (event_id, _now(), 'grade', str(verse)[:128], float(score)))
        conn.commit()
        conn.close()
    return event_id


def record_feedback(event_ref, vote, path=None) -> dict:
    """Append one feedback audit row + mirror the sentiment column
    onto the referenced scoring-event row (created if absent)."""
    if not valid_vote(vote):
        raise ValueError('vote must be "up" or "down"')
    if not valid_event_id(event_ref):
        raise ValueError('bad event id')
    fb_id = 'fb-' + uuid.uuid4().hex[:16]
    with _LOCK:
        conn = _connect(path)
        conn.execute(
            'INSERT OR IGNORE INTO events(event_id, ts, kind, verse) '
            'VALUES(?,?,?,?)',
            (event_ref, _now(), 'grade', ''))
        conn.execute(
            'INSERT INTO events(event_id, ts, kind, sentiment, event_ref) '
            'VALUES(?,?,?,?,?)',
            (fb_id, _now(), 'feedback', vote, event_ref))
        conn.execute(
            'UPDATE events SET sentiment=? WHERE event_id=? AND kind="grade"',
            (vote, event_ref))
        conn.commit()
        conn.close()
    return {'event_id': event_ref, 'feedback_id': fb_id, 'vote': vote}


def count(kind=None, path=None) -> int:
    conn = _connect(path)
    if kind:
        row = conn.execute(
            'SELECT COUNT(*) FROM events WHERE kind=?', (kind,)).fetchone()
    else:
        row = conn.execute('SELECT COUNT(*) FROM events').fetchone()
    conn.close()
    return int(row[0])


def rows(path=None, limit=1000):
    conn = _connect(path)
    out = conn.execute(
        'SELECT event_id, ts, kind, verse, score, sentiment, event_ref '
        'FROM events ORDER BY ts LIMIT ?', (limit,)).fetchall()
    conn.close()
    return out


if __name__ == '__main__':
    import json
    import sys
    init()
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'count'
    if cmd == 'count':
        print(json.dumps({'grade_rows': count('grade'),
                          'feedback_rows': count('feedback'),
                          'total': count()}))
    elif cmd == 'dump':
        for r in rows():
            print(json.dumps(r, ensure_ascii=False))
