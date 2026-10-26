# Sentiment-сигнал учеников на sk-grade — H6455 (исполнено)

_Created: 12-10-2026 · Last updated: 12-10-2026_

**Вердикт:** ПОСТРОЕНО и живо на проде .92 — коллектор тональности учеников к AI-фичам (карта 1 грилла [GRILL_AI_SENTIMENT_DECISIONS_11-10-2026](https://github.com/gasyoun/Uprava/blob/main/reports/GRILL_AI_SENTIMENT_DECISIONS_11-10-2026.md)): 👍/👎 на каждом скоринг-эвенте sk-grade (H6317) + LLM-судья v1 через существующий OpenRouter-стек + v2-майнинг TG-кураторов gated-before-enable (гейт H6473, карта К7).

## Строка-вердикт формата карты 7 wheel-watch (аспект 10 «user-feedback/sentiment»)

| наш аналог | upstream | что делает | вердикт | стоимость приёмки | решение MG |
|---|---|---|---|---|---|
| [sk-grade sentiment v1 (H6455)](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/sentiment_store.py): 👍/👎-колонка в SQLite-сторе + feedback-эндпоинт + LLM-судья | GitHub-тренды sentiment-моделей (RU SaaS/transformers) — **запрещены без @DECIDE-визы** (урок H6213: 65 вердиктов/0 адопций); локальная RU-модель — пилот [H6474](https://github.com/gasyoun/Uprava/blob/main/handoffs/H6474-OxAlpha_SanskritKaraoke_local-ru-sentiment-model-pilot_11.10.26.md), адопция через @DECIDE | захват оценки на каждом скоринг-эвенте (одна колонка `sentiment` + audit-строка на фидбек); тональность свободного текста — LLM-судья google/gemini-flash-1.5 через OpenRouter (стек [teaching_pipeline/llm.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/agents/teaching_pipeline/llm.py), инфраструктура 0); TG-кураторы (-1002079934542) — анонимизация 152-ФЗ (H6252-контракт), майнинг отказывает без гейта H6473 | ПОСТРОЕНО (v1) — питает 10-й аспект wheel-watch (monthly-волны) | ~0 ₽: LLM-судья < $0.01 / 100 текстов; SQLite stdlib; деплой в существующий systemd-юнит | _(пусто до визы; адопция локальной модели — через @DECIDE по результату H6474)_ |

## Что изменилось

- **`tools/sentiment_store.py`** (новый) — SQLite-сторадж (`data/sentiment/sentiment.db`, env `SK_GRADE_SENTIMENT_DB`); таблица `events` с одной колонкой `sentiment`; каждая запись фидбека — отдельная audit-строка (`kind='feedback'`), колонка зеркалится на скоринг-событие.
- **`tools/serve_grade.py`** — `POST /api/feedback?event=<id>&vote=up|down` (или JSON-тело); успешный `POST /api/grade` теперь возвращает `event_id` и пишет строку события (сбой стораджа не роняет грейдинг).
- **`tools/sentiment_judge.py`** (новый) — тональность v1 = LLM-судья через OpenRouter (`google/gemini-flash-1.5`, env `OPENROUTER_API_KEY`/`SK_SENTIMENT_MODEL`); принимает ТОЛЬКО уже обезличенный текст ({id,text} JSONL) — 152-ФЗ-контракт соблюдён на входе.
- **`tools/tg_mine_curators.py`** (новый) — v2-майнинг TG-чата кураторов; анонимизатор маскирует username/email/phone/t.me/URL и ОТБРАСЫЫВАЕТ сообщения с персоналиями («Имя Фамилия»); **gated-before-enable**: `--enable` без `SK_TG_MINING_GATE=APPROVED` + файла гейта `data/sentiment/tg_mining.gate` → отказ exit 3 (включение — юнит [H6473](https://github.com/gasyoun/Uprava/blob/main/handoffs/H6473-OxAlpha_SanskritKaraoke_sentiment-tg-mining-privacy-gate_11.10.26.md)).

## Не изменилось

Контракт `/api/grade`, CORS/12MB-cap/nginx/systemd деплой-механика, healthz-монитор (H6502), фронтенд student.html (захват UI-кнопками — @DO-остаток), сторонние sentiment-модели (не вводились).

## Проверки

| проверка | команда | результат |
|---|---|---|
| юнит+e2e оффлайн | `pytest tests/` | **34 passed** (8 новых: `tests/test_sentiment_signal.py`) |
| CI | PR [#184](https://github.com/gasyoun/SanskritKaraoke/pull/184) checks | **pass** (pytest+validate_library, Analyze, CodeQL, Changelog) |
| прод-канарейка 12-10-2026 | `curl -X POST samskrte.ru/sk-grade/api/feedback?event=h6455-live-test-1&vote=up` затем `vote=down` | **2 feedback-строки в сторадже .92, колонка sentiment события = `down`** |
| e2e 3 события → 3 строки | 3× `POST /api/feedback?event=h6455-live-c-1-*&vote=up` + подсчёт | **`CANARY_EXIT_0` (try 1/3)** |
| gate-негатив-контроль | `tg_mine_curators.py --enable` без гейта | **exit 3 GATE_CLOSED** |

Деплой-след: prod-клон `/opt/sk-grade/SanskritKaraoke` @ `c070fff` (merge #184), `systemctl restart sk-grade` → active, healthz 200 локально и публично. Фикс деплоя: `data/` создаётся `install -d -o deploy -g deploy -m 750` (root-owned repo-root не даёт deploy писать — внесено в ранбук ниже).

## Ранбук: дополнение к Deploy (vps92) — H6455-шаг

После `git fetch origin main && git reset --hard FETCH_HEAD`:

```
install -d -o deploy -g deploy -m 750 data data/sentiment   # сторадж тональности
systemctl restart sk-grade && systemctl is-active sk-grade
curl -s -X POST "https://samskrte.ru/sk-grade/api/feedback?event=canary-$(date +%s)&vote=up"   # -> {"ok":true,...}
/opt/sk-grade/venv/bin/python3 tools/sentiment_store.py count   # feedback_rows вырос на 1
```

## Остатки

- @DO: кнопки 👍/👎 в `student.html` → `POST /api/feedback` (UI-захват; эндпоинт жив, фронт не шлёт) — зарегистрировано GTD-строкой при закрытии H6455.
- TG-майнинг остаётся **выключенным до H6473** (приват-гейт; карта К7 — by design, не дефект). Гейт-документация H6473 готова 26-10-2026: политика [docs/security/TG_SENTIMENT_PRIVACY_GATE_H6473_2026-10-26.md](../docs/security/TG_SENTIMENT_PRIVACY_GATE_H6473_2026-10-26.md) (аудит-доступа, ретеншен, 152-ФЗ ≥k) + чеклист-виза включения [docs/security/TG_SENTIMENT_ENABLE_CHECKLIST_H6473_2026-10-26.md](../docs/security/TG_SENTIMENT_ENABLE_CHECKLIST_H6473_2026-10-26.md); пункт TG-майнинга остаётся **gated-before-enable** до финальной визы MG по чеклисту (A–C) и операционного включения на .92 (D).
- Пилот локальной RU-модели — H6474 против этого LLM-судьи на одном обезличенном наборе; адопция только через @DECIDE.

_Исполнитель: OxAlpha (opencode/z-ai/glm-5.3-flash), PR #184 (merge 12-10-2026T13:30Z), канарейка .92 12-10-2026 13:36Z._

_к.ф.н. М.Ю. Гасунс_
