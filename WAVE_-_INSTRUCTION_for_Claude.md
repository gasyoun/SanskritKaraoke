# Инструкция для продолжения работы над проектом Sanskrit Wave

## Проект
**Волновая нотация санскрита** — веб-приложение для визуализации метрической структуры санскритских шлок в виде волновой диаграммы с аудио-таймингом и экспортом в видео-карaoке.

## Рабочие файлы
- Последняя версия: **v1.4.0**
- История версий: `ver_info.txt` и `changelog.md`

## Правила работы
1. **Всегда** читать `ver_info.txt` перед началом — там полная история
2. **Всегда** увеличивать номер версии при каждом новом архиве
3. **Всегда** обновлять `ver_info.txt` с описанием изменения
4. **Всегда** обновлять `v1.NNN` в `index.html` (в `<title>` и в `<span>` после `<h1>`)
5. Синтаксис проверять: `node --check src/scripts/app.js`
6. Архив: `zip -r /mnt/user-data/outputs/html_vNNN.zip .` из `/home/claude/project/`
7. Исключать из архива: `--exclude "src/scripts/app.js.bak"`

## Архитектура

### Файлы
- `index.html` — интерфейс учителя (авторский инструмент)
- `student.html` — плеер для студентов (генерируется `tools/make_student.py`)
- `catalogue.html` — каталог шлок библиотеки
- `progress.html` — дашборд прогресса студента
- `src/scripts/app.js` — вся логика приложения (~480KB)
- `src/scripts/srs.js` — алгоритм SM-2 и страйки
- `src/scripts/quizzes.js` — интерактивные квизы
- `src/style.css` — стили (включая .tg-dark)
- `verses/index.json` — индекс библиотеки (автоматически обновляется CI)
- `ver_info.txt` — история версий
- `changelog.md` — подробный лог изменений

### Ключевые структуры данных
```javascript
DATA = { s1: [...], s2: [...] }
// Каждый слог: { syl, type:'guru'|'laghu', row, col, devSyl, arrow,
//               vipula:'culprit'|'group'|undefined, vipulaType:string|undefined }

TAP = {
  times: { s1: [t0,t1,...], s2: [t0,t1,...] },
  cheatY: { s1: [], s2: [] },
  zoom, offset, drag, pan, hover, selected,
  _playStartT, _playStopT, _playMode, _userPaused,
  _stepCallback, _circleY, _lineEndY, _cH, _cheatH,
  _cheatDrag,
}

_padaBounds = [[t0,t1], [t0,t1], [t0,t1], [t0,t1]]  // 4 пады
_lastVipulaLabel = null  // последняя метка метра для восстановления випулы

// Режим 1
TE_MODE = 'padas' | 'timing'
_teCurrentPada = -1
_teR1Mode = null      // 'all'|'pada'|'cur'
_teR1Active = false

// Режим 2
const TE = {
  zoom, offset, drag, pan,
  hover: null, selected: null,  // { key, idx }
  canvas, ctx,
  _circleY, _lineEndY, _cH, _cheatH, _cheatDrag,
  _playStartT, _playStopT, _playMode, _userPaused, _stepCallback,
}
```

### Маппинг пад → строфы
- s1 пада 0: индексы 0..half1-1  (half1 = Math.ceil(DATA.s1.length/2))
- s1 пада 1: индексы half1..end
- s2 пада 2: индексы 0..half2-1
- s2 пада 3: индексы half2..end

## Google Drive
```javascript
const GDRIVE = {
  clientId: '66648692430-60h3g4a5qa5j8iehjdojak436ph5h6n1.apps.googleusercontent.com',
  apiKey:   'AIzaSyDVK1eD272C7qHa-cmMokWFqfqfbsW8VVk',
  folderId: '1L4m_UG4XMOcswDRWZUk--2xxrcasHFrs',
  scopes:   'https://www.googleapis.com/auth/drive',  // не drive.file!
  tokenClient: null, accessToken: null,
}
```
- Scope `drive` (не `drive.file`) — пользователи видят расшаренную папку
- Одна кнопка **«Открыть»**: папка → навигация, файл → загрузить/заменить
- При сохранении аудио не дублируется — проверяется наличие аудио в папке через API
- Токен кешируется в localStorage с проверкой scope

## Редактор тайминга

### Режим 1: Разметка пад
- **«Указать пады»** — 8 линий с зазором 0.5с; начало пады ≥ конец предыдущей
- **Клик внутри пады** — выделяет паду, ставит `audio.currentTime` в точку клика
- **▶▶** (`teR1Play('all')`) — вся шлока от начала
- **▶|** (`teR1Play('pada')`) — пада от начала; повторное нажатие = пауза; следующее = снова с начала (не продолжает с места паузы!)
- **▶…** (`teR1Play('cur')`) — от текущей позиции до конца пады; пауза/продолжение
- Масштаб `te-zoom-select-r1` синхронизирован с колёсиком

### Режим 2: Тайминг слогов

#### Layout панели
- **Ряд 1**: ▶▶(Ctrl+Space) ▶|(Ctrl+Enter) ▶N[N] ▶•(Enter) ▶›(Space) + Масштаб
- **Ряд 2**: ◂(Ctrl+←) ⟵Выровнять(Home) ▸(Ctrl+→)
- **Ряд 2б**: ◀(←) ▶(→) — выбор предыдущего/следующего слога
- **Ряд 3**: timing-editor-info + te-stats + кнопка **Закрыть** (синяя, справа)

#### Горячие клавиши (только когда открыт редактор, не в input)
| Клавиша | Действие |
|---------|----------|
| `←` / `→` | Выбрать предыдущий / следующий слог |
| `Ctrl+←` / `Ctrl+→` | Сдвинуть слог на −0.01с / +0.01с |
| `Home` | Выровнять к началу |
| `Enter` | Проиграть текущий слог (▶•) |
| `Space` | Проиграть слог и перейти к следующему (▶›) |
| `Ctrl+Space` | До конца шлоки (▶▶) |
| `Ctrl+Enter` | До конца пады (▶|) |

#### Ключевые функции режима 2
```javascript
teSelectAdjacentSyl(delta)  // ◀▶: выбор слога + currentTime + скролл + TE._playStartT
teShiftSyl(delta)           // ◂▸: сдвиг + пауза + перезапуск если играло + скролл
teAlignToStart()            // Home: авторазбивка от начала пады до текущего слога
timingEditorPlaySyl()       // ▶•: проиграть текущий слог без перехода
timingEditorPlayStep()      // ▶›: проиграть слог и перейти к следующему
timingEditorPlay(mode)      // базовая функция: для syllables берёт TAP.times[sel]; для pada берёт t0 пады
timingEditorPlayOrPause(mode) // пауза/продолжение/новый старт
```

#### Важные детали
- `timingEditorPlay('syllables')` — всегда берёт `TAP.times[key][idx]` выбранного слога
- `timingEditorPlay('pada')` — всегда начинает с `_padaBounds[padaIdx][0]`
- `teR1Play('pada')` — повторное нажатие НЕ продолжает с места паузы, а начинает заново
- При открытии окна первый слог автоматически выбирается, `TE._playStartT = times[0]`
- Выбор слога переносит `audio.currentTime` и обновляет `TE._playStartT`
- Сдвиг клавиатурой: останавливает воспроизведение → сдвигает → запускает заново

## Випула (anuṣṭubh)

### Определение
- Вызывается в: `runPipeline`, `ftDetectMeter`, `_applySession`
- `detectAndMarkVipula(meterLabel)` — проверяет каждую нечётную паду отдельно по regex
- Помечает слоги: `s.vipula = 'culprit'|'group'`, `s.vipulaType = 'ma-vipulā'|...`
- `_lastVipulaLabel` — хранит метку, восстанавливает пометки после пересборки DATA

### Визуализация в SVG
- Слог-виновник (5-й): оранжевая штриховка 45° (`vp-culprit-${key}`)
- Группа (6-7): синяя штриховка 135° (`vp-group-${key}`)
- Слоги випулы на row=0: подпись **снизу** (сверху место для рамки)
- Рамка: левая = середина (x4+x5)/2, правая = (x7+x8)/2; верх над кружками; низ под текстом; `pointer-events="none"`
- Подпись над рамкой: `bha-vipulā (gll)`
- SVG высота +20px при наличии випулы

### Вывод в showMsg (3 строки)
```
✓ Размер: anuṣṭubh / śloka (ma-vipulā / bha-vipulā)
ma-vipulā: П1, слоги 5-7, ggg;
bha-vipulā: П3, слоги 5-7, gll;
```

### Алгоритм определения метра (lens=8,8)
При двух строках по 8 слогов — каждая строка проверяется как нечётная пада отдельно (не как пара нечётная+чётная).

## Подсветка слога в главном окне
- `_mainHighlightLoop` — rAF-петля, запускается при `onplay`, останавливается при `onpause/onended`
- `_updateKaraokeHighlightKey` — добавляет `.hl-ring` (большой прозрачный кружок) поверх оригинала
- Подсветка исчезает когда `t > _padaBounds[последней пады][1]`
- Карaoке видео: та же логика через `_padaBounds` для пад 2 и 4

## Основные функции
```javascript
// Главное окно
runPipeline()               // построение диаграммы
ftDetectMeter()             // определение метра + випула
detectAndMarkVipula(label)  // пометка слогов випулы → возвращает { type, padas }
buildWaveSVG(key)           // строит SVG с рамкой випулы
_mainHighlightLoop()        // подсветка слога при воспроизведении
_mainHighlightStart/Stop()  // запуск/остановка подсветки

// Редактор — общее
openTimingEditorInMode(mode)  // 'padas'|'timing'; при timing выбирает первый слог
closeTimingEditor()
teSwitchMode()

// Режим 1
teMarkPadas()               // 8 линий с зазором 0.5с
teR1Play(mode)              // 'all'|'pada'|'cur'
_teR1Loop()                 // rAF с автоскроллом и остановкой
_teSetCurrentPada(idx)      // выбор пады + currentTime на t0

// Режим 2
teSelectAdjacentSyl(delta)
teShiftSyl(delta)
teAlignToStart()
timingEditorPlaySyl()
timingEditorPlayStep()
timingEditorPlay(mode)
timingEditorPlayOrPause(mode)
_teUpdateStats()            // 3 строки статистики

// Drive
gdriveSave() / gdriveLoad()
_gdOpen(mode, onConfirm)
_gdLoadFolder(folderId)
_gdConfirm()               // одна кнопка: папка→навигация, файл→действие
_gdUpdateFooter()

// Карaoке
_karaokeLoop()              // isKeyActive использует _padaBounds
_renderPngCanvas()          // PNG рендер с шариком
```

## Новые возможности (v1.2.x - v1.3.0)

### Библиотека и CI
- Шлоки хранятся в `verses/data/*.json`.
- GitHub Actions автоматически проверяет JSON и перестраивает `verses/index.json`.
- В `index.html` добавлена форма **Library Export** для быстрого сохранения шлок.

### Студенческая платформа
- `student.html` поддерживает 3 режима (Full, Dots, Blind).
- Интеграция с Telegram: поддержка темной темы и кнопки «Назад».
- Мобильная адаптация: нижняя панель управления и touch-friendly квизы.
- Система SRS: интервальные повторения на базе SM-2.

## Как запустить локально
```
cd C:\Claude\shloka-wave\html
python3 -m http.server 8000
# открыть http://localhost:8000
```

## Технические детали

### Чтение/запись app.js (бинарный UTF-8)
```python
with open('/home/claude/project/src/scripts/app.js', 'rb') as f:
    text = f.read().decode('utf-8')
# После изменений:
with open('/home/claude/project/src/scripts/app.js', 'wb') as f:
    f.write(text.encode('utf-8'))
```

### Версионирование
1. Обновить `<title>` и `>v1.NNN<` в index.html
2. Дописать строку в ver_info.txt
3. `cd /home/claude/project && zip -r /mnt/user-data/outputs/html_vNNN.zip . --exclude "src/scripts/app.js.bak"`
