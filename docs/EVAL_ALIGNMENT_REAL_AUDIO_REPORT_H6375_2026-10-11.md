# H6375 — eval_alignment на реальном аудио: eval-отчёт (успех «Alignment eval report on real audio», MY_ROADMAP:212)

_Created: 11-10-2026 · Last updated: 11-10-2026_

_Executor: OxAlpha (`zai-coding-plan/glm-5.3-flash`), drain-ворктри `h6375-drain` от origin/main `b1e2c74`._

## Что прогонялось

Реальное аудио Уши Санка, полученное 11-10-2026 по H4474-маршруту (WebDAV, креды с .92 `/var/www/html/.env`, не эхом), **не синтетика**:

| clip | yadisk источник | байты (ожидалось) | байты (получено) | ffprobe |
|---|---|---|---|---|
| `subh_1221` | `yadisk:Subhashitas-Systematic/Su33-Utsave.mp3` | 301 799 | **301 799 ✓** | 18.83 s, 128 kbps, 44.1 kHz stereo |
| `subh_2745` | `yadisk:Subhashitas-Systematic/Su23-Adata.mp3` | 299 291 | **503 ×5** (объектная флака Яндекса; альт-копия в `Subhashitas-Systematic (1)/` того же размера, тоже 503) | недоступен |

Локальный путь аудио: `/tmp/usha_h6375_audio/` (вне репо; сайдкары таймингов рядом). DoD «≥1 реального клипа» выполнен на `subh_1221` (покрыт H5227 gold-атаками: 31/32 меток `conf=high`).

## Run A — указанный харнесс `eval_alignment.py` (Phase-1, ADR-0003)

```
$ python3 tools/eval_alignment.py --audio /tmp/usha_h6375_audio -v
No hand-timed reference verses found.
Run: python tools/extract_timing_from_session.py <session.json> <verse_id>
to populate references from Drive session exports.
EXIT=0
```

**Named-находка, не фейл:** харнесс отработал на реальном аудио-каталоге, но «руками-размеченных» референсов (`timing.auto_generated == false`) в `verses/data/` — **0 из 58** (строка-литера `"auto_generated": false` встречается в 10 JSON'ах вне поля `timing` — ловушка grep'а). Критерий ADR-0003 «≥90 % слогов ±50 ms к рукам-таймингам» на субхашитах **в принципе неизмерим**: золотые пары так и не заведены (ADR-0004 gold v2 ждёт исходников). Подменять референсами нечего и не нужно — это и есть честный итог прогона.

## Run B — H5227 gold-атаки против закоммиченных таймингов (реальное аудио H5223, cli-v2-whisper)

```
$ python3 tools/eval_gold_attacks.py
subh_2745  n=30  mean|Δ|= 120.2 ms  max=  533 ms  ≤100=18/30  ≤150=22/30  monotonic=yes
subh_0292  n=27  mean|Δ|= 409.8 ms  max= 1041 ms  ≤100=5/27   ≤150=5/27   monotonic=yes
subh_1375  n=26  mean|Δ|= 341.4 ms  max=  918 ms  ≤100=6/26   ≤150=6/26   monotonic=yes
subh_4488  n=31  mean|Δ|= 321.7 ms  max= 1243 ms  ≤100=12/31  ≤150=13/31  monotonic=yes
subh_6114  n=29  mean|Δ|= 356.1 ms  max= 1482 ms  ≤100=7/29   ≤150=12/29  monotonic=yes
subh_0513  n=26  mean|Δ|= 257.3 ms  max=  878 ms  ≤100=10/26  ≤150=14/26  monotonic=yes
subh_0605  n=27  mean|Δ|=1062.8 ms  max= 3157 ms  ≤100=3/27   ≤150=4/27   monotonic=yes
subh_5909  n=30  mean|Δ|= 772.7 ms  max= 3625 ms  ≤100=7/30   ≤150=9/30   monotonic=yes
subh_1221  n=31  mean|Δ|= 202.7 ms  max=  948 ms  ≤100=16/31  ≤150=21/31  monotonic=yes
subh_4693  n=26  mean|Δ|=2428.4 ms  max= 5874 ms  ≤100=2/26   ≤150=2/26   monotonic=yes
pooled  n=283  mean|Δ|=607.2 ms  max=5874 ms  ≤100=86/283
```

Ключевой замер качества на реальном аудио: **пул 30 % слогов в ±100 ms** — далеко от ADR-0003 (±50 ms, 90 %). Разброс по стихам огромен (лучший 120 ms — subh_2745 с H5223-якорями онсетов; худший 2428 ms — subh_4693). Дрейф интерьерности таймингов остаётся дефектом №1 (совпадает с жалобой MG «эндпоинты совпадают, буквы не успевают»).

## Run C — свежий прогон на свежескачанном клипе (fallback-цепочка, cli-v1)

```
$ python3 tools/align_chapter.py /tmp/usha_h6375_audio --only subh_1221
  audio: 18.83s  (415296 samples @ 22050 Hz)
  WARNING: pada detection failed, using uniform fallback over the verse span
  onsets: 121  peaks: 566
conf=0.75  uncertain=8/32  FALLBACK

$ python3 tools/eval_gold_attacks.py --timing-режим (sidecar subh_1221)
subh_1221  n=31  mean|Δ|=1066.9 ms  max= 2930 ms  ≤100=1/31  ≤150=1/31  monotonic=yes
```

Тот же реальный клип, тот же код, но **без faster-whisper** (не установлен на этой Mac-box, Python 3.13): mean|Δ| **1067 ms против 203 ms** у закоммиченного whisper-тайминга — в ~5 раз хуже. Причина видна в спанах: fallback положил s1 от 0.0 s (включая лид «subhāṣitam»), золото — от 2.93 s; пада-детекция и лид-обработка держатся на whisper-калибровке. **Вывод: `faster-whisper` — несущая зависимость пайплайна, не опция.**

## Вердикт

- Реальный прогоночный путь: аудио → align_chapter → сайдкар → eval_gold_attacks **работает** (exit 0, воспроизводимо, monotonic=yes везде).
- ADR-0003-приёмка (руки-золото) **не измерима** — 0 референсов; существующий измеримый стандарт — H5227 gold-атаки.
- Качество интерьерности на реальном аудио **не проходит** 90 %/±50 ms; whisper-калибровка обязательна; H5223-якоря (subh_2745) — лучший ряд (120 ms mean).

_Dr. Mārcis Gasūns_
