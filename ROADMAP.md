# Sanskrit Karaoke — Product Roadmap

**Vision:** двуликий инструмент — authoring-студия для учителя и интерактивный курс для студента,
живущий на samskrtam.ru, с платящей аудиторией уже сейчас.

---

## Фазы

### Phase 1 — Backend & Auth (месяцы 1–2)
*Цель: одинаковый прогресс на любом устройстве.*

Сейчас SRS-состояние хранится в `localStorage` — при смене устройства или браузера всё теряется. Это критично для платящих студентов.

- [ ] Подключить Firebase / Supabase: auth + Firestore/realtime DB
- [ ] Перенести SRS-состояние (streak, intervals, ratings) из localStorage в облако
- [ ] Google-логин на student/progress/catalogue страницах
- [ ] Teacher dashboard: кто из студентов что изучал, какой streak

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
- [ ] Расширить детектор метров: Mālinī, Śārdūlavikrīḍita, Vasantatilaka, Sragdharā

---

### Backlog (без срока)

- Словарные подсказки: клик на слово → перевод из Apte / Monier-Williams
- Открытый контрибьют: форма для добавления шлоки внешним учителем (с модерацией)
- Восстановить tapping mode (временно отключен)
- Исправить Drive file replacement (старый файл не удаляется)
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
