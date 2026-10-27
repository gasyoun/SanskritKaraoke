#!/usr/bin/env python3
"""sentiment_pilot_h6474 — локальная RU-модель vs LLM-судья на одном наборе.

Pilot for ruling К6 (grill AI-sentiment 11-10-2026, MG override «локальная
модель сразу»): score ONE de-identified fixture set of TG-style extracts with
(1) local HF RU-sentiment candidate model(s) and (2) the production LLM judge
(tools/sentiment_judge.py, OpenRouter google/gemini-flash-1.5), then emit
agreement metrics (raw % + Cohen's kappa vs the judge), latency and cost
estimates. Adoption of any local model is ONLY via an @DECIDE visa (rule К8);
this script changes no prod defaults.

152-ФЗ (H6473 gate): run ONLY on already-de-identified text. The committed
fixture data/sentiment/fixtures/tg_extracts_synthetic_h6474.jsonl is fully
SYNTHETIC (no TG content, no personalia) — real TG quotes must never enter
the repo. Detailed per-item output goes to files you point -o at; on .92 keep
those in working analysis dirs (30-day retention, docs/security policy).

Usage (on .92, with the pilot venv):
  python3 tools/sentiment_pilot_h6474.py fixture.jsonl \
      --local cointegrated/rubert-tiny-sentiment-balanced \
      --local seara/rubert-tiny2-russian-sentiment \
      --local blanchefort/rubert-base-cased-sentiment \
      -o runs/h6474

Env: OPENROUTER_API_KEY (judge leg; omit --judge to skip). Local legs need
torch+transformers in the environment; both backends are injectable for the
offline test (fake transport / fake local scorer).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sentiment_judge import DEFAULT_MODEL, PROMPT, judge_one  # noqa: E402

OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
JUDGE_USD_PER_MTOK_IN = 0.15   # google/gemini-flash-1.5 list price, per 1M input tok
JUDGE_USD_PER_MTOK_OUT = 0.60  # per 1M output tok (assumption stated in the report)

# Native label -> pilot vocabulary (up|down|neutral).
LABEL_MAPS = {
    'balanced-tiny': {'POSITIVE': 'up', 'NEGATIVE': 'down', 'NEUTRAL': 'neutral'},
    'three-class': {'neutral': 'neutral', 'positive': 'up', 'negative': 'down',
                    'POSITIVE': 'up', 'NEGATIVE': 'down', 'NEUTRAL': 'neutral'},
}


def load_items(path):
    items = []
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if line:
                rec = json.loads(line)
                items.append({'id': rec['id'], 'text': rec['text']})
    return items


# ---------------------------------------------------------------- judge leg

RU_SYNONYMS = (('положит', 'up'), ('позитив', 'up'),
               ('отрицат', 'down'), ('негатив', 'down'),
               ('нейтрал', 'neutral'), ('нейтральн', 'neutral'))
_EN = ('up', 'down', 'neutral')


def parse_label(content):
    """Pilot-side verdict parse: judge_one's English words + RU synonyms.

    The v1 prod judge (tools/sentiment_judge.py) parses only English words;
    gemini-3.x answers «положительно» etc., which falls back to neutral.
    The pilot widens the parse here so agreement is not an artifact of the
    parse; upstreaming the wider parse to sentiment_judge.py is a residual
    for the v1 owner, not this pilot."""
    low = str(content).strip().lower()
    for v in _EN:
        if v in low:
            return v
    for needle, v in RU_SYNONYMS:
        if needle in low:
            return v
    return 'neutral'


def judge_one_pilot(text, transport, model=None):
    """judge_one with the pilot-wide parse; records model from the response."""
    model = model or os.environ.get('SK_SENTIMENT_MODEL', DEFAULT_MODEL)
    resp = transport(PROMPT, text)
    content = str(resp['choices'][0]['message']['content'])
    return {'sentiment': parse_label(content), 'model': model, 'raw': content}


def score_judge(items, transport, usage_sink=None):
    """Score with the pilot judge; returns rows with per-item latency.

    transport/usage_sink are injectable: the test passes fakes without any
    network. The real transport records (model, latency, usage) into the
    sink; rows carry them for the cost leg."""
    rows = []
    for item in items:
        t0 = time.monotonic()
        verdict = judge_one_pilot(item['text'], transport)
        dt = time.monotonic() - t0
        row = dict(item)
        row.update({'system': 'judge', 'sentiment': verdict['sentiment'],
                    'model': verdict['model'], 'latency_s': round(dt, 3)})
        if usage_sink is not None:
            row['usage'] = usage_sink[-1] if usage_sink else {}
        rows.append(row)
    return rows


def default_judge_transport(sink):
    """Real OpenRouter transport that records (latency, usage) into sink."""
    import urllib.request
    model = os.environ.get('SK_SENTIMENT_MODEL', DEFAULT_MODEL)
    key = os.environ.get('OPENROUTER_API_KEY', '')
    if not key:
        raise RuntimeError('OPENROUTER_API_KEY не задан')

    def call(prompt, txt):
        t0 = time.monotonic()
        req = urllib.request.Request(
            OPENROUTER_URL, method='POST',
            headers={'Authorization': f'Bearer {key}',
                     'Content-Type': 'application/json'},
            data=json.dumps({
                'model': model,
                'messages': [{'role': 'user', 'content': f'{prompt} {txt}'}],
                # reasoning-style flash models (gemini-3.x) burn a small
                # max_tokens budget on thinking and return empty content;
                # 512 leaves room for the one-word verdict.
                'max_tokens': 512, 'temperature': 0,
            }).encode('utf-8'))
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.loads(r.read().decode('utf-8'))
        sink.append({'model': model,
                     'latency_s': round(time.monotonic() - t0, 3),
                     'usage': resp.get('usage', {})})
        return resp
    return call


# ---------------------------------------------------------------- local leg

def make_local_scorer(model_id, label_scheme='three-class'):
    """Return scorer(text) -> up|down|neutral using HF transformers."""
    from transformers import pipeline  # heavy import, only on the pilot box
    pipe = pipeline('text-classification', model=model_id,
                    top_k=None, truncation=True)
    mapping = LABEL_MAPS[label_scheme]

    def score(text):
        preds = pipe(text)
        if isinstance(preds[0], list):  # top_k=None returns [[{label,score}]]
            preds = preds[0]
        best = max(preds, key=lambda p: p['score'])
        return mapping.get(best['label'], 'neutral')
    return score


def score_local(items, scorer, model_id):
    rows = []
    for item in items:
        t0 = time.monotonic()
        label = scorer(item['text'])
        rows.append({'id': item['id'], 'text': item['text'],
                     'system': f'local:{model_id}', 'sentiment': label,
                     'latency_s': round(time.monotonic() - t0, 3)})
    return rows


# ------------------------------------------------------------------ metrics

def kappa(a, b):
    """Cohen's kappa between two equal-length label lists (stdlib)."""
    if len(a) != len(b) or not a:
        raise ValueError('kappa needs two equal non-empty lists')
    labels = sorted(set(a) | set(b))
    n = len(a)
    po = sum(1 for x, y in zip(a, b) if x == y) / n
    pe = sum((a.count(c) / n) * (b.count(c) / n) for c in labels)
    if pe == 1.0:
        return 1.0 if po == 1.0 else 0.0
    return round((po - pe) / (1 - pe), 3)


def agreement(local_rows, judge_rows):
    jmap = {r['id']: r['sentiment'] for r in judge_rows}
    pairs = [(r['sentiment'], jmap[r['id']]) for r in local_rows
             if r['id'] in jmap]
    la, jb = [p[0] for p in pairs], [p[1] for p in pairs]
    conf = {}
    for x, y in pairs:
        conf[f'{x}->{y}'] = conf.get(f'{x}->{y}', 0) + 1
    lat_l = [r['latency_s'] for r in local_rows]
    lat_j = [r['latency_s'] for r in judge_rows]
    return {
        'n': len(pairs),
        'raw_agreement': round(sum(1 for x, y in pairs if x == y) / len(pairs), 3)
        if pairs else None,
        'cohen_kappa_vs_judge': kappa(la, jb) if pairs else None,
        'confusion_local_to_judge': conf,
        'mean_latency_s_local': round(sum(lat_l) / len(lat_l), 3) if lat_l else None,
        'mean_latency_s_judge': round(sum(lat_j) / len(lat_j), 3) if lat_j else None,
    }


def judge_cost(judge_rows):
    tin = tout = 0
    for r in judge_rows:
        u = r.get('usage') or {}
        if 'usage' in u:  # rows carry the transport sink entry
            u = u['usage']
        tin += int(u.get('prompt_tokens', 0))
        tout += int(u.get('completion_tokens', 0))
    usd = (tin / 1e6 * JUDGE_USD_PER_MTOK_IN) + (tout / 1e6 * JUDGE_USD_PER_MTOK_OUT)
    return {'tokens_in': tin, 'tokens_out': tout,
            'usd_est': round(usd, 5), 'local_model_usd_est': 0.0}


# -------------------------------------------------------------------- main

def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('fixture')
    ap.add_argument('--local', action='append', default=[],
                    help='HF model id; repeatable (2-3 candidates)')
    ap.add_argument('--scheme', action='append', default=[],
                    help='label scheme per --local (three-class|balanced-tiny)')
    ap.add_argument('--judge', action='store_true', default=False,
                    help='also run the OpenRouter LLM judge leg')
    ap.add_argument('-o', dest='outdir', help='write results.jsonl + metrics.json here')
    args = ap.parse_args(argv)

    items = load_items(args.fixture)
    all_rows, usage_sink = [], []
    if args.judge:
        judge_rows = score_judge(items, default_judge_transport(usage_sink),
                                 usage_sink)
        all_rows.extend(judge_rows)

    # per-model scheme: explicit --scheme entries pair positionally, the
    # rest default to three-class (zip alone would silently truncate the
    # model list to the number of explicit schemes).
    explicit = args.scheme
    schemes = (explicit + ['three-class'] * len(args.local))[:len(args.local)]
    locals_ = []
    for mid, scheme in zip(args.local, schemes):
        scorer = make_local_scorer(mid, scheme)
        locals_.append((mid, score_local(items, scorer, mid)))
        all_rows.extend(locals_[-1][1])

    report = {'fixture': args.fixture, 'n_items': len(items),
              'judge_model': os.environ.get('SK_SENTIMENT_MODEL', DEFAULT_MODEL)
              if args.judge else None}
    if args.judge:
        jrows = [r for r in all_rows if r['system'] == 'judge']
        report['cost'] = judge_cost(jrows)
        report['models'] = {}
        for mid, lrows in locals_:
            m = agreement(lrows, jrows)
            m['model_id'] = mid
            report['models'][mid] = m
    elif locals_:
        report['models'] = {mid: {'model_id': mid, 'n': len(rows)} for mid, rows in locals_}

    if args.outdir:
        os.makedirs(args.outdir, exist_ok=True)
        with open(os.path.join(args.outdir, 'results.jsonl'), 'w', encoding='utf-8') as fh:
            for r in all_rows:
                fh.write(json.dumps(r, ensure_ascii=False) + '\n')
        with open(os.path.join(args.outdir, 'metrics.json'), 'w', encoding='utf-8') as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
