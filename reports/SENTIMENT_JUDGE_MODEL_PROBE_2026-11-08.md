# Живая проба моделей OpenRouter для sentiment-судьи v1 (Y23 / H6455, residual H6474)

_Created: 08-11-2026 · Last updated: 08-11-2026_

Контекст: прод-дефолт `tools/sentiment_judge.py` `DEFAULT_MODEL = google/gemini-flash-1.5` мёртв (404, H6474), выбор замены — @DECIDE-виза MG (прод-поведение). Пробы сделаны реальными API-вызовами OpenRouter 08-11-2026 с Mac (OpenRouter гео-блокирует RU-IP .92 — 403 pre-auth, нога судьи всегда шла с US-выхода/magenta-duck, H6474). Ключ читался из opencode auth-store, в логи не печатался. Сырые ответы — ниже, дословно.

## Пробы (по 1 вызову, judge-PROMPT v1, `max_tokens=8`, `temperature=0`, RU-текст «Автопроверка произношения очень помогает…»)

| # | Слаг | HTTP | Латентность | content (дословно) | reasoning tok / completion tok |
|---|---|---|---|---|---|
| 1 | `google/gemini-flash-1.5` (негативный контроль) | **404** | 0.60 s | — | — |
| 2 | `google/gemini-3.6-flash` (пилотный слаг H6474) | 200 | 1.69 s | **`null`** | 4 / 4 (всё — reasoning) |
| 3 | `google/gemini-2.5-flash` | 200 | 0.96 s | `"up"` | 0 / 1 |
| 4 | `google/gemini-3.6-flash`, `max_tokens=400` (доп. проба механизма) | 200 | 2.69 s | `"up"` | 229 / 230 |

Сырой error-body пробы 1 (дословно, без `user_id`): `{"error": {"message": "google/gemini-flash-1.5 is no longer available on OpenRouter: no provider serves this model anymore. See available models at https://openrouter.ai/models", "code": 404}}`.

## Чтение

1. **Слаг-дефолт мёртв подтверждён живой пробой** — 404 «no provider serves this model anymore», не список/слух.
2. **`gemini-3.6-flash` — ловушка для v1-параметров.** Судья v1 шлёт `max_tokens=8`; reasoning-модель 3.6 сжигает бюджет на рассуждение и возвращает `content=null` → строгий parse роняет **каждый** вердикт в neutral, молча. С бюджетом 400 отвечает корректно, но жжёт 229 reasoning-токенов на вердикт (~30× completion против 2.5-flash; H6474 мерил 298). На пилотном корпусе 27-10 отвечала и русскими словами («положительно») — фикc RU-парса в [tools/sentiment_judge.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/sentiment_judge.py) закрывает обе проблемы парса (RU-синонимы + видимый `raw` в каждой строке, включая `raw=null`).
3. **`google/gemini-2.5-flash` — чистый drop-in**: отвечает строго одним EN-словом (`"up"`), 0 reasoning-токенов, 1 completion-токен, суб-секундная латентность. Не «думает», контракт «ответь строго одним словом» выполняет.

## Рекомендация в @DECIDE-визу (PR дефолт-флипа, ready-for-MG)

`DEFAULT_MODEL: google/gemini-flash-1.5 → google/gemini-2.5-flash` — единственный из пробованных слаг, который при неизменных v1-параметрах судьи (`max_tokens=8`) возвращает валидный вердикт. Оверрайд всегда доступен через `SK_SENTIMENT_MODEL` без кода. Альтернатива 3.6-flash потребовала бы поднимать `max_tokens` (~30× токенов/вердикт) — не рекомендую.

Пробы: 4/4 выполнены, ни одна не выдумана; сырой лог вызовов хранится в сессии исполнения (в репо — эта сводка, персональных данных нет).

_к.ф.н. М.Ю. Гасунс_
