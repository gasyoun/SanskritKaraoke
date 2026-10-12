#!/usr/bin/env python3
"""tg_mine_curators — v2 TG-майнинг чата кураторов, gated-before-enable (H6455).

Reads messages of the curators TG chat (CURATORS_CHAT_ID=-1002079934542),
anonymizes them per the 152-ФЗ contract inherited from H6252 (no names,
no contacts, no quotes carrying personalia), and emits a digest JSONL
safe for the sentiment LLM-judge.

GATE (карта К7, MG 11-10): live mining (--enable) refuses to run unless
BOTH hold: env SK_TG_MINING_GATE=APPROVED AND the gate file
data/sentiment/tg_mining.gate exists (written by the H6473 privacy gate).
Default mode is DRY-RUN: anonymize what is given, print counts, write
nothing live.

Input (any of):
  --from-export file.jsonl   exported TG messages [{date, text}] — used in
                             tests and for offline runs; no token needed
  TG_BOT_TOKEN + live API    only with the gate open (--enable)

Env: TG_BOT_TOKEN, CURATORS_CHAT_ID (-1002079934542), SK_TG_MINING_GATE,
SK_TG_GATE_FILE (default data/sentiment/tg_mining.gate).
"""
from __future__ import annotations

import json
import os
import re
import sys

CURATORS_CHAT_ID = '-1002079934542'

# 152-ФЗ masks (contract H6252: no names / contacts / personalia quotes)
_RX_USERNAME = re.compile(r'@[A-Za-z0-9_]{3,}')
_RX_TME = re.compile(r'(?:https?://)?t\.me/\S+')
_RX_EMAIL = re.compile(r'\S+@\S+\.\S+')
_RX_PHONE = re.compile(r'(?:\+?\d[\d\s().-]{8,}\d)')
_RX_URL = re.compile(r'https?://\S+')
_RX_LONGRUN = re.compile(r'[A-ZА-ЯЁ][a-zа-яё]+ [A-ZА-ЯЁ][a-zа-яё]+')


def anonymize_text(text):
    """Mask contacts/ids; DROP the message when a probable personal name
    survives masking (drop > mask for quotes-with-personalia). Returns
    the safe text or None (message must not be mined)."""
    if not text:
        return None
    safe = _RX_TME.sub('[LINK]', text)
    safe = _RX_EMAIL.sub('[EMAIL]', safe)
    safe = _RX_URL.sub('[LINK]', safe)
    safe = _RX_USERNAME.sub('[USER]', safe)
    safe = _RX_PHONE.sub('[PHONE]', safe)
    # a "Firstname Lastname" run that is not already masked => personalia
    for m in _RX_LONGRUN.finditer(safe):
        span = safe[m.start():m.end()]
        if '[USER]' not in span and '[LINK]' not in span:
            return None
    return safe


def anonymize_messages(messages):
    """messages: [{date, text}] -> digest rows [{date, text}] (safe only)."""
    out = []
    for m in messages:
        safe = anonymize_text(m.get('text'))
        if safe:
            out.append({'date': m.get('date', ''), 'text': safe})
    return out


def gate_open(gate_file=None):
    gate_file = gate_file or os.environ.get(
        'SK_TG_GATE_FILE', os.path.join('data', 'sentiment', 'tg_mining.gate'))
    return (os.environ.get('SK_TG_MINING_GATE') == 'APPROVED'
            and os.path.exists(gate_file))


def live_fetch(token=None, chat_id=None):
    """Bot-API getUpdates pull — callable ONLY behind an open gate."""
    import urllib.parse
    import urllib.request
    token = token or os.environ.get('TG_BOT_TOKEN', '')
    chat_id = chat_id or os.environ.get('CURATORS_CHAT_ID', CURATORS_CHAT_ID)
    if not token:
        raise RuntimeError('TG_BOT_TOKEN не задан')
    url = ('https://api.telegram.org/bot' + token
           + '/getUpdates?allowed_updates='
           + urllib.parse.quote(json.dumps([{'message': {'chat': {'id': chat_id}}}])))
    with urllib.request.urlopen(url, timeout=30) as r:
        payload = json.loads(r.read().decode('utf-8'))
    msgs = []
    for u in payload.get('result', []):
        m = u.get('message') or {}
        if str((m.get('chat') or {}).get('id')) == str(chat_id):
            msgs.append({'date': m.get('date'), 'text': m.get('text') or ''})
    return msgs


def main(argv):
    src = None
    enable = '--enable' in argv
    if '--from-export' in argv:
        src = open(argv[argv.index('--from-export') + 1], encoding='utf-8')
    if enable:
        if not gate_open():
            print('GATE_CLOSED: TG-майнинг отключён до приват-гейта H6473 '
                  '(нужны SK_TG_MINING_GATE=APPROVED и файл '
                  'data/sentiment/tg_mining.gate)', file=sys.stderr)
            return 3
    if src is None:
        if not enable:
            print('DRY_RUN: укажи --from-export file.jsonl или --enable '
                  '(гейт H6473). Ничего не выгружено.', file=sys.stderr)
            return 0
        src = live_fetch()
    messages = [json.loads(l) for l in src if l.strip()]
    digest = anonymize_messages(messages)
    dropped = len(messages) - len(digest)
    for row in digest:
        print(json.dumps({'chat': CURATORS_CHAT_ID, **row},
                         ensure_ascii=False))
    print(f'mined={len(digest)} dropped_personalia={dropped}',
          file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
