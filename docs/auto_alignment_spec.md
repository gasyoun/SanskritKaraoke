# Auto-Alignment: технический дизайн

Цель: сократить ручную разметку тайминга с 10–30 мин до 2–5 мин для одного чтеца с устойчивым темпом.

---

## Принцип работы

Система состоит из трёх слоёв, каждый уточняет предыдущий:

```
[1. Корпусное масштабирование]  →  грубая оценка (±0.5s)
        ↓
[2. Онсет/пик детекция]         →  точная позиция  (±0.05s)
        ↓
[3. Оценка уверенности]         →  флаг неясных слогов
        ↓
[Timing Editor: учитель правит только флаги]
```

---

## Слой 1: Корпусное масштабирование

**Откуда берётся начальная оценка:**

В каталоге уже есть N шлок с размеченным таймингом (хранится в `timing.s1/s2` в JSON, см. ниже). Для новой шлоки:

1. Найти ближайшую в корпусе: тот же метр → если нет, ближайшее количество слогов
2. Взять её тайминг и пропорционально масштабировать:
   ```
   scaled_t[i] = corpus_t[i] × (new_duration / corpus_duration)
   ```
3. Результат: все ползунки расставлены примерно правильно

Работает хорошо потому что: один чтец, медленный темп, метрически структурированный текст (anuṣṭubh — 8 слогов × 4 пады, все похожи).

---

## Слой 2: Детекция онсета / пика

**Теория:** Каждый слог начинается с резкого роста энергии (онсет). Но у санскритских полугласных (я, в, р, л) граница слога лучше ловится на *пике* амплитуды, а не на фронте атаки.

**Реализация (Web Audio API, в браузере):**

```javascript
function detectOnsets(audioBuffer) {
  const data = audioBuffer.getChannelData(0); // PCM float32
  const sr = audioBuffer.sampleRate;
  const winSamples = Math.round(0.005 * sr); // 5ms окно
  const hopSamples = Math.round(0.002 * sr); // 2ms шаг

  const rms = [];
  for (let i = 0; i < data.length - winSamples; i += hopSamples) {
    let sum = 0;
    for (let j = 0; j < winSamples; j++) sum += data[i+j] ** 2;
    rms.push({ t: i / sr, energy: Math.sqrt(sum / winSamples) });
  }

  // Найти локальные максимумы производной (onset = резкий рост)
  const onsets = [], peaks = [];
  for (let i = 2; i < rms.length - 2; i++) {
    const diff = rms[i].energy - rms[i-2].energy;
    if (diff > threshold && diff > rms[i-1].energy - rms[i-3].energy) {
      onsets.push(rms[i].t);
    }
    if (rms[i].energy > rms[i-1].energy && rms[i].energy > rms[i+1].energy) {
      peaks.push(rms[i].t);
    }
  }
  return { onsets, peaks };
}
```

**Привязка к слогу:**

Для каждого слога берём его грубую оценку `t0` из слоя 1, смотрим в окне `[t0 - 150ms, t0 + 150ms]` и ищем ближайший кандидат нужного типа согласно таблице фонем.

---

## Слой 3: Таблица фонем (phoneme_rules.json)

**Файл `tools/phoneme_rules.json`:**

```json
{
  "version": 1,
  "note": "initial consonant of syllable (IAST) → where to place the timing marker",
  "rules": {
    "y":  { "align_to": "peak",  "offset_ms": 0 },
    "v":  { "align_to": "peak",  "offset_ms": 0 },
    "r":  { "align_to": "peak",  "offset_ms": 0 },
    "l":  { "align_to": "peak",  "offset_ms": 0 },
    "m":  { "align_to": "onset", "offset_ms": -15 },
    "n":  { "align_to": "onset", "offset_ms": -15 },
    "ṅ":  { "align_to": "onset", "offset_ms": -10 },
    "default": { "align_to": "onset", "offset_ms": 0 }
  }
}
```

**Начальные правила:** вписаны вручную учителем (5 минут).

**Автообогащение (`tools/analyze_phoneme_patterns.py`):**
- Читает все JSON с `timing` + скачивает аудио с Drive
- Для каждого слога: берёт окно ±200ms вокруг известного тайминга
- Измеряет расстояние до ближайшего онсета и ближайшего пика
- Записывает: `initial_consonant → {"closest": "onset|peak", "avg_offset_ms": N}`
- Обновляет `phoneme_rules.json`

Система самообучается: каждая новая подтверждённая шлока уточняет правила.

---

## Оценка уверенности

```javascript
function computeConfidence(t, syllable, onsets, peaks) {
  const rule = getRule(syllable); // из phoneme_rules.json
  const candidates = rule.align_to === 'peak' ? peaks : onsets;
  
  const nearest = candidates.reduce((a, b) =>
    Math.abs(b - t) < Math.abs(a - t) ? b : a, Infinity);
  
  const dist = Math.abs(nearest - t);
  
  if (dist < 0.03) return 1.0;   // < 30ms: отлично
  if (dist < 0.07) return 0.7;   // < 70ms: хорошо
  if (dist < 0.15) return 0.4;   // < 150ms: сомнительно
  return 0.1;                    // далеко: флаг
}
```

Слоги с `confidence < 0.5` подсвечиваются в Timing Editor оранжевым.

---

## Изменения в Timing Editor (UI)

### Новая кнопка "Авто"

```
[◀ Пада] [Слоги] [▶]   [▶ Авто ✨]
```

Нажатие:
1. Запускает слои 1–3
2. Заполняет все `TAP.times.s1/s2`
3. Раскрашивает слоги: зелёный = уверен, оранжевый = проверь
4. Курсор прыгает на первый оранжевый слог

### Новые клавиши

| Клавиша | Действие |
|---|---|
| `Tab` | Следующий слог с низкой уверенностью |
| `Shift+Tab` | Предыдущий |
| `Enter` | Подтвердить текущий (убрать оранжевый) |
| `A` | Accept all — принять всё без review |

### Маркеры на осциллограмме

Поверх существующей волны: маленькие вертикальные тики — детектированные кандидаты. Текущий выбранный кандидат — яркий, остальные — полупрозрачные. Клик по тику → назначает его текущему слогу.

---

## Изменения в схеме данных

### verse.schema.json — новое поле `timing`

```json
"timing": {
  "type": "object",
  "description": "Per-syllable timestamps (seconds from audio start)",
  "properties": {
    "s1": { "type": "array", "items": { "type": "number" } },
    "s2": { "type": "array", "items": { "type": "number" } },
    "confidence": {
      "type": "object",
      "properties": {
        "s1": { "type": "array", "items": { "type": "number", "minimum": 0, "maximum": 1 } },
        "s2": { "type": "array", "items": { "type": "number", "minimum": 0, "maximum": 1 } }
      }
    },
    "auto_generated": { "type": "boolean" },
    "generator":      { "type": "string", "description": "browser-v1 | whisper-v1" }
  }
}
```

### Экстракция из существующих сессий

Одноразовый скрипт для популяции корпуса из уже существующих Drive-сессий:

```python
# tools/extract_timing_from_session.py
# Запуск: python tools/extract_timing_from_session.py path/to/session.json bhg_2_47
# Читает tapTimes из session JSON, дополняет verse JSON полем timing

import json, sys
session = json.load(open(sys.argv[1]))
verse_path = f'verses/data/{sys.argv[2]}.json'
verse = json.load(open(verse_path))
verse['timing'] = {
    's1': session['tapTimes']['s1'],
    's2': session['tapTimes']['s2'],
    'auto_generated': False,
    'generator': 'manual'
}
json.dump(verse, open(verse_path, 'w'), ensure_ascii=False, indent=2)
```

---

## Фаза B: GitHub Actions + Whisper (upgrade)

Когда браузерного алгоритма недостаточно (сложный метр, нестандартный темп):

```yaml
# .github/workflows/align.yml
on:
  push:
    paths: ['verses/data/*.json']

jobs:
  align:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Whisper
        run: pip install openai-whisper torch
      - name: Download audio from Drive
        run: python tools/download_audio.py ${{ env.VERSE_ID }}
        env:
          GDRIVE_SERVICE_ACCOUNT: ${{ secrets.GDRIVE_SA_JSON }}
      - name: Run alignment
        run: python tools/align_whisper.py ${{ env.VERSE_ID }}
      - name: Commit timing
        run: |
          git config user.name "align-bot"
          git commit -am "auto-timing: ${{ env.VERSE_ID }}"
          git push
```

Публичный репо → GitHub Actions бесплатны без лимита минут. Один Whisper-запуск (~1 мин) не требует платного тарифа.

---

## Порядок реализации

```
Неделя 1:  extract_timing_from_session.py — экстрагировать тайминг из 10-30 существующих сессий
           Добавить поле timing в schema + 3 существующих JSON

Неделя 2:  detectOnsets() в браузере (Web Audio API)
           Маркеры кандидатов на осциллограмме

Неделя 3:  phoneme_rules.json (начальная версия вручную)
           Corpus scaling (слой 1)
           Кнопка "Авто" в Timing Editor

Неделя 4:  Оценка уверенности + подсветка оранжевым
           Tab / Shift+Tab / Enter в Timing Editor
           Тест: сравнить авто vs ручную разметку на 3 шлоках

Неделя 5:  analyze_phoneme_patterns.py — автообогащение правил
           
Неделя 6+: GitHub Actions + Whisper (если браузера недостаточно)
```

---

## Ожидаемый результат

| Этап | Время разметки |
|---|---|
| Сейчас (полностью вручную) | 10–30 мин |
| После недели 3 (корпус + кнопка Авто) | ~5 мин |
| После недели 4 (флаги + Tab) | ~2–3 мин |
| После Whisper (Фаза B) | ~1–2 мин |
