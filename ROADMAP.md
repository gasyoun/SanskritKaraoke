# Sanskrit Karaoke — Product Roadmap

_Created: 14-05-2026 · Last updated: 26-08-2026_

> **Truth-pass 18-08-2026 (H3000).** This file is a *product vision* roadmap and
> its phases stay as written. What it cannot show is that the product is not
> stalled on engineering: the app shipped at **v1.4.8** and every remaining
> product step waits on Уша Санка's written permission and her chapter audio —
> two artefacts only a human can supply. Phase 2's first open unit (TTS) is
> deliberately **not** scheduled: generating synthetic audio while waiting for a
> named reciter's recordings is a product-premise decision, not a drain unit.
> Open items sorted by what actually blocks them:
> [docs/ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/ROADMAP_SANSKRITKARAOKE_AUDIO_GATE_RESIDUAL_2026H2.md).

**Vision:** двуликий инструмент — authoring-студия для учителя и интерактивный курс для студента,
живущий на samskrtam.ru, с платящей аудиторией уже сейчас.

---

## Фазы

### Phase 1 — Backend & Auth (месяцы 1–2)
*Цель: одинаковый прогресс на любом устройстве.*

Сейчас SRS-состояние хранится в `localStorage` — при смене устройства или браузера всё теряется. Это критично для платящих студентов.

**Статус (29-07-2026, H1879):** первые три пункта уже реализованы кодом (MY_ROADMAP.md
Phase 5 · `.ai_state.md` v1.4.0–v1.4.2 — Firebase Cloud Sync (Auth + Firestore) shipped);
чекбоксы просто не были проставлены после этого. Реально открыты только
cross-page auth-wiring консолидация (три страницы по-разному подключают Firebase auth —
см. `.ai_state.md` Dev Notes) и teacher dashboard.

- [x] Подключить Firebase / Supabase: auth + Firestore/realtime DB
- [x] Перенести SRS-состояние (streak, intervals, ratings) из localStorage в облако
- [x] Google-логин на student/progress/catalogue страницах (live acceptance test still pending — blocked on M.G. at password/2FA, see `.ai_state.md`)
- [x] Teacher dashboard: кто из студентов что изучал, какой streak ([PR #56](https://github.com/gasyoun/SanskritKaraoke/pull/56) — `teacher.html`; Firestore `firestore.rules` deploy is an owner residual, see PR body)

**Технические решения:** Firebase Auth + Firestore (бессерверный, бесплатный тариф покрывает сотни студентов).

---

### Phase 2 — Auto-timing Agent (месяцы 2–4)
*Цель: добавить новую шлоку за 10 минут вместо 1–2 часов.*

Сейчас каждая шлока требует ручной разметки тайминга в Timing Editor. Это узкое горлышко роста контента.

- [ ] Интеграция TTS (Google Cloud TTS Sanskrit / ElevenLabs) для генерации аудио
- [ ] Forced-alignment pipeline: text + audio → per-syllable timestamps автоматически
  - Вариант A: Whisper + CTC alignment (локально/дешево)
  - Вариант B: Assembly AI forced alignment API
- [ ] Verse agent: на входе текст шлоки → на выходе готовый JSON с таймингом для проверки учителем
- [ ] UI-режим "проверка авто-тайминга": учитель слышит + видит авто-разметку, правит только расхождения

**Связь с AGENTS.md:** это следующий шаг агентного pipeline после `verse_agent_raw.py`.

---

### Phase 3 — Social & Engagement (месяцы 3–5)
*Цель: студенты возвращаются каждый день, видят свой прогресс и прогресс других.*

- [ ] Публичный профиль студента: аватар, streak, count mastered, список изученных шлок
- [ ] Leaderboard: топ по verses mastered / longest streak (опционально — только для своей группы)
- [ ] Поделиться результатом: кнопка "отправить в Telegram" — картинка с именем + прогрессом
- [ ] Уведомления из бота: "Сегодня 3 шлоки к повторению" (Telegram Bot API)
- [ ] Teacher view: таблица студентов с последней активностью

---

### Phase 4 — Структурированный курс (месяцы 5–8)
*Цель: samskrtam.ru становится полноценным курсом, а не просто инструментом.*

- [ ] Страницы уроков на samskrtam.ru: текст + встроенный плеер + задание
- [ ] Curriculum path: последовательность шлок по уровням (начальный / средний / продвинутый)
- [ ] Assignments: учитель назначает шлоку группе студентов с дедлайном
- [ ] Certificate of completion (PDF) за прохождение уровня
- [x] Расширить детектор метров: Mālinī, Śārdūlavikrīḍita, Vasantatilaka, Sragdharā
  (уже было реализовано в `METER_DATA.samavritta` — `app.js:2668`; проверено headless-тестом
  [tools/test_meter_detector.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/test_meter_detector.py):
  все четыре метра зарегистрированы, round-trip и уникально распознаются; 26-08-2026)

---

### Backlog (без срока)

- Словарные подсказки: клик на слово → перевод из Apte / Monier-Williams
- Открытый контрибьют: форма для добавления шлоки внешним учителем (с модерацией)
- [x] Восстановить tapping mode (временно отключен)
  (восстановлен 26-08-2026: кнопка «⏺ Тэппинг» + сброс + скорость воспроизведения +
  пара ▶/■ снова в `tap-block` под Редактором тайминга; null-safe гварды в
  `startTapping`/`resetTapping`/`karaokePlay`/`karaokeStop`; i18n ключи `tapBtn`
  и др. в `strings.js` ru+en — коммит `0e2f6a4`)
- [x] Исправить Drive file replacement (старый файл не удаляется)
  (исправлено 26-08-2026: `gdriveSave` теперь находит ВСЕ файлы с тем же именем
  в целевой папке (не только выбранный в диалоге), загружает новый файл и удаляет
  старые копии после успешной загрузки; неудачное удаление больше не глотается
  молча — показывается предупреждение с id и HTTP-статусом — коммит `0e2f6a4`)
- Apte prosody cross-check modal

---

## Метрики успеха (через 6 месяцев)

| Метрика | Сейчас | Цель |
|---|---|---|
| Шлок в каталоге | ~10 | 50+ |
| DAU (активных студентов/день) | ? | 30+ |
| Средний streak | ? | 7+ дней |
| Время добавления шлоки | ~2 ч | < 15 мин |

---

## Технический стек (плановый)

| Слой | Решение |
|---|---|
| Frontend | Без изменений (vanilla JS, static) |
| Auth + DB | Firebase Auth + Firestore |
| TTS | Google Cloud TTS (Sanskrit voice) |
| Alignment | Whisper + `torchaudio` CTC forced alignment |
| Notifications | Telegram Bot API |
| Hosting | Текущий сервер samskrtam.ru |

_Dr. Mārcis Gasūns_
