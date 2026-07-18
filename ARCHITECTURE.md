# Sanskrit Karaoke — Architecture

Документ описывает текущее состояние и целевую архитектуру по каждой фазе из ROADMAP.md.

---

## Текущее состояние (as-is)

```
Browser (student)                   samskrtam.ru (nginx)
─────────────────                   ────────────────────
localStorage                        Static files only
  └── srs_state (per device)        index.html
  └── streak                        student.html
  └── lang                          catalogue.html
                                    progress.html
                                    src/scripts/app.js
                                    verses/data/*.json
                                    audio/ (MP3 files)
```

**Проблемы текущего состояния:**
- SRS прогресс привязан к устройству — смена телефона = потеря данных
- Учитель не видит прогресс студентов
- Добавление шлоки = 1-2 часа ручной работы (запись → разметка тайминга → JSON)
- Нет идентификации пользователей, хотя платящие студенты уже есть

---

## Целевая архитектура (to-be)

```
Telegram Channel                GitHub repo
─────────────────               ─────────────────────────────
  Ссылки на уроки               verses/data/*.json  (текст)
  Анонсы                        verses/audio/*.mp3  (аудио)
        │                                │
        │                                │  git push → GitHub Actions
        │                                │  (Whisper forced alignment)
        ▼                                ▼
Browser (student / teacher)     samskrtam.ru (nginx + Python API)
──────────────────────────────  ──────────────────────────────────
  Karaoke App (vanilla JS)  ←── Static files (app.js, HTML, CSS)
  SRS / Progress UI         
  Auth token (localStorage) ──► POST /api/srs        (sync progress)
                                GET  /api/progress    (load on open)
                                POST /api/auth/login  (JWT по userId)
                                                │
                                                ▼
                                        SQLite DB
                                        ─────────
                                        users
                                        srs_entries
                                        streaks
```

---

## Фаза 1 — Backend + Auth

### Стек

| Компонент | Решение | Обоснование |
|---|---|---|
| API | Python + FastAPI | Уже есть Python на сервере (`http.server`); FastAPI — минимальный overhead |
| БД | SQLite | Нет отдельного DB-сервера, <1000 студентов, embedded |
| Auth | JWT (HS256) | Самодельный сайт уже знает пользователей — выдаем токен при логине |
| Сессия | `localStorage['sk_token']` | Как Google Drive token сейчас |

### Схема авторизации

```
Самодельный сайт (samskrtam.ru)          Karaoke App
──────────────────────────────           ───────────────
1. Студент логинится на курс
2. Сайт генерирует JWT:                  
   { userId, name, exp: +30d }  ───────► localStorage['sk_token']
   подписан SECRET_KEY                   
                                         3. При каждом SRS-запросе:
                                            Authorization: Bearer <token>
                                            ▼
                                         /api/srs (Python FastAPI)
                                            └── проверяет JWT → userId
                                            └── пишет в SQLite
```

**Важно:** JWT-секрет один и тот же на самодельном сайте и на Python API — они на одном сервере, секрет берется из env-файла.

### Модель данных (SQLite)

```sql
CREATE TABLE users (
    id          TEXT PRIMARY KEY,  -- userId из самодельного сайта
    name        TEXT,
    created_at  INTEGER
);

CREATE TABLE srs_entries (
    user_id     TEXT,
    verse_id    TEXT,
    interval    REAL,              -- дни
    ease        REAL,              -- SM-2 ease factor
    due_date    INTEGER,           -- unix timestamp
    reps        INTEGER,
    PRIMARY KEY (user_id, verse_id)
);

CREATE TABLE streaks (
    user_id         TEXT PRIMARY KEY,
    current         INTEGER,
    longest         INTEGER,
    last_study_date TEXT            -- YYYY-MM-DD
);
```

### API endpoints (FastAPI)

```
POST /api/auth/login
     body: { userId, signature }  → JWT

GET  /api/progress
     header: Authorization        → { srs_entries[], streak }

POST /api/progress
     header: Authorization
     body: { verse_id, rating, new_interval, new_ease, due_date }
     → 200 OK

GET  /api/leaderboard             → top 20 by mastered_count (interval ≥ 21)
```

### Деплой на samskrtam.ru

```
nginx (уже работает)
  └── /api/  →  proxy_pass http://127.0.0.1:8001

systemd unit: sanskrit-api.service
  └── uvicorn api.main:app --host 127.0.0.1 --port 8001 --workers 1
```

---

## Фаза 2 — Auto-timing Pipeline

### Принятый контракт (18-07-2026)

- одна визуальная отметка на слог, без искусственного перехода на вторую mātrā внутри guru;
- начало подсветки = самый ранний слышимый onset слога: согласный или гласный у
  слога без начального согласного;
- слог подсвечен до начала следующего; в настоящей паузе красная точка исчезает;
- эталон поведения — одобренный `sample.mp4`;
- цель — проверка человеком **менее одной минуты на клип**.

### Целевой pipeline

```
оригинальное аудио + текст
          │
          ├─ автоматическая сегментация фраз и пауз
          ├─ существующий Taylor/chandas-анализ → pāda + mātrā constraints (для śloka)
          ├─ акустические признаки согласного onset + vowel onset/nucleus
          └─ монотонное 1:1 выравнивание известной последовательности слогов
                                  │
                                  ▼
                       timing JSON + confidence
                                  │
                                  ▼
                     Timing Editor: approval/flags only
```

Обучающий и проверочный материал берется из уже существующих пар:
`automatic-before JSON` ↔ `human-approved-after JSON` + оригинальное аудио. Профиль
калибруется под стабильную запись Уши (тот же голос, микрофон и условия). Шлоки,
прозаические сутры и ведийский материал проверяются раздельно. Подробности и измеренный
baseline: [ADR-0004](docs/adr/0004-approved-timing-corpus-alignment.md). Старый independent
RMS snap / равное деление на четыре части больше не является plan of record.

---

## Фаза 3 — Social

### Новые компоненты

```
/api/leaderboard   → таблица лидеров (из уже существующей БД)
/api/profile/:id   → публичный профиль

student.html       → кнопка "Поделиться результатом"
                     генерирует PNG-карточку (canvas API):
                     [имя] [streak: 🔥14] [mastered: 12 шлок]
                     → скачать / отправить в Telegram

progress.html      → добавить раздел "Топ студентов"
```

### Telegram-бот (уведомления)

```
Bot (python-telegram-bot, на том же сервере)
  └── Cron (каждый день 09:00 МСК):
      SELECT users WHERE due_today > 0
      → отправить "Сегодня к повторению: 3 шлоки → [ссылка]"
  
  └── Webhook /telegram/webhook → обрабатывает /start, /progress
```

Студент один раз отправляет `/start` боту → бот сохраняет `telegram_id → userId` в таблице `users`.

---

## Фаза 4 — Курс

### Структура страниц

```
samskrtam.ru/
  ├── /              → самодельный сайт (лендинг + оплата)
  ├── /shloka-wave   → authoring tool (index.html) — для учителя
  ├── /catalogue     → каталог шлок (catalogue.html)
  ├── /student?id=   → плеер (student.html)
  ├── /progress      → прогресс студента (progress.html)
  └── /course        → (новое) структурированный курс
        ├── /course/1-basics
        ├── /course/2-anustubh
        └── /course/3-tristubh
```

### Модель курса (новые таблицы)

```sql
CREATE TABLE lessons (
    id          TEXT PRIMARY KEY,
    module      TEXT,
    order_n     INTEGER,
    title_ru    TEXT,
    title_en    TEXT,
    verse_ids   TEXT   -- JSON array
);

CREATE TABLE assignments (
    id          TEXT PRIMARY KEY,
    lesson_id   TEXT,
    user_id     TEXT,
    due_date    TEXT,
    completed   INTEGER DEFAULT 0
);
```

---

## Технические ограничения и риски

| Риск | Вероятность | Митигация |
|---|---|---|
| Whisper дает плохой alignment для Sanskrit | Средняя | Fallback: линейная интерполяция + UI правки |
| SQLite медленно при >500 одновременных запросах | Низкая (аудитория небольшая) | WAL mode; при росте — Postgres |
| JWT-секрет утечет | Низкая | Хранить в `.env`, не в репо; rotation раз в год |
| GitHub Actions минуты кончатся | Низкая | 2000 мин/мес бесплатно; alignment ~1 мин/шлока |

---

## Порядок реализации (детально)

```
Неделя 1-2:   FastAPI скелет + SQLite schema + /api/progress endpoints
Неделя 3:     JWT auth + интеграция с самодельным сайтом
Неделя 4:     Миграция localStorage → /api/progress в app.js / srs.js
Неделя 5-6:   tools/align.py (Whisper) + GitHub Actions workflow
Неделя 7:     UI проверки авто-тайминга в index.html
Неделя 8-9:   Telegram-бот + уведомления
Неделя 10-11: Leaderboard + профили + share-карточки
Неделя 12+:   Структура курса
```
