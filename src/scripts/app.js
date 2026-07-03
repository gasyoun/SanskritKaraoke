// ── Core ES module imports (ADR-0001 strangler fig) ──────────────────────────
import { devToIast, syllabifyIast as _syllabifyIast,
         IAST_LONG_V, IAST_SHORT_V, IAST_ALL_V, IAST_CONS,
       } from '../core/translit.js';
import { computeSharedColWidths as _coreSharedColWidths, colX as _coreColX,
         totalSvgW as _coreTotalSvgW, buildWavePath as _coreBuildWavePath,
         ROW_Y_BASE, SVG_H_BASE, COL_STEP_MIN, SVG_PAD,
       } from '../core/layout.js';
import { buildWaveSvgString as _coreBuildWaveSvgString, wrapSvgInDiv,
       } from '../core/svg.js';
import { composePngFrame } from '../core/compose.js';
import { currentSylIndex as _coreCurrentSylIndex, drawHighlight, drawStoryFrame,
         updateCamera,
       } from '../core/karaoke-frame.js';
import { detectOnsetsFromPcm, snapToNearest as _snapToNearest,
         snapConfidence as _snapConfidence, distributePada,
         padaUnitDuration, detectPadaBoundsFromPcm,
         corpusScaleTiming as _coreCorpusScaleTiming,
       } from '../core/timing.js';

// ═══════════════════════════════════════════════
// DEVELOPER FLAGS
// ═══════════════════════════════════════════════
// ═══════════════════════════════════════════════
// CONSTANTS  (from template analysis)
// ═══════════════════════════════════════════════
// A4 landscape: 297×210mm, margins 10mm each side
// Content width = 277mm ≈ 16270 dxa
// Table: 23 cols × 682 dxa = 15686 dxa ≈ 277mm
// 4 rows: row0=602dxa, rows 1-3=623dxa each

const CONTENT_MM = 277;   // mm, usable width on A4 landscape
const ROWS = 4;
const LONG_V = ['ā','ī','ū','ṝ','e','o','ai','au'];

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
let DATA = { s1: [], s2: [] };  // [{syl, devSyl, type, row, col}, ...]
let SHOW_DEV = false; // toggle: show Devanagari on balls instead of IAST
let audioB64 = null, audioMime = 'audio/mp4';
let ctxTarget = null; // {half, col}

// devToIast — delegated to src/core/translit.js (ADR-0001)

// ═══════════════════════════════════════════════
// IAST SYLLABIFICATION
// ═══════════════════════════════════════════════
// IAST_LONG_V, IAST_SHORT_V, IAST_ALL_V, IAST_CONS — imported from core/translit.js

// startsVowel/startsCons — only used by syllabifyIast; removed when syllabifyIast delegated

function syllabifyIast(iast) {
  const strictEl = document.getElementById('syl-mode-std');
  const strict = strictEl ? strictEl.checked : false;
  return _syllabifyIast(iast, { strict });
}


// ═══════════════════════════════════════════════
// GURU / LAGHU detection
// ═══════════════════════════════════════════════
function isGuru(syl) {
  // 1. Long vowel → guru
  for (const v of LONG_V) if (syl.includes(v)) return true;
  // 2. Ends in ANY consonant (closed syllable) → guru
  //    IAST consonants: k g c j ṭ ḍ t d p b y r l v h m n s ś ṣ ṅ ñ ṇ ṃ ḥ
  if (/[kgcjṭḍtdpbyrḷvhmnśṣṅñṇṃḥ]$/u.test(syl)) return true;
  return false;
}

// ═══════════════════════════════════════════════
// AUDIO HANDLING
// ═══════════════════════════════════════════════
function onAudioDrop(e) {
  e.preventDefault();
  document.getElementById('audio-drop').classList.remove('over');
  if (e.dataTransfer.files[0]) readAudioFile(e.dataTransfer.files[0]);
}
function onAudioFile(inp) { if (inp.files[0]) readAudioFile(inp.files[0]); }
let audioFile = null; // keep File object for ffmpeg
let _lastOnsets = [];   // cached onset positions from last detectOnsets call
let _lastPeaks  = [];   // cached peak positions from last detectOnsets call

// ── Tapping / Karaoke state ──────────────────────────────────────────────────
const TAP = {
  active:    false,   // tapping mode on
  times:     {},      // { 's1': [t0,t1,...], 's2': [t0,t1,...] }
  confidence: { s1: [], s2: [] },
  cursor:    { s1: 0, s2: 0 },  // next syllable index per key
  playRate:  0.75,    // playback speed during tapping
  audioCtx:  null,
  cheatY:    { s1: [], s2: [] },  // per-syllable Y offset in cheatsheet (row index 0-4)
};
let karaokeRaf = null;  // requestAnimationFrame handle for playback highlight

function readAudioFile(file, resetState = true) {
  audioMime = file.type || 'audio/mp4';
  audioFile = file;

  // Всегда сбрасываем waveform — новое аудио, новая диаграмма
  _waveformPcm = null;
  _lastVipulaLabel = null;
  const wCanvas = document.getElementById('waveform-canvas');
  if (wCanvas) wCanvas.style.display = 'none';

  // Сброс разбивки пад и тайминга при загрузке нового файла вручную
  if (resetState) {
    _padaBounds = null;
    TAP.times = { s1: [], s2: [] };
    TAP.confidence = { s1: [], s2: [] };
    TAP.cheatY = { s1: [], s2: [] };
    _teUpdatePadasInfo();
    // Скрыть кнопки перехода в режим тайминга
    const btnSwitch = document.getElementById('btn-te-switch');
    const btnReset  = document.getElementById('btn-te-reset');
    if (btnSwitch) btnSwitch.style.display = 'none';
    if (btnReset)  btnReset.style.display  = 'none';
  }

  const r = new FileReader();
  r.onload = e => {
    audioB64 = e.target.result.split(',')[1];
    const drop = document.getElementById('audio-drop');
    drop.classList.add('loaded');
    document.getElementById('audio-name').textContent = '✓ ' + file.name;
    // Show audio preview
    const preview = document.getElementById('audio-preview');
    if (preview) { preview.src = e.target.result; preview.style.display = ''; }

    // Show tapping block
    const tapBlock = document.getElementById('tap-block');
    if (tapBlock) tapBlock.style.display = '';

    // Pre-decode full PCM immediately for pause detection
    _decodeFullPcm(e.target.result);

  };
  r.readAsDataURL(file);
}

async function _decodeFullPcm(dataUrl) {
  try {
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    const resp = await fetch(dataUrl);
    const buf = await resp.arrayBuffer();
    const decoded = await actx.decodeAudioData(buf);
    _waveformSr = decoded.sampleRate;
    const ch = decoded.getChannelData(0);
    _waveformFull = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i++) _waveformFull[i] = Math.abs(ch[i]);
    // Build display PCM
    const step = Math.ceil(ch.length / 800);
    const pcm = new Float32Array(800);
    for (let i = 0; i < 800; i++) {
      let max = 0;
      for (let j = 0; j < step; j++) {
        const v = ch[i * step + j] ? Math.abs(ch[i * step + j]) : 0;
        if (v > max) max = v;
      }
      pcm[i] = max;
    }
    _waveformPcm = pcm;
    actx.close();
    // Show waveform canvas
    const canvas = document.getElementById('waveform-canvas');
    if (canvas) { canvas.style.display = ''; refreshWaveform(); }
  } catch(e) { console.warn('PCM decode error:', e); }
}

// ═══════════════════════════════════════════════
// PATTERN-BASED PIPELINE (no API needed)
// ═══════════════════════════════════════════════
// Default row pattern from template (all 4 shlokas identical):
// col: 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21
// row: 1  0  1  1  0  1  1  0  1  1  2  2  3  3  1  0  0  0  0  1  1  1
const DEFAULT_PATTERN = []; // empty = use flat level 2 (row index 1)

function parseCheatsheet(text) {
  // Format "col:row col:row ..." or plain "1 0 1 1 0 1 ..."
  if (text.includes(':')) {
    const pairs = [...text.matchAll(/(\d+):(\d+)/g)];
    if (pairs.length >= 4) {
      const map = {};
      pairs.forEach(m => { map[+m[1]] = +m[2]; });
      const maxCol = Math.max(...Object.keys(map).map(Number));
      return Array.from({length: maxCol+1}, (_,i) => map[i] ?? 1);
    }
  }
  const nums = [...text.matchAll(/[0-3]/g)].map(m => +m[0]);
  return nums.length >= 4 ? nums : null;
}

function applyPattern(sylWords, pattern) {
  return sylWords.map((syl, i) => ({
    syl,
    type: isGuru(syl) ? 'guru' : 'laghu',
    row: i < pattern.length ? pattern[i] : 1,
    col: i
  }));
}

function runPipeline() {
  const devRawInput = document.getElementById('dev-input').value.trim();
  // Check for Cyrillic characters
  if (/[а-яёА-ЯЁ]/.test(devRawInput)) {
    const sel2 = document.getElementById('scheme-select');
    if (sel2) sel2.value = '';
    showMsg('Введите текст на санскрите — русские буквы не поддерживаются', 'err');
    return;
  }
  const sel = document.getElementById('scheme-select');
  const detectedScheme = sel ? sel.value : autoDetectScheme(devRawInput);
  if (!detectedScheme) { showMsg('Выберите кодировку из списка', 'err'); return; }
  const schemeLabel = SCHEME_NAMES[detectedScheme] || detectedScheme;
  // Convert to Devanagari locally
  let devRaw = transliterateToDev(devRawInput, detectedScheme);
  // Validate: result must contain Devanagari (if input was not already DEV)
  if (detectedScheme !== 'DEV' && !/[ऀ-ॿ]/.test(devRaw)) {
    showMsg('Кодировка определена неверно — выберите другую в списке', 'err');
    return;
  }
  // Warn if too few Devanagari chars (partial conversion)
  const devChars = (devRaw.match(/[ऀ-ॿ]/g) || []).length;
  const totalChars = devRaw.replace(/\s/g,'').length;
  if (detectedScheme !== 'DEV' && devChars / totalChars < 0.3) {
    showMsg('Возможно кодировка определена неверно — проверьте список', 'err');
    return;
  }
  // Normalize ASCII punctuation to Devanagari
  devRaw = devRaw
    .replace(/\|\|(\d+)\|\|/g, (_, n) => '॥' + n.split('').map(d=>'०१२३४५६७८९'[+d]).join('') + '॥')
    .replace(/\|\|/g, '॥')
    .replace(/(?<![।॥])\|(?!\|)/g, '।')
    .replace(/\.\.(\d+)\.\./g, (_, n) => '॥' + n.split('').map(d=>'०१२३४५६७८९'[+d]).join('') + '॥')
    .replace(/\.\./g, '॥')
    .replace(/(?<![।॥])\.(?![।॥])/g, '।')
    .replace(/[0-9]/g, d => '०१२३४५६७८९'[+d]);
  if (!devRaw) { showMsg('Введите текст деванагари', 'err'); return; }

  try {
  // Split into two lines
  const devLines = devRaw.split(/\n/).map(l => l.trim()).filter(Boolean);
  if (devLines.length < 1) { showMsg('Введите хотя бы одну строфу', 'err'); return; }

  const dev1 = devLines[0] || '';
  const dev2 = devLines[1] || devLines[0];

  // Transliterate devanagari → IAST
  const iast1 = devToIast(dev1);
  const iast2 = devToIast(dev2);

  // Syllabify
  const sylsRaw1 = syllabifyIast(iast1);
  const sylsRaw2 = syllabifyIast(iast2);

  // Sync hidden fields for PNG export
  document.getElementById('s1dev').value = dev1;
  document.getElementById('s2dev').value = dev2;

  // Apply row pattern
  // Use existing rows as pattern (by index), fallback to DEFAULT_PATTERN on very first build
  const pat1 = DATA.s1 && DATA.s1.length ? DATA.s1.map(s => s.row) : DEFAULT_PATTERN;
  const pat2 = DATA.s2 && DATA.s2.length ? DATA.s2.map(s => s.row) : DEFAULT_PATTERN;
  const arr1 = DATA.s1 && DATA.s1.length ? DATA.s1.map(s => s.arrow || '') : [];
  const arr2 = DATA.s2 && DATA.s2.length ? DATA.s2.map(s => s.arrow || '') : [];
  DATA.s1 = sylsRaw1.map((s, i) => ({ ...s, devSyl: transliterateToDev(s.syl, 'IAST'), row: i < pat1.length ? pat1[i] : (pat1.length ? pat1[pat1.length-1] : 1), col: i, arrow: arr1[i] || '' }));
  // Восстанавливаем пометки випулы после пересборки DATA
  if (_lastVipulaLabel) detectAndMarkVipula(_lastVipulaLabel);
  DATA.s2 = sylsRaw2.map((s, i) => ({ ...s, devSyl: transliterateToDev(s.syl, 'IAST'), row: i < pat2.length ? pat2[i] : (pat2.length ? pat2[pat2.length-1] : 1), col: i, arrow: arr2[i] || '' }));

  // Populate editable syllable fields
  const schemeInfo = detectedScheme !== 'DEV' ? ` · кодировка: ${schemeLabel}` : '';
  const _w1 = DATA.s1.map(s => s.type === 'guru' ? 'g' : 'l').join('');
  const _w2 = DATA.s2.map(s => s.type === 'guru' ? 'g' : 'l').join('');
  const _mr = identifyMeterLocal(_w1, _w2, DATA.s1.map(s=>s.syl), DATA.s2.map(s=>s.syl));
  showMsg(`Первая строка: ${DATA.s1.length} сл. · Вторая строка: ${DATA.s2.length} сл.${schemeInfo} · ${_mr.label}`, 'ok');
  // Auto-fill meter in footer if field is empty
  const meterField = document.getElementById('ft-meter');
  if (meterField && !meterField.value.trim()) meterField.value = meterLabelForFooter(_mr.label);
  // Пометить слоги випулы при построении диаграммы
  _lastVipulaLabel = _mr.label;
  detectAndMarkVipula(_mr.label);
  document.fonts.ready.then(() => {
    render();
    document.getElementById('dl-wrap').style.display = '';
  });
  const mibtn = document.getElementById('btn-meter-info');
  if (mibtn) mibtn.style.display = '';
  
  // Show library export panel
  const libPanel = document.getElementById('lib-export-panel');
  if (libPanel) {
    libPanel.style.display = 'block';
    // Auto-fill ID if empty
    const idField = document.getElementById('lib-id');
    if (idField && !idField.value.trim()) {
      const slug = (document.getElementById('ft-source').value + '_' + document.getElementById('ft-year').value)
        .toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 20);
      idField.value = slug || 'verse_id';
    }
    // Auto-fill titles if empty
    const tRu = document.getElementById('lib-title-ru');
    if (tRu && !tRu.value.trim()) tRu.value = document.getElementById('ft-source').value.split(' ')[0];
  }
  } catch (err) {
    console.error('runPipeline error:', err);
    showMsg('Ошибка обработки: ' + (err.message || String(err)), 'err');
  }
}

// ═══════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════

function render() {
  const main = document.getElementById('main-area');
  main.innerHTML = '';

  computeSharedColWidths();
  ['s1','s2'].forEach((key, hi) => {
    const block = document.createElement('div');
    block.className = 'shloka-block';
    block.id = `block-${key}`;

    const label = document.createElement('div');
    label.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px';
    const labelLeft = document.createElement('span');
    labelLeft.className = 'shloka-label';
    labelLeft.textContent = hi === 0 ? 'Первая строка' : 'Вторая строка';
    label.appendChild(labelLeft);
    if (hi === 0) {
      const labelRight = document.createElement('span');
      labelRight.style.cssText = "font-size:.68rem;font-family:'JetBrains Mono',monospace;color:var(--ink2)";
      labelRight.textContent = 'правая кнопка мыши на шарике слога для редактирования';
      label.appendChild(labelRight);
    }
    block.appendChild(label);

    // 0+1. Combined: cheat header with arrow buttons + textarea inside cheat body
    const cheatWrap = document.createElement('div');
    cheatWrap.style.cssText = 'margin-bottom:6px;border:1px solid var(--border);border-radius:4px;overflow:hidden';

    const cheatHead = document.createElement('div');
    cheatHead.style.cssText = 'display:flex;align-items:center;gap:4px;padding:5px 10px;background:var(--bg2);cursor:pointer;font-size:.65rem;letter-spacing:.15em;text-transform:uppercase;color:var(--ink2);font-family:"JetBrains Mono",monospace;user-select:none;transition:background .15s;border-bottom:1px solid var(--border)';
    cheatHead.onmouseenter = () => cheatHead.style.background = 'var(--border)';
    cheatHead.onmouseleave = () => cheatHead.style.background = 'var(--bg2)'
    const otherKey = key === 's1' ? 's2' : 's1';
    const otherNum = key === 's1' ? '2' : '1';
    cheatHead.innerHTML = '<span style="font-size:1rem;margin-right:4px;transition:transform .2s">▸</span> Шпаргалка мелодии';

    // Arrow buttons in header
    const arrowUp = document.createElement('button');
    arrowUp.textContent = '↑';
    arrowUp.title = 'Добавить стрелку вверх';
    arrowUp.style.cssText = 'font-size:.9rem;padding:0px 6px;border:1px solid var(--border);border-radius:3px;background:var(--bg2);color:var(--ink);cursor:pointer;margin-left:auto';
    arrowUp.onclick = e => { e.stopPropagation(); insertArrowTo(key,'↑'); };
    const arrowDn = document.createElement('button');
    arrowDn.textContent = '↓';
    arrowDn.title = 'Добавить стрелку вниз';
    arrowDn.style.cssText = 'font-size:.9rem;padding:0px 6px;border:1px solid var(--border);border-radius:3px;background:var(--bg2);color:var(--ink);cursor:pointer';
    arrowDn.onclick = e => { e.stopPropagation(); insertArrowTo(key,'↓'); };
    const arrowDel = document.createElement('button');
    arrowDel.textContent = '✕';
    arrowDel.title = 'Удалить стрелку';
    arrowDel.style.cssText = 'font-size:.9rem;padding:0px 6px;border:1px solid var(--border);border-radius:3px;background:var(--bg2);color:var(--ink2);cursor:pointer';
    arrowDel.onclick = e => { e.stopPropagation(); removeArrowFrom(key); };
    cheatHead.appendChild(arrowUp);
    cheatHead.appendChild(arrowDn);
    cheatHead.appendChild(arrowDel);
    const devToggle = document.createElement('button');
    devToggle.id = 'dev-toggle-' + key;
    devToggle.textContent = SHOW_DEV ? 'IAST' : 'देव';
    devToggle.title = SHOW_DEV ? 'Переключить на IAST' : 'Переключить на деванагари';
    devToggle.style.cssText = 'font-size:.78rem;padding:0px 7px;border:1px solid var(--border);border-radius:3px;background:var(--bg2);color:var(--ink2);cursor:pointer;margin-left:10px;font-family:"Sanskrit 2003","Siddhanta",serif';
    devToggle.onclick = e => {
      e.stopPropagation();
      SHOW_DEV = !SHOW_DEV;
      // Update all toggle buttons across both blocks
      document.querySelectorAll('[id^=dev-toggle-]').forEach(btn => {
        btn.textContent = SHOW_DEV ? 'IAST' : 'देव';
        btn.title = SHOW_DEV ? 'Переключить на IAST' : 'Переключить на деванагари';
      });
      // Rebuild both wave diagrams and translit lines
      ['s1','s2'].forEach(k => {
        const bl = document.getElementById('block-' + k);
        if (!bl) return;
        const oldWrap = bl.querySelector('.wave-svg-wrap');
        if (oldWrap) bl.replaceChild(buildWaveSVG(k), oldWrap);
        rebuildTranslit(k);
      });
    };
    cheatHead.appendChild(devToggle);
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '← из ' + otherNum;
    copyBtn.title = 'Скопировать расположение из шлоки ' + otherNum;
    copyBtn.style.cssText = 'font-size:.6rem;padding:1px 6px;border:1px solid var(--border);border-radius:3px;background:var(--bg2);color:var(--ink2);cursor:pointer;font-family:"JetBrains Mono",monospace;margin-left:8px';
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      copyRowsFrom(key, otherKey);
    };
    cheatHead.appendChild(copyBtn);

    const resetWrap = document.createElement('span');
    resetWrap.style.cssText = 'display:inline-flex;align-items:center;margin-left:4px;border:1px solid var(--border);border-radius:3px;overflow:hidden';
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '↺ сброс';
    resetBtn.title = 'Сбросить все слоги на выбранный ряд';
    resetBtn.style.cssText = 'font-size:.6rem;padding:1px 6px;background:var(--bg2);color:var(--ink2);cursor:pointer;font-family:"JetBrains Mono",monospace;border:none;border-right:1px solid var(--border)';
    const resetRowSel = document.createElement('select');
    resetRowSel.id = 'reset-row-sel-' + key;
    resetRowSel.title = 'Ряд для сброса (1=верх … 5=низ)';
    resetRowSel.style.cssText = 'font-size:.6rem;font-family:"JetBrains Mono",monospace;background:var(--bg2);color:var(--ink2);border:none;cursor:pointer;padding:1px 2px';
    [1,2,3,4,5].forEach(n => {
      const opt = document.createElement('option');
      opt.value = n; opt.textContent = n;
      if (n === 2) opt.selected = true;
      resetRowSel.appendChild(opt);
    });
    resetRowSel.addEventListener('click', e => e.stopPropagation());
    resetBtn.onclick = (e) => { e.stopPropagation(); resetRows(key); };
    resetWrap.appendChild(resetBtn);
    resetWrap.appendChild(resetRowSel);
    cheatHead.appendChild(resetWrap);

    const undoBtn = document.createElement('button');
    undoBtn.id = 'undo-btn-' + key;
    undoBtn.textContent = '↩ вернуть';
    undoBtn.title = 'Отменить последнее действие';
    undoBtn.disabled = true;
    undoBtn.style.cssText = 'font-size:.6rem;padding:1px 6px;border:1px solid var(--border);border-radius:3px;background:var(--bg2);color:var(--ink2);cursor:pointer;font-family:"JetBrains Mono",monospace;margin-left:4px';
    undoBtn.style.opacity = '0.4';
    undoBtn.addEventListener('click', (e) => { e.stopPropagation(); undoRows(key); });
    undoBtn.addEventListener('mouseenter', () => { if (!undoBtn.disabled) undoBtn.style.opacity='1'; });
    undoBtn.addEventListener('mouseleave', () => { if (!undoBtn.disabled) undoBtn.style.opacity='0.8'; });
    cheatHead.appendChild(undoBtn);

    const cheatBody = document.createElement('div');
    cheatBody.id = 'cheat-body-' + key;
    cheatBody.style.cssText = 'padding:6px 8px 6px;background:var(--card);overflow-x:auto';

    // Syllables are now editable directly in cheat table cells

    // Build table from DATA[key]
    cheatWrap.id = 'cheat-wrap-' + key;
    buildCheatTable(key, cheatBody);

    const cheatHint = document.createElement('p');
    cheatHint.style.cssText = 'font-size:.62rem;color:var(--ink2);margin:4px 0 0;font-family:"JetBrains Mono",monospace';
    cheatHint.textContent = '';

    cheatBody.appendChild(cheatHint);
    cheatWrap.appendChild(cheatHead);
    cheatWrap.appendChild(cheatBody);

    // Toggle collapse
    const cheatDefaultOpen = !document.getElementById('opt-cheat-open') || document.getElementById('opt-cheat-open').checked;
    let cheatOpen = cheatDefaultOpen;
    cheatBody.style.display = cheatOpen ? '' : 'none';
    cheatHead.querySelector('span').style.transform = cheatOpen ? 'rotate(90deg)' : 'rotate(0deg)';
    cheatHead.addEventListener('click', () => {
      cheatOpen = !cheatOpen;
      cheatBody.style.display = cheatOpen ? '' : 'none';
      const arr = cheatHead.querySelector('span');
      arr.style.transform = cheatOpen ? 'rotate(90deg)' : 'rotate(0deg)';
    });

    block.appendChild(cheatWrap);

    // 2. Wave SVG
    block.appendChild(buildWaveSVG(key));

    // 3. Devanagari line
    const devEl = document.createElement('div');
    devEl.className = 'dev-line';
    devEl.id = `dev-${key}`;
    devEl.textContent = document.getElementById(`s${hi+1}dev`).value.trim();
    block.appendChild(devEl);

    // 4. Transliteration line
    block.appendChild(buildTranslitLine(key));

    main.appendChild(block);
  });

  // Wait for fonts + layout before fitting text
  document.fonts.ready.then(() => {
    requestAnimationFrame(() => {
      ['s1','s2'].forEach(k => autoFitFonts(k));
    });
  });

}


document.addEventListener('click', closeCtx);

// Close ctx-menu on any click — wired once at load, not inside render()
document.addEventListener('click', closeCtx);

// Active drag state
let svgDrag = null;
// {key, col, startY, origRow, svgEl, nodeEl, ghostCircle}

// ROW_Y_BASE, SVG_H_BASE — imported from core/layout.js
function waveScale() {
  const el = document.getElementById('opt-wave-scale');
  return el ? parseFloat(el.value) : 0.5;
}
function maxUsedRow(key) {
  // Highest row index actually used (0-based), minimum 3 (=4 rows)
  if (!DATA[key] || !DATA[key].length) return 3;
  return Math.max(3, ...DATA[key].map(s => s.row));
}

function getROW_Y(key) {
  // Always expose all 5 rows so user can drag/set any row
  // but only render guides up to the max used row
  const s = waveScale();
  return ROW_Y_BASE.map(y => Math.round(y * s)); // all 5
}

function getSVG_H(key) {
  // Height = last USED row + padding (no empty space below)
  const s = waveScale();
  const maxRow = key ? maxUsedRow(key) : Math.max(
    DATA.s1.length ? maxUsedRow('s1') : 3,
    DATA.s2.length ? maxUsedRow('s2') : 3
  );
  const lastUsedY = Math.round(ROW_Y_BASE[maxRow] * s);
  return lastUsedY + 34; // 34px for labels
}
// Keep ROW_Y as alias for drag/snap code
// ROW_Y and SVG_H are now functions that accept optional key
// Keep backward-compatible getters using global max
Object.defineProperty(window, 'ROW_Y', { get: () => getROW_Y(null) });
Object.defineProperty(window, 'SVG_H', { get: () => getSVG_H(null) });
// COL_STEP_MIN, SVG_PAD — imported from core/layout.js

// Per-key dynamic column widths based on syllable label size
const _colWidths = {};
const _measureCtx = document.createElement('canvas').getContext('2d');
const _measureCache = new Map();
function measureSyl(text, bold) {
  const font = `${bold?'700':'400'} 13px "Charter Indologique",serif`;
  const cacheKey = font + '|' + text;
  if (_measureCache.has(cacheKey)) return _measureCache.get(cacheKey);
  _measureCtx.font = font;
  const w = Math.ceil(_measureCtx.measureText(text).width);
  _measureCache.set(cacheKey, w);
  return w;
}

// Measure vertical metrics (ascent/descent) for given text, size, font
function measureTextV(text, fontSize, fontWeight, fontFamily) {
  const font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  _measureCtx.font = font;
  const m = _measureCtx.measureText(text);
  return {
    ascent:  m.actualBoundingBoxAscent  || fontSize * 0.75,
    descent: m.actualBoundingBoxDescent || fontSize * 0.2
  };
}

function computeColWidths(key, syls) {
  const w = {};
  syls.forEach(s => {
    w[s.col] = Math.max(COL_STEP_MIN, measureSyl(s.syl + (s.arrow||''), s.type==='guru') + 14);
  });
  _colWidths[key] = w;
}

// Compute shared column widths for both strophes so they align perfectly
// computeSharedColWidths — delegates to core/layout.js (ADR-0001)
function computeSharedColWidths() {
  const merged = _coreSharedColWidths(DATA.s1, DATA.s2);
  _colWidths.s1 = { ...merged };
  _colWidths.s2 = { ...merged };
}
function colX(key, c) {
  return _coreColX(c, _colWidths[key] || {});
}
function totalSvgW(key, numCols) {
  return _coreTotalSvgW(numCols, _colWidths[key] || {});
}

function nearestRow(svgY, key) {
  const rows = key ? getROW_Y(key) : ROW_Y;
  let best = 0, bestDist = Infinity;
  rows.forEach((ry, ri) => {
    const d = Math.abs(svgY - ry);
    if (d < bestDist) { bestDist = d; best = ri; }
  });
  return best;
}

// buildWavePath — delegates to core/layout.js (ADR-0001)
function buildWavePath(key, syls) {
  const mode = document.getElementById('opt-smooth')?.value || 'bezier';
  return _coreBuildWavePath(syls, _colWidths[key] || {}, getROW_Y(key), { smooth: mode });
}

// Centralised color resolver — read CSS vars; headless renderers can override.
function _getWaveColors() {
  const rs = getComputedStyle(document.documentElement);
  return {
    guruColor:  rs.getPropertyValue('--guru').trim()  || '#8B0000',
    laghuColor: rs.getPropertyValue('--laghu').trim() || '#2C4A1E',
  };
}

// buildWaveSVG — delegates to core/svg.js (ADR-0001)
function buildWaveSVG(key) {
  const syls = DATA[key];
  if (!syls.length) return document.createElement('div');
  const { guruColor, laghuColor } = _getWaveColors();
  const svgStr = _coreBuildWaveSvgString(key, syls, _colWidths[key] || {}, {
    scale:    waveScale(),
    smooth:   document.getElementById('opt-smooth')?.value || 'bezier',
    showDots: !document.getElementById('opt-dots')   || document.getElementById('opt-dots').checked,
    showLine: !document.getElementById('opt-line')   || document.getElementById('opt-line').checked,
    hollow:   !document.getElementById('opt-hollow') || document.getElementById('opt-hollow').checked,
    showDev:  SHOW_DEV,
    guruColor, laghuColor,
  });
  return wrapSvgInDiv(key, svgStr, getSVG_H(key));
}

function buildTranslitLine(key) {
  const div = document.createElement('div');
  const greyMode = !document.getElementById('opt-grey-iast') || document.getElementById('opt-grey-iast').checked;
  div.className = 'trl-line' + (greyMode ? ' grey-mode' : '');
  div.id = `trl-${key}`;
  const devFont = SHOW_DEV ? "'Sanskrit 2003', serif" : "'Charter Indologique', 'Cormorant Garamond', serif";
  div.style.cssText = `display:flex;justify-content:space-between;align-items:baseline;font-family:${devFont};`;
  const sorted = [...DATA[key]].sort((a,b) => a.col - b.col || a.row - b.row);
  div.innerHTML = sorted.map(s => {
    // No arrows in IAST line — only in wave nodes
    return `<span class="t${s.type[0]}">${SHOW_DEV && s.devSyl ? s.devSyl : s.syl}</span>`;
  }).join('');
  return div;
}

function autoFitFonts(key) {
  const block = document.getElementById(`block-${key}`);
  const refW = block ? block.getBoundingClientRect().width - 4 : 800;
  const LINE_GAP = 5; // px gap between elements
  applyCheatWidth(key);

  // 1. Fit devanagari line to width
  const devEl = document.getElementById(`dev-${key}`);
  if (devEl && devEl.textContent) {
    fitTextToWidth(devEl, refW, 14, 48);
    const devFs = parseFloat(devEl.style.fontSize) || 32;
    const dvm = measureTextV(devEl.textContent, devFs, 700, 'Sanskrit 2003, serif');
    // marginTop: gap from real visual bottom of SVG content to top of dev text (= ascent)
    const waveWrap = block ? block.querySelector('.wave-svg-wrap') : null;
    const svgEl = waveWrap ? waveWrap.querySelector('svg') : null;
    const svgH = svgEl ? (+svgEl.getAttribute('viewBox').split(' ')[3] || 0) : 0;
    const contentBottom = waveWrap ? (+waveWrap.dataset.contentBottom || svgH) : svgH;
    const overflowExtra = Math.max(0, contentBottom - svgH);
    // Same logic as PNG renderer: devH = devFs + 10, text drawn at fs*0.82 from top
    devEl.style.marginTop     = (LINE_GAP + overflowExtra) + 'px';
    devEl.style.marginBottom  = '0px';
    devEl.style.height        = 'auto';
    devEl.style.lineHeight    = 'normal';
    devEl.style.paddingTop    = dvm.ascent * 0.15 + 'px';
    devEl.style.paddingBottom = dvm.descent + 'px';
  }

  // 2. Fit transliteration line to width
  const trlEl = document.getElementById(`trl-${key}`);
  if (trlEl) {
    fitTextToWidth(trlEl, refW, 9, 22);
    const trlFs = parseFloat(trlEl.style.fontSize) || 14;
    // Width = dev text width before danda
    const devEl2 = document.getElementById(`dev-${key}`);
    const devFs2 = devEl2 ? (parseFloat(devEl2.style.fontSize) || 32) : 32;
    const devText = devEl2 ? devEl2.textContent : '';
    const lastDevIdx2 = devText.search(/[\u0900-\u0965\u0970-\u097F][^\u0900-\u0965\u0970-\u097F]*$/);
    const devToLast = lastDevIdx2 >= 0 ? devText.slice(0, lastDevIdx2 + 1) : devText;
    _measureCtx.font = `700 ${devFs2}px "Sanskrit 2003", serif`;
    const trlW = Math.max(Math.ceil(_measureCtx.measureText(devToLast).width), 100);
    trlEl.style.width         = trlW + 'px';
    trlEl.style.marginTop     = LINE_GAP + 'px';
    trlEl.style.marginBottom  = '8px';
    trlEl.style.height        = (trlFs + 8) + 'px';
    trlEl.style.lineHeight    = (trlFs + 8) + 'px';
    trlEl.style.paddingTop    = '0px';
    trlEl.style.paddingBottom = '0px';
  }
}

function fitTextToWidth(el, targetW, minSz, maxSz) {
  // Start at max, reduce until text fits
  el.style.whiteSpace = 'nowrap';
  el.style.overflow   = 'visible';
  for (let sz = maxSz; sz >= minSz; sz -= 0.5) {
    el.style.fontSize = sz + 'px';
    if (el.scrollWidth <= targetW + 4) break;
  }
  el.style.overflow = 'hidden';
}

// ── SVG drag handlers ──────────────────────────
function svgClientToSVG(svgEl, clientY) {
  const rect = svgEl.getBoundingClientRect();
  const scaleY = +svgEl.getAttribute('viewBox').split(' ')[3] / rect.height;
  return (clientY - rect.top) * scaleY;
}

function svgDragStart(e, g) {
  if (e.button !== 0) return;
  e.preventDefault();
  const key = g.dataset.key;
  const col = +g.dataset.col;
  const svgEl = document.getElementById(`svg-${key}`);
  const circle = g.querySelector('circle');
  g.classList.add('dragging');

  svgDrag = { key, col, svgEl, nodeEl: g, circle };

  window.addEventListener('mousemove', svgDragMove);
  window.addEventListener('mouseup',   svgDragEnd);
}

function _normEv(e) {
  const src = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
  return { clientX: src.clientX, clientY: src.clientY, target: e.target,
           button: e.button || 0, preventDefault() { e.preventDefault(); } };
}

function svgTouchStart(e, g) {
  e.preventDefault();
  const touch = e.touches[0];
  const key = g.dataset.key;
  const col = +g.dataset.col;
  const svgEl = document.getElementById(`svg-${key}`);
  g.classList.add('dragging');
  svgDrag = { key, col, svgEl, nodeEl: g, circle: g.querySelector('circle') };

  window.addEventListener('touchmove', svgTouchMove, {passive:false});
  window.addEventListener('touchend',  svgDragEnd);
}

function svgDragMove(e) {
  if (!svgDrag) return;
  const svgY = svgClientToSVG(svgDrag.svgEl, e.clientY);
  const row = nearestRow(svgY);
  // Snap circle to target row while dragging
  const snapY = ROW_Y[row];
  svgDrag.circle.setAttribute('cy', snapY);
  // Move label too
  const txt = svgDrag.nodeEl.querySelector('text');
  { const dfs = parseFloat(txt.getAttribute('font-size') || 11); txt.setAttribute('y', row === 0 ? snapY - 8 - 4 - dfs * 0.25 : snapY + 8 + 4 + dfs * 0.85); }
  // Update wave path live
  const syl = DATA[svgDrag.key].find(s => s.col === svgDrag.col);
  if (syl) {
    const fakeRow = row;
    const tempSyls = DATA[svgDrag.key].map(s =>
      s.col === svgDrag.col ? {...s, row: fakeRow} : s);
    const wavePath = document.getElementById(`wave-path-${svgDrag.key}`);
    if (wavePath) {
      wavePath.setAttribute('d', buildWavePath(svgDrag.key, tempSyls));
      wavePath.setAttribute('stroke', getComputedStyle(document.documentElement).getPropertyValue('--guru').trim()||'#8B0000');
      wavePath.setAttribute('stroke-width', '1.6');
      wavePath.setAttribute('stroke-opacity', '0.35');
    }
  }
}

function svgTouchMove(e) {
  if (!svgDrag) return;
  e.preventDefault();
  const touch = e.touches[0];
  svgDragMove({clientY: touch.clientY});
}

function svgDragEnd(e) {
  if (!svgDrag) return;
  const { key, col, svgEl, nodeEl } = svgDrag;
  nodeEl.classList.remove('dragging');

  // Final position
  const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
  const svgY  = svgClientToSVG(svgEl, clientY);
  const newRow = nearestRow(svgY, key);

  // Commit to DATA
  const syl = DATA[key].find(s => s.col === col);
  if (syl) syl.row = newRow;

  svgDrag = null;
  window.removeEventListener('mousemove', svgDragMove);
  window.removeEventListener('mouseup',   svgDragEnd);
  window.removeEventListener('touchmove', svgTouchMove);
  window.removeEventListener('touchend',  svgDragEnd);

  // Rebuild wave
  rebuildTable(key);
  // Rebuild cheat table to reflect new row values
  applyCheatsheet(key);
}

// ═══════════════════════════════════════════════
// CONTEXT MENU

// ═══════════════════════════════════════════════
function onSylClick(g) {
  // Select node for context menu
}

function onSylCtx(e, g) {
  e.preventDefault();
  const key = g.dataset.key;
  const col = +g.dataset.col;
  ctxTarget = { key, col };
  const menu = document.getElementById('ctx');
  menu.style.left = e.clientX + 'px';
  menu.style.top  = e.clientY + 'px';
  menu.classList.add('show');
}

function onCellCtx(e) {
  e.preventDefault();
  const td = e.currentTarget;
  const key = td.dataset.key;
  const row = +td.dataset.row;
  const col = +td.dataset.col;
  // Find syllable at this cell or nearby column
  const syl = DATA[key].find(s => s.col === col); // any row in this col
  if (!syl) { closeCtx(); return; }
  ctxTarget = { key, col };
  const menu = document.getElementById('ctx');
  menu.style.left = e.clientX + 'px';
  menu.style.top  = e.clientY + 'px';
  menu.classList.add('show');
}
function closeCtx() { document.getElementById('ctx').classList.remove('show'); }
function ctxSetType(type) {
  if (!ctxTarget) return;
  const syl = DATA[ctxTarget.key].find(s => s.col === ctxTarget.col);
  if (syl) { syl.type = type; rebuildTable(ctxTarget.key); }
  closeCtx();
}
function ctxMoveRow(row) {
  if (!ctxTarget) return;
  const syl = DATA[ctxTarget.key].find(s => s.col === ctxTarget.col);
  if (syl) {
    // Check if dest row/col is empty
    const conflict = DATA[ctxTarget.key].find(s => s.row === row && s.col === ctxTarget.col && s !== syl);
    if (!conflict) {
      syl.row = row;
      rebuildTable(ctxTarget.key);
      const cw = document.getElementById('cheat-wrap-' + ctxTarget.key);
      if (cw) { const inp = cw.querySelectorAll('input[type="number"]')[syl.col]; if (inp) inp.value = row + 1; }
    }
  }
  closeCtx();
}
function ctxDelete() {
  if (!ctxTarget) return;
  DATA[ctxTarget.key] = DATA[ctxTarget.key].filter(s => s.col !== ctxTarget.col);
  rebuildTable(ctxTarget.key);
  closeCtx();
}


// Track which textarea was last focused
// insertArrowTo: add arrow to the focused contenteditable cell or last focused
let lastSylCell = null; // last focused contenteditable td

function insertArrowTo(key, arrow) {
  // Find the target cell: currently focused, or last focused, or first cell
  const block = document.getElementById('block-' + key);
  if (!block) return;
  const cells = [...block.querySelectorAll('table tr:first-child td[contenteditable]')];
  // When arrow button is clicked, focus has already moved away — rely on lastSylCell
  const target = cells.find(c => c === document.activeElement) || lastSylCell || cells[0];
  if (!target) return;

  // Find the index of this cell to update DATA directly
  const idx = cells.indexOf(target);
  if (idx < 0 || !DATA[key][idx]) return;

  // Update DATA directly (do not rely on blur/saveSyl chain — focus was already lost)
  const cur = target.textContent.trim();
  const base = (cur.endsWith('↑') || cur.endsWith('↓')) ? cur.slice(0, -1) : cur;
  const newText = base + arrow;

  target.textContent = newText;
  DATA[key][idx].arrow = arrow;

  // Immediately rebuild the wave diagram so arrow appears at once
  const oldWrap = block.querySelector('.wave-svg-wrap');
  if (oldWrap) block.replaceChild(buildWaveSVG(key), oldWrap);
  rebuildTranslit(key);
}

function removeArrowFrom(key) {
  const block = document.getElementById('block-' + key);
  if (!block) return;
  const cells = [...block.querySelectorAll('table tr:first-child td[contenteditable]')];
  const target = cells.find(c => c === document.activeElement) || lastSylCell || cells[0];
  if (!target) return;

  const idx = cells.indexOf(target);
  if (idx < 0 || !DATA[key][idx]) return;

  const cur = target.textContent.trim();
  const base = (cur.endsWith('↑') || cur.endsWith('↓')) ? cur.slice(0, -1) : cur;

  target.textContent = base;
  DATA[key][idx].arrow = '';

  const oldWrap = block.querySelector('.wave-svg-wrap');
  if (oldWrap) block.replaceChild(buildWaveSVG(key), oldWrap);
  rebuildTranslit(key);
}

function insertArrow(arrow) {
  // fallback: use lastSylCell's key
  if (lastSylCell) {
    const block = lastSylCell.closest('[id^=block-]');
    if (block) { insertArrowTo(block.id.replace('block-',''), arrow); return; }
  }
  insertArrowTo('s1', arrow);
}

function rebuildTranslit(key) {
  const block = document.getElementById('block-' + key);
  if (!block) return;
  const old = block.querySelector('.trl-line');
  if (old) block.replaceChild(buildTranslitLine(key), old);
  autoFitFonts(key);
}

// ═══════════════════════════════════════════════
// UNDO (one snapshot per key — before reset only)
// ═══════════════════════════════════════════════
const HISTORY = { s1: null, s2: null };

function pushHistory(key) {
  HISTORY[key] = DATA[key].map(s => ({ ...s }));
  const undoBtn = document.getElementById('undo-btn-' + key);
  if (undoBtn) { undoBtn.disabled = false; undoBtn.style.opacity = '0.8'; }
}

function undoRows(key) {
  if (!HISTORY[key]) return;
  DATA[key] = HISTORY[key];
  HISTORY[key] = null;
  const block = document.getElementById('block-' + key);
  if (block) {
    const oldWrap = block.querySelector('.wave-svg-wrap');
    if (oldWrap) block.replaceChild(buildWaveSVG(key), oldWrap);
    applyCheatsheet(key);
  }
  const undoBtn = document.getElementById('undo-btn-' + key);
  if (undoBtn) { undoBtn.disabled = true; undoBtn.style.opacity = '0.4'; }
}

function resetRows(key) {
  pushHistory(key);
  const resetRowSel = document.getElementById('reset-row-sel-' + key);
  const resetRowVal = resetRowSel ? Math.max(0, Math.min(4, (+resetRowSel.value || 2) - 1)) : 1;
  DATA[key].forEach(s => s.row = resetRowVal);
  const block = document.getElementById('block-' + key);
  if (block) {
    const oldWrap = block.querySelector('.wave-svg-wrap');
    if (oldWrap) block.replaceChild(buildWaveSVG(key), oldWrap);
    applyCheatsheet(key);
  }
}

function copyRowsFrom(toKey, fromKey) {
  const from = DATA[fromKey];
  const to   = DATA[toKey];
  if (!from.length || !to.length) return;
  // Copy row positions by index (not by syllable match)
  to.forEach((s, i) => {
    s.row = i < from.length ? from[i].row : s.row;
  });
  // Rebuild wave and cheat table for target key
  const block = document.getElementById('block-' + toKey);
  if (block) {
    const oldWrap = block.querySelector('.wave-svg-wrap');
    if (oldWrap) block.replaceChild(buildWaveSVG(toKey), oldWrap);
    applyCheatsheet(toKey);
  }
}

function applyCheatWidth(key) {
  const svgEl = document.getElementById('svg-' + key);
  if (!svgEl) return;
  const renderedW = svgEl.getBoundingClientRect().width || +svgEl.getAttribute('width');
  if (!renderedW) return;
  const tbl = document.querySelector('#block-' + key + ' table');
  if (!tbl) return;
  tbl.style.width = renderedW + 'px';
}

function buildCheatTable(key, container) {
  // Clear existing table if any
  const existing = container.querySelector('table');
  if (existing) existing.remove();

  const syls = DATA[key];
  if (!syls.length) return;

  const tbl = document.createElement('table');
  tbl.style.cssText = 'border-collapse:collapse;white-space:nowrap;width:100%';
  // Width will be set to match SVG after render via applyCheatWidth(key)

  // Row 1: syllables
  const tr1 = document.createElement('tr');
  // Row 2: row numbers (1-4)
  const tr2 = document.createElement('tr');

  syls.forEach((s, i) => {
    const td1 = document.createElement('td');
    const guruC  = getComputedStyle(document.documentElement).getPropertyValue('--guru').trim()  || '#8B0000';
    const laghuC = getComputedStyle(document.documentElement).getPropertyValue('--laghu').trim() || '#2C4A1E';
    td1.contentEditable = 'true';
    td1.spellcheck = false;
    td1.style.cssText = 'padding:1px 2px;text-align:center;font-family:"Charter Indologique","Cormorant Garamond",serif;font-size:.9rem;cursor:text;min-width:14px;outline:none;border-radius:2px;' +
      (s.type === 'guru' ? `font-weight:700;color:${guruC}` : `color:${laghuC}`);
    td1.textContent = s.syl + (s.arrow || '');
    // Save on blur or Enter
    const saveSyl = () => {
      const raw = td1.textContent.trim();
      // Extract arrow suffix if present
      const arrow = raw.endsWith('↑') ? '↑' : raw.endsWith('↓') ? '↓' : '';
      const syl   = arrow ? raw.slice(0, -1).trim() : raw;
      if (syl) {
        DATA[key][i].syl  = syl;
        DATA[key][i].arrow = arrow;
        DATA[key][i].devSyl = transliterateToDev(syl, 'IAST');
        // Update weight
        DATA[key][i].type = isGuru(syl) ? 'guru' : 'laghu';
        td1.textContent = syl + arrow;
        // Rebuild wave
        const block = document.getElementById('block-' + key);
        if (block) {
          const oldWrap = block.querySelector('.wave-svg-wrap');
          if (oldWrap) block.replaceChild(buildWaveSVG(key), oldWrap);
          rebuildTranslit(key);
        }
      }
    };
    td1.addEventListener('focus', () => { lastSylCell = td1; });
    td1.addEventListener('blur', saveSyl);
    td1.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); td1.blur(); }
      if (e.key === 'Tab')   { e.preventDefault(); td1.blur();
        // Move to next cell
        const allTd = tbl.querySelectorAll('tr:first-child td');
        const idx   = [...allTd].indexOf(td1);
        if (idx >= 0 && idx < allTd.length - 1) allTd[idx+1].focus();
      }
    });
    tr1.appendChild(td1);

    const td2 = document.createElement('td');
    td2.style.cssText = 'padding:1px 1px;text-align:center;';
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = 1; inp.max = 5; inp.value = s.row + 1; // +1 for display (1-4)
    inp.style.cssText = 'width:26px;text-align:center;font-family:"JetBrains Mono",monospace;font-size:.78rem;border:1px solid var(--border);border-radius:3px;padding:1px 0px;background:var(--card);color:var(--ink);outline:none';
    inp.addEventListener('change', () => {
      const newRow = Math.max(0, Math.min(4, (+inp.value || 1) - 1)); // back to 0-4
      inp.value = newRow + 1;
      DATA[key][i].row = newRow;
      const block = document.getElementById('block-' + key);
      if (!block) return;
      const oldWrap = block.querySelector('.wave-svg-wrap');
      if (oldWrap) block.replaceChild(buildWaveSVG(key), oldWrap);
    });
    td2.appendChild(inp);
    tr2.appendChild(td2);
  });

  tbl.appendChild(tr1);
  tbl.appendChild(tr2);
  container.insertBefore(tbl, container.firstChild);
}

function applyCheatsheet(key) {
  // Rebuild the cheat table after data changes
  const wrap = document.getElementById('cheat-wrap-' + key);
  if (!wrap) return;
  const body = wrap.querySelector('div:last-child') || wrap.lastElementChild;
  if (body) buildCheatTable(key, body);
}


function rebuildAll() {
  computeSharedColWidths();
  rebuildTable('s1');
  rebuildTable('s2');
}

function rebuildTable(key) {
  const block = document.getElementById(`block-${key}`);
  if (!block) return;
  computeSharedColWidths();
  const oldWrap = block.querySelector('.wave-svg-wrap');
  const newWrap = buildWaveSVG(key);
  block.replaceChild(newWrap, oldWrap);
  const oldTrl = block.querySelector('.trl-line');
  const newTrl = buildTranslitLine(key);
  block.replaceChild(newTrl, oldTrl);
  // Sync cheat table (type and row changes from context menu)
  applyCheatsheet(key);
  document.fonts.ready.then(() => {
    requestAnimationFrame(() => autoFitFonts(key));
  });
}

// ═══════════════════════════════════════════════
// DOCX GENERATION
// ═══════════════════════════════════════════════
function escXml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function makeCellXml(text, type) {
  const styleId = type === 'guru' ? 'IASTGuru' : 'IASTLaghu';
  // Font size: vary by syllable length like in preview
  const l = text ? text.length : 0;
  const sz = l <= 2 ? 36 : l <= 3 ? 34 : l <= 4 ? 32 : 28;
  const run = text
    ? `<w:r><w:rPr><w:rStyle w:val="${styleId}"/><w:spacing w:val="-10"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t>${escXml(text)}</w:t></w:r>`
    : '';
  return `<w:tc>
      <w:tcPr><w:tcW w:w="682" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      <w:p><w:pPr>
        <w:spacing w:after="0" w:line="240" w:lineRule="atLeast"/>
        <w:ind w:left="-284" w:right="-284"/>
        <w:jc w:val="center"/>
        <w:rPr><w:noProof/><w:spacing w:val="-10"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr>
      </w:pPr>${run}</w:p>
    </w:tc>`;
}

// Resolve CSS vars to concrete colour values
function resolveCssVars(el) {
  // Remove preview-only elements (guide numbers) before PNG export
  el.querySelectorAll('.preview-only').forEach(n => n.remove());
  const vars = {
    'var(--guru)':   getComputedStyle(document.documentElement).getPropertyValue('--guru').trim()||'#8B0000',
    'var(--laghu)':  getComputedStyle(document.documentElement).getPropertyValue('--laghu').trim()||'#2C4A1E',
    'var(--border)': '#d0c8b8',
    'var(--ink2)':   '#6b5c4e',
    'var(--ink)':    '#18120c',
  };
  // Walk every element: fix attr vars AND copy computed stroke/fill
  // so CSS-class-only styles are captured
  function fix(node) {
    if (node.tagName) {
      // Resolve any remaining CSS var() references in attributes
      for (const attr of ['stroke','fill','style','stroke-opacity','stroke-width']) {
        let v = node.getAttribute(attr); if (!v) continue;
        for (const [k,val] of Object.entries(vars)) v = v.replaceAll(k, val);
        node.setAttribute(attr, v);
      }
      // For live DOM elements, also copy computed styles to inline attrs
      // so CSS-class rules (like .wave-line { stroke: ... }) survive serialization
      const live = document.getElementById(node.id || '__none__') ||
                   (node.tagName === 'path' || node.tagName === 'circle' || node.tagName === 'line' ? null : null);
      // Use getComputedStyle on original element by matching id
      const origEl = node.id ? document.getElementById(node.id) : null;
      if (origEl) {
        const cs = getComputedStyle(origEl);
        if (!node.getAttribute('stroke') && cs.stroke && cs.stroke !== 'none' && cs.stroke !== '')
          node.setAttribute('stroke', cs.stroke);
        if (!node.getAttribute('fill') && cs.fill && cs.fill !== 'none' && cs.fill !== '')
          node.setAttribute('fill', cs.fill);
        if (!node.getAttribute('stroke-width') && cs.strokeWidth)
          node.setAttribute('stroke-width', cs.strokeWidth);
        if (!node.getAttribute('stroke-opacity') && cs.strokeOpacity)
          node.setAttribute('stroke-opacity', cs.strokeOpacity);
      }
    }
    for (const ch of node.children) fix(ch);
  }
  fix(el);
}

// Render one SVG element → canvas at given scale
function _exportPadaDivider() {
  const el = document.getElementById('opt-pada-divider');
  return el ? el.checked : true;
}

function renderSvgToCanvas(svgEl, scale) {
  const W = +svgEl.getAttribute('width') || 620;
  const vb = svgEl.getAttribute('viewBox');
  const H = vb ? (+vb.split(' ')[3] || 200) : 200;
  if (!W || !H || !scale || !isFinite(scale)) {
    return Promise.reject(new Error('SVG has zero/invalid dimensions: W=' + W + ' H=' + H + ' scale=' + scale));
  }
  const clone = svgEl.cloneNode(true);
  if (!_exportPadaDivider()) clone.querySelectorAll('.pada-divider').forEach(el => el.remove());
  resolveCssVars(clone);
  const bg = document.createElementNS('http://www.w3.org/2000/svg','rect');
  bg.setAttribute('width', W); bg.setAttribute('height', H); bg.setAttribute('fill','#ffffff');
  clone.insertBefore(bg, clone.firstChild);
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  clone.setAttribute('width', W); clone.setAttribute('height', H);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(W * scale); c.height = Math.round(H * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,c.width,c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      res(c);
    };
    img.onerror = e => rej(new Error('SVG render failed'));
    img.src = url;
  });
}

// Draw text line onto canvas context, return line height used
function drawTextLine(ctx, text, font, color, x, y, maxW) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y, maxW);
  const m = ctx.measureText(text);
  return Math.round(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + 4);
}

async function showPng() {
  if (!DATA.s1.length) { showMsg('Сначала постройте диаграмму', 'err'); return; }
  showMsg('Рендеринг...', 'info');
  try {
    const { canvas } = await _renderPngCanvas();
    if (!canvas) throw new Error('Ошибка рендеринга');
    const dataUrl = canvas.toDataURL('image/png');
    // Remove previous overlay if any
    const prev = document.getElementById('png-overlay');
    if (prev) prev.remove();
    // Get page-wrap dimensions to position overlay
    const pageWrap = document.querySelector('.page-wrap') || document.body;
    const overlay = document.createElement('div');
    overlay.id = 'png-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:16px;overflow-y:auto;box-sizing:border-box;';
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    const _pngEsc = e => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', _pngEsc); } };
    document.addEventListener('keydown', _pngEsc);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ Закрыть';
    closeBtn.className = 'btn btn-s';
    closeBtn.style.cssText = 'margin-bottom:10px;align-self:flex-end;';
    closeBtn.onclick = () => overlay.remove();
    let isOriginal = false;
    const maxW = pageWrap.getBoundingClientRect().width;
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.cssText = 'width:100%;max-width:' + maxW + 'px;height:auto;display:block;border-radius:4px;box-shadow:0 4px 24px rgba(0,0,0,.5);cursor:zoom-in;';
    img.onclick = e => {
      e.stopPropagation();
      isOriginal = !isOriginal;
      img.style.width = isOriginal ? canvas.width + 'px' : '100%';
      img.style.maxWidth = isOriginal ? 'none' : maxW + 'px';
      img.style.cursor = isOriginal ? 'zoom-out' : 'zoom-in';
    };
    overlay.appendChild(closeBtn);
    overlay.appendChild(img);
    document.body.appendChild(overlay);
    showMsg('✓ PNG', 'ok');
  } catch(e) {
    showMsg('Ошибка: ' + e.message, 'err');
  }
}

function _isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function _iosShowImage(dataUrl) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;gap:14px;touch-action:none';
  const msg = document.createElement('div');
  msg.style.cssText = 'color:#fff;font-size:.9rem;text-align:center;font-family:sans-serif;max-width:320px;line-height:1.6;padding:10px 14px;background:rgba(255,255,255,.1);border-radius:8px';
  msg.textContent = t('iosSaveImage');
  const img = document.createElement('img');
  img.src = dataUrl;
  img.style.cssText = 'max-width:100%;max-height:55vh;border-radius:6px;object-fit:contain';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'padding:8px 24px;border:1px solid rgba(255,255,255,.4);border-radius:6px;background:transparent;color:#fff;font-size:.95rem;cursor:pointer';
  closeBtn.onclick = () => document.body.removeChild(ov);
  ov.append(msg, img, closeBtn);
  document.body.appendChild(ov);
}

function _iosShowVideoLink(url) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;gap:16px';
  const msg = document.createElement('div');
  msg.style.cssText = 'color:#fff;font-size:.9rem;text-align:center;font-family:sans-serif;max-width:320px;line-height:1.6;padding:10px 14px;background:rgba(255,255,255,.1);border-radius:8px';
  msg.textContent = t('iosSaveVideo');
  const openBtn = document.createElement('a');
  openBtn.href = url; openBtn.target = '_blank';
  openBtn.textContent = t('iosOpenVideo');
  openBtn.style.cssText = 'display:block;padding:12px 28px;border-radius:6px;background:#357bdd;color:#fff;font-size:.95rem;text-decoration:none;text-align:center;font-family:sans-serif';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'padding:8px 24px;border:1px solid rgba(255,255,255,.4);border-radius:6px;background:transparent;color:#fff;font-size:.9rem;cursor:pointer';
  closeBtn.onclick = () => { URL.revokeObjectURL(url); document.body.removeChild(ov); };
  ov.append(msg, openBtn, closeBtn);
  document.body.appendChild(ov);
}

async function downloadPng() {
  if (!DATA.s1.length) { showMsg('Сначала постройте диаграмму', 'err'); return; }
  showMsg('Рендеринг PNG...', 'info');
  try {
    const { canvas } = await _renderPngCanvas();
    if (!canvas) throw new Error('Ошибка рендеринга');
    const dataUrl = canvas.toDataURL('image/png');
    if (_isIOS()) {
      _iosShowImage(dataUrl);
      showMsg('✓ ' + t('iosSaveImage'), 'ok');
      return;
    }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'shloka_wave_1920x1080.png';
    a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => document.body.removeChild(a), 100);
    showMsg('✓ PNG скачан! (1920×1080)', 'ok');
  } catch(e) {
    showMsg('Ошибка: ' + e.message, 'err');
    console.error(e);
  }
}


function loadImg(dataUrl) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = dataUrl;
  });
}

async function downloadMp4() {
  if (_isIOS()) { showMsg(t('iosNoCapture'), 'err'); return; }
  const _audioEl = document.getElementById('audio-preview');
  if (!_audioEl || !_audioEl.src || _audioEl.style.display === 'none') {
    showMsg('Сначала загрузите аудиофайл', 'err'); return;
  }
  if (!audioFile) { showMsg('Сначала загрузите аудио', 'err'); return; }
  if (!DATA.s1.length) { showMsg('Сначала постройте диаграмму', 'err'); return; }

  const btn = document.getElementById('btn-mp4');
  btn.disabled = true;

  try {
    showMsg('Рендеринг кадра...', 'info');
    let pngDataUrl;
    try { pngDataUrl = await renderToPngDataUrl(); } catch(re) { throw new Error('PNG: ' + re.message); }
    if (!pngDataUrl) throw new Error('PNG рендеринг вернул null');

    const img = await loadImg(pngDataUrl);
    const offscreen = document.createElement('canvas');
    offscreen.width = img.width; offscreen.height = img.height;
    const octx = offscreen.getContext('2d');
    octx.drawImage(img, 0, 0);

    // Decode audio
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(await audioFile.arrayBuffer());
    const duration = audioBuffer.duration;
    showMsg(`Запись видео (${Math.round(duration)} с)...`, 'info');

    // Wait for frame to be painted before capturing stream
    await new Promise(r => setTimeout(r, 100));

    // Capture at 25fps so frame is definitely included
    const stream = offscreen.captureStream(25);

    // Redraw image every 500ms to keep canvas stream alive
    const redrawTimer = setInterval(() => octx.drawImage(img, 0, 0), 500);

    const dest = audioCtx.createMediaStreamDestination();
    const src = audioCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(dest);
    stream.addTrack(dest.stream.getAudioTracks()[0]);

    const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')
      ? 'video/mp4;codecs=avc1'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';
    const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';

    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    await new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = e => reject(e.error || new Error('Ошибка записи'));
      recorder.start(500);
      const startTime = Date.now();
      const timer = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const pct = Math.min(100, Math.round(elapsed / duration * 100));
        showMsg(`Запись видео... ${pct}% (${Math.round(elapsed)}/${Math.round(duration)} с)`, 'info');
      }, 500);
      src.start(0);
      src.onended = () => {
        clearInterval(timer);
        clearInterval(redrawTimer);
        recorder.stop();
        audioCtx.close();
      };
    });

    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'shloka_wave.' + ext;
    a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    showMsg('✓ Видео скачано! (' + ext.toUpperCase() + ')', 'ok');

  } catch(e) {
    showMsg('Ошибка: ' + e.message, 'err');
    console.error(e);
  }
  btn.disabled = false;
}


async function downloadKaraokeMp4() {
  const _audioEl = document.getElementById('audio-preview');
  if (!_audioEl || !_audioEl.src || _audioEl.style.display === 'none') { showMsg('Сначала загрузите аудио', 'err'); return; }
  if (!audioFile) { showMsg('Сначала загрузите аудио', 'err'); return; }
  if (!DATA.s1.length) { showMsg('Сначала постройте диаграмму', 'err'); return; }
  if (!TAP.times.s1 || !TAP.times.s1.length) { showMsg('Сначала выполните тэппинг или авторазбивку', 'err'); return; }
  if (typeof Mp4Muxer === 'undefined') { showMsg('Ошибка: mp4-muxer не загружен', 'err'); return; }
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    if (!confirm(t('mobileExportWarning'))) return;
  }

  const btn = document.getElementById('btn-karaoke-mp4');
  btn.disabled = true;

  try {
    const FPS = 30;
    const frameDurUs = Math.round(1_000_000 / FPS);

    // Decode audio
    showMsg('Декодирование аудио...', 'info');
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(await audioFile.arrayBuffer());
    await audioCtx.close();
    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;
    const totalFrames = Math.ceil(duration * FPS);

    // Render base PNG canvas
    showMsg('Рендеринг базового кадра...', 'info');
    const { canvas: baseCanvas, sylPositions: _sylPos } = await _renderPngCanvas();
    if (!baseCanvas) throw new Error('PNG рендеринг не удался');
    const W = baseCanvas.width, H = baseCanvas.height;

    // Используем точные позиции слогов из _renderPngCanvas
    function getSylPngPos(key, col) {
      return _sylPos[key]?.[col] || null;
    }

    // Setup muxer
    const { Muxer, ArrayBufferTarget } = Mp4Muxer;
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: W, height: H },
      audio: { codec: 'aac', sampleRate, numberOfChannels: numChannels },
      fastStart: 'in-memory',
    });
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: e => { throw new Error('VideoEncoder: ' + e.message); },
    });
    const videoConfig = { codec: 'avc1.640028', width: W, height: H, bitrate: 4_000_000, framerate: FPS };
    const support = await VideoEncoder.isConfigSupported(videoConfig);
    if (!support.supported) throw new Error('Кодек avc1 не поддерживается');
    videoEncoder.configure(videoConfig);

    const workCanvas = document.createElement('canvas');
    workCanvas.width = W; workCanvas.height = H;
    const wdc = workCanvas.getContext('2d');

    // Encode frames
    showMsg('Кодирование видео...', 'info');
    for (let fi = 0; fi < totalFrames; fi++) {
      const t = fi / FPS;
      wdc.clearRect(0, 0, W, H);
      wdc.drawImage(baseCanvas, 0, 0);

      // Compute laghu duration per key for grace period
      function getVideoLaghuDur(key) {
        const times = TAP.times[key] || [];
        const syls  = DATA[key] || [];
        if (times.length < 2) return 0.3;
        const halfIdx = Math.floor(times.length / 2);
        const span = times[times.length - 1] - times[halfIdx];
        const units = syls.slice(halfIdx).reduce((a, s) => a + (s.type === 'guru' ? 2 : 1), 0);
        return units > 0 ? span / units : 0.3;
      }

      ['s1', 's2'].forEach(key => {
        const times = TAP.times[key] || [];
        const syls  = DATA[key] || [];
        if (!times.length) return;
        // Check if past last syllable
        // Конец последнего слога — из _padaBounds конец последней пады строфы
        let lastSylEnd;
        if (_padaBounds) {
          const lastPada = key === 's1' ? _padaBounds[1] : _padaBounds[3];
          lastSylEnd = lastPada ? lastPada[1] : (times[times.length-1] + getVideoLaghuDur(key) * 2);
        } else {
          const lastSylUnits = syls[syls.length - 1]?.type === 'guru' ? 2 : 1;
          lastSylEnd = times[times.length-1] + getVideoLaghuDur(key) * lastSylUnits;
        }
        if (t > lastSylEnd) return; // don't highlight

        const idx = _currentSylIndex(key, t);
        if (idx < 0) return;
        const s = DATA[key][idx];
        if (!s) return;
        const pos = getSylPngPos(key, s.col);
        drawHighlight(wdc, pos);
      });

      const bitmap = await createImageBitmap(workCanvas);
      const vf = new VideoFrame(bitmap, { timestamp: fi * frameDurUs, duration: frameDurUs });
      videoEncoder.encode(vf, { keyFrame: fi % (FPS * 2) === 0 });
      vf.close();
      bitmap.close();

      if (fi % 20 === 0) {
        showMsg(`Кодирование: ${Math.round(fi / totalFrames * 100)}%...`, 'info');
        await new Promise(r => setTimeout(r, 0));
      }
    }
    await videoEncoder.flush();

    // Encode audio
    showMsg('Кодирование аудио...', 'info');
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: e => { throw new Error('AudioEncoder: ' + e.message); },
    });
    audioEncoder.configure({ codec: 'mp4a.40.2', sampleRate, numberOfChannels: numChannels, bitrate: 128_000 });
    const CHUNK = 4096;
    const totalSamples = audioBuffer.length;
    const channelData = Array.from({ length: numChannels }, (_, c) => audioBuffer.getChannelData(c));
    for (let offset = 0; offset < totalSamples; offset += CHUNK) {
      const len = Math.min(CHUNK, totalSamples - offset);
      const ts = Math.round(offset / sampleRate * 1_000_000);
      const interleaved = new Float32Array(len * numChannels);
      for (let i = 0; i < len; i++)
        for (let c = 0; c < numChannels; c++)
          interleaved[i * numChannels + c] = channelData[c][offset + i];
      const ad = new AudioData({ format: 'f32', sampleRate, numberOfFrames: len, numberOfChannels: numChannels, timestamp: ts, data: interleaved });
      audioEncoder.encode(ad);
      ad.close();
    }
    await audioEncoder.flush();
    muxer.finalize();

    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    if (_isIOS()) {
      _iosShowVideoLink(url);
      showMsg('✓ ' + t('iosSaveVideo'), 'ok');
    } else {
      const a = document.createElement('a');
      a.href = url; a.download = 'shloka_karaoke.mp4';
      a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
      showMsg('✓ Караоке MP4 скачан!', 'ok');
    }

  } catch(e) {
    showMsg('Ошибка: ' + e.message, 'err');
    console.error(e);
  }
  btn.disabled = false;
}

async function downloadTelegramStoryMp4() {
  const _audioEl = document.getElementById('audio-preview');
  if (!_audioEl || !_audioEl.src || _audioEl.style.display === 'none') { showMsg('Сначала загрузите аудио', 'err'); return; }
  if (!audioFile) { showMsg('Сначала загрузите аудио', 'err'); return; }
  if (!DATA.s1.length) { showMsg('Сначала постройте диаграмму', 'err'); return; }
  if (!TAP.times.s1 || !TAP.times.s1.length) { showMsg('Сначала выполните тайминг', 'err'); return; }
  if (typeof Mp4Muxer === 'undefined') { showMsg('Ошибка: mp4-muxer не загружен', 'err'); return; }

  const fmtSel  = document.getElementById('story-format-sel');
  const zoomSel = document.getElementById('story-zoom-sel');
  const fmt = fmtSel ? fmtSel.value : '9:16';
  const sylsToShow = parseInt(zoomSel ? zoomSel.value : '3', 10);
  const [storyW, storyH] = fmt === '1:1' ? [1080, 1080] : [1080, 1920];

  const btn = document.getElementById('btn-story-mp4');
  btn.disabled = true;

  try {
    const FPS = 24;
    const frameDurUs = Math.round(1_000_000 / FPS);

    showMsg('Декодирование аудио...', 'info');
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(await audioFile.arrayBuffer());
    await audioCtx.close();
    const sampleRate = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;
    const duration = audioBuffer.duration;
    const totalFrames = Math.ceil(duration * FPS);

    showMsg('Рендеринг базового кадра...', 'info');
    const { canvas: baseCanvas, sylPositions: _sylPos } = await _renderPngCanvas();
    if (!baseCanvas) throw new Error('PNG рендеринг не удался');
    const BW = baseCanvas.width, BH = baseCanvas.height; // 1920 × 1080

    // Compute average horizontal spacing between adjacent syllables
    const allXPos = [];
    for (const key of ['s1', 's2']) {
      for (const col in (_sylPos[key] || {})) allXPos.push(_sylPos[key][col].x);
    }
    allXPos.sort((a, b) => a - b);
    let avgSpacing = 120;
    if (allXPos.length >= 2) {
      const spacings = allXPos.slice(1).map((x, i) => x - allXPos[i]).filter(d => d > 4);
      if (spacings.length) {
        spacings.sort((a, b) => a - b);
        avgSpacing = spacings[Math.floor(spacings.length / 2)];
      }
    }

    // Source window: show sylsToShow syllables, maintain output aspect ratio
    let srcW = avgSpacing * (sylsToShow + 0.5);
    let srcH = srcW * (storyH / storyW);
    if (srcH > BH) { srcH = BH; srcW = BH * (storyW / storyH); }
    srcW = Math.max(srcW, 80); srcH = Math.max(srcH, 80);

    function getSylPos(key, col) { return _sylPos[key]?.[col] || null; }

    // Initial camera: first syllable of s1
    let camX = BW / 2, camY = BH / 2;
    const s1Sorted = [...(DATA.s1 || [])].sort((a, b) => a.col - b.col);
    if (s1Sorted.length) {
      const p0 = getSylPos('s1', s1Sorted[0].col);
      if (p0) { camX = p0.x; camY = p0.y; }
    }

    const minCamX = srcW / 2, maxCamX = BW - srcW / 2;
    const minCamY = srcH / 2, maxCamY = BH - srcH / 2;
    camX = Math.max(minCamX, Math.min(maxCamX, camX));
    camY = Math.max(minCamY, Math.min(maxCamY, camY));
    let cam = { camX, camY };

    // Setup muxer
    const { Muxer, ArrayBufferTarget } = Mp4Muxer;
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: storyW, height: storyH },
      audio: { codec: 'aac', sampleRate, numberOfChannels: numChannels },
      fastStart: 'in-memory',
    });
    const videoConfig = { codec: 'avc1.640028', width: storyW, height: storyH, bitrate: 6_000_000, framerate: FPS };
    const support = await VideoEncoder.isConfigSupported(videoConfig);
    if (!support.supported) throw new Error('Кодек avc1 не поддерживается');
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: e => { throw new Error('VideoEncoder: ' + e.message); },
    });
    videoEncoder.configure(videoConfig);

    const workCanvas = document.createElement('canvas');
    workCanvas.width = storyW; workCanvas.height = storyH;
    const wdc = workCanvas.getContext('2d');
    const LERP = 0.10; // camera smoothing per frame
    const camBounds = { minX: minCamX, maxX: maxCamX, minY: minCamY, maxY: maxCamY };

    showMsg('Кодирование видео...', 'info');
    for (let fi = 0; fi < totalFrames; fi++) {
      const t = fi / FPS;
      cam = updateCamera(cam, _sylPos, TAP.times, DATA, _padaBounds, t, camBounds, LERP);
      drawStoryFrame(wdc, baseCanvas, cam, srcW, srcH, storyW, storyH,
                     _sylPos, TAP.times, DATA, _padaBounds, t);

      const bitmap = await createImageBitmap(workCanvas);
      const vf = new VideoFrame(bitmap, { timestamp: fi * frameDurUs, duration: frameDurUs });
      videoEncoder.encode(vf, { keyFrame: fi % (FPS * 2) === 0 });
      vf.close(); bitmap.close();

      if (fi % 30 === 0) {
        showMsg(`Story: ${Math.round(fi / totalFrames * 100)}%...`, 'info');
        await new Promise(r => setTimeout(r, 0));
      }
    }
    await videoEncoder.flush();

    // Encode audio (identical to karaoke export)
    showMsg('Кодирование аудио...', 'info');
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: e => { throw new Error('AudioEncoder: ' + e.message); },
    });
    audioEncoder.configure({ codec: 'mp4a.40.2', sampleRate, numberOfChannels: numChannels, bitrate: 128_000 });
    const CHUNK = 4096;
    const totalSamples = audioBuffer.length;
    const channelData = Array.from({ length: numChannels }, (_, c) => audioBuffer.getChannelData(c));
    for (let offset = 0; offset < totalSamples; offset += CHUNK) {
      const len = Math.min(CHUNK, totalSamples - offset);
      const ts = Math.round(offset / sampleRate * 1_000_000);
      const interleaved = new Float32Array(len * numChannels);
      for (let i = 0; i < len; i++)
        for (let c = 0; c < numChannels; c++)
          interleaved[i * numChannels + c] = channelData[c][offset + i];
      const ad = new AudioData({ format: 'f32', sampleRate, numberOfFrames: len, numberOfChannels: numChannels, timestamp: ts, data: interleaved });
      audioEncoder.encode(ad); ad.close();
    }
    await audioEncoder.flush();
    muxer.finalize();

    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fmt === '1:1' ? 'shloka_story_sq.mp4' : 'shloka_story_9x16.mp4';
    a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    showMsg('✓ Story MP4 скачан!', 'ok');

  } catch(e) {
    showMsg('Ошибка: ' + e.message, 'err');
    console.error(e);
  }
  btn.disabled = false;
}

async function downloadMp4Muxer() {
  const _audioEl = document.getElementById('audio-preview');
  if (!_audioEl || !_audioEl.src || _audioEl.style.display === 'none') {
    showMsg('Сначала загрузите аудиофайл', 'err'); return;
  }
  if (!audioFile) { showMsg('Сначала загрузите аудио', 'err'); return; }
  if (!DATA.s1.length) { showMsg('Сначала постройте диаграмму', 'err'); return; }
  if (typeof Mp4Muxer === 'undefined') { showMsg('Ошибка: mp4-muxer не загружен', 'err'); return; }

  const btn = document.getElementById('btn-mp4-muxer');
  btn.disabled = true;

  try {
    showMsg('Рендеринг кадра...', 'info');
    const { canvas: frameCanvas } = await _renderPngCanvas();
    if (!frameCanvas) throw new Error('PNG рендеринг не удался');
    const W = frameCanvas.width, H = frameCanvas.height;

    showMsg('Декодирование аудио...', 'info');
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(await audioFile.arrayBuffer());
    await audioCtx.close();
    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;

    showMsg('Кодирование видео...', 'info');

    const { Muxer, ArrayBufferTarget } = Mp4Muxer;
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: W, height: H },
      audio: { codec: 'aac', sampleRate, numberOfChannels: numChannels },
      fastStart: 'in-memory',
    });

    // --- Video: encode at 1fps (static image) ---
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: e => { throw new Error('VideoEncoder: ' + e.message); },
    });
    const videoConfig = { codec: 'avc1.640028', width: W, height: H, bitrate: 2_000_000, framerate: 1 };
    const support = await VideoEncoder.isConfigSupported(videoConfig);
    if (!support.supported) throw new Error('Кодек avc1 не поддерживается в этом браузере');
    videoEncoder.configure(videoConfig);

    const bitmap = await createImageBitmap(frameCanvas);
    const totalFrames = Math.ceil(duration);
    const frameDurationUs = 1_000_000;
    for (let i = 0; i < totalFrames; i++) {
      const f = new VideoFrame(bitmap, { timestamp: i * frameDurationUs, duration: frameDurationUs });
      videoEncoder.encode(f, { keyFrame: i === 0 });
      f.close();
      if (i % 30 === 0) await new Promise(r => setTimeout(r, 0));
    }
    await videoEncoder.flush();
    bitmap.close();

    // --- Audio: encode in chunks ---
    showMsg('Кодирование аудио...', 'info');
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: e => { throw new Error('AudioEncoder: ' + e.message); },
    });
    audioEncoder.configure({ codec: 'mp4a.40.2', sampleRate, numberOfChannels: numChannels, bitrate: 128_000 });

    const CHUNK = 4096;
    const totalSamples = audioBuffer.length;
    const channelData = Array.from({ length: numChannels }, (_, c) => audioBuffer.getChannelData(c));
    for (let offset = 0; offset < totalSamples; offset += CHUNK) {
      const len = Math.min(CHUNK, totalSamples - offset);
      const ts = Math.round(offset / sampleRate * 1_000_000);
      const interleaved = new Float32Array(len * numChannels);
      for (let i = 0; i < len; i++)
        for (let c = 0; c < numChannels; c++)
          interleaved[i * numChannels + c] = channelData[c][offset + i];
      const ad = new AudioData({ format: 'f32', sampleRate, numberOfFrames: len, numberOfChannels: numChannels, timestamp: ts, data: interleaved });
      audioEncoder.encode(ad);
      ad.close();
    }
    await audioEncoder.flush();
    muxer.finalize();

    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'shloka_wave_fast.mp4';
    a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    showMsg('✓ MP4 скачан (mp4-muxer)!', 'ok');

  } catch(e) {
    showMsg('Ошибка: ' + e.message, 'err');
    console.error(e);
  }
  btn.disabled = false;
}

async function renderToPngDataUrl() {
  // Reuse the same canvas logic as downloadPng, return dataURL instead of downloading
  return await _renderPngCanvas().then(r => r?.canvas ? r.canvas.toDataURL('image/png') : null);
}

async function _renderPngCanvas() {
  await document.fonts.ready;

  const svgEl1 = document.getElementById('svg-s1');
  const svgEl2 = document.getElementById('svg-s2');
  if (!svgEl1 || !svgEl2) return null;

  const { guruColor, laghuColor } = _getWaveColors();
  const verse = {
    s1dev: document.getElementById('s1dev')?.value.trim() || '',
    s2dev: document.getElementById('s2dev')?.value.trim() || '',
    meter: document.getElementById('meter-label')?.textContent?.trim() || '',
  };
  return composePngFrame(verse, { s1: DATA.s1, s2: DATA.s2 }, {
    guruColor,
    laghuColor,
    showDev: SHOW_DEV,
    waveScale: waveScale(),
    smooth: document.getElementById('opt-smooth')?.value || 'bezier',
    showDots: !document.getElementById('opt-dots') || document.getElementById('opt-dots').checked,
    showLine: !document.getElementById('opt-line') || document.getElementById('opt-line').checked,
    hollow: !document.getElementById('opt-hollow') || document.getElementById('opt-hollow').checked,
    greyIast: !document.getElementById('opt-grey-iast') || document.getElementById('opt-grey-iast').checked,
    footer: {
      author: document.getElementById('ft-author')?.value.trim() || '',
      year: document.getElementById('ft-year')?.value.trim() || '',
      url: document.getElementById('ft-url')?.value.trim() || '',
      source: document.getElementById('ft-source')?.value.trim() || '',
      meter: document.getElementById('ft-meter')?.value.trim() || '',
    },
  });

  const OUT_W = 1920, OUT_H = 1080, MARGIN = 24, FT_AREA = 80;
  const contentH = OUT_H - MARGIN - FT_AREA - MARGIN;
  const GAP_BLOCK = 40, GAP_LINE = 14;
  const GURU_C = getComputedStyle(document.documentElement).getPropertyValue('--guru').trim()||'#8B0000';
    const LAGHU_C = getComputedStyle(document.documentElement).getPropertyValue('--laghu').trim()||'#2C4A1E';
    const INK_C = '#18120c';

  const measure = document.createElement('canvas').getContext('2d');
  function fitFontSize(ctx, text, family, maxW, maxSz, minSz) {
    for (let sz = maxSz; sz >= minSz; sz -= 0.5) {
      ctx.font = `700 ${sz}px "${family}", serif`;
      if (ctx.measureText(text).width <= maxW) return sz;
    }
    return minSz;
  }

  const devTarget = Math.round(OUT_W * 0.8);
  function getDevInfo(idx) {
    const dev = document.getElementById('s' + idx + 'dev').value.trim();
    const fontPx = Math.round(fitFontSize(measure, dev, 'Sanskrit 2003', devTarget, 120, 18));
    measure.font = `700 ${fontPx}px "Sanskrit 2003", serif`;
    const devW = Math.round(measure.measureText(dev).width);
    return { dev, fontPx, devW };
  }
  const di1 = getDevInfo(1), di2 = getDevInfo(2);
  // Guard: if devanagari fields are empty or font not yet loaded, devW may be 0.
  // Fall back to SVG natural width so scale never becomes 0.
  const svgNatW = Math.max(
    +(svgEl1.getAttribute('width') || 0),
    +(svgEl2.getAttribute('width') || 0)
  );
  const blockW = Math.max(di1.devW, di2.devW, svgNatW, 620);

  function calcBlockInfo(key, idx, di) {
    const syls = [...DATA[key]].sort((a,b) => a.col - b.col || a.row - b.row);
    const iast = syls.map(s => s.syl).join('  ');
    const iastFontPx = Math.round(fitFontSize(measure, iast, 'Charter Indologique', blockW, 48, 8));
    // Strip trailing dandas, digits, spaces from end
    const devMain = di.dev.replace(/\s*[\u0964\u0965|]+(?:\s*[\d\u0966-\u096F0-9]+\s*[\u0964\u0965|]+)?\s*$/, '');
    const devSuffix = di.dev.slice(devMain.length);
    return { dev: devMain, devSuffix, iast, syls, devFontPx: di.fontPx, iastFontPx, devH: di.fontPx + 10, iastH: iastFontPx + 8 };
  }

  const bInfo1 = calcBlockInfo('s1', 1, di1);
  const bInfo2 = calcBlockInfo('s2', 2, di2);

  const svgW1 = +svgEl1.getAttribute('width');
  const svgW2 = +svgEl2.getAttribute('width');
  const [wave1s_0, wave2s_0] = await Promise.all([
    renderSvgToCanvas(svgEl1, blockW / svgW1),
    renderSvgToCanvas(svgEl2, blockW / svgW2),
  ]);


  function makeB(bi, wc) {
    const totalH = wc.height + GAP_LINE + bi.devH + GAP_LINE + bi.iastH;
    return { ...bi, gl: GAP_LINE, totalH };
  }

  let fb1 = makeB(bInfo1, wave1s_0), fb2 = makeB(bInfo2, wave2s_0);
  let finalWave1 = wave1s_0, finalWave2 = wave2s_0, finalBlockW = blockW;

  const naturalH = fb1.totalH + GAP_BLOCK + fb2.totalH;
  const vScale = naturalH > contentH ? contentH / naturalH : 1;
  if (vScale < 1) {
    const sW = Math.round(blockW * vScale);
    [finalWave1, finalWave2] = await Promise.all([
      renderSvgToCanvas(svgEl1, sW / svgW1),
      renderSvgToCanvas(svgEl2, sW / svgW2),
    ]);
    finalBlockW = sW;
    function sB(bi, wc) {
      const dp = Math.round(fitFontSize(measure, bi.dev, 'Sanskrit 2003', sW, 120, 18));
      const ip = Math.round(fitFontSize(measure, bi.iast, 'Charter Indologique', sW, 48, 8));
      const gl = Math.round(GAP_LINE * vScale);
      return { ...bi, devFontPx: dp, iastFontPx: ip, devH: dp+10, iastH: ip+8, gl,
               totalH: wc.height + gl + dp + 10 + gl + ip + 8 };
    }
    fb1 = sB(bInfo1, finalWave1); fb2 = sB(bInfo2, finalWave2);
  }

  const canvas = document.createElement('canvas');
  canvas.width = OUT_W; canvas.height = OUT_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, OUT_W, OUT_H);

  const usedH = fb1.totalH + Math.round(GAP_BLOCK * vScale) + fb2.totalH;
  const vOffset = MARGIN + Math.max(0, Math.round((contentH - usedH) / 2));
  const hOffset = Math.round((OUT_W - finalBlockW) / 2);

  function drawBlock(waveCanvas, b, yStart) {
    ctx.drawImage(waveCanvas, hOffset, yStart);
    let y = yStart + waveCanvas.height + b.gl;
    ctx.font = `700 ${b.devFontPx}px "Sanskrit 2003", serif`;
    ctx.fillStyle = INK_C;
    ctx.fillText(b.dev, hOffset, y + b.devFontPx * 0.82);
    // Draw suffix (dandas + number) after the main dev text
    if (b.devSuffix) {
      const mainW = ctx.measureText(b.dev).width;
      ctx.fillText(b.devSuffix, hOffset + mainW, y + b.devFontPx * 0.82);
    }
    y += b.devH + b.gl;
    const sylFont = s => SHOW_DEV && s.devSyl
      ? `${s.type==='guru'?700:400} ${b.iastFontPx}px "Sanskrit 2003",serif`
      : `${s.type==='guru'?700:400} ${b.iastFontPx}px "Charter Indologique","Cormorant Garamond",serif`;
    const sylLabel = s => SHOW_DEV && s.devSyl ? s.devSyl : s.syl;
    const sylWidths = b.syls.map(s => {
      ctx.font = sylFont(s);
      return ctx.measureText(sylLabel(s)).width;
    });
    const natW = sylWidths.reduce((a,w)=>a+w,0);
    const gapW = b.syls.length > 1 ? Math.min((finalBlockW - natW)/(b.syls.length-1), b.iastFontPx*1.2) : 0;
    const greyIast = !document.getElementById('opt-grey-iast') || document.getElementById('opt-grey-iast').checked;
    let x = hOffset;
    b.syls.forEach((s, i) => {
      const iastCol = greyIast ? '#888888' : (s.type==='guru' ? GURU_C : LAGHU_C);
      ctx.font = sylFont(s);
      ctx.fillStyle = iastCol;
      ctx.fillText(sylLabel(s), x, y + b.iastFontPx * 0.82);
      x += (sylWidths[i] || 0) + gapW;
    });
  }

  drawBlock(finalWave1, fb1, vOffset);
  drawBlock(finalWave2, fb2, vOffset + fb1.totalH + Math.round(GAP_BLOCK * vScale));

  // Pada divider lines
  function drawPngPadaDivider(key, waveTop, svgEl, svgW) {
    const syls = [...DATA[key]].sort((a,b) => a.col - b.col);
    const halfIdx = Math.ceil(syls.length / 2);
    if (halfIdx <= 0 || halfIdx >= syls.length) return;
    const nodeA = svgEl.querySelector(`.syl-node[data-col="${syls[halfIdx-1].col}"]`);
    const nodeB = svgEl.querySelector(`.syl-node[data-col="${syls[halfIdx].col}"]`);
    if (!nodeA || !nodeB) return;
    const cxA = parseFloat(nodeA.querySelector('circle')?.getAttribute('cx') || 0);
    const cxB = parseFloat(nodeB.querySelector('circle')?.getAttribute('cx') || 0);
    const sc = finalBlockW / svgW;
    const divX = hOffset + (cxA + cxB) / 2 * sc;
    const vb = svgEl.getAttribute('viewBox');
    const svgH = vb ? +vb.split(' ')[3] : 200;
    const y0 = waveTop + 4 * sc;
    const y1 = waveTop + (svgH - 4) * sc;
    ctx.save();
    ctx.strokeStyle = '#a07020';
    ctx.lineWidth = Math.max(2, sc * 1.2);
    ctx.setLineDash([Math.round(6 * sc), Math.round(4 * sc)]);
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(divX, y0);
    ctx.lineTo(divX, y1);
    ctx.stroke();
    ctx.restore();
  }
  if (_exportPadaDivider()) {
    drawPngPadaDivider('s1', vOffset, svgEl1, svgW1);
    drawPngPadaDivider('s2', vOffset + fb1.totalH + Math.round(GAP_BLOCK * vScale), svgEl2, svgW2);
  }

  // Собираем точные позиции кружков слогов для видеокодера
  const sylPositions = {};
  function collectSylPos(key, svgEl, svgW, waveTop) {
    const sc = finalBlockW / svgW;
    sylPositions[key] = {};
    DATA[key].forEach(s => {
      const node = svgEl.querySelector(`.syl-node[data-col="${s.col}"]`);
      if (!node) return;
      const circle = node.querySelector('circle');
      if (!circle) return;
      const cx = parseFloat(circle.getAttribute('cx'));
      const cy = parseFloat(circle.getAttribute('cy'));
      const r  = parseFloat(circle.getAttribute('r') || '8');
      sylPositions[key][s.col] = { x: hOffset + cx * sc, y: waveTop + cy * sc, r: r * sc };
    });
  }
  collectSylPos('s1', svgEl1, svgW1, vOffset);
  collectSylPos('s2', svgEl2, svgW2, vOffset + fb1.totalH + Math.round(GAP_BLOCK * vScale));

  // Footer
  const ftAuthor = document.getElementById('ft-author').value.trim();
  const ftYear   = document.getElementById('ft-year').value.trim();
  const ftUrl    = document.getElementById('ft-url').value.trim();
  const ftSource = document.getElementById('ft-source').value.trim();
  const ftMeterEl = document.getElementById('ft-meter');
  const ftMeter = ftMeterEl && ftMeterEl.value.trim() ? ftMeterEl.value.trim() : '';
  const FT_H=56, FT_SZ=24, FT_Y=OUT_H-20;
  const FT_COL='#3a3530', OM_COL='#c0392b', URL_COL='#2a6496', OM='ॐ';
  const FT_FONT=`400 ${FT_SZ}px "Charter Indologique","Cormorant Garamond",serif`;
  const FT_FONT_B=`700 ${FT_SZ}px "Charter Indologique","Cormorant Garamond",serif`;
  const OM_FONT=`400 ${FT_SZ+6}px "Sanskrit 2003",serif`;
  const mW2=(t,f)=>{ctx.font=f;return ctx.measureText(t).width;};
  ctx.strokeStyle='#cccccc'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(MARGIN,OUT_H-FT_H); ctx.lineTo(OUT_W-MARGIN,OUT_H-FT_H); ctx.stroke();
  // Build centre parts: Автор · Источник · Размер · Год + ссылка
  // Auto-shrink font if content doesn't fit
  const SEP = '  ·  ';
  const MAX_CONTENT_W = OUT_W - MARGIN * 2;
  const gap = 20;

  function buildFooterAtSize(sz) {
    const fFont  = `400 ${sz}px "Charter Indologique","Cormorant Garamond",serif`;
    const fFontB = `700 ${sz}px "Charter Indologique","Cormorant Garamond",serif`;
    const oFont  = `400 ${sz+6}px "Sanskrit 2003",serif`;
    const segs = [];
    if (ftAuthor) segs.push({ text: ftAuthor, font: fFont,  col: FT_COL });
    if (ftSource) segs.push({ text: ftSource, font: fFont,  col: FT_COL });
    if (ftMeter)  segs.push({ text: ftMeter,  font: fFont,  col: FT_COL });
    if (ftYear)   segs.push({ text: ftYear,   font: fFont,  col: FT_COL });
    if (ftUrl)    segs.push({ text: ftUrl,    font: fFontB, col: URL_COL, underline: true });
    const sepW = mW2(SEP, fFont);
    const omW  = mW2(OM, oFont);
    let centreW = 0;
    segs.forEach((s, i) => { s.w = mW2(s.text, s.font); centreW += s.w + (i < segs.length-1 ? sepW : 0); });
    const totalW = omW + gap + centreW + gap + omW;
    return { segs, sepW, omW, centreW, totalW, fFont, fFontB, oFont };
  }

  // Shrink from FT_SZ down to 14px until it fits
  let ftSzActual = FT_SZ;
  let ft = buildFooterAtSize(ftSzActual);
  while (ft.totalW > MAX_CONTENT_W && ftSzActual > 14) {
    ftSzActual -= 1;
    ft = buildFooterAtSize(ftSzActual);
  }

  const { segs, sepW, omW, centreW, oFont } = ft;
  const x0 = Math.round((OUT_W - ft.totalW) / 2);
  const ftYadj = FT_Y + Math.round((FT_SZ - ftSzActual) / 2); // vertical centre compensation

  // Draw left OM
  ctx.font = oFont; ctx.fillStyle = OM_COL; ctx.textAlign = 'left';
  ctx.fillText(OM, x0, ftYadj);

  // Draw centre segments
  let cx = x0 + omW + gap;
  segs.forEach((s, i) => {
    ctx.font = s.font; ctx.fillStyle = s.col;
    ctx.fillText(s.text, cx, ftYadj);
    if (s.underline) {
      ctx.strokeStyle = s.col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, ftYadj+3); ctx.lineTo(cx + s.w, ftYadj+3); ctx.stroke();
    }
    cx += s.w;
    if (i < segs.length - 1) {
      ctx.font = ft.fFont; ctx.fillStyle = FT_COL;
      ctx.fillText(SEP, cx, ftYadj);
      cx += sepW;
    }
  });

  // Draw right OM
  ctx.font = oFont; ctx.fillStyle = OM_COL;
  ctx.fillText(OM, x0 + omW + gap + centreW + gap, ftYadj);
  ctx.textAlign = 'left';

  return { canvas, sylPositions };
}

// ═══════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════
// ═══════════════════════════════════════════════
// DEFAULTS via localStorage
// ═══════════════════════════════════════════════
const DEFAULTS_KEY = 'shloka_defaults_v1';

function collectSettings() {
  return {
    guruColor:  document.getElementById('color-guru')      ? document.getElementById('color-guru').value      : '#8B0000',
    laghuColor: document.getElementById('color-laghu')     ? document.getElementById('color-laghu').value     : '#2C4A1E',
    showDots:   document.getElementById('opt-dots')        ? document.getElementById('opt-dots').checked       : true,
    showLine:   document.getElementById('opt-line')        ? document.getElementById('opt-line').checked       : true,
    hollow:     document.getElementById('opt-hollow')      ? document.getElementById('opt-hollow').checked     : true,
    greyIast:   document.getElementById('opt-grey-iast')   ? document.getElementById('opt-grey-iast').checked  : true,

    sylMode:    document.getElementById('syl-mode-std')    ? (document.getElementById('syl-mode-std').checked ? 'std' : 'user') : 'user',
    waveScale:  document.getElementById('opt-wave-scale')  ? document.getElementById('opt-wave-scale').value   : '0.5',
    ftAuthor:   document.getElementById('ft-author')       ? document.getElementById('ft-author').value        : '',
    ftYear:     document.getElementById('ft-year')         ? document.getElementById('ft-year').value          : '',
    ftUrl:      document.getElementById('ft-url')          ? document.getElementById('ft-url').value           : '',
    ftSource:   document.getElementById('ft-source')       ? document.getElementById('ft-source').value        : '',
    ftMeter:    document.getElementById('ft-meter')        ? document.getElementById('ft-meter').value         : '',
    cheatOpen:  document.getElementById('opt-cheat-open') ? document.getElementById('opt-cheat-open').checked  : false,
    msgPos:     getMsgPos(),
  };
}

function applySettingsToUI(s) {
  if (!s) return;
  if (s.guruColor  && document.getElementById('color-guru'))    document.getElementById('color-guru').value   = s.guruColor;
  if (s.laghuColor && document.getElementById('color-laghu'))   document.getElementById('color-laghu').value  = s.laghuColor;
  if (s.guruColor || s.laghuColor) applyColors();
  if (s.showDots  !== undefined && document.getElementById('opt-dots'))     document.getElementById('opt-dots').checked    = s.showDots;
  if (s.showLine  !== undefined && document.getElementById('opt-line'))     document.getElementById('opt-line').checked    = s.showLine;
  if (s.hollow    !== undefined && document.getElementById('opt-hollow'))   document.getElementById('opt-hollow').checked  = s.hollow;
  if (s.greyIast  !== undefined && document.getElementById('opt-grey-iast'))document.getElementById('opt-grey-iast').checked = s.greyIast;

  if (s.sylMode   && document.getElementById('syl-mode-std'))
    document.getElementById(s.sylMode === 'std' ? 'syl-mode-std' : 'syl-mode-user').checked = true;
  if (s.waveScale && document.getElementById('opt-wave-scale')) {
    document.getElementById('opt-wave-scale').value = s.waveScale;
    if (document.getElementById('opt-wave-scale-val'))
      document.getElementById('opt-wave-scale-val').textContent = parseFloat(s.waveScale).toFixed(2);
  }
  if (s.ftAuthor  !== undefined && document.getElementById('ft-author'))  document.getElementById('ft-author').value  = s.ftAuthor;
  if (s.ftYear    !== undefined && document.getElementById('ft-year'))    document.getElementById('ft-year').value    = s.ftYear;
  if (s.ftUrl     !== undefined && document.getElementById('ft-url'))     document.getElementById('ft-url').value     = s.ftUrl;
  if (s.ftSource  !== undefined && document.getElementById('ft-source'))  document.getElementById('ft-source').value  = s.ftSource;
  if (s.ftMeter   !== undefined && document.getElementById('ft-meter'))   document.getElementById('ft-meter').value   = s.ftMeter;
  if (s.msgPos) {
    const el = document.getElementById(
      s.msgPos === 'header' ? 'msg-pos-header' : s.msgPos === 'both' ? 'msg-pos-both' : 'msg-pos-sidebar'
    );
    if (el) el.checked = true;
  }
}

function saveDefaults() {
  try {
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(collectSettings()));
    const msg = document.getElementById('defaults-saved-msg');
    if (msg) { msg.style.display = ''; setTimeout(() => msg.style.display = 'none', 2000); }
  } catch(e) { showMsg('localStorage недоступен', 'err'); }
}

function loadDefaults() {
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    if (raw) applySettingsToUI(JSON.parse(raw));
  } catch(e) { /* ignore */ }
}

function applyColorPreset(btn) {
  const guru  = btn.dataset.guru;
  const laghu = btn.dataset.laghu;
  document.getElementById('color-guru').value  = guru;
  document.getElementById('color-laghu').value = laghu;
  applyColors();
}

function applyColors() {
  const guru  = document.getElementById('color-guru').value;
  const laghu = document.getElementById('color-laghu').value;
  document.documentElement.style.setProperty('--guru',  guru);
  document.documentElement.style.setProperty('--laghu', laghu);
  rebuildAll();
}

function _buildSessionState() {
  const state = {
    version: 1,
    // Text
    devInput: document.getElementById('dev-input').value,
    dev1: document.getElementById('s1dev').value,
    dev2: document.getElementById('s2dev').value,
    // Syllable edits with arrows
    syls: {
      s1: DATA.s1.map(s => ({ syl: s.syl, type: s.type, row: s.row, col: s.col, arrow: s.arrow||'' })),
      s2: DATA.s2.map(s => ({ syl: s.syl, type: s.type, row: s.row, col: s.col, arrow: s.arrow||'' })),
    },
    tapTimes: { s1: TAP.times.s1 || [], s2: TAP.times.s2 || [] },
    cheatY:   { s1: TAP.cheatY.s1 || [], s2: TAP.cheatY.s2 || [] },
    padaBounds: _padaBounds ? _padaBounds.map(b => [b[0], b[1]]) : null,
    // Cheatsheets per key (from DOM after render)
    cheat: {
      s1: (() => { const el = document.getElementById('cheatsheet-s1'); return el ? el.value : ''; })(),
      s2: (() => { const el = document.getElementById('cheatsheet-s2'); return el ? el.value : ''; })(),
    },
    // Settings
    settings: { ...collectSettings(), showDev: SHOW_DEV,
      padaDivider: document.getElementById('opt-pada-divider') ? document.getElementById('opt-pada-divider').checked : true }
  };
  return state;
}

function saveSession() {
  const state = _buildSessionState();

    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'shloka_session.json';
  a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  showMsg('✓ Сессия сохранена', 'ok');
}

function _applySession(state) {
  // Сброс предыдущего состояния тайминга перед применением новой сессии
  TAP.times  = { s1: [], s2: [] };
  TAP.cheatY = { s1: [], s2: [] };
  _padaBounds = null;

  // Restore text
      if (state.devInput !== undefined) {
        document.getElementById('dev-input').value = state.devInput;
        scheduleSchemeDetect();
      }

      // Restore DATA
      // Restore cheatY
      if (state.cheatY) {
        TAP.cheatY.s1 = state.cheatY.s1 || [];
        TAP.cheatY.s2 = state.cheatY.s2 || [];
      }

      if (state.syls) {
        if (state.syls.s1) DATA.s1 = state.syls.s1;
        if (state.syls.s2) DATA.s2 = state.syls.s2;
        // Recalculate devSyl in case it's missing from older session files
        ['s1','s2'].forEach(k => DATA[k].forEach(s => { if (!s.devSyl) s.devSyl = transliterateToDev(s.syl, 'IAST'); }));
      }

      // Restore settings
      const s = state.settings || {};
      if (s.guruColor  && document.getElementById('color-guru'))  { document.getElementById('color-guru').value  = s.guruColor;  }
      if (s.laghuColor && document.getElementById('color-laghu')) { document.getElementById('color-laghu').value = s.laghuColor; }
      if (s.guruColor || s.laghuColor) applyColors();

      if (s.showDots   !== undefined && document.getElementById('opt-dots'))      document.getElementById('opt-dots').checked    = s.showDots;
      if (s.showLine   !== undefined && document.getElementById('opt-line'))      document.getElementById('opt-line').checked    = s.showLine;
      if (s.hollow     !== undefined && document.getElementById('opt-hollow'))    document.getElementById('opt-hollow').checked  = s.hollow;
      if (s.greyIast   !== undefined && document.getElementById('opt-grey-iast'))document.getElementById('opt-grey-iast').checked= s.greyIast;
      if (document.getElementById('opt-pada-divider')) document.getElementById('opt-pada-divider').checked = (s.padaDivider !== undefined ? s.padaDivider : true);
      if (s.sylMode    && document.getElementById('syl-mode-std'))  document.getElementById(s.sylMode === 'std' ? 'syl-mode-std' : 'syl-mode-user').checked = true;
      if (s.waveScale  && document.getElementById('opt-wave-scale')) {
        document.getElementById('opt-wave-scale').value = s.waveScale;
        document.getElementById('opt-wave-scale-val').textContent = parseFloat(s.waveScale).toFixed(2);
      }
      if (s.ftAuthor  !== undefined && document.getElementById('ft-author'))  document.getElementById('ft-author').value  = s.ftAuthor;
      if (s.ftYear    !== undefined && document.getElementById('ft-year'))    document.getElementById('ft-year').value    = s.ftYear;
      if (s.ftUrl     !== undefined && document.getElementById('ft-url'))     document.getElementById('ft-url').value     = s.ftUrl;
      if (s.ftSource   !== undefined && document.getElementById('ft-source'))   document.getElementById('ft-source').value   = s.ftSource;
      if (s.ftMeter    !== undefined && document.getElementById('ft-meter'))    document.getElementById('ft-meter').value    = s.ftMeter;
      if (s.cheatOpen  !== undefined && document.getElementById('opt-cheat-open')) { document.getElementById('opt-cheat-open').checked = s.cheatOpen; applyCheatOpenSetting(); }

      if (s.showDev !== undefined) {
        SHOW_DEV = !!s.showDev;
        document.querySelectorAll('[id^=dev-toggle-]').forEach(btn => {
          btn.textContent = SHOW_DEV ? 'IAST' : 'देव';
          btn.title = SHOW_DEV ? 'Переключить на IAST' : 'Переключить на деванагари';
        });
      }

      // Render diagram
      if (!DATA.s1.length && !DATA.s2.length && state.devInput) {
        // No syllable data in session — re-parse from text
        runPipeline();
      } else if (DATA.s1.length || DATA.s2.length) {
        // Re-sync s1dev/s2dev before render, since render() reads them
        if (state.dev1 !== undefined && state.dev2 !== undefined) {
          // New session format: dev lines saved directly
          document.getElementById('s1dev').value = state.dev1;
          document.getElementById('s2dev').value = state.dev2;
        } else if (state.devInput !== undefined) {
          // Old session format: recompute from devInput
          const _lines = state.devInput.trim().split('\n').map(l => l.trim()).filter(Boolean);
          const _scheme = (document.getElementById('scheme-select') || {}).value || 'DEV';
          const _toDev = t => (_scheme && _scheme !== 'DEV') ? transliterateToDev(t, _scheme) : t;
          document.getElementById('s1dev').value = _lines[0] ? _toDev(_lines[0]) : '';
          document.getElementById('s2dev').value = _lines[1] ? _toDev(_lines[1]) : '';
        }
        render();
        document.getElementById('dl-wrap').style.display = '';

        // Restore cheatsheet values after render (elements created in render)
        requestAnimationFrame(() => {
          if (state.cheat) {
            ['s1','s2'].forEach(key => {
              const el = document.getElementById('cheatsheet-' + key);
              if (el && state.cheat[key]) el.value = state.cheat[key];
            });
          }
          // Restore syllable edit fields
          if (state.syls) {
            ['s1','s2'].forEach((key, i) => {
              const el = document.getElementById('syl-edit-' + (i+1));
              if (el && state.syls[key]) {
                el.value = state.syls[key].map(s => s.syl + (s.arrow||'')).join(' ');
              }
            });
          }
        });
      }

      if (state.padaBounds) {
        _padaBounds = state.padaBounds;
      }
      if (state.tapTimes) {
        TAP.times.s1 = state.tapTimes.s1 || [];
        TAP.times.s2 = state.tapTimes.s2 || [];
        const hasTimings = (TAP.times.s1.length || TAP.times.s2.length);
        const playBtn = document.getElementById('btn-karaoke-play');
        if (playBtn && hasTimings) playBtn.disabled = false;
        if (hasTimings) {
          const etb = document.getElementById('edit-timing-block');
          if (etb) etb.style.display = '';
        }
        if (hasTimings) requestAnimationFrame(() => { _waveformPcm = null; drawWaveform(); });
      }
  showMsg('✓ Сессия загружена', 'ok');
  // Перерисовать диаграмму с актуальными падами после применения сессии
  setTimeout(refreshWaveform, 100);
  // Пометить випулу если метр уже определён
  const _mf = document.getElementById('ft-meter');
  if (_mf && _mf.value) {
    _lastVipulaLabel = _mf.value;
    detectAndMarkVipula(_mf.value);
    ['s1','s2'].forEach(k => {
      const bl = document.getElementById('block-' + k);
      if (!bl) return;
      const oldWrap = bl.querySelector('.wave-svg-wrap');
      if (oldWrap) bl.replaceChild(buildWaveSVG(k), oldWrap);
    });
  }
}

function loadSession(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const state = JSON.parse(e.target.result);
      _applySession(state);
    } catch(err) {
      showMsg('Ошибка загрузки: ' + err.message, 'err');
    }
    input.value = '';
  };
  reader.readAsText(file);
}




// ═══════════════════════════════════════════════
// SCHEME DETECTION & TRANSLITERATION
// (based on skrutable by Tyler Neill, CC BY-SA 4.0)
// ═══════════════════════════════════════════════

const SCHEME_MAPS = {"IAST": [["ṝ", "ṝ"], ["Ṝ", "Ṝ"], ["ṝ", "ṝ"], ["Ṝ", "Ṝ"], ["ḹ", "ḹ"], ["Ḹ", "Ḹ"], ["ḹ", "ḹ"], ["Ḹ", "Ḹ"], ["r̥", "ṛ"], ["R̥", "ṛ"], ["l̥", "ḷ"], ["L̥", "ḷ"], ["ṁ", "ṃ"], ["ē", "e"], ["ĕ", "ĕ"], ["ō", "o"], ["ŏ", "ŏ"], ["ā", "ā"], ["Ā", "Ā"], ["ī", "ī"], ["Ī", "Ī"], ["ū", "ū"], ["Ū", "Ū"], ["ï", "ï"], ["ü", "ü"], ["ṛ", "ṛ"], ["Ṛ", "Ṛ"], ["ṝ", "ṝ"], ["Ṝ", "Ṝ"], ["ḷ", "ḷ"], ["Ḷ", "Ḷ"], ["ḹ", "ḹ"], ["Ḹ", "Ḹ"], ["ṅ", "ṅ"], ["Ṅ", "Ṅ"], ["ñ", "ñ"], ["Ñ", "Ñ"], ["ṭ", "ṭ"], ["Ṭ", "Ṭ"], ["ḍ", "ḍ"], ["Ḍ", "Ḍ"], ["ṇ", "ṇ"], ["Ṇ", "Ṇ"], ["ś", "ś"], ["Ś", "Ś"], ["ṣ", "ṣ"], ["Ṣ", "Ṣ"], ["ḥ", "ḥ"], ["Ḥ", "Ḥ"], ["ẖ", "ẖ"], ["H̱", "H"], ["ḫ", "ḫ"], ["Ḫ", "H"], ["ṃ", "ṃ"], ["Ṃ", "Ṃ"], ["ṭh", "W"], ["ḍh", "Q"], ["ai", "E"], ["au", "O"], ["kh", "K"], ["gh", "G"], ["ch", "C"], ["jh", "J"], ["th", "T"], ["dh", "D"], ["ph", "P"], ["bh", "B"], ["ṁ", "ṃ"], ["ē", "e"], ["ō", "o"], ["A", "a"], ["B", "b"], ["C", "c"], ["D", "d"], ["E", "e"], ["F", "f"], ["G", "g"], ["H", "h"], ["I", "i"], ["J", "j"], ["K", "k"], ["L", "l"], ["M", "m"], ["N", "n"], ["O", "o"], ["P", "p"], ["Q", "q"], ["R", "r"], ["S", "s"], ["T", "t"], ["U", "u"], ["V", "v"], ["W", "w"], ["X", "x"], ["Y", "y"], ["Z", "z"], ["Ā", "ā"], ["Ī", "ī"], ["Ū", "ū"], ["Ṛ", "ṛ"], ["Ḷ", "ḷ"], ["Ṅ", "ṅ"], ["Ñ", "ñ"], ["Ṭ", "ṭ"], ["Ḍ", "ḍ"], ["Ṇ", "ṇ"], ["Ś", "ś"], ["Ṣ", "ṣ"], ["Ḥ", "ḥ"], ["Ḫ", "h"], ["Ṃ", "ṃ"], ["ṭ", "w"], ["ḍ", "q"], ["ā", "A"], ["ī", "I"], ["ū", "U"], ["ṛ", "f"], ["ṝ", "F"], ["ḷ", "x"], ["ḹ", "X"], ["ï", "i"], ["ü", "u"], ["ṅ", "N"], ["ñ", "Y"], ["ṇ", "R"], ["ś", "S"], ["ṣ", "z"], ["ṃ", "M"], ["ḥ", "H"], ["ẖ", "H"], ["ḫ", "H"]], "HK": [["lRR", "X"], ["RR", "F"], ["lR", "x"], ["gh", "G"], ["Th", "W"], ["Dh", "Q"], ["th", "T"], ["dh", "D"], ["jh", "J"], ["ai", "E"], ["au", "O"], ["kh", "K"], ["ch", "C"], ["ph", "P"], ["bh", "B"], ["R", "f"], ["N", "R"], ["G", "N"], ["T", "w"], ["D", "q"], ["J", "Y"], ["z", "Z"], ["S", "z"], ["Z", "S"], ["’", "'"]], "ITRANS": [["RRi", "f"], ["R^i", "f"], ["RRI", "F"], ["R^I", "F"], ["LLi", "x"], ["L^i", "x"], ["LLI", "X"], ["L^I", "X"], ["Th", "W"], ["Dh", "Q"], ["th", "T"], ["dh", "D"], ["~N", "Z"], ["aa", "A"], ["ii", "I"], ["uu", "U"], ["ee", "e"], ["oo", "o"], ["ai", "E"], ["au", "O"], ["Ri", "f"], ["RI", "F"], ["Li", "x"], ["LI", "X"], ["kh", "K"], ["gh", "G"], ["ch", "c"], ["Ch", "C"], ["jh", "J"], ["~n", "Y"], ["ph", "P"], ["bh", "B"], ["sh", "S"], ["Sh", "z"], [".m", "M"], [".h", "H"], [".a", "'"], ["w", "v"], ["T", "w"], ["D", "q"], ["N", "R"], ["Z", "N"], ["E", "e"], ["O", "o"], ["’", "'"]], "SLP_DEV": [["a", "अ"], ["A", "आ"], ["i", "इ"], ["I", "ई"], ["u", "उ"], ["U", "ऊ"], ["f", "ऋ"], ["F", "ॠ"], ["x", "ऌ"], ["X", "ॡ"], ["e", "ए"], ["ĕ", "ए"], ["E", "ऐ"], ["o", "ओ"], ["ŏ", "ओ"], ["O", "औ"], ["M", "ं"], ["H", "ः"], ["k", "क"], ["K", "ख"], ["g", "ग"], ["G", "घ"], ["N", "ङ"], ["c", "च"], ["C", "छ"], ["j", "ज"], ["J", "झ"], ["Y", "ञ"], ["w", "ट"], ["W", "ठ"], ["q", "ड"], ["Q", "ढ"], ["R", "ण"], ["t", "त"], ["T", "थ"], ["d", "द"], ["D", "ध"], ["n", "न"], ["p", "प"], ["P", "फ"], ["b", "ब"], ["B", "भ"], ["m", "म"], ["y", "य"], ["r", "र"], ["l", "ल"], ["v", "व"], ["S", "श"], ["z", "ष"], ["s", "स"], ["h", "ह"], ["'", "ऽ"], ["1", "१"], ["2", "२"], ["3", "३"], ["4", "४"], ["5", "५"], ["6", "६"], ["7", "७"], ["8", "८"], ["9", "९"], ["0", "०"]], "DEV_SLP": [["अ", "a"], ["आ", "A"], ["इ", "i"], ["ई", "I"], ["उ", "u"], ["ऊ", "U"], ["ऋ", "f"], ["ॠ", "F"], ["ऌ", "x"], ["ॡ", "X"], ["ए", "e"], ["ऐ", "E"], ["ओ", "o"], ["औ", "O"], ["ं", "M"], ["ः", "H"], ["क", "k"], ["ख", "K"], ["ग", "g"], ["घ", "G"], ["ङ", "N"], ["च", "c"], ["छ", "C"], ["ज", "j"], ["झ", "J"], ["ञ", "Y"], ["ट", "w"], ["ठ", "W"], ["ड", "q"], ["ढ", "Q"], ["ण", "R"], ["त", "t"], ["थ", "T"], ["द", "d"], ["ध", "D"], ["न", "n"], ["प", "p"], ["फ", "P"], ["ब", "b"], ["भ", "B"], ["म", "m"], ["य", "y"], ["र", "r"], ["ल", "l"], ["व", "v"], ["श", "S"], ["ष", "z"], ["स", "s"], ["ह", "h"], ["ऽ", "'"], ["ा", "A"], ["ि", "i"], ["ी", "I"], ["ु", "u"], ["ू", "U"], ["ृ", "f"], ["ॄ", "F"], ["ॢ", "x"], ["ॣ", "X"], ["े", "e"], ["ै", "E"], ["ो", "o"], ["ौ", "O"], ["१", "1"], ["२", "2"], ["३", "3"], ["४", "4"], ["५", "5"], ["६", "6"], ["७", "7"], ["८", "8"], ["९", "9"], ["०", "0"]], "VH": [[".a", "'"], ["aa", "A"], ["ii", "I"], ["uu", "U"], [".r", "f"], [".R", "F"], [".l", "x"], [".L", "X"], ["ai", "E"], ["au", "O"], [".m", "M"], [".h", "H"], ["\"n", "N"], ["~n", "Y"], [".t", "w"], [".T", "W"], [".d", "q"], [".D", "Q"], [".n", "R"], ["\"s", "S"], [".s", "z"], ["’", "'"]], "WX": [["F", "Y"], ["Q", "F"], ["D", "Q"], ["X", "D"], ["R", "z"], ["N", "R"], ["f", "N"], ["q", "f"], ["d", "q"], ["x", "d"], ["L", "x"], ["t", "V"], ["w", "t"], ["V", "w"], ["T", "V"], ["W", "T"], ["V", "W"], ["Z", "'"]]};

// Detect scheme from character fingerprint
function detectScheme(text) {
  if (!text || !text.trim()) return null;

  // Devanagari Unicode block
  if (/[ऀ-ॿ]/.test(text)) return 'DEV';

  // IAST: diacritics specific to Sanskrit transliteration
  if (/[āīūṛṝḷṃḥṅñṭḍṇśṣ]/.test(text.toLowerCase())) return 'IAST';

  // VH (Velthuis): .t .d .n .s etc.
  if (/\.[ntdsmr]|"n|\.h/.test(text)) return 'VH';

  // ITRANS: aa, ii, uu, RRi, .m, ~N etc.
  if (/aa|ii|uu|RRi|\.m|N\^|~N/i.test(text)) return 'ITRANS';

  // SLP unique markers: single-char aspirates B(bh) G(gh) J(jh) D(dh) P(ph)
  // and f(ṛ) E(ai) O(au) — none of these are used in HK as single chars
  // HK uses digraphs: bh gh jh dh ph, and R for ṛ, ai/au for diphthongs
  if (/[BGJDPfFEO]/.test(text)) return 'SLP';

  // WX: Z=ś (capital), q=ḍ, w=ṭ — distinct from HK
  // HK: z=ś (lowercase), S=ṣ
  const hasWX = /[wqZ]/.test(text);
  const hasHK  = /[zS]/.test(text);

  if (hasWX && !hasHK) return 'WX';
  if (hasHK || /[AIUkgctdpbmnyrls]/.test(text)) return 'HK';
  if (hasWX) return 'WX';

  return 'HK'; // default ASCII fallback
}

const SCHEME_NAMES = {
  DEV: 'Деванагари', IAST: 'IAST', HK: 'Harvard-Kyoto',
  ITRANS: 'ITRANS', VH: 'Velthuis', WX: 'WX', SLP: 'SLP'
};

// Full transliteration data (ported from skrutable, CC BY-SA 4.0)
const TRL = {"IAST_SLP": [["r̥", "ṛ"], ["R̥", "ṛ"], ["l̥", "ḷ"], ["L̥", "ḷ"], ["ṁ", "ṃ"], ["ṁ", "ṃ"], ["ē", "e"], ["ē", "e"], ["ĕ", "ĕ"], ["ō", "o"], ["ō", "o"], ["ŏ", "ŏ"], ["ā", "ā"], ["Ā", "Ā"], ["ī", "ī"], ["Ī", "Ī"], ["ū", "ū"], ["Ū", "Ū"], ["ï", "ï"], ["ü", "ü"], ["ṛ", "ṛ"], ["Ṛ", "Ṛ"], ["ṝ", "ṝ"], ["Ṝ", "Ṝ"], ["ṝ", "ṝ"], ["Ṝ", "Ṝ"], ["ṝ", "ṝ"], ["Ṝ", "Ṝ"], ["ḷ", "ḷ"], ["Ḷ", "Ḷ"], ["ḹ", "ḹ"], ["Ḹ", "Ḹ"], ["ḹ", "ḹ"], ["Ḹ", "Ḹ"], ["ḹ", "ḹ"], ["Ḹ", "Ḹ"], ["ṅ", "ṅ"], ["Ṅ", "Ṅ"], ["ñ", "ñ"], ["Ñ", "Ñ"], ["ṭ", "ṭ"], ["Ṭ", "Ṭ"], ["ḍ", "ḍ"], ["Ḍ", "Ḍ"], ["ṇ", "ṇ"], ["Ṇ", "Ṇ"], ["ś", "ś"], ["Ś", "Ś"], ["ṣ", "ṣ"], ["Ṣ", "Ṣ"], ["ḥ", "ḥ"], ["Ḥ", "Ḥ"], ["ẖ", "ẖ"], ["H̱", "H"], ["ḫ", "ḫ"], ["Ḫ", "H"], ["ṃ", "ṃ"], ["Ṃ", "Ṃ"], ["A", "a"], ["B", "b"], ["C", "c"], ["D", "d"], ["E", "e"], ["F", "f"], ["G", "g"], ["H", "h"], ["I", "i"], ["J", "j"], ["K", "k"], ["L", "l"], ["M", "m"], ["N", "n"], ["O", "o"], ["P", "p"], ["Q", "q"], ["R", "r"], ["S", "s"], ["T", "t"], ["U", "u"], ["V", "v"], ["W", "w"], ["X", "x"], ["Y", "y"], ["Z", "z"], ["Ā", "ā"], ["Ī", "ī"], ["Ū", "ū"], ["Ṛ", "ṛ"], ["Ḷ", "ḷ"], ["Ṅ", "ṅ"], ["Ñ", "ñ"], ["Ṭ", "ṭ"], ["Ḍ", "ḍ"], ["Ṇ", "ṇ"], ["Ś", "ś"], ["Ṣ", "ṣ"], ["Ḥ", "ḥ"], ["Ḫ", "h"], ["Ṃ", "ṃ"], ["ṭh", "W"], ["ṭ", "w"], ["ḍh", "Q"], ["ḍ", "q"], ["ā", "A"], ["ī", "I"], ["ū", "U"], ["ṛ", "f"], ["ṝ", "F"], ["ḷ", "x"], ["ḹ", "X"], ["ai", "E"], ["au", "O"], ["ï", "i"], ["ü", "u"], ["kh", "K"], ["gh", "G"], ["ṅ", "N"], ["ch", "C"], ["jh", "J"], ["ñ", "Y"], ["ṇ", "R"], ["th", "T"], ["dh", "D"], ["ph", "P"], ["bh", "B"], ["ś", "S"], ["ṣ", "z"], ["ṃ", "M"], ["ḥ", "H"], ["ẖ", "H"], ["ḫ", "H"]], "HK_SLP": [["lRR", "X"], ["RR", "F"], ["lR", "x"], ["R", "f"], ["N", "R"], ["G", "N"], ["gh", "G"], ["Th", "W"], ["T", "w"], ["Dh", "Q"], ["D", "q"], ["th", "T"], ["dh", "D"], ["J", "Y"], ["jh", "J"], ["z", "Z"], ["S", "z"], ["Z", "S"], ["ai", "E"], ["au", "O"], ["kh", "K"], ["ch", "C"], ["ph", "P"], ["bh", "B"], ["’", "'"]], "VH_SLP": [[".a", "'"], ["aa", "A"], ["ii", "I"], ["uu", "U"], [".r", "f"], [".R", "F"], [".l", "x"], [".L", "X"], ["ai", "E"], ["au", "O"], [".m", "M"], [".h", "H"], ["\"n", "N"], ["~n", "Y"], [".t", "w"], [".T", "W"], [".d", "q"], [".D", "Q"], [".n", "R"], ["\"s", "S"], [".s", "z"], ["’", "'"]], "WX_SLP": [["F", "Y"], ["Q", "F"], ["D", "Q"], ["X", "D"], ["R", "z"], ["N", "R"], ["f", "N"], ["q", "f"], ["d", "q"], ["x", "d"], ["L", "x"], ["t", "V"], ["w", "t"], ["V", "w"], ["T", "V"], ["W", "T"], ["V", "W"], ["Z", "'"]], "ITRANS_SLP": [["w", "v"], ["T", "w"], ["Th", "W"], ["D", "q"], ["Dh", "Q"], ["th", "T"], ["dh", "D"], ["~N", "Z"], ["N", "R"], ["Z", "N"], ["aa", "A"], ["ii", "I"], ["uu", "U"], ["ee", "e"], ["oo", "o"], ["E", "e"], ["ai", "E"], ["O", "o"], ["au", "O"], ["RRi", "f"], ["Ri", "f"], ["R^i", "f"], ["RRI", "F"], ["RI", "F"], ["R^I", "F"], ["LLi", "x"], ["Li", "x"], ["L^i", "x"], ["LLI", "X"], ["LI", "X"], ["L^I", "X"], ["kh", "K"], ["gh", "G"], ["ch", "c"], ["Ch", "C"], ["jh", "J"], ["~n", "Y"], ["ph", "P"], ["bh", "B"], ["sh", "S"], ["Sh", "z"], [".m", "M"], [".h", "H"], [".a", "'"], ["’", "'"]], "DEV_SLP": [["अ", "a"], ["आ", "A"], ["इ", "i"], ["ई", "I"], ["उ", "u"], ["ऊ", "U"], ["ऋ", "f"], ["ॠ", "F"], ["ऌ", "x"], ["ॡ", "X"], ["ए", "e"], ["ऐ", "E"], ["ओ", "o"], ["औ", "O"], ["ं", "M"], ["ः", "H"], ["क", "k"], ["ख", "K"], ["ग", "g"], ["घ", "G"], ["ङ", "N"], ["च", "c"], ["छ", "C"], ["ज", "j"], ["झ", "J"], ["ञ", "Y"], ["ट", "w"], ["ठ", "W"], ["ड", "q"], ["ढ", "Q"], ["ण", "R"], ["त", "t"], ["थ", "T"], ["द", "d"], ["ध", "D"], ["न", "n"], ["प", "p"], ["फ", "P"], ["ब", "b"], ["भ", "B"], ["म", "m"], ["य", "y"], ["र", "r"], ["ल", "l"], ["व", "v"], ["श", "S"], ["ष", "z"], ["स", "s"], ["ह", "h"], ["ऽ", "'"], ["ा", "A"], ["ि", "i"], ["ी", "I"], ["ु", "u"], ["ू", "U"], ["ृ", "f"], ["ॄ", "F"], ["ॢ", "x"], ["ॣ", "X"], ["े", "e"], ["ै", "E"], ["ो", "o"], ["ौ", "O"], ["१", "1"], ["२", "2"], ["३", "3"], ["४", "4"], ["५", "5"], ["६", "6"], ["७", "7"], ["८", "8"], ["९", "9"], ["०", "0"]], "SLP_DEV": [["a", "अ"], ["A", "आ"], ["i", "इ"], ["I", "ई"], ["u", "उ"], ["U", "ऊ"], ["f", "ऋ"], ["F", "ॠ"], ["x", "ऌ"], ["X", "ॡ"], ["e", "ए"], ["ĕ", "ए"], ["E", "ऐ"], ["o", "ओ"], "ŏओ", ["O", "औ"], ["M", "ं"], ["H", "ः"], ["k", "क"], ["K", "ख"], ["g", "ग"], ["G", "घ"], ["N", "ङ"], ["c", "च"], ["C", "छ"], ["j", "ज"], ["J", "झ"], ["Y", "ञ"], ["w", "ट"], ["W", "ठ"], ["q", "ड"], ["Q", "ढ"], ["R", "ण"], ["t", "त"], ["T", "थ"], ["d", "द"], ["D", "ध"], ["n", "न"], ["p", "प"], ["P", "फ"], ["b", "ब"], ["B", "भ"], ["m", "म"], ["y", "य"], ["r", "र"], ["l", "ल"], ["v", "व"], ["S", "श"], ["z", "ष"], ["s", "स"], ["h", "ह"], ["'", "ऽ"], ["1", "१"], ["2", "२"], ["3", "३"], ["4", "४"], ["5", "५"], ["6", "६"], ["7", "७"], ["8", "८"], ["9", "९"], ["0", "०"]], "SLP_consonants": ["k", "K", "c", "C", "w", "W", "t", "T", "p", "P", "z", "S", "s", "g", "G", "N", "j", "J", "Y", "q", "Q", "R", "d", "D", "n", "b", "B", "m", "y", "r", "l", "v", "h"], "SLP_vowels": ["a", "i", "u", "f", "x", "ĕ", "ŏ", "A", "I", "U", "F", "X", "e", "E", "o", "O"], "SLP_vowels_with_matras": ["i", "u", "f", "x", "ĕ", "ŏ", "A", "I", "U", "F", "X", "e", "E", "o", "O"], "virAma_DEV": "्", "vowel_matras_DEV": {"i": "ि", "u": "ु", "f": "ृ", "x": "ॢ", "ĕ": "े", "ŏ": "ो", "A": "ा", "I": "ी", "U": "ू", "F": "ॄ", "X": "ॣ", "e": "े", "E": "ै", "o": "ो", "O": "ौ"}, "vowels_that_preempt_virama": ["a", "i", "u", "f", "x", "ĕ", "ŏ", "A", "I", "U", "F", "X", "e", "E", "o", "O", "ि", "ु", "ृ", "ॢ", "े", "ो", "ा", "ी", "ू", "ॄ", "ॣ", "े", "ै", "ो", "ौ", "ি", "ু", "ৃ", "ৢ", "ে", "ো", "া", "ী", "ূ", "ৄ", "ৣ", "ে", "ৈ", "ো", "ৌ", "િ", "ુ", "ૃ", "ૢ", "ે", "ો", "ા", "ી", "ૂ", "ૄ", "ૣ", "ે", "ૈ", "ો", "ૌ"], "SLP_and_indic_consonants": ["k", "K", "c", "C", "w", "W", "t", "T", "p", "P", "z", "S", "s", "g", "G", "N", "j", "J", "Y", "q", "Q", "R", "d", "D", "n", "b", "B", "m", "y", "r", "l", "v", "h", "क", "ख", "ग", "घ", "ङ", "च", "छ", "ज", "झ", "ञ", "ट", "ठ", "ड", "ढ", "ण", "त", "थ", "द", "ध", "न", "प", "फ", "ब", "भ", "म", "य", "र", "ल", "व", "श", "ष", "स", "ह", "ক", "খ", "গ", "ঘ", "ঙ", "চ", "ছ", "জ", "ঝ", "ঞ", "ট", "ঠ", "ড", "ঢ", "ণ", "ত", "থ", "দ", "ধ", "ন", "প", "ফ", "ব", "ভ", "ম", "য", "র", "ল", "ব", "শ", "ষ", "স", "হ", "ક", "ખ", "ગ", "ઘ", "ઙ", "ચ", "છ", "જ", "ઝ", "ઞ", "ટ", "ઠ", "ડ", "ઢ", "ણ", "ત", "થ", "દ", "ધ", "ન", "પ", "ફ", "બ", "ભ", "મ", "ય", "ર", "લ", "વ", "શ", "ષ", "સ", "હ"]};

function applySchemeDetect(text, sel) {
  if (/[а-яёА-ЯЁ]/.test(text)) {
    if (sel) sel.value = '';
    showMsg('Введите текст на санскрите — русские буквы не поддерживаются', 'err');
    return;
  }
  const scheme = detectScheme(text);
  if (sel) sel.value = scheme || '';
  if (scheme) showMsg('Определена кодировка: ' + (SCHEME_NAMES[scheme] || scheme), 'ok');
  else { if (sel) sel.value = ''; showMsg('Кодировка не определена — выберите вручную', 'err'); }
}

function forceSchemeDetect() {
  const text = document.getElementById('dev-input').value.trim();
  if (!text) return;
  applySchemeDetect(text, document.getElementById('scheme-select'));
}

let _schemeDetectTimer = null;
function scheduleSchemeDetect() {
  clearTimeout(_schemeDetectTimer);
  _schemeDetectTimer = setTimeout(() => {
    const text = document.getElementById('dev-input').value.trim();
    const sel = document.getElementById('scheme-select');
    if (!text) { if (sel) sel.value = ''; return; }
    applySchemeDetect(text, sel);
  }, 400);
}

function autoDetectScheme(rawText) {
  return detectScheme(rawText) || 'DEV';
}

// Apply ordered replacement pairs (longest match first — already sorted in data)
function mapReplace(text, pairs) {
  for (const [from, to] of pairs) {
    text = text.split(from).join(to);
  }
  return text;
}

// linear_preprocessing: handles inherent 'a' and virama (SLP → DEV)
function slpToDev(slp) {
  const CONS  = new Set(TRL.SLP_consonants);
  const CONS_AND_INDIC = new Set(TRL.SLP_and_indic_consonants);
  const VOWELS_PREEMPT = new Set(TRL.vowels_that_preempt_virama);
  const VOWELS_MATRAS  = new Set(TRL.SLP_vowels_with_matras);
  const VIRAMA = TRL.virAma_DEV;
  const MATRAS = TRL.vowel_matras_DEV;

  // linear_preprocessing: SLP → DEV hybrid
  let out = '';
  let prev = '';
  for (const curr of slp) {
    if (CONS_AND_INDIC.has(prev)) {
      if (curr === 'a') {
        // inherent 'a' — skip (will be added by map_replace)
        // actually: 'a' after consonant means NO virama needed → just skip
      } else if (!VOWELS_PREEMPT.has(curr)) {
        // not a vowel mātrā → add virama
        out += VIRAMA + curr;
      } else if (VOWELS_MATRAS.has(curr)) {
        // vowel with mātrā form
        out += (MATRAS[curr] || curr);
      } else {
        out += curr;
      }
    } else {
      out += curr;
    }
    prev = curr;
  }
  // final consonant needs virama
  if (CONS.has(prev)) out += VIRAMA;

  // Now apply SLP→DEV map
  return mapReplace(out, TRL.SLP_DEV);
}

// Transliterate any scheme → Devanagari
function normalizePunctuation(text) {
  return text
    .replace(/\|\|/g, '॥')
    .replace(/(?<!॥)\|(?!\|)/g, '।')
    .replace(/\.\./g, '॥').replace(/\./g, '।');
}

function transliterateToDev(text, scheme) {
  if (scheme === 'DEV') return normalizePunctuation(text);
  const mapName = scheme + '_SLP';
  const pairs   = TRL[mapName];
  if (!pairs) return normalizePunctuation(text);
  // Step 1: scheme → SLP
  let slp = mapReplace(text, pairs);
  // Step 2: SLP → DEV (with virama logic)
  let dev = slpToDev(slp);
  // Step 3: punctuation normalization
  return normalizePunctuation(dev);
}


// ═══════════════════════════════════════════════
// APTE PROSODY DATABASE (Apte 1890, Appendix I)
// ═══════════════════════════════════════════════
// APTE_METERS + APTE_METERS2: ~200 KB of Apte prosody data, lazy-loaded from
// src/data/apte_meters.json on first use (Meter Info / cross-check only) so it
// stays out of the initial app.js payload. Kept as mutable globals + an awaited
// loadApteMeters() at each entry point, so the sync consumers below are unchanged.
let APTE_METERS = null;
let APTE_METERS2 = null;
let _apteMetersPromise = null;
function loadApteMeters() {
  if (APTE_METERS) return Promise.resolve();
  if (_apteMetersPromise) return _apteMetersPromise;
  _apteMetersPromise = fetch('src/data/apte_meters.json')
    .then(r => { if (!r.ok) throw new Error('apte_meters.json ' + r.status); return r.json(); })
    .then(d => { APTE_METERS = d.APTE_METERS; APTE_METERS2 = d.APTE_METERS2; })
    .catch(e => { _apteMetersPromise = null; throw e; });
  return _apteMetersPromise;
}


// APTE_METERS2: structured JSON from Apte Prosody
// APTE_METERS2 data -> src/data/apte_meters.json (lazy-loaded; see loadApteMeters)

// Lookup Apte entry by meter label (normalize and try variants)
function lookupApte(label) {
  if (!label || !APTE_METERS) return null;
  // Strip square bracket annotations like [14: tBjjgg]
  let name = label.replace(/\s*\[.*?\]/g, '').replace(/\s*atha vā.*$/,'').trim();
  // Remove upajāti prefix
  name = name.replace(/^upajāti\s+\w+:\s*/,'').trim();
  
  function norm(s) {
    return s.toLowerCase()
      .replace(/[ṃṁ]/g,'m').replace(/ḥ/g,'h')
      .replace(/[āa]/g,'a').replace(/[īi]/g,'i').replace(/[ūu]/g,'u')
      .replace(/[ṛṝr]/g,'r').replace(/ḷ/g,'l')
      .replace(/[śṣs]/g,'s').replace(/[ṭt]/g,'t').replace(/[ḍd]/g,'d')
      .replace(/[ṇṅñn]/g,'n').replace(/[^\w]/g,'');
  }
  
  const nk = norm(name);
  // Direct match
  if (APTE_METERS[nk]) return APTE_METERS[nk];
  // Partial match
  for (const [k, v] of Object.entries(APTE_METERS)) {
    if (k.startsWith(nk.slice(0,6)) || nk.startsWith(k.slice(0,6))) return v;
    // also_called
    if (v.also_called && v.also_called.some(a => norm(a) === nk)) return v;
  }
  return null;
}

// Lookup in APTE_METERS2 (new structured data)
function lookupApte2(label) {
  if (!label || !APTE_METERS2) return null;
  let name = label.replace(/\s*\[.*?\]/g,'').replace(/\s*atha vā.*$/,'').trim();
  name = name.replace(/^upajāti\s+\w+:\s*/,'').trim();
  function norm(s) {
    return s.toLowerCase()
      .replace(/[ṃṁ]/g,'m').replace(/ḥ/g,'h')
      .replace(/[āa]/g,'a').replace(/[īi]/g,'i').replace(/[ūu]/g,'u')
      .replace(/[ṛṝr]/g,'r').replace(/ḷ/g,'l')
      .replace(/[śṣs]/g,'s').replace(/[ṭt]/g,'t').replace(/[ḍd]/g,'d')
      .replace(/[ṇṅñn]/g,'n').replace(/[^\w]/g,'');
  }
  const nk = norm(name);
  if (APTE_METERS2[nk]) return APTE_METERS2[nk];
  for (const entry of Object.values(APTE_METERS2)) {
    if (norm(entry.name) === nk) return entry;
    if (entry.also_called && entry.also_called.some(a => norm(a) === nk)) return entry;
  }
  for (const [k, entry] of Object.entries(APTE_METERS2)) {
    if (k.startsWith(nk.slice(0,6)) || nk.startsWith(k.slice(0,6))) return entry;
  }
  return null;
}

// ═══════════════════════════════════════════════
// METER IDENTIFICATION (ported from skrutable by Tyler Neill)
// CC BY-SA 4.0  https://github.com/tylergneill/skrutable
// ═══════════════════════════════════════════════

const METER_DATA = {"gaRas": {"lgg": "y", "ggg": "m", "ggl": "t", "glg": "r", "lgl": "j", "gll": "B", "lll": "n", "llg": "s"}, "anustubh": {"even": "^(?!.ll.|.glg).{4}lgl.$", "odd": {"^(?!.ll.).{4}lgg.$": "pathyā", "^.glgggg.$": "ma-vipulā", "^.glggll.$": "bha-vipulā", "^.ggggll.$": "bha-vipulā (ma-gaṇa-pūrvikā!)", "^(?!.ll).{3}glll.$": "na-vipulā", "^(?!.ll).{3}gglg.$": "ra-vipulā"}}, "family_names": {"0": "...", "1": "...", "2": "...", "3": "...", "4": "pratiṣṭhā", "5": "supratiṣṭhā", "6": "gāyatrī", "7": "uṣṇih", "8": "anuṣṭubh", "9": "bṛhatī", "10": "paṅkti", "11": "triṣṭubh", "12": "jagatī", "13": "atijagatī", "14": "śakvarī", "15": "atiśakvarī", "16": "aṣṭi", "17": "atyaṣṭi", "18": "dhṛti", "19": "atidhṛti", "20": "kṛti", "21": "prakṛti", "22": "ākṛti", "23": "vikṛti", "24": "saṃskṛti", "25": "atikṛti", "26": "utkṛti", "27": "daṇḍaka", "28": "daṇḍaka", "29": "daṇḍaka", "30": "daṇḍaka", "31": "daṇḍaka", "32": "daṇḍaka", "33": "daṇḍaka", "34": "daṇḍaka", "35": "daṇḍaka", "36": "daṇḍaka", "37": "daṇḍaka", "38": "daṇḍaka"}, "samavritta": {"4": {"m(g|l)": "kanyā"}, "5": {"Bg(g|l)": "paṅkti"}, "6": {"t(y|j)": "tanumadhyamā", "m(m|t)": "vidyullekhā", "n(y|j)": "śaśivadanā", "y(y|j)": "somarājī"}, "7": {"js(g|l)": "kumāralalitā", "ms(g|l)": "madalekhā", "nn(g|l)": "madhumatī"}, "8": {"nBl(g|l)": "gajagati", "jrl(g|l)": "pramāṇikā", "Btl(g|l)": "māṇavaka", "mmg(g|l)": "vidyunmālā", "rjg(g|l)": "samānikā"}, "9": {"nn(m|t)": "bhujagaśiṣubhṛtā", "sj(r|B)": "bhujaṅgasaṅgatā", "Bm(s|n)": "maṇimadhya"}, "10": {"njn(g|l)": "tvaritagati", "mBs(g|l)": "mattā", "Bms(g|l)": "rukmavatī"}, "11": {"ttjg(g|l)": "indravajrā", "jtjg(g|l)": "upendravajrā", "BBBg(g|l)": "dodhaka", "mBnl(g|l)": "bhramaravilasita", "rnrl(g|l)": "rathoddhatā", "mBtg(g|l)": "vātormī", "mttg(g|l)": "śālinī", "rnBg(g|l)": "svāgatā"}, "12": {"ttj(r|B)": "indravaṃśā", "rnB(s|n)": "candravartma", "mBs(m|t)": "jaladharamālā", "jsj(s|n)": "jaloddhatagati", "njj(y|j)": "tāmarasa", "sss(s|n)": "toṭaka", "nBB(r|B)": "drutavilambita", "nnr(r|B)": "pramuditavadanā", "sjs(s|n)": "pramitākṣarā", "yyy(y|j)": "bhujaṅgaprayāta", "tyt(y|j)": "maṇimālā", "njj(r|B)": "mālatī", "jtj(r|B)": "vaṃśastha", "mmy(y|j)": "vaiśvadevī", "rrr(r|B)": "sragviṇī"}, "13": {"sjss(g|l)": "kalahaṃsa", "nntt(g|l)": "kṣamā", "mnjr(g|l)": "praharṣiṇī", "sjsj(g|l)": "mañjubhāṣiṇī", "mtys(g|l)": "mattamayūrī", "jBsj(g|l)": "rucirā", "nnrr(g|l)": "prabhā (mandākinī)"}, "14": {"nnrsl(g|l)": "aparājitā", "mtnsg(g|l)": "asaṃbādhā", "sjsyl(g|l)": "pathyā", "njBjl(g|l)": "pramadā", "nnBnl(g|l)": "praharaṇakalikā", "mBnyg(g|l)": "madhyakṣāmā", "tBjjg(g|l)": "vasantatilakā", "mtnmg(g|l)": "vāsantī"}, "15": {"rjrj(r|B)": "cārucāmara", "nnmy(y|j)": "mālinī", "mmmm(m|t)": "līlākhela", "nnnn(s|n)": "śaśikalā"}, "16": {"rjrjr(g|l)": "citra", "jrjrj(g|l)": "pañcacāmara", "njBjr(g|l)": "vāṇinī"}, "17": {"ssjBjg(g|l)": "citralekhā", "njBjjl(g|l)": "narkuṭaka", "jsjsyl(g|l)": "pṛthvī", "mBnttg(g|l)": "mandākrāntā", "BrnBnl(g|l)": "vaṃśapatrapatita", "ymnsBl(g|l)": "śikhariṇī", "nsmrsl(g|l)": "hariṇī"}, "18": {"mtnyy(y|j)": "kusumitalatāvellitā", "mBnyy(y|j)": "citralekhā", "njBjr(r|B)": "nandana", "nnrrr(r|B)": "nārāca", "msjst(s|n)": "śārdūlalalita", "rsjjB(r|B)": "mallikāmālā"}, "19": {"ymnsrr(g|l)": "meghavisphūrjitā", "msjstt(g|l)": "śārdūlavikrīḍita", "mrBnmn(g|l)": "sumadhurā", "mrBnyn(g|l)": "surasā"}, "20": {"sjjBrsl(g|l)": "gītikā", "mrBnyBl(g|l)": "suvadanā"}, "21": {"njBjjj(r|B)": "pañcakāvalī", "mrBnyy(y|j)": "sragdharā"}, "22": {"mmtnnns(g|l)": "haṃsī", "tByjsrn(g|l)": "aśvadhāṭī"}, "23": {"njBjBjBl(g|l)": "adritanayā", "njjjjjjl(g|l)": "śravaṇābharaṇam"}, "24": {"BtnsBBn(y|j)": "tanvī"}, "25": {"BmsBnnnn(g|l)": "krauñcapadā"}, "26": {"mmtnnnrsl(g|l)": "bhujaṅgavijṛmbhita", "jsnBjsnBl(g|l)": "śivatāṇḍava"}}, "jati": [{"regex": "\\[(12|11), (18|17), (12|11), (15|14)\\]", "morae": [12, 18, 12, 15], "name": "āryā"}, {"regex": "\\[(12|11), (18|17), (12|11), (18|17)\\]", "morae": [12, 18, 12, 18], "name": "gīti"}, {"regex": "\\[(12|11), (15|14), (12|11), (15|14)\\]", "morae": [12, 15, 12, 15], "name": "upagīti"}, {"regex": "\\[(12|11), (15|14), (12|11), (18|17)\\]", "morae": [12, 15, 12, 18], "name": "udgīti"}, {"regex": "\\[(12|11), (20|19), (12|11), (20|19)\\]", "morae": [12, 20, 12, 20], "name": "āryāgīti"}], "vizama": [{"p1":"sjsl","p2":"nsjg","p3":"Bnjlg","p4":"sjsjg","name":"udgatā"},{"p1":"sjsl","p2":"nsjg","p3":"BnBg","p4":"sjsjg","name":"udgatā 2"}], "ardha": [{"odd": "nnrl(g|l)", "even": "njj(r|B)", "name": "aparavaktra = [11: nnrlg] 1,3 + [12: njjr] 2,4"}, {"odd": "sssl(g|l)", "even": "BBBg(g|l)", "name": "upacitra = [11: ssslg] 1,3 + [11: BBBgg] 2,4"}, {"odd": "nnr(y|j)", "even": "njjr(g|l)", "name": "puṣpitāgrā = [12: nnry] 1,3 + [12: njjrg] 2,4"}, {"odd": "ssj(g|l)", "even": "sBrl(g|l)", "name": "viyoginī = [10: ssjg] 1,3 + [11: sBrlg] 2,4"}, {"odd": "sss(g|l)", "even": "BBBg(g|l)", "name": "vegavatī = [10: sssg] 1,3 + [11: BBBgg] 2,4"}, {"odd": "sssl(g|l)", "even": "nBB(r|B)", "name": "hariṇaplutā = [11: ssjgg] 1,3 + [12: nBBr] 2,4"}, {"odd": "ssjg(g|l)", "even": "sBr(y|j)", "name": "aupacchandasika = [11: ssjgg] 1,3 + [12: sBry] 2,4"}]};

// IAST → SLP transliteration (for scansion purposes)
const IAST_TO_SLP = {
  'ā':'A','ī':'I','ū':'U','ṛ':'f','ṝ':'F','ḷ':'x',
  'e':'e','ai':'E','o':'o','au':'O','a':'a','i':'i','u':'u',
  'k':'k','kh':'K','g':'g','gh':'G','ṅ':'N',
  'c':'c','ch':'C','j':'j','jh':'J','ñ':'Y',
  'ṭ':'w','ṭh':'W','ḍ':'q','ḍh':'Q','ṇ':'N',
  't':'t','th':'T','d':'d','dh':'D','n':'n',
  'p':'p','ph':'P','b':'b','bh':'B','m':'m',
  'y':'y','r':'r','l':'l','v':'v',
  'ś':'z','ṣ':'S','s':'s','h':'h',
  'ṃ':'M','ḥ':'H','ḻ':'L',
};

function iastToSlp(iast) {
  // Remove spaces, lowercase, then map chars longest-first
  let s = iast.toLowerCase().replace(/\s+/g,'');
  let out = '';
  let i = 0;
  const keys2 = Object.keys(IAST_TO_SLP).filter(k=>k.length===2);
  const keys1 = Object.keys(IAST_TO_SLP).filter(k=>k.length===1);
  while (i < s.length) {
    let matched = false;
    for (const k of keys2) {
      if (s.slice(i,i+k.length) === k) { out += IAST_TO_SLP[k]; i += k.length; matched=true; break; }
    }
    if (!matched) {
      for (const k of keys1) {
        if (s[i] === k) { out += IAST_TO_SLP[k]; i++; matched=true; break; }
      }
    }
    if (!matched) i++;
  }
  return out;
}

const SLP_LONG_V  = new Set(['A','I','U','F','X','e','E','o','O']);
const SLP_ALL_V   = new Set(['a','i','u','f','x','A','I','U','F','X','e','E','o','O']);
const SLP_CONS    = new Set(['k','K','c','C','w','W','t','T','p','P','z','S','s',
                             'g','G','N','j','J','Y','q','Q','n','m','y','r','l',
                             'v','h','b','B','d','D','M','H','L']);

// Syllabify SLP text (skrutable algorithm: open syllables, M/H close)
function syllabifySlp(slp) {
  let syls = [], cur = '';
  for (let i = 0; i < slp.length; i++) {
    const ch = slp[i];
    cur += ch;
    if (ch === 'M' || ch === 'H') { syls.push(cur); cur=''; }
    else if (SLP_ALL_V.has(ch)) { syls.push(cur); cur=''; }
  }
  // remaining consonants attach to last syllable
  if (cur && syls.length) syls[syls.length-1] += cur;
  else if (cur) syls.push(cur);
  return syls;
}

// Determine g/l weight of each syllable
function scanWeights(syls) {
  return syls.map((syl, n) => {
    const last = syl[syl.length-1];
    if (SLP_LONG_V.has(last) || last === 'M' || last === 'H') return 'g'; // heavy by nature
    if (SLP_CONS.has(last)) return 'g'; // closed syllable
    // heavy by position: next syllable starts with 2+ consonants
    if (n < syls.length-1) {
      const next = syls[n+1];
      if (next.length > 1 && SLP_CONS.has(next[0]) && SLP_CONS.has(next[1])) return 'g';
    }
    return 'l';
  }).join('');
}

// gaṇa abbreviation (groups of 3)
const GANAS = METER_DATA.gaRas;
function gaRaAbbrev(weights) {
  let out = '', i = 0;
  while (i < weights.length) {
    const tri = weights.slice(i, i+3);
    if (tri.length === 3 && GANAS[tri]) { out += GANAS[tri]; i += 3; }
    else { out += weights[i]; i++; }
  }
  return out;
}

function chooseHeavy(pat) {
  // e.g. "ttjg(g|l)" → "ttjgg"
  if (pat.endsWith('(g|l)')) return pat.slice(0,-5) + 'g';
  if (pat.endsWith('(r|B)')) return pat.slice(0,-5) + 'r';
  if (pat.endsWith('(y|j)')) return pat.slice(0,-5) + 'y';
  if (pat.endsWith('(m|t)')) return pat.slice(0,-5) + 'm';
  if (pat.endsWith('(s|n)')) return pat.slice(0,-5) + 's';
  return pat;
}

function morePerLine(w) { return w.split('l').length-1 + (w.split('g').length-1)*2; }

// Main identification function
// weights1/weights2 — строки вида 'gllggl...' (g=guru, l=laghu)
// syls1/syls2     — массивы строк слогов для отображения сканшена
function identifyMeterLocal(weights1, weights2, syls1, syls2) {
  const wbp = [weights1, weights2];
  const gbp = wbp.map(w => gaRaAbbrev(w));
  const mpl = wbp.map(w => morePerLine(w));
  const lens = wbp.map(w => w.length);

  let label = null, score = 0;

  function combine(newLabel, newScore) {
    if (newScore > score) { label = newLabel; score = newScore; }
    else if (newScore === score && newLabel && label && newLabel !== label) {
      const parts = label.split(' atha vā ');
      if (!parts.includes(newLabel)) label += ' atha vā ' + newLabel;
    }
  }

  // --- Test anuṣṭubh (śloka): check if both lines match ---
  function testAnustubhHalf(odd, even) {
    if (!new RegExp(METER_DATA.anustubh.even).test(even)) return null;
    for (const [pat, name] of Object.entries(METER_DATA.anustubh.odd))
      if (new RegExp(pat).test(odd)) return name;
    return null;
  }
  if (lens[0] === 8 && lens[1] === 8) {
    // Каждая строка — нечётная пада (1-я и 3-я); чётных пад нет
    // Проверяем каждую строку отдельно как нечётную паду anuṣṭubh
    function classifyOdd(w) {
      for (const [pat, name] of Object.entries(METER_DATA.anustubh.odd))
        if (new RegExp(pat).test(w)) return name;
      return null;
    }
    const r1 = classifyOdd(wbp[0]);
    const r2 = classifyOdd(wbp[1]);
    if (r1 && r2) {
      const label8 = (r1 === r2) ? r1 : r1 + ' / ' + r2;
      combine('anuṣṭubh / śloka (' + label8 + ')', 8);
    } else if (r1 || r2) {
      combine('anuṣṭubh / śloka (' + (r1 || r2) + ')', 6);
    }
    // Также проверяем старый вариант (s1=нечётная, s2=чётная)
    const resOld = testAnustubhHalf(wbp[0], wbp[1]);
    if (resOld) combine('anuṣṭubh / śloka (' + resOld + ')', 9);
  }
  // Пользователь передаёт 2 полустишия по 16 слогов (пады 1+2 и 3+4)
  if (lens[0] === 16 && lens[1] === 16) {
    const p1 = wbp[0].slice(0, 8), p2 = wbp[0].slice(8);
    const p3 = wbp[1].slice(0, 8), p4 = wbp[1].slice(8);
    const r1 = testAnustubhHalf(p1, p2);
    const r2 = testAnustubhHalf(p3, p4);
    if (r1 && r2) combine('anuṣṭubh / śloka (' + (r1 === r2 ? r1 : r1 + ' / ' + r2) + ')', 9);
    // Не выдаём результат если только одна из двух пад распознана
  }

  // --- Test samavṛtta ---
  // Пользователь передаёт полустишия (2 пады в каждой строке).
  // Разбиваем каждую строку пополам, получаем 4 пады p1..p4.
  const SM = METER_DATA.samavritta;
  function evalSamavritta(w, matchCount) {
    const g = gaRaAbbrev(w);
    const fam = SM[String(w.length)];
    if (!fam) return false;
    for (const [pat, name] of Object.entries(fam)) {
      if (new RegExp(pat).test(g)) {
        const full = name + ' [' + w.length + ': ' + chooseHeavy(pat) + ']';
        const sc = matchCount === 4 ? 9 : matchCount >= 2 ? 7 : 6;
        combine(full, sc);
        return true;
      }
    }
    combine('ajñātasamavṛtta [' + w.length + ': ' + g + ']', matchCount >= 2 ? 7 : 5);
    return false;
  }

  // Разбиваем на пады
  function splitPadas(w) {
    const half = Math.floor(w.length / 2);
    return [w.slice(0, half), w.slice(half)];
  }
  const padas = [
    ...splitPadas(wbp[0]),
    ...splitPadas(wbp[1]),
  ]; // [p1, p2, p3, p4]

  // Ищем паттерн с максимальным числом совпадающих пад
  function countMatchingSamavritta(padas) {
    const SM = METER_DATA.samavritta;
    const fam = SM[String(padas[0].length)];
    if (!fam) return { matchCount: 0, bestPada: padas[0] };
    let best = { matchCount: 0, bestPada: padas[0] };
    for (const [pat] of Object.entries(fam)) {
      const matching = padas.filter(p => new RegExp(pat).test(gaRaAbbrev(p)));
      if (matching.length > best.matchCount)
        best = { matchCount: matching.length, bestPada: matching[0] };
    }
    return best;
  }

  if (padas[0].length === padas[2].length) {
    // Все пады одной длины — samavṛtta
    const { matchCount } = countMatchingSamavritta(padas);
    if (matchCount === 4) {
      // Все пады одного типа — чистый самавритт
      evalSamavritta(padas[0], 4);
    } else if (matchCount > 0) {
      // Пады смешаны (upajāti и подобные) — проверяем каждую паду отдельно,
      // передаём score=2 чтобы все варианты попали в combine с одинаковым весом
      padas.forEach(p => evalSamavritta(p, 2));
    } else {
      padas.forEach(p => evalSamavritta(p, 1));
    }
  } else {
    // Пады разной длины — проверяем попарно
    padas.forEach(p => evalSamavritta(p, 1));
  }

  // --- Test ardhasamavṛtta ---
  // Перебираем все точки разреза каждого полустишия, чтобы корректно
  // обрабатывать случаи вроде puṣpitāgrā, где пады неравной длины
  for (const {odd, even, name} of METER_DATA.ardha) {
    const rOdd  = new RegExp("^(?:" + odd  + ")$");
    const rEven = new RegExp("^(?:" + even + ")$");
    let found = false;
    for (let i = 1; i < wbp[0].length && !found; i++) {
      const p1 = wbp[0].slice(0, i), p2 = wbp[0].slice(i);
      if (!rOdd.test(gaRaAbbrev(p1)) || !rEven.test(gaRaAbbrev(p2))) continue;
      for (let j = 1; j < wbp[1].length && !found; j++) {
        const p3 = wbp[1].slice(0, j), p4 = wbp[1].slice(j);
        if (rOdd.test(gaRaAbbrev(p3)) && rEven.test(gaRaAbbrev(p4))) {
          combine(name, 8);
          found = true;
        }
      }
    }
  }

  // --- Test viṣamavṛtta (udgatā etc.) ---
  // Try all split points: each half-verse may contain 2 pādas of unequal length
  for (const v of METER_DATA.vizama) {
    const r1 = new RegExp('^' + v.p1 + '$');
    const r2 = new RegExp('^' + v.p2 + '$');
    const r3 = new RegExp('^' + v.p3 + '$');
    const r4 = new RegExp('^' + v.p4 + '$');
    let found = false;
    for (let i = 1; i < wbp[0].length && !found; i++) {
      const g1 = gaRaAbbrev(wbp[0].slice(0, i));
      const g2 = gaRaAbbrev(wbp[0].slice(i));
      if (!r1.test(g1) || !r2.test(g2)) continue;
      for (let j = 1; j < wbp[1].length && !found; j++) {
        const g3 = gaRaAbbrev(wbp[1].slice(0, j));
        const g4 = gaRaAbbrev(wbp[1].slice(j));
        if (r3.test(g3) && r4.test(g4)) { combine(v.name, 9); found = true; }
      }
    }
  }

  // --- Test jāti ---
  // Перебираем все точки разреза каждого полустишия, чтобы найти
  // правильное деление на пады (āryā и подобные — неравные пады).
  for (const {regex, name} of METER_DATA.jati) {
    const re = new RegExp(regex);
    let found = false;
    for (let i = 1; i < wbp[0].length && !found; i++) {
      const m1 = morePerLine(wbp[0].slice(0, i));
      const m2 = morePerLine(wbp[0].slice(i));
      for (let j = 1; j < wbp[1].length && !found; j++) {
        const m3 = morePerLine(wbp[1].slice(0, j));
        const m4 = morePerLine(wbp[1].slice(j));
        const moraeStr = '[' + [m1, m2, m3, m4].join(', ') + ']';
        if (re.test(moraeStr)) { combine(name, 7); found = true; }
      }
    }
  }

  // --- Распознавание upajāti ---
  // Если в результате присутствуют оба варианта indravajrā и upendravajrā —
  // это upajāti (смешение, как определяет Апте)
  if (label && label.includes('indravajrā') && label.includes('upendravajrā')) {
    const parts = label.split(' atha vā ');
    const unique = [...new Set(parts)];
    label = 'upajāti: ' + unique.join(', ');
  }

  // Build scansion display
  const scan = [syls1, syls2].map((syls, li) =>
    syls.map((s, i) => s + '(' + wbp[li][i] + ')').join(' ')
  ).join('\n');

  return {
    label: label || 'na kiṃcid adhyavasitam (метр не определён)',
    score,
    weights: wbp,
    ganas:   gbp,
    morae:   mpl,
    scan,
  };
}

async function identifyMeter() {
  if (!DATA.s1.length) { showMsg('Сначала постройте диаграмму', 'err'); return; }
  showMsg('Определяю метр...', 'info');
  try {
    const w1   = DATA.s1.map(s => s.type === 'guru' ? 'g' : 'l').join('');
    const w2   = DATA.s2.map(s => s.type === 'guru' ? 'g' : 'l').join('');
    const syls1 = DATA.s1.map(s => s.syl);
    const syls2 = DATA.s2.map(s => s.syl);
    const result = identifyMeterLocal(w1, w2, syls1, syls2);

    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center';
    ov.onclick = e => { if(e.target===ov) ov.remove(); };
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--card);border-radius:8px;padding:24px 28px;max-width:600px;width:90%;font-family:"Charter Indologique","Cormorant Garamond",serif;color:var(--ink);box-shadow:0 8px 32px rgba(0,0,0,.25)';
    box.innerHTML = `
      <div style="font-size:.65rem;letter-spacing:.15em;text-transform:uppercase;font-family:'JetBrains Mono',monospace;color:var(--ink2);margin-bottom:12px">Метр / छन्दस्</div>
      <div style="font-size:1.4rem;font-weight:700;margin-bottom:14px">${result.label}</div>
      <table style="font-family:'JetBrains Mono',monospace;font-size:.72rem;border-collapse:collapse;width:100%;margin-bottom:12px">
        <tr><td style="color:var(--ink2);padding:2px 8px 2px 0;white-space:nowrap">Строфа 1:</td>
            <td style="letter-spacing:.12em">${result.weights[0]}</td>
            <td style="color:var(--ink2);padding:2px 0 2px 12px">${result.ganas[0]}</td>
            <td style="color:var(--ink2);padding:2px 0 2px 12px">мор: ${result.morae[0]}</td></tr>
        <tr><td style="color:var(--ink2);padding:2px 8px 2px 0;white-space:nowrap">Строфа 2:</td>
            <td style="letter-spacing:.12em">${result.weights[1]}</td>
            <td style="color:var(--ink2);padding:2px 0 2px 12px">${result.ganas[1]}</td>
            <td style="color:var(--ink2);padding:2px 0 2px 12px">мор: ${result.morae[1]}</td></tr>
      </table>
      <button onclick="this.closest('div[style*=fixed]').remove()" class="btn btn-s" style="width:100%">Закрыть</button>`;
    ov.appendChild(box);
    document.body.appendChild(ov);
    showMsg('✓ Метр: ' + result.label, 'ok');
  } catch(e) {
    showMsg('Ошибка: ' + e.message, 'err');
    console.error(e);
  }
}

async function showMeterInfo() {
  try { await loadApteMeters(); } catch (e) {}
  const w1 = DATA.s1.map(s => s.type==='guru'?'g':'l').join('');
  const w2 = DATA.s2.map(s => s.type==='guru'?'g':'l').join('');
  const mr = identifyMeterLocal(w1, w2, DATA.s1.map(s=>s.syl), DATA.s2.map(s=>s.syl));
  // If ajñātasamavṛtta — open group anchor in apte_prosody.html
  if (mr.label && mr.label.includes('ajñātasamavṛtta')) {
    const grpEntry = getGroupFromLabel(mr.label);
    if (grpEntry && grpEntry.anchor) {
      const a = document.createElement('a');
      a.href = 'apte_prosody.html';
      const w = window.open(a.href + '#' + grpEntry.anchor, '_blank');
      if (!w) _showMeterInfoPopup(mr, null);
      return;
    }
  }
  const entry2 = lookupApte2(mr.label);
  const key = entry2 ? entry2.key : null;

  // Open external HTML if key available, fallback to popup
  if (key) {
    const htmlPath = 'apte_prosody.html';
    // Use <a> trick to resolve relative path — works on file:// too
    const a = document.createElement('a');
    a.href = htmlPath;
    const resolved = a.href; // absolute URL
    // Try to open; if blocked or unavailable, show popup
    const w = window.open(resolved + '#' + key, '_blank');
    // Can't reliably detect file-not-found on file://, so show popup as well
    // if running from file:// (no server) user can close the blank tab
    if (!w) {
      _showMeterInfoPopup(mr, entry2);
    }
    return;
  }
  _showMeterInfoPopup(mr, entry2);
}

function _showMeterInfoPopup(mr, entry2) {
  const entry = entry2 || lookupApte(mr.label);

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(24,18,12,.75);z-index:300;overflow-y:auto;padding:30px 20px;box-sizing:border-box';
  ov.onclick = e => { if(e.target===ov) ov.remove(); };
  const _pngEsc = e => { if(e.key==='Escape'){ov.remove();document.removeEventListener('keydown',_pngEsc);} };
  document.addEventListener('keydown', _pngEsc);

  const box = document.createElement('div');
  box.style.cssText = "max-width:700px;margin:0 auto;background:var(--card);border-radius:12px;padding:32px 36px;font-family:'Gentium Plus','Gentium',Georgia,serif;font-size:.95rem;color:var(--ink);box-shadow:0 16px 60px rgba(0,0,0,.4)";
  const closeBtn = `<button onclick="this.closest('div[style*=fixed]').remove()" style="border:none;background:none;cursor:pointer;font-size:1.2rem;color:var(--ink2);align-self:flex-start">✕</button>`;

  if (!entry) {
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <strong style="font-size:.9rem">${mr.label}</strong>${closeBtn}
      </div>
      <p style="color:var(--ink2)">Описание не найдено в базе Апте.</p>`;
  } else if (entry2) {
    const nameClean = entry2.name.replace(/^\s*\(\d+\)\s*/,'');
    const num = (entry2.name.match(/^\s*\((\d+)\)/) || [])[1] || '';
    const groupTotal = Object.values(APTE_METERS2).filter(e=>e.group===entry2.group).length;
    const alsoStr = entry2.also_called
      ? ` <span style="color:var(--ink2);font-size:.85em">(also called ${entry2.also_called.join(', ')})</span>` : '';
    let html = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
        <div>
          <div style="font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ink);margin-bottom:3px">${entry2.section||''}</div>
          <div style="font-size:.8rem;color:var(--ink2);margin-bottom:6px">${entry2.group||''}</div>
        </div>${closeBtn}
      </div>
      <h4 style="font-size:1.1rem;margin:0 0 4px;font-family:'Gentium Plus','Gentium',Georgia,serif">
        ${num?'('+num+(groupTotal>1?'/'+groupTotal:'')+') ':''}${nameClean}${alsoStr}
      </h4>
      <hr style="border:none;border-top:1px solid var(--border);margin:10px 0">
      <div style="line-height:1.9;font-family:'Gentium Plus','Gentium',Georgia,serif">`;
    if (entry2.def)
      html += `<p style="margin:4px 0"><b>Def.</b> <span style="color:#4F81BD">${entry2.def}</span></p>`;
    if (entry2.sch)
      html += `<p style="margin:4px 0"><b>Sch. G.</b> ${entry2.sch}</p>`;
    if (entry2.example) {
      const exLines = entry2.example.split('\n').map(l=>`<span style="color:#4F81BD">${l}</span>`).join('<br>');
      const refObj = entry2.example_ref;
      const refStr = refObj ? ` <span style="color:var(--ink2);font-size:.82em;font-style:italic">${typeof refObj==='object'?refObj.full:refObj}</span>` : '';
      html += `<p style="margin:8px 0"><b>Ex.</b> ${exLines}${refStr}</p>`;
    }
    if (entry2.notes&&entry2.notes.length)
      html += entry2.notes.map(n=>`<p style="margin:6px 0;color:var(--ink2);font-size:.9em">${n}</p>`).join('');
    html += `</div>
      <button onclick="this.closest('div[style*=fixed]').remove()" class="btn btn-s" style="margin-top:20px;width:100%">Закрыть</button>`;
    box.innerHTML = html;
  } else {
    const familyCounts = {"Metres with 6 Syllables in a quarter.":4,"Metres with 7 Syllables in a quarter.":3,"Metres with 8 Syllables in a quarter.":6,"Metres with 9 Syllables in a quarter.":3,"Metres with 10 Syllables in a quarter.":3,"Metres with 11 Syllables in a quarter.":9,"Metres with 12 Syllables in a quarter.":9,"Metres with 13 Syllables in a quarter.":6,"Metres with 14 Syllables in a quarter.":8,"Metres with 15 Syllables in a quarter.":4,"Metres with 16 Syllables in a quarter.":3,"Metres with 17 Syllables in a quarter.":7,"Metres with 18 Syllables in a quarter.":5,"Metres with 19 Syllables in a quarter.":4,"Metres with 20 Syllables in a quarter.":2,"Metres with 21 Syllables in a quarter.":2,"Metres with 26 Syllables in a quarter.":12};
    let textHtml = entry.html||entry.text||'';
    const total = familyCounts[entry.family];
    if (total) textHtml = textHtml.replace(/\((\d+)\)/,(_,n)=>'('+n+'/'+total+')');
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div>
          <div style="font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ink);margin-bottom:3px;font-family:'Gentium Plus','Gentium',Georgia,serif">${entry.section}</div>
          <div style="font-size:.8rem;color:var(--ink);margin-bottom:10px;font-family:'Gentium Plus','Gentium',Georgia,serif">${entry.family}</div>
        </div>${closeBtn}
      </div>
      <style>#meter-info-content h4{font-size:1.05rem;margin:0 0 8px}</style>
      <hr style="border:none;border-top:1px solid var(--border);margin:12px 0">
      <div id="meter-info-content" style="line-height:1.7"><p style="margin:8px 0">${textHtml}</p></div>
      <button onclick="this.closest('div[style*=fixed]').remove()" class="btn btn-s" style="margin-top:20px;width:100%">Закрыть</button>`;
  }
  box.setAttribute('spellcheck','false');
  box.setAttribute('lang','sa');
  ov.appendChild(box);
  document.body.appendChild(ov);
}


// ══════════════════════════════════════════════════════════════════════════════
// TAPPING & KARAOKE PLAYBACK
// ══════════════════════════════════════════════════════════════════════════════

// ── Waveform drawing ─────────────────────────────────────────────────────────
let _waveformPcm = null;     // Float32Array of mono samples (800 pts, for display)
let _waveformFull = null;    // Float32Array full-res mono PCM for pause detection
let _waveformSr   = 44100;   // sample rate of full PCM
let _padaBounds   = null;    // [t0,t1,t2,t3,t4] — 5 boundary times (start/end of 4 padas)

async function drawWaveform() {
  const canvas = document.getElementById('waveform-canvas');
  if (!canvas) return;
  const preview = document.getElementById('audio-preview');
  if (!preview || !preview.src) return;

  // Decode audio into PCM (may already be done by _decodeFullPcm on audio load)
  if (!_waveformPcm) {
    await _decodeFullPcm(preview.src);
    if (!_waveformPcm) return;
  }

  canvas.style.display = '';
  canvas.width = canvas.offsetWidth * devicePixelRatio;
  const W = canvas.width, H = canvas.height * devicePixelRatio;
  canvas.height = H;
  const dc = canvas.getContext('2d');
  dc.scale(devicePixelRatio, devicePixelRatio);
  const cW = canvas.offsetWidth, cH = canvas.offsetHeight;

  // Background
  dc.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg2') || '#f5f0e8';
  dc.fillRect(0, 0, cW, cH);

  // Waveform bars
  dc.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink2') || '#888';
  const barW = cW / _waveformPcm.length;
  for (let i = 0; i < _waveformPcm.length; i++) {
    const h = _waveformPcm[i] * cH;
    dc.fillRect(i * barW, (cH - h) / 2, Math.max(1, barW - 0.5), h);
  }

  // Draw tap markers
  _drawWaveformMarkers(dc, cW, cH);
}

function _drawWaveformMarkers(dc, cW, cH) {
  const preview = document.getElementById('audio-preview');
  if (!preview) return;
  const dur = preview.duration || 1;
  const root = getComputedStyle(document.documentElement);
  const guruCol  = root.getPropertyValue('--guru').trim()  || '#8B0000';
  const laghuCol = root.getPropertyValue('--laghu').trim() || '#2C4A1E';

  // Syllable boundaries — thin lines, no labels
  ['s1','s2'].forEach(key => {
    const times = TAP.times[key] || [];
    const syls  = DATA[key] || [];
    times.forEach((t, i) => {
      const x = (t / dur) * cW;
      const guru = syls[i] && syls[i].type === 'guru';
      dc.strokeStyle = guru ? guruCol : laghuCol;
      dc.lineWidth = 0.5;
      dc.globalAlpha = 0.6;
      dc.beginPath();
      dc.moveTo(x, 0);
      dc.lineTo(x, cH);
      dc.stroke();
      dc.globalAlpha = 1.0;
    });
  });

  // Pada boundaries
  if (_padaBounds) {
    _padaBounds.forEach((b, i) => {
      const x0 = (b[0] / dur) * cW;
      const x1 = (b[1] / dur) * cW;
      // Shade
      dc.fillStyle = `rgba(100,80,20,${i % 2 === 0 ? 0.07 : 0.13})`;
      dc.fillRect(x0, 0, x1 - x0, cH);
      // Start boundary — solid
      dc.strokeStyle = 'rgba(100,80,20,0.8)';
      dc.lineWidth = 1;
      dc.setLineDash([]);
      dc.beginPath(); dc.moveTo(x0, 0); dc.lineTo(x0, cH); dc.stroke();
      // End boundary — solid (same as start)
      dc.beginPath(); dc.moveTo(x1, 0); dc.lineTo(x1, cH); dc.stroke();
    });

    // Dashed line at midpoint of silence between pada 2 and pada 3
    [[1,2]].forEach(([a,b]) => {
      if (_padaBounds[a] && _padaBounds[b]) {
        const xMid = (((_padaBounds[a][1] + _padaBounds[b][0]) / 2) / dur) * cW;
        dc.strokeStyle = 'rgba(100,80,20,0.6)';
        dc.lineWidth = 1;
        dc.setLineDash([3,3]);
        dc.beginPath(); dc.moveTo(xMid, 0); dc.lineTo(xMid, cH); dc.stroke();
        dc.setLineDash([]);
      }
    });
  }

  // Playhead
  if (!preview.paused) {
    const x = (preview.currentTime / dur) * cW;
    dc.strokeStyle = '#e44';
    dc.lineWidth = 1.5;
    dc.beginPath();
    dc.moveTo(x, 0);
    dc.lineTo(x, cH);
    dc.stroke();
  }

  // Draw onset candidate ticks
  dc.save();
  dc.strokeStyle = 'rgba(180, 120, 0, 0.4)';
  dc.lineWidth   = 1;
  _lastOnsets.forEach(t => {
    const x = (t / dur) * cW;
    dc.beginPath(); dc.moveTo(x, 0); dc.lineTo(x, cH * 0.35); dc.stroke();
  });
  dc.strokeStyle = 'rgba(0, 100, 180, 0.35)';
  _lastPeaks.forEach(t => {
    const x = (t / dur) * cW;
    dc.beginPath(); dc.moveTo(x, 0); dc.lineTo(x, cH * 0.25); dc.stroke();
  });
  dc.restore();
}

// ── Waveform onset / peak detection ──────────────────────────────────────────
async function detectOnsets(audioBuffer) {
  // Thin adapter over core/timing.js — pure detection runs on raw PCM.
  return detectOnsetsFromPcm(audioBuffer.getChannelData(0), audioBuffer.sampleRate);
}

// _snapToNearest, _snapConfidence — imported from core/timing.js (ADR-0001).


function _isSylUncertain(key, i) {
  const conf = TAP.confidence?.[key];
  return conf && conf[i] !== undefined && conf[i] < 0.5;
}


// ── Phoneme rules (loaded once, cached) ──────────────────────────────────────
let _phonemeRules = null;
async function loadPhonemeRules() {
  if (_phonemeRules) return _phonemeRules;
  try {
    const r = await fetch('tools/phoneme_rules.json');
    _phonemeRules = (await r.json()).rules;
  } catch(e) {
    _phonemeRules = { default: { align_to: 'onset', offset_ms: 0 } };
  }
  return _phonemeRules;
}

function _getPhonemeRule(syl, rules) {
  // syl is IAST transliteration from DATA, e.g. "kar", "ma", "ya"
  const first = syl.trim()[0] || '';
  return rules[first] || rules[first.toLowerCase()] || rules['default'];
}

// ── Corpus-based timing scale ─────────────────────────────────────────────────
async function corpusScaleTiming(meter, s1len, s2len, newDuration) {
  try {
    return await _coreCorpusScaleTiming({
      meter,
      s1len,
      s2len,
      newDuration,
      loadIndex: async () => {
        const r = await fetch('verses/index.json');
        return r.json();
      },
      loadVerse: async id => {
        const r = await fetch(`verses/data/${id}.json`);
        return r.json();
      },
    });
  } catch(e) {
    return null;
  }
}

function refreshWaveform() {
  const canvas = document.getElementById('waveform-canvas');
  if (!canvas || canvas.style.display === 'none') return;
  const cW = canvas.offsetWidth, cH = canvas.offsetHeight;
  const dc = canvas.getContext('2d');
  dc.clearRect(0, 0, cW, cH);
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg2') || '#f5f0e8';
  dc.fillStyle = bg;
  dc.fillRect(0, 0, cW, cH);
  if (_waveformPcm) {
    dc.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink2') || '#888';
    const barW = cW / _waveformPcm.length;
    for (let i = 0; i < _waveformPcm.length; i++) {
      const h = _waveformPcm[i] * cH;
      dc.fillRect(i * barW, (cH - h) / 2, Math.max(1, barW - 0.5), h);
    }
  }
  _drawWaveformMarkers(dc, cW, cH);
}

// Allow dragging markers on waveform
(function() {
  let dragging = null; // { key, idx }
  function getCanvas() { return document.getElementById('waveform-canvas'); }
  function xToTime(x, cW) {
    const preview = document.getElementById('audio-preview');
    return (x / cW) * (preview ? preview.duration || 1 : 1);
  }
  function findNearestMarker(x, cW) {
    // Find marker by zone: click anywhere between marker[i] and marker[i+1] (or pada end)
    const tClick = _teXToTime(x, cW);
    let best = null;
    ['s1','s2'].forEach(key => {
      const times = TAP.times[key] || [];
      const syls  = DATA[key] || [];
      const half  = Math.ceil(syls.length / 2);
      times.forEach((t, i) => {
        if (best) return;
        let padaEnd = _teDur();
        if (_padaBounds) {
          let padaIdx;
          if (key === 's1') padaIdx = i < half ? 0 : 1;
          else padaIdx = i < half ? 2 : 3;
          if (padaIdx < _padaBounds.length) padaEnd = _padaBounds[padaIdx][1];
        }
        const tNext = times[i + 1] !== undefined ? Math.min(times[i + 1], padaEnd) : padaEnd;
        if (tClick >= t && tClick < tNext) best = { key, idx: i };
      });
    });
    return best;
  }
  document.addEventListener('mousedown', e => {
    const c = getCanvas();
    if (!c || e.target !== c) return;
    const rect = c.getBoundingClientRect();
    const x = e.clientX - rect.left;
    dragging = findNearestMarker(x, rect.width);
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const c = getCanvas();
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const t = xToTime(x, rect.width);
    if (!TAP.times[dragging.key]) TAP.times[dragging.key] = [];
    TAP.times[dragging.key][dragging.idx] = t;
    refreshWaveform();
  });
  document.addEventListener('mouseup', () => { dragging = null; });
  document.addEventListener('touchstart', e => {
    const c = getCanvas();
    if (!c || e.target !== c) return;
    e.preventDefault();
    const ne = _normEv(e);
    const rect = c.getBoundingClientRect();
    dragging = findNearestMarker(ne.clientX - rect.left, rect.width);
  }, {passive: false});
  document.addEventListener('touchmove', e => {
    if (!dragging) return;
    e.preventDefault();
    const c = getCanvas();
    if (!c) return;
    const ne = _normEv(e);
    const rect = c.getBoundingClientRect();
    const x = Math.max(0, Math.min(ne.clientX - rect.left, rect.width));
    TAP.times[dragging.key] = TAP.times[dragging.key] || [];
    TAP.times[dragging.key][dragging.idx] = xToTime(x, rect.width);
    refreshWaveform();
  }, {passive: false});
  document.addEventListener('touchend', () => { dragging = null; });
})();

// ── Tapping logic ─────────────────────────────────────────────────────────────
function startTapping() {
  if (!DATA.s1.length && !DATA.s2.length) { showMsg('Сначала постройте диаграмму', 'err'); return; }
  const preview = document.getElementById('audio-preview');
  if (!preview || !preview.src || preview.style.display === 'none') { showMsg('Сначала загрузите аудио', 'err'); return; }

  // Reset cursors
  TAP.cursor = { s1: 0, s2: 0 };
  if (!TAP.times.s1) TAP.times.s1 = [];
  if (!TAP.times.s2) TAP.times.s2 = [];

  // Set speed and play
  preview.playbackRate = TAP.playRate;
  preview.currentTime = 0;
  preview.play();

  TAP.active = true;
  _updateTapStatus();
  // Remove focus from button so spacebar doesn't re-trigger it
  if (document.activeElement) document.activeElement.blur();

  document.getElementById('btn-karaoke-play').disabled = true;
  document.getElementById('btn-karaoke-stop').disabled = true;

  // Draw waveform
  _waveformPcm = null; // force redecode
  drawWaveform();

  showMsg('Тэппинг: нажимайте пробел на каждом слоге', 'info');
}

function resetTapping() {
  TAP.active = false;
  TAP.times = { s1: [], s2: [] };
  TAP.cursor = { s1: 0, s2: 0 };
  const preview = document.getElementById('audio-preview');
  if (preview) { preview.pause(); preview.playbackRate = 1.0; }
  karaokeStop();
  _clearKaraokeHighlight();
  document.getElementById('btn-karaoke-play').disabled = true;
  document.getElementById('btn-karaoke-stop').disabled = true;
  document.getElementById('tap-status').textContent = '';
  // Сброс границ пад
  _padaBounds = null;
  // Скрыть кнопку «Редактировать тайминг»
  const etb = document.getElementById('edit-timing-block');
  if (etb) etb.style.display = 'none';
  refreshWaveform();
  showMsg('Тайминг и пады сброшены', 'ok');
}

function _updateTapStatus() {
  const el = document.getElementById('tap-status');
  if (!el) return;
  if (!TAP.active) { el.textContent = ''; return; }
  const i1 = TAP.cursor.s1, i2 = TAP.cursor.s2;
  const n1 = DATA.s1.length, n2 = DATA.s2.length;
  const next1 = DATA.s1[i1] ? DATA.s1[i1].syl : '—';
  const next2 = DATA.s2[i2] ? DATA.s2[i2].syl : '—';
  el.textContent = `Строка 1: ${i1}/${n1} (${next1})  Строка 2: ${i2}/${n2} (${next2})`;
}

// Spacebar handler for tapping
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { const ov = document.getElementById('timing-editor-overlay'); if (ov && ov.style.display !== 'none') { closeTimingEditor(); return; } }
  if (!TAP.active) return;
  if (e.code !== 'Space' && e.key !== ' ') return;
  // Prevent page scroll and button re-trigger
  e.preventDefault();

  const preview = document.getElementById('audio-preview');
  if (!preview) return;
  const t = preview.currentTime;

  // Assign to whichever strophe still has unset syllables, alternating s1→s2→s1...
  // Strategy: fill s1 first, then s2
  const i1 = TAP.cursor.s1, n1 = DATA.s1.length;
  const i2 = TAP.cursor.s2, n2 = DATA.s2.length;

  if (i1 < n1) {
    TAP.times.s1[i1] = t;
    TAP.cursor.s1++;
  } else if (i2 < n2) {
    TAP.times.s2[i2] = t;
    TAP.cursor.s2++;
  }

  _updateTapStatus();
  refreshWaveform();

  // Highlight tapped syllable briefly
  const key  = (i1 < n1) ? 's1' : 's2';
  const idx  = (key === 's1') ? i1 : i2;
  _flashSyllable(key, idx);

  // Check if done
  if (TAP.cursor.s1 >= n1 && TAP.cursor.s2 >= n2) {
    TAP.active = false;
    preview.pause();
    preview.playbackRate = 1.0;
    document.getElementById('btn-karaoke-play').disabled = false;
    const _etb = document.getElementById('edit-timing-block'); if (_etb) _etb.style.display = '';
    document.getElementById('tap-status').textContent = '✓ Тэппинг завершён';
    drawWaveform();
    showMsg('✓ Тайминг записан. Можно воспроизвести или скорректировать маркеры на waveform.', 'ok');
  }
});

// ── Karaoke playback with highlight ──────────────────────────────────────────
function karaokePlay() {
  if (!TAP.times.s1 && !TAP.times.s2) { showMsg('Сначала выполните тэппинг', 'err'); return; }
  const preview = document.getElementById('audio-preview');
  if (!preview) return;
  _clearKaraokeHighlight(); // restore all colors before starting
  preview.playbackRate = 1.0;
  preview.currentTime = 0;
  preview.play();
  document.getElementById('btn-karaoke-play').disabled = true;
  document.getElementById('btn-karaoke-stop').disabled = false;
  _karaokeLoop();
}

function karaokeStop() {
  if (karaokeRaf) { cancelAnimationFrame(karaokeRaf); karaokeRaf = null; }
  const preview = document.getElementById('audio-preview');
  if (preview) preview.pause();
  document.getElementById('btn-karaoke-play').disabled = false;
  document.getElementById('btn-karaoke-stop').disabled = true;
  _clearKaraokeHighlight();
}

function _karaokeLoop() {
  const preview = document.getElementById('audio-preview');
  if (!preview || preview.paused || preview.ended) {
    _clearKaraokeHighlight();
    document.getElementById('btn-karaoke-play').disabled = false;
    document.getElementById('btn-karaoke-stop').disabled = true;
    return;
  }
  const t = preview.currentTime;

  // For each strophe independently: compute laghu duration and last syllable end
  function getLaghuDur(key) {
    const times = TAP.times[key] || [];
    const syls  = DATA[key] || [];
    if (times.length < 2) return 0.3;
    const halfIdx = Math.floor(times.length / 2);
    const span = times[times.length - 1] - times[halfIdx];
    const units = syls.slice(halfIdx).reduce((a, s) => a + (s.type === 'guru' ? 2 : 1), 0);
    return units > 0 ? span / units : 0.3;
  }

  function isKeyActive(key) {
    const times = TAP.times[key] || [];
    if (!times.length) return false;
    // Конец последнего слога — из _padaBounds конец последней пады строфы
    let lastSylEnd;
    if (_padaBounds) {
      const lastPada = key === 's1' ? _padaBounds[1] : _padaBounds[3];
      lastSylEnd = lastPada ? lastPada[1] : (times[times.length-1] + getLaghuDur(key) * 2);
    } else {
      const lastSyl = (DATA[key]||[])[times.length-1];
      const lastUnits = lastSyl?.type === 'guru' ? 2 : 1;
      lastSylEnd = times[times.length-1] + getLaghuDur(key) * lastUnits;
    }
    return t <= lastSylEnd;
  }

  const s1Active = isKeyActive('s1');
  const s2Active = isKeyActive('s2');

  ['s1', 's2'].forEach(key => {
    const active = key === 's1' ? s1Active : s2Active;
    if (active) {
      _updateKaraokeHighlightKey(key, t);
    } else {
      _clearKaraokeHighlightKey(key);
    }
  });

  refreshWaveform();
  karaokeRaf = requestAnimationFrame(_karaokeLoop);
}


// ── Подсветка текущего слога в главном окне при воспроизведении ─────────────
let _mainHlRaf = null;

function _mainHighlightLoop() {
  const preview = document.getElementById('audio-preview');
  if (!preview || preview.paused) {
    // Аудио остановлено — снимаем подсветку
    ['s1','s2'].forEach(k => _clearKaraokeHighlightKey(k));
    _mainHlRaf = null;
    return;
  }
  const t = preview.currentTime;
  ['s1','s2'].forEach(k => {
    const times = TAP.times[k] || [];
    if (!times.length) return;
    const lastIdx = times.length - 1;
    // Конец последнего слога строфы — из _padaBounds конец последней пады
    let lastSylEnd = Infinity;
    if (_padaBounds) {
      const lastPada = k === 's1' ? _padaBounds[1] : _padaBounds[3];
      if (lastPada) lastSylEnd = lastPada[1];
    } else {
      lastSylEnd = times[lastIdx] + 0.5;
    }
    // Снимаем подсветку только если вышли за конец последнего слога
    if (t > lastSylEnd) {
      _clearKaraokeHighlightKey(k);
    } else {
      _updateKaraokeHighlightKey(k, t);
    }
  });
  _mainHlRaf = requestAnimationFrame(_mainHighlightLoop);
}

function _mainHighlightStart() {
  if (!_mainHlRaf) _mainHlRaf = requestAnimationFrame(_mainHighlightLoop);
}

function _mainHighlightStop() {
  if (_mainHlRaf) { cancelAnimationFrame(_mainHlRaf); _mainHlRaf = null; }
  ['s1','s2'].forEach(k => _clearKaraokeHighlightKey(k));
}

function _currentSylIndex(key, t) {
  return _coreCurrentSylIndex(TAP.times[key] || [], t);
}

// Track previously highlighted node to restore it efficiently
let _prevHighlight = { s1: -1, s2: -1 };


function _updateKaraokeHighlightKey(key, t) {
  const root = getComputedStyle(document.documentElement);
  const guruCol  = root.getPropertyValue('--guru').trim()  || '#8B0000';
  const laghuCol = root.getPropertyValue('--laghu').trim() || '#2C4A1E';
  const idx = _currentSylIndex(key, t);
  const syls = DATA[key] || [];
  const prevIdx = _prevHighlight[key];

  // Restore previous — удаляем hl-ring
  if (prevIdx !== idx && prevIdx >= 0 && prevIdx < syls.length) {
    const ps = syls[prevIdx];
    const pnode = document.querySelector(`.syl-node[data-key="${key}"][data-col="${ps.col}"]`);
    if (pnode) {
      const ring = pnode.querySelector('.hl-ring');
      if (ring) ring.remove();
    }
  }

  // Highlight current — добавляем большой прозрачный кружок поверх, оригинал не трогаем
  if (idx >= 0 && idx < syls.length && idx !== prevIdx) {
    const s = syls[idx];
    const node = document.querySelector(`.syl-node[data-key="${key}"][data-col="${s.col}"]`);
    if (node) {
      const circle = node.querySelector('circle');
      if (circle && !node.querySelector('.hl-ring')) {
        const cx = circle.getAttribute('cx');
        const cy = circle.getAttribute('cy');
        const r  = s.type === 'guru' ? 14 : 11;
        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ring.setAttribute('cx', cx);
        ring.setAttribute('cy', cy);
        ring.setAttribute('r', r);
        ring.setAttribute('fill', 'rgba(220,60,60,0.22)');
        ring.setAttribute('stroke', 'rgba(200,40,40,0.45)');
        ring.setAttribute('stroke-width', '1.5');
        ring.setAttribute('pointer-events', 'none');
        ring.classList.add('hl-ring');
        node.insertBefore(ring, circle);
      }
    }
  }
  _prevHighlight[key] = idx;
}

function _clearKaraokeHighlightKey(key) {
  const syls = DATA[key] || [];
  syls.forEach(s => {
    const node = document.querySelector(`.syl-node[data-key="${key}"][data-col="${s.col}"]`);
    if (!node) return;
    const ring = node.querySelector('.hl-ring');
    if (ring) ring.remove();
  });
  _prevHighlight[key] = -1;
}

function _updateKaraokeHighlight(t) {
  const root = getComputedStyle(document.documentElement);
  const guruCol  = root.getPropertyValue('--guru').trim()  || '#8B0000';
  const laghuCol = root.getPropertyValue('--laghu').trim() || '#2C4A1E';

  ['s1','s2'].forEach(key => {
    const idx = _currentSylIndex(key, t);
    const syls = DATA[key] || [];
    const prevIdx = _prevHighlight[key];

    // Restore previous highlighted syllable if changed
    if (prevIdx !== idx && prevIdx >= 0 && prevIdx < syls.length) {
      const ps = syls[prevIdx];
      const pnode = document.querySelector(`.syl-node[data-key="${key}"][data-col="${ps.col}"]`);
      if (pnode) {
        const pc = pnode.querySelector('circle');
        if (pc) {
          pc.setAttribute('fill', pc.getAttribute('data-orig-fill') || '#ffffff');
          pc.setAttribute('stroke', pc.getAttribute('data-orig-stroke') || (ps.type === 'guru' ? guruCol : laghuCol));
          pc.setAttribute('r', ps.type === 'guru' ? '8' : '5.5');
          pc.removeAttribute('data-orig-fill');
          pc.removeAttribute('data-orig-stroke');
        }
        const pt = pnode.querySelector('text');
        if (pt) {
          pt.setAttribute('fill', ps.type === 'guru' ? guruCol : laghuCol);
          pt.setAttribute('font-weight', ps.type === 'guru' ? '700' : '400');
        }
      }
    }

    // Highlight current syllable
    if (idx >= 0 && idx < syls.length && idx !== prevIdx) {
      const s = syls[idx];
      const node = document.querySelector(`.syl-node[data-key="${key}"][data-col="${s.col}"]`);
      if (node) {
        const circle = node.querySelector('circle');
        if (circle) {
          if (!circle.getAttribute('data-orig-fill')) circle.setAttribute('data-orig-fill', circle.getAttribute('fill'));
          if (!circle.getAttribute('data-orig-stroke')) circle.setAttribute('data-orig-stroke', circle.getAttribute('stroke'));
          circle.setAttribute('fill', '#e44');
          circle.setAttribute('stroke', '#e44');
          circle.setAttribute('r', s.type === 'guru' ? '11' : '8');
        }
        const textEl = node.querySelector('text');
        if (textEl) {
          textEl.setAttribute('fill', '#e44');
          textEl.setAttribute('font-weight', '900');
        }
      }
    }

    _prevHighlight[key] = idx;
  });
}

function _clearKaraokeHighlight() {
  document.querySelectorAll('.syl-node').forEach(node => {
    const key = node.getAttribute('data-key');
    const col = parseInt(node.getAttribute('data-col'));
    const syls = DATA[key] || [];
    const s = syls.find(x => x.col === col);
    if (!s) return;
    const circle = node.querySelector('circle');
    if (circle) {
      const origFill = circle.getAttribute('data-orig-fill');
      const origStroke = circle.getAttribute('data-orig-stroke');
      if (origFill !== null) { circle.setAttribute('fill', origFill); circle.removeAttribute('data-orig-fill'); }
      if (origStroke !== null) { circle.setAttribute('stroke', origStroke); circle.removeAttribute('data-orig-stroke'); }
      circle.setAttribute('r', s.type === 'guru' ? '8' : '5.5');
    }
    const textEl = node.querySelector('text');
    if (textEl) {
      const col2 = getComputedStyle(document.documentElement);
      textEl.setAttribute('fill', s.type === 'guru'
        ? (col2.getPropertyValue('--guru').trim() || '#8B0000')
        : (col2.getPropertyValue('--laghu').trim() || '#2C4A1E'));
      textEl.setAttribute('font-weight', s.type === 'guru' ? '700' : '400');
    }
  });
  _prevHighlight = { s1: -1, s2: -1 };
}

function _flashSyllable(key, idx) {
  const s = DATA[key] && DATA[key][idx];
  if (!s) return;
  const node = document.querySelector(`.syl-node[data-key="${key}"][data-col="${s.col}"]`);
  if (!node) return;
  const circle = node.querySelector('circle');
  if (circle) {
    circle.setAttribute('fill', '#e44');
    setTimeout(() => {
      circle.setAttribute('fill', circle.getAttribute('data-orig-fill') || '#ffffff');
    }, 200);
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// PADA BOUNDARY DETECTION & AUTO-TIMING
// ══════════════════════════════════════════════════════════════════════════════

function calcAutoTiming() {
  if (!_padaBounds) { showMsg('Сначала найдите границы пад', 'err'); return; }
  if (!DATA.s1.length && !DATA.s2.length) { showMsg('Сначала постройте диаграмму', 'err'); return; }

  const lastLaghuAsGuru = document.getElementById('opt-last-laghu-as-guru')?.checked || false;

  const half1 = Math.ceil(DATA.s1.length / 2);
  const half2 = Math.ceil(DATA.s2.length / 2);
  const padas = [
    { syls: DATA.s1.slice(0, half1),  t0: _padaBounds[0][0], t1: _padaBounds[0][1], key: 's1', from: 0 },
    { syls: DATA.s1.slice(half1),     t0: _padaBounds[1][0], t1: _padaBounds[1][1], key: 's1', from: half1 },
    { syls: DATA.s2.slice(0, half2),  t0: _padaBounds[2][0], t1: _padaBounds[2][1], key: 's2', from: 0 },
    { syls: DATA.s2.slice(half2),     t0: _padaBounds[3][0], t1: _padaBounds[3][1], key: 's2', from: half2 },
  ];

  const onlyUnmarked = document.getElementById('opt-only-unmarked')?.checked || false;

  if (!onlyUnmarked) {
    TAP.times.s1 = new Array(DATA.s1.length).fill(0);
    TAP.times.s2 = new Array(DATA.s2.length).fill(0);
  }

  // Проверка «размечена ли пада» — хотя бы один ненулевой тайминг в диапазоне
  function _padaIsMarked(key, from, count) {
    const times = TAP.times[key] || [];
    for (let i = from; i < from + count; i++) {
      if (times[i] && times[i] > 0) return true;
    }
    return false;
  }

  padas.forEach(pada => {
    const { syls, t0, t1, key, from } = pada;
    if (!syls.length) return;
    // Пропустить если опция включена и пада уже размечена
    if (onlyUnmarked && _padaIsMarked(key, from, syls.length)) return;
    // Инициализировать массив если нужно
    if (!TAP.times[key] || TAP.times[key].length === 0) {
      TAP.times[key] = new Array(DATA[key].length).fill(0);
    }
    // Mora-proportional distribution (core/timing.js). lastLaghuAsGuru weights
    // a trailing laghu as a guru.
    const times = distributePada(syls, t0, t1, { lastLaghuAsGuru });
    times.forEach((t, i) => { TAP.times[key][from + i] = t; });
  });

  refreshWaveform();

  const laghuInfo = padas.map((pada, pi) => {
    const { syls, t0, t1 } = pada;
    if (!syls.length) return '';
    const unitDur = padaUnitDuration(syls, t0, t1, { lastLaghuAsGuru });
    return `П${pi+1}: ${unitDur.toFixed(3)}с`;
  }).join('  ·  ');
  showMsg('✓ Тайминг вычислен. Лагху: ' + laghuInfo, 'ok');
}

// ── Drag pada boundaries on waveform ─────────────────────────────────────────
let _dragPada = null; // index into _padaBounds (1,2,3 — inner boundaries only)

function _enablePadaDrag() {
  // handled in global mousemove/mousedown below
}

// Extend existing drag logic to handle pada boundaries
(function() {
  const _origMousedown = document.onmousedown;
  // _dragPada = { padaIdx, edge: 'start'|'end' }
  document.addEventListener('mousedown', e => {
    const c = document.getElementById('waveform-canvas');
    if (!c || e.target !== c || !_padaBounds) return;
    const rect = c.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const preview = document.getElementById('audio-preview');
    const dur = preview ? preview.duration || 1 : 1;
    const cW = rect.width;
    let best = null, bestDist = 12;
    _padaBounds.forEach((b, i) => {
      ['start','end'].forEach(edge => {
        const t = edge === 'start' ? b[0] : b[1];
        const bx = (t / dur) * cW;
        const d = Math.abs(bx - x);
        if (d < bestDist) { bestDist = d; best = { padaIdx: i, edge }; }
      });
    });
    if (best !== null) _dragPada = best;
  });
  document.addEventListener('mousemove', e => {
    if (_dragPada === null) return;
    const c = document.getElementById('waveform-canvas');
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const preview = document.getElementById('audio-preview');
    const dur = preview ? preview.duration || 1 : 1;
    const t = (x / rect.width) * dur;
    const { padaIdx, edge } = _dragPada;
    const b = _padaBounds[padaIdx];
    if (edge === 'start') {
      const min = padaIdx > 0 ? _padaBounds[padaIdx-1][1] + 0.05 : 0;
      b[0] = Math.max(min, Math.min(t, b[1] - 0.1));
    } else {
      const max = padaIdx < 3 ? _padaBounds[padaIdx+1][0] - 0.05 : dur;
      b[1] = Math.max(b[0] + 0.1, Math.min(t, max));
    }
    refreshWaveform();
  });
  document.addEventListener('mouseup', e => {
    if (_dragPada !== null) {
      _dragPada = null;
      if (TAP.times.s1 && TAP.times.s1.length) calcAutoTiming();
    }
  });
  document.addEventListener('touchstart', e => {
    const c = document.getElementById('waveform-canvas');
    if (!c || e.target !== c || !_padaBounds) return;
    e.preventDefault();
    const ne = _normEv(e);
    const rect = c.getBoundingClientRect();
    const x = ne.clientX - rect.left;
    const preview = document.getElementById('audio-preview');
    const dur = preview ? preview.duration || 1 : 1;
    const cW = rect.width;
    let best = null, bestDist = 20;
    _padaBounds.forEach((b, i) => {
      ['start','end'].forEach(edge => {
        const t = edge === 'start' ? b[0] : b[1];
        const d = Math.abs((t / dur) * cW - x);
        if (d < bestDist) { bestDist = d; best = { padaIdx: i, edge }; }
      });
    });
    if (best !== null) _dragPada = best;
  }, {passive: false});
  document.addEventListener('touchmove', e => {
    if (_dragPada === null) return;
    e.preventDefault();
    const c = document.getElementById('waveform-canvas');
    if (!c) return;
    const ne = _normEv(e);
    const rect = c.getBoundingClientRect();
    const x = Math.max(0, Math.min(ne.clientX - rect.left, rect.width));
    const preview = document.getElementById('audio-preview');
    const dur = preview ? preview.duration || 1 : 1;
    const t = (x / rect.width) * dur;
    const { padaIdx, edge } = _dragPada;
    const b = _padaBounds[padaIdx];
    if (edge === 'start') {
      const min = padaIdx > 0 ? _padaBounds[padaIdx-1][1] + 0.05 : 0;
      b[0] = Math.max(min, Math.min(t, b[1] - 0.1));
    } else {
      const max = padaIdx < 3 ? _padaBounds[padaIdx+1][0] - 0.05 : dur;
      b[1] = Math.max(b[0] + 0.1, Math.min(t, max));
    }
    refreshWaveform();
  }, {passive: false});
  document.addEventListener('touchend', () => {
    if (_dragPada !== null) {
      _dragPada = null;
      if (TAP.times.s1 && TAP.times.s1.length) calcAutoTiming();
    }
  });
})();


// ══════════════════════════════════════════════════════════════════════════════
// TIMING EDITOR
// ══════════════════════════════════════════════════════════════════════════════

const TE = {
  zoom:    1,
  offset:  0,
  drag:    null,
  pan:     null,    // { startX, startOffset }
  hover:    null,   // { key, idx } — syllable under cursor
  selected: null,   // { key, idx } — clicked syllable
  canvas:  null,
  ctx:     null,
  _circleY:  0,
  _lineEndY: 0,
  _cH:       0,
  _cheatDrag: null,  // { key, idx, startY, startRow }
};




function timingEditorPlaySyl() {
  // Проиграть только текущий выбранный слог — без перехода к следующему
  if (!TE.selected) { showMsg('Выберите слог', 'err'); return; }
  // Без stepCallback — после остановки остаёмся на том же слоге
  TE._stepCallback = null;
  // Используем тот же механизм что PlayStep (n=1) — с линией позиции
  const nEl = document.getElementById('te-play-n');
  const prevN = nEl ? nEl.value : '3';
  if (nEl) nEl.value = '1';
  timingEditorPlay('syllables');
  if (nEl) nEl.value = prevN;
}

function timingEditorPlayStep() {
  // Select first syllable if nothing selected
  if (!TE.selected) {
    const all = [];
    ['s1','s2'].forEach(k => (TAP.times[k]||[]).forEach((t,i) => all.push({key:k,idx:i,t})));
    all.sort((a,b)=>a.t-b.t);
    if (!all.length) { showMsg('Нет тайминга','err'); return; }
    TE.selected = {key:all[0].key, idx:all[0].idx};
    TE._playStartT = all[0].t;
    _teRender();
  }
  // Set callback to advance selection after stop
  TE._stepCallback = () => {
    const all = [];
    ['s1','s2'].forEach(k => (TAP.times[k]||[]).forEach((t,i) => all.push({key:k,idx:i,t})));
    all.sort((a,b)=>a.t-b.t);
    const pos = all.findIndex(e => e.key===TE.selected?.key && e.idx===TE.selected?.idx);
    const next = all[pos+1];
    if (next) { TE.selected={key:next.key,idx:next.idx}; TE._playStartT=next.t; _teRender(); }
  };
  // Temporarily set n=1 input and call syllables mode
  const nEl = document.getElementById('te-play-n');
  const prevN = nEl ? nEl.value : '3';
  if (nEl) nEl.value = '1';
  timingEditorPlay('syllables');
  if (nEl) nEl.value = prevN;
}

function timingEditorPlayOrPause(mode) {
  const preview = document.getElementById('audio-preview');
  if (!preview) return;
  // If currently playing this mode — pause
  if (!preview.paused && TE._playMode === mode) {
    preview.pause();
    TE._userPaused = true;
    _teUpdatePlayButtons(mode, 'paused');
    return;
  }
  // If user-paused on this mode — resume from where we stopped
  if (preview.paused && TE._playMode === mode && TE._userPaused) {
    TE._userPaused = false;
    preview.play();
    _teUpdatePlayButtons(mode, 'playing');
    _tePlayLoop();
    return;
  }
  // Otherwise (ended or different mode) — start fresh from selected
  TE._userPaused = false;
  timingEditorPlay(mode);
}

function _teUpdatePlayButtons(activeMode, state) {
  const labels = { end: '▶▶', pada: '▶|', syllables: '▶N' };
  const ids    = { end: 'btn-te-play-end', pada: 'btn-te-play-pada', syllables: 'btn-te-play-syls' };
  const playing = state === 'playing';
  Object.keys(ids).forEach(m => {
    const btn = document.getElementById(ids[m]);
    if (!btn) return;
    if (m === activeMode) {
      btn.textContent = playing ? ('⏸' + labels[m]) : labels[m];
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      btn.style.cursor = 'pointer';
    } else {
      btn.textContent = labels[m];
      btn.style.opacity = playing ? '0.4' : '1';
      btn.style.pointerEvents = playing ? 'none' : 'auto';
      btn.style.cursor = playing ? 'default' : 'pointer';
    }
  });
}

function timingEditorPlay(mode) {
  const preview = document.getElementById('audio-preview');
  if (!preview) return;
  // Для режима syllables — берём время выбранного слога из TAP.times
  // Для других режимов — используем TE._playStartT или offset
  let startT;
  if (mode === 'syllables' && TE.selected && TAP.times[TE.selected.key]?.[TE.selected.idx] !== undefined) {
    startT = TAP.times[TE.selected.key][TE.selected.idx];
    TE._playStartT = startT;
  } else {
    startT = (TE._playStartT !== undefined) ? TE._playStartT : TE.offset;
  }
  TE._playMode  = mode;
  TE._playStopT = null;

  if (mode === 'pada' && _padaBounds) {
    // Determine pada index from selected syllable, or fall back to current playhead position
    let padaIdx = -1;
    if (TE.selected) {
      const key  = TE.selected.key;
      const idx  = TE.selected.idx;
      const half = Math.ceil((DATA[key] || []).length / 2);
      padaIdx = key === 's1' ? (idx < half ? 0 : 1) : (idx < half ? 2 : 3);
    } else {
      // Find pada by current playback position
      for (let i = 0; i < _padaBounds.length; i++) {
        if (startT >= _padaBounds[i][0] && startT <= _padaBounds[i][1]) {
          padaIdx = i; break;
        }
      }
      // If between padas or before first — pick nearest upcoming pada
      if (padaIdx === -1) {
        for (let i = 0; i < _padaBounds.length; i++) {
          if (startT < _padaBounds[i][0]) { padaIdx = i; break; }
        }
      }
      if (padaIdx === -1) padaIdx = _padaBounds.length - 1;
    }
    if (padaIdx >= 0 && padaIdx < _padaBounds.length) {
      TE._playStopT = _padaBounds[padaIdx][1];
      startT = _padaBounds[padaIdx][0]; // всегда с начала пады
    }
  } else if (mode === 'syllables' && TE.selected) {
    const n = Math.max(1, parseInt(document.getElementById('te-play-n')?.value || '3'));
    // Build global chronological list with pada end info
    const allEntries = [];
    ['s1','s2'].forEach(key => {
      const times = TAP.times[key] || [];
      const syls  = DATA[key] || [];
      const half  = Math.ceil(syls.length / 2);
      times.forEach((t, i) => {
        let padaEnd = null;
        if (_padaBounds) {
          const padaIdx = key === 's1' ? (i < half ? 0 : 1) : (i < half ? 2 : 3);
          if (padaIdx < _padaBounds.length) padaEnd = _padaBounds[padaIdx][1];
        }
        allEntries.push({ t, padaEnd });
      });
    });
    allEntries.sort((a,b) => a.t - b.t);
    const selT   = TAP.times[TE.selected.key]?.[TE.selected.idx];
    const selPos = allEntries.findIndex(e => Math.abs(e.t - selT) < 0.001);
    const stopPos = selPos + n;
    if (stopPos < allEntries.length) {
      const lastEntry = allEntries[stopPos - 1];
      const nextT     = allEntries[stopPos].t;
      // If next syllable is after a silence — stop at pada end of last syllable
      TE._playStopT = (lastEntry.padaEnd !== null && nextT > lastEntry.padaEnd + 0.05)
        ? lastEntry.padaEnd
        : nextT;
    } else {
      const lastEntry = allEntries[Math.min(stopPos - 1, allEntries.length - 1)];
      TE._playStopT = lastEntry?.padaEnd || null;
    }
  }
  // mode === 'end' or no mode: _playStopT stays null → plays to end

  preview.currentTime = startT;
  // Scroll view so startT is visible (left quarter of screen)
  if (TE.canvas) {
    const cW = TE.canvas.offsetWidth;
    const visible = _teDur() / TE.zoom;
    const tLeft = startT - visible * 0.15;
    TE.offset = Math.max(0, tLeft);
    _teClampOffset();
    _teRender();
  }
  preview.play();
  _teUpdatePlayButtons(mode, 'playing');
  _tePlayLoop();
}

function timingEditorStop() {
  const preview = document.getElementById('audio-preview');
  if (preview) preview.pause();
  if (TE._stepCallback) {
    const cb = TE._stepCallback;
    TE._stepCallback = null;
    setTimeout(cb, 50);
  }
  TE._userPaused = false;
  _teUpdatePlayButtons(TE._playMode || 'end', 'stopped');
  if (TE._playRaf) { cancelAnimationFrame(TE._playRaf); TE._playRaf = null; }
}

function _tePlayLoop() {
  const preview = document.getElementById('audio-preview');
  if (!preview || preview.paused || preview.ended) {
    timingEditorStop();
    return;
  }
  // Stop at scheduled time
  const t = preview.currentTime;
  if (TE._playStopT !== null && TE._playStopT !== undefined && t >= TE._playStopT) {
    preview.pause();
    timingEditorStop();
    return;
  }
  // Pan view to follow playhead
  const dur = _teDur();
  const visible = dur / TE.zoom;
  if (t > TE.offset + visible * 0.85) {
    TE.offset = t - visible * 0.15;
    _teClampOffset();
  }
  _teRender();
  TE._playRaf = requestAnimationFrame(_tePlayLoop);
}

function openTimingEditor() {
  const overlay = document.getElementById('timing-editor-overlay');
  if (!overlay) return;
  const preview = document.getElementById('audio-preview');
  if (!preview || !preview.duration) {
    showMsg('Сначала загрузите аудиофайл', 'err');
    return;
  }
  overlay.style.display = '';
  TE.canvas = document.getElementById('timing-editor-canvas');
  TE.ctx = TE.canvas.getContext('2d');
  TE.zoom = 1;
  TE.offset = 0;
  _teCurrentPada = -1;
  _teR1Active = false;
  _teSyncZoomLabel();

  // Подключаем обработчики перетаскивания линий пад
  TE.canvas.addEventListener('mousedown', _tePadaMousedown);
  TE.canvas.addEventListener('touchstart', _tePadaMousedown, {passive: false});
  document.addEventListener('mousemove', _tePadaMousemove);
  document.addEventListener('touchmove', _tePadaMousemove, {passive: false});
  document.addEventListener('mouseup',   _tePadaMouseup);
  document.addEventListener('touchend',  _tePadaMouseup);

  // Режим: если есть тайминг — открываем режим 2, иначе режим 1
  const mode = _hasTimingData() ? 'timing' : 'padas';
  openTimingEditorInMode(mode);
}

function closeTimingEditor() {
  timingEditorStop();
  if (TE.canvas) {
    TE.canvas.removeEventListener('mousedown', _tePadaMousedown);
    TE.canvas.removeEventListener('touchstart', _tePadaMousedown);
  }
  document.removeEventListener('mousemove', _tePadaMousemove);
  document.removeEventListener('touchmove', _tePadaMousemove);
  document.removeEventListener('mouseup',   _tePadaMouseup);
  document.removeEventListener('touchend',  _tePadaMouseup);
  document.getElementById('timing-editor-overlay').style.display = 'none';
  refreshWaveform();
}

// ── Режимы редактора тайминга ─────────────────────────────────────────────────
let TE_MODE = 'padas';

function openTimingEditorInMode(mode) {
  TE_MODE = mode;
  const panelPadas  = document.getElementById('te-panel-padas');
  const panelTiming = document.getElementById('te-panel-timing');
  const title       = document.getElementById('te-mode-title');
  const btnSwitch   = document.getElementById('btn-te-switch');
  const btnAuto     = document.getElementById('btn-te-autotiming');
  const btnReset    = document.getElementById('btn-te-reset');

  if (mode === 'padas') {
    panelPadas.style.display  = '';
    panelTiming.style.display = 'none';
    title.textContent         = 'Разметка пад';
    btnSwitch.textContent     = '→ Тайминг слогов';
    btnSwitch.style.display   = _hasTimingData() ? '' : 'none';
    btnAuto.style.display     = _padaBounds ? '' : 'none';
    btnReset.style.display    = _hasTimingData() ? '' : 'none';
    _teUpdatePadasInfo();
  } else {
    panelPadas.style.display  = 'none';
    panelTiming.style.display = '';
    title.textContent         = 'Тайминг слогов';
    btnSwitch.textContent     = '← Разметка пад';
    btnSwitch.style.display   = '';
    // Выбираем первый слог при открытии если ничего не выбрано
    if (!TE.selected) {
      const times = TAP.times.s1 || [];
      if (times.length) {
        TE.selected = { key: 's1', idx: 0 };
        const s = (DATA.s1 || [])[0];
        const info = document.getElementById('timing-editor-info');
        if (info && s) info.textContent =
          `Строфа 1, слог 1: ${s.syl} — ${times[0].toFixed(3)}с`;
        // Переносим позицию воспроизведения на первый слог
        const _prev = document.getElementById('audio-preview');
        if (_prev && _prev.src) try { _prev.currentTime = times[0]; } catch(e) {}
        TE._playStartT = times[0];
      }
    }
  }
  requestAnimationFrame(() => requestAnimationFrame(() => _teRender()));
}

function teSwitchMode() {
  openTimingEditorInMode(TE_MODE === 'padas' ? 'timing' : 'padas');
}

function _hasTimingData() {
  return TAP.times.s1 && TAP.times.s1.length > 0;
}

function _teUpdatePadasInfo() {
  const el = document.getElementById('te-padas-info');
  if (!el) return;
  if (!_padaBounds) { el.textContent = ''; return; }
  el.textContent = _padaBounds.map((b, i) =>
    `П${i+1}: ${b[0].toFixed(2)}–${b[1].toFixed(2)}с`
  ).join('  ');
}

// Расставить 8 линий пад равномерно
function teMarkPadas() {
  const dur = _teDur();
  // Audio-based auto-detection when full-res PCM is available (core/timing.js):
  // place pāda bounds at the 3 longest pauses; fall back to uniform division.
  let detected = null;
  if (_waveformFull && _waveformSr) {
    const r = detectPadaBoundsFromPcm(_waveformFull, _waveformSr, dur);
    if (r.padas) {
      detected = r.padas.map(p => [p.t0, p.t1]);
      showMsg(`✓ Пады определены по паузам (порог ${r.thresh.toFixed(2)})`, 'ok');
    }
  }
  if (detected) {
    _padaBounds = detected;
  } else {
    const margin = 1.0; // отступ от начала/конца
    const gap = 0.5;    // зазор между падами
    const padaDur = (dur - margin * 2 - gap * 3) / 4;
    _padaBounds = [];
    for (let i = 0; i < 4; i++) {
      const t0 = margin + i * (padaDur + gap);
      _padaBounds.push([t0, t0 + padaDur]);
    }
  }
  const btnAuto  = document.getElementById('btn-te-autotiming');
  const btnReset = document.getElementById('btn-te-reset');
  if (btnAuto)  btnAuto.style.display  = '';
  if (btnReset) btnReset.style.display = _hasTimingData() ? '' : 'none';
  _teUpdatePadasInfo();
  _teRender();
}

// Авторазбивка + переход в режим 2
async function teAutoTimingAndSwitch() {
  if (!DATA.s1.length && !DATA.s2.length) { showMsg('Сначала постройте диаграмму', 'err'); return; }
  if (!audioFile) { showMsg('Сначала загрузите аудиофайл', 'err'); return; }

  // Step 1: linear distribution as base (existing logic, unchanged)
  calcAutoTiming();

  // Step 2: decode audio
  showMsg('Анализ волны…', 'info');
  let audioBuffer;
  try {
    const actx = new AudioContext();
    audioBuffer = await actx.decodeAudioData(await audioFile.arrayBuffer());
  } catch(e) {
    showMsg('Не удалось декодировать аудио, используется линейный тайминг', 'info');
    openTimingEditorInMode('timing');
    return;
  }

  // Step 3: corpus scaling (overwrite linear with scaled corpus if available)
  const meter = (document.getElementById('meter-label') || {}).textContent || '';
  const scaled = await corpusScaleTiming(
    meter.toLowerCase().replace(/\s+/g, '_'),
    DATA.s1.length, DATA.s2.length, audioBuffer.duration
  );
  if (scaled) {
    TAP.times.s1 = scaled.s1;
    TAP.times.s2 = scaled.s2;
  }

  // Step 4: onset detection
  const { onsets, peaks } = await detectOnsets(audioBuffer);
  _lastOnsets = onsets;
  _lastPeaks  = peaks;
  const rules = await loadPhonemeRules();
  const SNAP_WINDOW = 0.15;   // look ±150 ms around estimate

  TAP.confidence = { s1: [], s2: [] };

  for (const key of ['s1', 's2']) {
    const syls  = DATA[key] || [];
    const times = TAP.times[key] || [];
    const conf  = [];

    syls.forEach((syl, i) => {
      const t0   = times[i] ?? 0;
      const rule = _getPhonemeRule(syl.syl || '', rules);
      const candidates = rule.align_to === 'peak' ? peaks : onsets;

      const { snapped, dist } = _snapToNearest(t0, candidates, SNAP_WINDOW);
      const offsetS = (rule.offset_ms || 0) / 1000;

      if (snapped !== null) {
        TAP.times[key][i] = snapped + offsetS;
        conf.push(_snapConfidence(dist, SNAP_WINDOW));
      } else {
        conf.push(0.2);  // no candidate found → flag as uncertain
      }
    });

    TAP.confidence[key] = conf;
  }

  refreshWaveform();
  openTimingEditorInMode('timing');

  const uncertain = ['s1','s2'].reduce((n, k) =>
    n + (TAP.confidence[k] || []).filter(c => c < 0.5).length, 0);

  if (uncertain > 0) {
    showMsg(`Авто-тайминг готов. ${uncertain} слогов требуют проверки (оранжевые). Tab — следующий.`, 'info');
  } else {
    showMsg('Авто-тайминг готов!', 'ok');
  }
}

// Сброс тайминга
function teResetTiming() {
  TAP.times = { s1: [], s2: [] };
  TAP.cheatY = { s1: [], s2: [] };
  _padaBounds = null;
  const btnAuto  = document.getElementById('btn-te-autotiming');
  const btnReset = document.getElementById('btn-te-reset');
  const btnSwitch = document.getElementById('btn-te-switch');
  if (btnAuto)   btnAuto.style.display   = 'none';
  if (btnReset)  btnReset.style.display  = 'none';
  if (btnSwitch) btnSwitch.style.display = 'none';
  _teUpdatePadasInfo();
  refreshWaveform();
  _teRender();
  showMsg('Тайминг сброшен', 'ok');
}

// Тэппинг из режима 2
function teStartTapping() {
  if (!DATA.s1.length && !DATA.s2.length) { showMsg('Сначала постройте диаграмму', 'err'); return; }
  const preview = document.getElementById('audio-preview');
  if (!preview || !preview.src || preview.style.display === 'none') { showMsg('Сначала загрузите аудио', 'err'); return; }
  TAP.cursor = { s1: 0, s2: 0 };
  if (!TAP.times.s1) TAP.times.s1 = [];
  if (!TAP.times.s2) TAP.times.s2 = [];
  preview.playbackRate = TAP.playRate || 1.0;
  preview.currentTime = 0;
  preview.play();
  TAP.active = true;
  showMsg('Тэппинг: нажимайте пробел на каждом слоге', 'info');
}

// ── Перетаскивание 8 линий пад в режиме 1 ────────────────────────────────────
let _tePadaDrag = null; // { padaIdx: 0-3, edge: 'start'|'end', startX, startT }

// Текущая пада в режиме 1 (-1 = не выбрана)
let _teCurrentPada = -1;

function _teSetCurrentPada(idx) {
  // Остановить воспроизведение если играет
  if (_teR1Active) {
    const preview = document.getElementById('audio-preview');
    if (preview && !preview.paused) preview.pause();
    _teR1Active = false;
    _teR1UpdateButtons(false, _teR1Mode);
  }
  _teCurrentPada = idx;
  // Установить позицию аудио на начало пады (даже если paused)
  if (idx >= 0 && _padaBounds && _padaBounds[idx]) {
    const preview = document.getElementById('audio-preview');
    if (preview && preview.src) {
      try { preview.currentTime = _padaBounds[idx][0]; } catch(e) {}
    }
  }
  _teRender();
}



// ── Режим 1: единая система воспроизведения ─────────────────────────────
// _teR1Mode: 'all' | 'pada' | 'cur' | null
// _teR1Active: bool
let _teR1Mode   = null;
let _teR1Active = false;
let _lastVipulaLabel = null;

function _teR1BtnId(mode) {
  return { all: 'btn-r1-play-all', pada: 'btn-r1-play-pada', cur: 'btn-r1-play-cur' }[mode];
}

function _teR1UpdateButtons(playing, mode) {
  ['all','pada','cur'].forEach(m => {
    const btn = document.getElementById(_teR1BtnId(m));
    if (!btn) return;
    const labels = { all: '▶▶', pada: '▶|', cur: '▶…' };
    if (playing && m === mode) {
      btn.textContent = '⏸';
      btn.style.background = 'var(--accent,#357bdd)';
      btn.style.color = '#fff';
    } else {
      btn.textContent = labels[m];
      btn.style.background = '';
      btn.style.color = '';
    }
  });
}

function _teR1ScrollTo(t) {
  if (!TE.canvas) return;
  const cW = TE.canvas.offsetWidth;
  const visible = _teDur() / TE.zoom;
  // Если позиция вышла за пределы видимой области — скроллим
  if (t < TE.offset || t > TE.offset + visible * 0.85) {
    TE.offset = Math.max(0, t - visible * 0.15);
    _teClampOffset();
  }
}

function _teR1Loop() {
  const preview = document.getElementById('audio-preview');
  if (!preview || !_teR1Active) return;
  const t = preview.currentTime;

  // Автоскролл
  _teR1ScrollTo(t);
  _teRender();

  // Проверяем конец
  let stopAt = preview.duration;
  if (_teR1Mode === 'pada' || _teR1Mode === 'cur') {
    if (_teCurrentPada >= 0 && _padaBounds) {
      stopAt = _padaBounds[_teCurrentPada][1];
    }
  }

  if (!preview.paused && t < stopAt) {
    requestAnimationFrame(_teR1Loop);
  } else if (!preview.paused && t >= stopAt) {
    preview.pause();
    _teR1Active = false;
    _teR1UpdateButtons(false, _teR1Mode);
    _teRender();
  }
}

function teR1Play(mode) {
  const preview = document.getElementById('audio-preview');
  if (!preview || !preview.duration) { showMsg('Аудио не загружено', 'err'); return; }

  // Режимы пады требуют разбивки
  if ((mode === 'pada' || mode === 'cur') && (!_padaBounds || _teCurrentPada < 0)) {
    showMsg('Укажите пады и выберите нужную (кликните внутри)', 'err'); return;
  }

  // Если нажата та же кнопка что играет — пауза
  if (_teR1Active && !preview.paused && _teR1Mode === mode) {
    preview.pause();
    _teR1Active = false;
    _teR1UpdateButtons(false, mode);
    return;
  }

  // Если на паузе с тем же mode:
  // — 'pada': всегда начинает сначала (игнорирует текущую позицию)
  // — 'cur' и 'all': продолжить с текущего места
  if (!_teR1Active && preview.paused && _teR1Mode === mode) {
    if (mode === 'cur' || mode === 'all') {
      preview.play();
      _teR1Active = true;
      _teR1UpdateButtons(true, mode);
      _teR1Loop();
      return;
    }
    // mode === 'pada': падаём в новый старт ниже
  }

  // Новый старт
  _teR1Mode = mode;
  let startAt;
  if (mode === 'all') {
    startAt = 0;
  } else if (mode === 'pada') {
    startAt = _padaBounds[_teCurrentPada][0];
  } else { // cur
    startAt = preview.currentTime;
    const b = _padaBounds[_teCurrentPada];
    if (startAt < b[0] || startAt >= b[1]) startAt = b[0];
  }

  preview.currentTime = startAt;
  _teR1ScrollTo(startAt);
  preview.play();
  _teR1Active = true;
  _teR1UpdateButtons(true, mode);
  _teR1Loop();
}

// Оставляем для обратной совместимости
function tePlayPadaFromStart() { teR1Play('pada'); }
function teToggleCurrentPada() { teR1Play('cur'); }


function _tePadaClickZone(x, y, cW, cH) {
  // Определяем в какую паду кликнули (только в режиме 1)
  if (TE_MODE !== 'padas' || !_padaBounds) return -1;
  const dur = _teDur();
  const visible = dur / TE.zoom;
  for (let i = 0; i < _padaBounds.length; i++) {
    const x0 = Math.max(0, (((_padaBounds[i][0] - TE.offset) / visible) * cW));
    const x1 = Math.min(cW, (((_padaBounds[i][1] - TE.offset) / visible) * cW));
    if (x >= x0 && x <= x1) return i;
  }
  return -1;
}

function _tePadaMousedown(e) {
  if (TE_MODE !== 'padas' || !_padaBounds || !TE.canvas) return;
  const ne = _normEv(e);
  const rect = TE.canvas.getBoundingClientRect();
  const x = ne.clientX - rect.left;
  const cW = TE.canvas.offsetWidth;
  const dur = _teDur();
  const toX = t => ((t - TE.offset) / (dur / TE.zoom)) * cW;

  let best = null, bestDist = 14;
  _padaBounds.forEach((b, i) => {
    ['start','end'].forEach(edge => {
      const t  = edge === 'start' ? b[0] : b[1];
      const bx = toX(t);
      const d  = Math.abs(bx - x);
      if (d < bestDist) { bestDist = d; best = { padaIdx: i, edge }; }
    });
  });
  if (best) {
    // Клик рядом с линией — только перетаскивание, смена пады без сброса позиции
    _tePadaDrag = best;
    if (_teCurrentPada !== best.padaIdx) {
      _teCurrentPada = best.padaIdx;
      if (_teR1Active) {
        const preview = document.getElementById('audio-preview');
        if (preview && !preview.paused) preview.pause();
        _teR1Active = false;
        _teR1UpdateButtons(false, _teR1Mode);
      }
      _teRender();
    }
    e.preventDefault();
  } else {
    // Клик внутри пады (далеко от линий) — выбрать паду и поставить курсор в точку клика
    const padaIdx = _tePadaClickZone(x, 0, cW, TE.canvas.offsetHeight);
    if (padaIdx >= 0) {
      // Если играет другая пада — остановить
      if (_teR1Active && _teCurrentPada !== padaIdx) {
        const preview = document.getElementById('audio-preview');
        if (preview && !preview.paused) preview.pause();
        _teR1Active = false;
        _teR1UpdateButtons(false, _teR1Mode);
      }
      _teCurrentPada = padaIdx;
      // Поставить курсор в точку клика
      const clickTime = TE.offset + (x / cW) * (_teDur() / TE.zoom);
      const preview = document.getElementById('audio-preview');
      if (preview && preview.src) {
        try { preview.currentTime = clickTime; } catch(e2) {}
      }
      // Если играет эта же пада — продолжаем (rAF уже крутится), просто рендерим
      _teRender();
    }
  }
}

function _tePadaMousemove(e) {
  if (!_tePadaDrag || !TE.canvas) return;
  const ne = _normEv(e);
  const rect = TE.canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(ne.clientX - rect.left, rect.width));
  const cW = TE.canvas.offsetWidth;
  const dur = _teDur();
  const t = TE.offset + (x / cW) * (dur / TE.zoom);

  const { padaIdx, edge } = _tePadaDrag;
  const b = _padaBounds[padaIdx];
  const MIN_PAD = 0.1;

  if (edge === 'start') {
    // Начало пады не может быть раньше конца предыдущей
    const minT = padaIdx > 0 ? _padaBounds[padaIdx - 1][1] : 0;
    b[0] = Math.max(minT, Math.min(t, b[1] - MIN_PAD));
  } else {
    // Конец пады не может быть позже начала следующей
    const maxT = padaIdx < 3 ? _padaBounds[padaIdx + 1][0] : dur;
    b[1] = Math.max(b[0] + MIN_PAD, Math.min(t, maxT));
  }

  // Сбросить тайминг слогов только для текущей пады
  if (_hasTimingData()) {
    const { padaIdx } = _tePadaDrag;
    const half1 = Math.ceil((DATA.s1||[]).length / 2);
    const half2 = Math.ceil((DATA.s2||[]).length / 2);
    // Определяем диапазон индексов в TAP.times для данной пады
    let key, fromIdx, toIdx;
    if (padaIdx === 0) { key = 's1'; fromIdx = 0;     toIdx = half1; }
    else if (padaIdx === 1) { key = 's1'; fromIdx = half1; toIdx = (DATA.s1||[]).length; }
    else if (padaIdx === 2) { key = 's2'; fromIdx = 0;     toIdx = half2; }
    else                    { key = 's2'; fromIdx = half2; toIdx = (DATA.s2||[]).length; }
    // Обнуляем только слоги этой пады
    const times  = TAP.times[key]  || [];
    const cheatY = TAP.cheatY[key] || [];
    for (let i = fromIdx; i < toIdx; i++) { times[i] = 0; cheatY[i] = undefined; }
    TAP.times[key]  = times;
    TAP.cheatY[key] = cheatY;
    // Если после сброса нет ни одного валидного тайминга — скрыть кнопку перехода
    const stillHasTiming = _hasTimingData();
    const btnSwitch = document.getElementById('btn-te-switch');
    const btnReset  = document.getElementById('btn-te-reset');
    if (btnSwitch) btnSwitch.style.display = stillHasTiming ? '' : 'none';
    if (btnReset)  btnReset.style.display  = stillHasTiming ? '' : 'none';
  }

  const btnAuto = document.getElementById('btn-te-autotiming');
  if (btnAuto) btnAuto.style.display = '';
  _teUpdatePadasInfo();
  _teRender();
}

function _tePadaMouseup() {
  _tePadaDrag = null;
}

function timingEditorZoomIn() {
  TE.zoom = Math.min(TE.zoom * 2, 32);
  _teClampOffset();
  _teRender();
}

function timingEditorZoomOut() {
  TE.zoom = Math.max(TE.zoom / 2, 1);
  _teClampOffset();
  _teSyncZoomLabel();
  _teRender();
}

function timingEditorSetZoom(z) {
  if (!TE.canvas) return;
  const cW = TE.canvas.offsetWidth;
  const tMid = _teXToTime(cW / 2, cW);
  TE.zoom = z;
  const visible = _teDur() / TE.zoom;
  TE.offset = tMid - visible / 2;
  _teClampOffset();
  _teSyncZoomLabel();
  _teRender();
}

function _teSyncZoomLabel() {
  let closest = null, closestDiff = Infinity;
  // Синхронизируем оба селекта (режим 1 и режим 2)
  for (const selId of ['te-zoom-select', 'te-zoom-select-r1']) {
    const sel = document.getElementById(selId);
    if (!sel) continue;
    closest = null; closestDiff = Infinity;
    for (const opt of sel.options) {
      const diff = Math.abs(+opt.value - TE.zoom);
      if (diff < closestDiff) { closestDiff = diff; closest = opt.value; }
    }
    if (closest !== null) sel.value = closest;
  }
}

function _teDur() {
  const p = document.getElementById('audio-preview');
  return p ? p.duration || 1 : 1;
}

function _teClampOffset() {
  const dur = _teDur();
  const visible = dur / TE.zoom;
  TE.offset = Math.max(0, Math.min(TE.offset, dur - visible));
}

// ── Canvas scrollbar ──────────────────────────────────────────
const _sb = {
  dragging: false,
  dragStartX: 0,
  dragStartOffset: 0,
};

function _teSbThumb() {
  // Returns { left, width } in canvas pixels
  const sb = document.getElementById('te-scrollbar');
  if (!sb) return null;
  const W   = sb.offsetWidth || sb.width;
  const dur = _teDur();
  const visible = dur / TE.zoom;
  const ratio = Math.min(1, visible / dur);       // thumb width ratio
  const thumbW = Math.max(30, ratio * W);
  const maxOffset = Math.max(0, dur - visible);
  const pos = maxOffset > 0 ? (TE.offset / maxOffset) * (W - thumbW) : 0;
  return { left: pos, width: thumbW, trackW: W };
}

function _teSyncScrollbar() {
  const sb = document.getElementById('te-scrollbar');
  if (!sb) return;
  const dpr = window.devicePixelRatio || 1;
  const W = sb.offsetWidth;
  const H = 16;  // fixed height, do not read from offsetHeight (causes resize loop)
  if (!W) return;
  // Only resize canvas backing store if dimensions actually changed
  const needW = W * dpr, needH = H * dpr;
  if (sb.width !== needW || sb.height !== needH) {
    sb.width  = needW;
    sb.height = needH;
  }
  const dc = sb.getContext('2d');
  dc.scale(dpr, dpr);

  const root = getComputedStyle(document.documentElement);
  const bg2    = root.getPropertyValue('--bg2').trim()   || '#ede8df';
  const border = root.getPropertyValue('--border').trim()|| '#c8b89a';

  // Track
  dc.clearRect(0, 0, W, H);

  const th = _teSbThumb();
  if (!th || th.trackW <= 0) return;

  const dur = _teDur();
  const visible = dur / TE.zoom;
  const disabled = visible >= dur;

  // Thumb
  const x = th.left, w = th.width, h = H;
  const r = 3;

  if (disabled) {
    dc.fillStyle = bg2;
    return;
  }

  // 3D Excel-style thumb: base fill + highlight + shadow
  // Base
  dc.beginPath();
  dc.moveTo(x + r, 1); dc.lineTo(x + w - r, 1);
  dc.quadraticCurveTo(x + w, 1, x + w, 1 + r);
  dc.lineTo(x + w, h - 1 - r);
  dc.quadraticCurveTo(x + w, h - 1, x + w - r, h - 1);
  dc.lineTo(x + r, h - 1);
  dc.quadraticCurveTo(x, h - 1, x, h - 1 - r);
  dc.lineTo(x, 1 + r);
  dc.quadraticCurveTo(x, 1, x + r, 1);
  dc.closePath();

  // Gradient fill (3D look)
  const grad = dc.createLinearGradient(0, 1, 0, h - 1);
  grad.addColorStop(0,   '#f0ece4');
  grad.addColorStop(0.4, '#e2dcd0');
  grad.addColorStop(0.6, '#d4cec2');
  grad.addColorStop(1,   '#c8c2b6');
  dc.fillStyle = grad;
  dc.fill();

  // Border
  dc.strokeStyle = border;
  dc.lineWidth = 1;
  dc.stroke();

  // Top highlight line
  dc.beginPath();
  dc.moveTo(x + r + 1, 2); dc.lineTo(x + w - r - 1, 2);
  dc.strokeStyle = 'rgba(255,255,255,0.8)';
  dc.lineWidth = 1;
  dc.stroke();

  // Grip lines (3 vertical lines in center)
  const cx = x + w / 2;
  const gy = h / 2;
  [-3, 0, 3].forEach(dx => {
    dc.beginPath();
    dc.moveTo(cx + dx, gy - 3); dc.lineTo(cx + dx, gy + 3);
    dc.strokeStyle = 'rgba(100,90,70,0.4)';
    dc.lineWidth = 1;
    dc.stroke();
    // Highlight below each grip line
    dc.beginPath();
    dc.moveTo(cx + dx + 0.5, gy - 2.5); dc.lineTo(cx + dx + 0.5, gy + 3.5);
    dc.strokeStyle = 'rgba(255,255,255,0.5)';
    dc.lineWidth = 0.5;
    dc.stroke();
  });
}

function _teSbSetFromX(clientX) {
  const sb = document.getElementById('te-scrollbar');
  if (!sb) return;
  const rect = sb.getBoundingClientRect();
  const x  = clientX - rect.left;
  const th = _teSbThumb();
  if (!th) return;
  const dur = _teDur();
  const visible = dur / TE.zoom;
  const maxOffset = Math.max(0, dur - visible);
  const trackUsable = th.trackW - th.width;
  if (trackUsable <= 0) return;
  TE.offset = (x - th.width / 2) / trackUsable * maxOffset;
  _teClampOffset();
  _teRender();
}

// Scrollbar mouse events
(function() {
  function getSb() { return document.getElementById('te-scrollbar'); }

  document.addEventListener('mousedown', e => {
    const sb = getSb();
    if (!sb || e.target !== sb) return;
    e.preventDefault();
    const rect = sb.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const th = _teSbThumb();
    if (th && x >= th.left && x <= th.left + th.width) {
      // Drag thumb
      _sb.dragging    = true;
      _sb.dragStartX  = e.clientX;
      _sb.dragStartOffset = TE.offset;
    } else {
      // Click on track → jump
      _teSbSetFromX(e.clientX);
    }
  });

  document.addEventListener('mousemove', e => {
    if (!_sb.dragging) return;
    const sb = getSb();
    if (!sb) return;
    const th = _teSbThumb();
    if (!th) return;
    const dur = _teDur();
    const visible = dur / TE.zoom;
    const maxOffset = Math.max(0, dur - visible);
    const trackUsable = th.trackW - th.width;
    if (trackUsable <= 0) return;
    const dx = e.clientX - _sb.dragStartX;
    TE.offset = _sb.dragStartOffset + (dx / trackUsable) * maxOffset;
    _teClampOffset();
    _teRender();
  });

  document.addEventListener('mouseup', () => { _sb.dragging = false; });
  document.addEventListener('touchstart', e => {
    const sb = getSb();
    if (!sb || e.target !== sb) return;
    e.preventDefault();
    const ne = _normEv(e);
    const rect = sb.getBoundingClientRect();
    const x = ne.clientX - rect.left;
    const th = _teSbThumb();
    if (th && x >= th.left && x <= th.left + th.width) {
      _sb.dragging    = true;
      _sb.dragStartX  = ne.clientX;
      _sb.dragStartOffset = TE.offset;
    } else {
      _teSbSetFromX(ne.clientX);
    }
  }, {passive: false});
  document.addEventListener('touchmove', e => {
    if (!_sb.dragging) return;
    e.preventDefault();
    const sb = getSb();
    if (!sb) return;
    const th = _teSbThumb();
    if (!th) return;
    const ne = _normEv(e);
    const dur = _teDur();
    const visible = dur / TE.zoom;
    const maxOffset = Math.max(0, dur - visible);
    const trackUsable = th.trackW - th.width;
    if (trackUsable <= 0) return;
    TE.offset = _sb.dragStartOffset + ((ne.clientX - _sb.dragStartX) / trackUsable) * maxOffset;
    _teClampOffset();
    _teRender();
  }, {passive: false});
  document.addEventListener('touchend', () => { _sb.dragging = false; });
})();

function _teUpdateStats() {
  const el = document.getElementById('te-stats');
  if (!el) return;
  const guruDurs = [], laghuDurs = [], guruNoLastDurs = [], laghuNoLastDurs = [];
  ['s1','s2'].forEach(key => {
    const times = TAP.times[key] || [];
    const syls  = DATA[key] || [];
    const half  = Math.ceil(syls.length / 2);
    times.forEach((t, i) => {
      const s = syls[i];
      if (!s) return;
      const next = times[i + 1];
      if (next === undefined) return;
      const dur = next - t;
      if (dur <= 0 || dur > 5) return;
      const isLastOfPada = (i === half - 1) || (i === times.length - 1);
      if (s.type === 'guru') {
        guruDurs.push(dur);
        if (!isLastOfPada) guruNoLastDurs.push(dur);
      } else {
        laghuDurs.push(dur);
        if (!isLastOfPada) laghuNoLastDurs.push(dur);
      }
    });
  });
  const avg = arr => arr.length ? (arr.reduce((a,b) => a+b, 0) / arr.length).toFixed(2) : '—';
  el.innerHTML =
    `гуру: ${avg(guruDurs)}с &nbsp;| &nbsp; лагху: ${avg(laghuDurs)}с<br>` +
    `гуру (без посл.): ${avg(guruNoLastDurs)}с<br>` +
    `лагху (без посл.): ${avg(laghuNoLastDurs)}с`;
}
function teSelectAdjacentSyl(delta) {
  // Выбрать предыдущий (delta=-1) или следующий (delta=+1) слог
  const keys = ['s1', 's2'];

  if (!TE.selected) {
    // Ничего не выбрано — берём первый/последний слог
    const k = 's1';
    const times = TAP.times[k] || [];
    if (!times.length) { showMsg('Нет тайминга', 'err'); return; }
    const idx = delta > 0 ? 0 : times.length - 1;
    TE.selected = { key: k, idx };
  } else {
    const { key, idx } = TE.selected;
    const times = TAP.times[key] || [];
    const newIdx = idx + delta;

    if (newIdx >= 0 && newIdx < times.length) {
      // В пределах той же строфы
      TE.selected = { key, idx: newIdx };
    } else if (delta > 0 && key === 's1') {
      // Переход s1 → s2
      const t2 = TAP.times['s2'] || [];
      if (t2.length) TE.selected = { key: 's2', idx: 0 };
    } else if (delta < 0 && key === 's2') {
      // Переход s2 → s1
      const t1 = TAP.times['s1'] || [];
      if (t1.length) TE.selected = { key: 's1', idx: t1.length - 1 };
    }
  }

  // Обновляем info и скроллим к слогу
  const { key, idx } = TE.selected;
  const s = (DATA[key] || [])[idx];
  const selT = (TAP.times[key] || [])[idx];
  const info = document.getElementById('timing-editor-info');
  if (info && s) info.textContent =
    `${key === 's1' ? 'Строфа 1' : 'Строфа 2'}, слог ${idx + 1}: ${s.syl} — ${selT?.toFixed(3)}с`;

  // Переносим позицию воспроизведения на начало слога
  if (selT !== undefined) {
    const _prev = document.getElementById('audio-preview');
    if (_prev && _prev.src) try { _prev.currentTime = selT; } catch(e) {}
  }

  // Скроллим так чтобы слог был виден (левая четверть экрана)
  if (TE.canvas && selT !== undefined) {
    const cW = TE.canvas.offsetWidth;
    const visible = _teDur() / TE.zoom;
    const tLeft = selT - visible * 0.15;
    TE.offset = Math.max(0, tLeft);
    _teClampOffset();
  }
  _teRender();
}

function teShiftSyl(delta) {
  // Сдвинуть текущий выбранный слог на delta секунд
  if (!TE.selected) { showMsg('Выберите слог', 'err'); return; }
  const { key, idx } = TE.selected;
  const times = TAP.times[key] || [];
  if (!times.length || times[idx] === undefined) { showMsg('Нет тайминга', 'err'); return; }

  // Запоминаем — играло ли аудио
  const preview = document.getElementById('audio-preview');
  const wasPlaying = preview && !preview.paused;
  if (wasPlaying) preview.pause();

  const newT = times[idx] + delta;

  // Не выходим за пределы соседних слогов
  const prevT = idx > 0 ? times[idx - 1] : 0;
  const nextT = idx < times.length - 1 ? times[idx + 1] : Infinity;
  times[idx] = Math.max(prevT + 0.001, Math.min(nextT - 0.001, newT));
  TAP.times[key] = times;

  // Переносим позицию воспроизведения на начало слога
  const selT = TAP.times[key][idx];
  if (selT !== undefined) {
    const _prev = document.getElementById('audio-preview');
    if (_prev && _prev.src) try { _prev.currentTime = selT; } catch(e) {}
    TE._playStartT = selT; // обновляем стартовую точку для timingEditorPlay
    // Запускаем воспроизведение заново если оно было
    if (wasPlaying) timingEditorPlaySyl();
  }
  // Скроллим к слогу
  if (TE.canvas && selT !== undefined) {
    const cW = TE.canvas.offsetWidth;
    const visible = _teDur() / TE.zoom;
    if (selT < TE.offset || selT > TE.offset + visible * 0.85) {
      TE.offset = Math.max(0, selT - visible * 0.15);
      _teClampOffset();
    }
  }
  refreshWaveform();
  _teUpdateStats();
  _teRender();
}

function teAlignToStart() {
  // Авторазбивка от начала пады до текущего слога (не включая текущий)
  if (!TE.selected) { showMsg('Выберите слог (текущий)', 'err'); return; }
  if (!_padaBounds) { showMsg('Нет границ пад', 'err'); return; }

  const { key, idx } = TE.selected;
  const syls = DATA[key] || [];
  const half  = Math.ceil(syls.length / 2);

  // Определить паду: 0 или 1 для s1, 2 или 3 для s2
  let padaIdx, padaFrom, padaTo;
  if (key === 's1') {
    if (idx < half) { padaIdx = 0; padaFrom = 0; padaTo = half; }
    else            { padaIdx = 1; padaFrom = half; padaTo = syls.length; }
  } else {
    const half2 = Math.ceil((DATA.s2||[]).length / 2);
    if (idx < half2) { padaIdx = 2; padaFrom = 0; padaTo = half2; }
    else             { padaIdx = 3; padaFrom = half2; padaTo = (DATA.s2||[]).length; }
  }

  // Слоги пады от начала до текущего (не включая)
  const localIdx = idx - padaFrom; // позиция текущего в паде
  if (localIdx <= 0) { showMsg('Текущий слог — первый в паде, нечего выравнивать', 'err'); return; }

  const times = TAP.times[key] || [];
  const t0 = _padaBounds[padaIdx][0];
  const tCurrent = times[idx]; // время начала текущего слога = конец отрезка для выравнивания

  if (tCurrent === undefined || tCurrent <= t0) {
    showMsg('Нет тайминга для текущего слога', 'err'); return;
  }

  const lastLaghuAsGuru = document.getElementById('opt-last-laghu-as-guru')?.checked || false;
  const padaSyls = syls.slice(padaFrom, padaFrom + localIdx); // только до текущего (не включая)

  // Единицы мор: последний слог отрезка НЕ является последним в паде, поэтому
  // lastLaghuAsGuru не применяем здесь (только к последнему слогу всей пады)
  const units = padaSyls.map(s => s.type === 'guru' ? 2 : 1);
  const totalUnits = units.reduce((a, v) => a + v, 0);
  if (totalUnits === 0) return;

  const unitDur = (tCurrent - t0) / totalUnits;
  let acc = 0;
  padaSyls.forEach((s, i) => {
    times[padaFrom + i] = t0 + acc * unitDur;
    acc += units[i];
  });
  TAP.times[key] = times;

  refreshWaveform();
  _teUpdateStats();
  _teRender();
  showMsg(`✓ Выровнено ${localIdx} слог(ов) пады П${padaIdx+1} (единица: ${unitDur.toFixed(3)}с)`, 'ok');
}

function _teJumpToNextUncertain(dir) {
  // Build flat list of uncertain syllables across s1 then s2
  const uncertain = [];
  for (const key of ['s1', 's2']) {
    (DATA[key] || []).forEach((_, i) => {
      if (_isSylUncertain(key, i)) uncertain.push({ key, idx: i });
    });
  }
  if (!uncertain.length) { showMsg('Нет неясных слогов!', 'ok'); return; }

  // Find current position in uncertain list
  const cur = TE.selected;
  let curPos = cur
    ? uncertain.findIndex(u => u.key === cur.key && u.idx === cur.idx)
    : -1;

  curPos = ((curPos + dir) % uncertain.length + uncertain.length) % uncertain.length;
  const next = uncertain[curPos];
  TE.selected = next;

  const syl = (DATA[next.key] || [])[next.idx];
  const t   = (TAP.times[next.key] || [])[next.idx] ?? 0;
  const info = document.getElementById('timing-editor-info');
  if (info && syl) info.textContent =
    `${next.key === 's1' ? 'Строфа 1' : 'Строфа 2'}, слог ${next.idx + 1}: ${syl.syl} — ${t.toFixed(3)}с ⚠`;

  _teRender();
}


function teScrollbarInput(val) {
  // kept for compatibility
  const dur = _teDur();
  const visible = dur / TE.zoom;
  const maxOffset = Math.max(0, dur - visible);
  TE.offset = (val / 1000) * maxOffset;
  _teClampOffset();
  _teRender();
}

function _teTimeToX(t, cW) {
  const dur = _teDur();
  const visible = dur / TE.zoom;
  return ((t - TE.offset) / visible) * cW;
}

function _teXToTime(x, cW) {
  const dur = _teDur();
  const visible = dur / TE.zoom;
  return TE.offset + (x / cW) * visible;
}

function _teRender() {
  const canvas = TE.canvas;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const cW = canvas.offsetWidth;
  const cH = canvas.offsetHeight;
  canvas.width  = cW * dpr;
  canvas.height = cH * dpr;
  const dc = TE.ctx;
  dc.scale(dpr, dpr);

  const root = getComputedStyle(document.documentElement);
  const bg     = root.getPropertyValue('--bg2').trim()   || '#f5f0e8';
  const ink2   = root.getPropertyValue('--ink2').trim()  || '#888';
  const ink    = root.getPropertyValue('--ink').trim()   || '#333';
  const guruC  = root.getPropertyValue('--guru').trim()  || '#8B0000';
  const laghuC = root.getPropertyValue('--laghu').trim() || '#2C4A1E';
  const dur    = _teDur();
  const visible = dur / TE.zoom;

  // Background
  dc.fillStyle = bg;
  dc.fillRect(0, 0, cW, cH);

  // Shade bottom grab zone (axis area)
  const gapCol = 'rgba(160,112,32,0.10)';

  // Layout: top 1/3 = cheatsheet, bottom 2/3 = waveform
  const CHEAT_H      = Math.floor(cH / 3);   // cheatsheet zone height
  // CHEAT_PAD_TOP: pada label(11) + gap(4) + syl label max(22) + gap(3) + circle radius max(20) = 60
  const CHEAT_PAD_TOP = 60;
  const WAVE_TOP  = CHEAT_H;              // waveform starts here
  // axisFontSz max = 16px (capped), tick=5px, gap=2px, pad=2px → reserve always = 16+5+2+2=25
  const AXIS_RESERVE = 16 + 5 + 2 + 2;   // fixed: based on max font size
  const AXIS_Y    = cH - AXIS_RESERVE;    // X axis line (seconds labels)
  const WAVE_BOT  = AXIS_Y;              // waveform ends at axis
  const WAVE_H    = WAVE_BOT - WAVE_TOP;

  // Cheatsheet zone background (slightly different shade)
  dc.fillStyle = 'rgba(0,0,0,0.04)';
  dc.fillRect(0, 0, cW, CHEAT_H);

  // Divider line between cheatsheet and waveform
  dc.strokeStyle = ink2;
  dc.lineWidth = 1;
  dc.globalAlpha = 0.3;
  dc.beginPath(); dc.moveTo(0, CHEAT_H); dc.lineTo(cW, CHEAT_H); dc.stroke();
  dc.globalAlpha = 1.0;

  // Waveform — drawn in bottom 2/3, axis at bottom, symmetric around waveform center
  // Slightly protrudes below axis (5px)
  const WAVE_MID  = WAVE_TOP + WAVE_H / 2;
  if (_waveformPcm) {
    dc.fillStyle = ink2;
    const startFrac = TE.offset / dur;
    const endFrac   = (TE.offset + visible) / dur;
    const startIdx  = Math.floor(startFrac * _waveformPcm.length);
    const endIdx    = Math.ceil(endFrac   * _waveformPcm.length);
    const count     = endIdx - startIdx;
    const barW      = cW / count;
    // Normalize by global peak across entire audio — stable scale while scrolling
    let globalPeak = 0;
    for (let i = 0; i < _waveformPcm.length; i++) { if (_waveformPcm[i] > globalPeak) globalPeak = _waveformPcm[i]; }
    if (globalPeak < 0.01) globalPeak = 1;
    const maxBarH = WAVE_H * 0.92;  // 4% padding top and bottom
    for (let i = 0; i < count; i++) {
      const v = _waveformPcm[startIdx + i] || 0;
      const h = (v / globalPeak) * maxBarH;
      dc.fillRect(i * barW, WAVE_MID - h / 2, Math.max(1, barW - 0.5), h);
    }
  }

  // Pada dividers + 8 drag lines (режим 1) / фон (режим 2)
  const PADA_COLORS = [
    ['rgba(53,126,221,0.10)', 'rgba(53,126,221,0.7)',  '#357bdd'],
    ['rgba(29,158,117,0.10)', 'rgba(29,158,117,0.7)',  '#1d9e75'],
    ['rgba(186,117,23,0.10)', 'rgba(186,117,23,0.7)',  '#ba7517'],
    ['rgba(216,90,48,0.10)',  'rgba(216,90,48,0.7)',   '#d85a30'],
  ];
  if (_padaBounds) {
    _padaBounds.forEach((b, pi) => {
      const x0 = Math.max(0, _teTimeToX(b[0], cW));
      const x1 = Math.min(cW, _teTimeToX(b[1], cW));
      const [fillC, lineC, textC] = PADA_COLORS[pi];
      // Фоновая заливка
      dc.fillStyle = (TE_MODE === 'padas' && pi === _teCurrentPada)
        ? fillC.replace('0.10', '0.28')  // ярче для текущей
        : fillC;
      dc.fillRect(x0, 0, x1 - x0, cH);
      // Метка пады
      const mx = (x0 + x1) / 2;
      if (mx > 0 && mx < cW) {
        dc.fillStyle = textC;
        dc.font = 'bold 11px monospace';
        dc.fillText('П' + (pi + 1), mx - 8, 11);
      }
      // В режиме 1: рисуем 8 вертикальных линий (начало/конец каждой пады)
      if (TE_MODE === 'padas') {
        [[b[0], 'start'], [b[1], 'end']].forEach(([t, edge]) => {
          const lx = _teTimeToX(t, cW);
          if (lx < 0 || lx > cW) return;
          dc.save();
          dc.strokeStyle = textC;
          dc.lineWidth = 2;
          dc.setLineDash(edge === 'start' ? [] : [6, 4]);
          dc.beginPath(); dc.moveTo(lx, 0); dc.lineTo(lx, cH); dc.stroke();
          dc.setLineDash([]);
          // Треугольник-ручка посередине
          const ty = cH / 2;
          const arr = edge === 'start' ? 6 : -6;
          dc.fillStyle = textC;
          dc.beginPath();
          dc.moveTo(lx, ty);
          dc.lineTo(lx + arr, ty - 8);
          dc.lineTo(lx + arr, ty + 8);
          dc.closePath();
          dc.fill();
          dc.restore();
        });
      }
    });
  }

  // Syllable markers
  const CIRCLE_R = 5;

  // Cheatsheet grid: 5 rows inside top 1/3
  // Row 0 = top, row 4 = bottom (same as main diagram)
  const CHEAT_PAD_BOT = 8;
  const CHEAT_USABLE  = CHEAT_H - CHEAT_PAD_TOP - CHEAT_PAD_BOT;
  const CHEAT_ROW_STEP = CHEAT_USABLE / 4;  // 4 gaps for 5 rows
  // ROW_Y in cheatsheet space (row 0 = top = high pitch)
  function cheatRowY(row) {
    return CHEAT_PAD_TOP + row * CHEAT_ROW_STEP;
  }

  // Marker circle in waveform zone: fixed position just above waveform
  const MARKER_Y  = WAVE_TOP + 10;  // fixed Y for all syllable markers in waveform zone
  const LABEL_Y   = MARKER_Y - CIRCLE_R - 3;  // syllable label above marker

  // Store for cursor zone detection (used by drag/hover logic)
  TE._circleY  = MARKER_Y;
  TE._labelY   = LABEL_Y - 11;
  TE._lineEndY = AXIS_Y;
  TE._cH       = cH;
  TE._cheatH   = CHEAT_H;
  // Zoom-proportional font sizes: base × zoom^0.4
  const zoomF      = Math.pow(TE.zoom, 0.4);
  const sylFontSz  = Math.round(Math.min(9  * zoomF, 22));
  const timeFontSz = Math.round(Math.min(8  * zoomF, 18));
  const axisFontSz = Math.round(Math.min(8  * zoomF, 16));

  // Draw cheatsheet wave lines (bezier) per key
  const showDotsEl = document.getElementById('opt-dots');
  const showDots   = !showDotsEl || showDotsEl.checked;
  const hollowEl   = document.getElementById('opt-hollow');
  const hollow     = !hollowEl || hollowEl.checked;

  // Cheatsheet grid lines (5 rows)
  for (let row = 0; row < 5; row++) {
    const gy = cheatRowY(row);
    dc.strokeStyle = ink;
    dc.lineWidth = 1;
    dc.globalAlpha = 0.35;
    dc.setLineDash([3, 4]);
    dc.beginPath(); dc.moveTo(0, gy); dc.lineTo(cW, gy); dc.stroke();
    dc.setLineDash([]);
    dc.globalAlpha = 1.0;
  }

  ['s1','s2'].forEach(key => {
    const times = TAP.times[key] || [];
    const syls  = DATA[key] || [];
    if (!times.length) return;
    const cheatYArr = TAP.cheatY[key];

    // Helper: get cheat Y for syllable i (row → pixel, default = s.row)
    function getCheatPx(i) {
      const s = syls[i];
      const row = (cheatYArr[i] !== undefined) ? cheatYArr[i] : (s ? s.row : 2);
      return cheatRowY(row);
    }

    // Draw cheatsheet wave path (bezier), broken at pada boundaries
    const half = Math.ceil(syls.length / 2);
    // Build segments: one per pada
    const padaSegs = [[], []];  // [pada0, pada1] per key
    times.forEach((t, i) => {
      const x = _teTimeToX(t, cW);
      const y = getCheatPx(i);
      const segIdx = i < half ? 0 : 1;
      padaSegs[segIdx].push({ x, y, i });
    });

    padaSegs.forEach(pts => {
      if (pts.length < 2) return;
      dc.lineWidth = 1.5;
      dc.globalAlpha = 0.7;
      dc.setLineDash([]);
      dc.beginPath();
      dc.moveTo(pts[0].x, pts[0].y);
      for (let pi = 1; pi < pts.length; pi++) {
        const p = pts[pi-1], c = pts[pi];
        const s = syls[c.i];
        const col = s && s.type === 'guru' ? guruC : laghuC;
        dc.strokeStyle = col;
        const dx = (c.x - p.x) * 0.42;
        dc.bezierCurveTo(p.x+dx, p.y, c.x-dx, c.y, c.x, c.y);
      }
      dc.stroke();
      dc.globalAlpha = 1.0;
    });

    // Draw syllable markers
    times.forEach((t, i) => {
      const x = _teTimeToX(t, cW);
      if (x < -20 || x > cW + 20) return;
      const s    = syls[i];
      const guru = s && s.type === 'guru';
      const col  = guru ? guruC : laghuC;
      const isDragging   = TE.drag && TE.drag.key===key && TE.drag.idx===i;
      const isCheatDrag  = TE._cheatDrag && TE._cheatDrag.key===key && TE._cheatDrag.idx===i;
      const r = guru ? CIRCLE_R : CIRCLE_R * 0.7;
      const lineW = isDragging ? 2.5 : (guru ? 1.5 : 1.0);

      // Cheatsheet circle Y
      const cheatY = getCheatPx(i);

      // Waveform marker circle Y (fixed)
      const cy = MARKER_Y;

      // Hover haze
      const isHovered = TE.hover && TE.hover.key === key && TE.hover.idx === i;
      if (isHovered) {
        let padaEnd = null;
        if (_padaBounds) {
          const half = Math.ceil(DATA[key].length / 2);
          let padaIdx;
          if (key === 's1') padaIdx = i < half ? 0 : 1;
          else padaIdx = i < half ? 2 : 3;
          if (padaIdx < _padaBounds.length) padaEnd = _padaBounds[padaIdx][1];
        }
        const nextT = times[i + 1];
        let tEnd = nextT !== undefined ? nextT : (padaEnd || _teDur());
        if (padaEnd !== null) tEnd = Math.min(tEnd, padaEnd);
        const xNext = _teTimeToX(tEnd, cW);
        if (xNext > x) {
          dc.fillStyle = 'rgba(255, 220, 0, 0.18)';
          dc.fillRect(x, 0, xNext - x, cH);
        }
      }

      // Vertical line: from cheatsheet circle through waveform marker down to axis
      dc.strokeStyle = col;
      dc.lineWidth = lineW;
      dc.globalAlpha = isDragging ? 1.0 : 0.55;
      dc.beginPath();
      dc.moveTo(x, cheatY + r);
      dc.lineTo(x, AXIS_Y);
      dc.stroke();
      dc.globalAlpha = 1.0;

      // Waveform marker circle removed — circles only in cheatsheet

      // Cheatsheet circle (at cheatY) — scaled with zoom
      if (showDots) {
        const isCheatSelected = TE.selected && TE.selected.key === key && TE.selected.idx === i;
        const rC = guru ? CIRCLE_R * zoomF : CIRCLE_R * 0.7 * zoomF;
        dc.beginPath();
        dc.arc(x, cheatY, isCheatDrag ? rC + 2 : rC, 0, Math.PI*2);
        if (isCheatSelected) {
          dc.fillStyle = '#e44';
          dc.fill();
          dc.strokeStyle = col;
          dc.lineWidth = guru ? 2.5 : 1.5;
          dc.stroke();
        } else if (hollow) {
          dc.fillStyle = '#ffffff';
          dc.fill();
          dc.strokeStyle = col;
          dc.lineWidth = guru ? 2.5 : 1.5;
          dc.stroke();
        } else {
          dc.fillStyle = col;
          dc.fill();
        }
      }

      // Syllable label — always above circle (CHEAT_PAD_TOP guarantees space)
      if (s) {
        const rC = guru ? CIRCLE_R * zoomF : CIRCLE_R * 0.7 * zoomF;
        dc.font = `${guru?'700':'400'} ${sylFontSz}px "Charter Indologique",serif`;
        const uncertain = _isSylUncertain(key, i);
        dc.fillStyle = uncertain ? '#d97706' : col;
        const lbl = s.syl;
        const lw  = dc.measureText(lbl).width;
        dc.fillText(lbl, x - lw/2, cheatY - rC - 3);
      }

      // Time labels below axis removed (overlap with second marks)
    });
  });

  // X axis line
  dc.strokeStyle = ink;
  dc.lineWidth = 1;
  dc.globalAlpha = 0.4;
  dc.beginPath(); dc.moveTo(0, AXIS_Y); dc.lineTo(cW, AXIS_Y); dc.stroke();
  dc.globalAlpha = 1.0;

  // Second marks on X axis
  dc.strokeStyle = ink;
  dc.lineWidth = 1;
  dc.globalAlpha = 0.85;
  dc.font = axisFontSz + 'px monospace';
  dc.fillStyle = ink;
  const secVisible = dur / TE.zoom;
  const secStart = Math.ceil(TE.offset);
  const secEnd   = Math.floor(TE.offset + secVisible);
  for (let s = secStart; s <= secEnd; s++) {
    const x = _teTimeToX(s, cW);
    if (x < 0 || x > cW) continue;
    dc.beginPath(); dc.moveTo(x, AXIS_Y); dc.lineTo(x, AXIS_Y + 5); dc.stroke();
    const lbl = String(s);
    const lw  = dc.measureText(lbl).width;
    dc.fillText(lbl, x - lw/2, AXIS_Y + 5 + axisFontSz);
  }
  dc.globalAlpha = 1.0;

  // Active syllable highlight (yellow glow around circle)
  const previewEl = document.getElementById('audio-preview');
  if (previewEl && !previewEl.paused) {
    const ct = previewEl.currentTime;
    ['s1','s2'].forEach(key => {
      const times = TAP.times[key] || [];
      const syls  = DATA[key] || [];
      if (!times.length) return;
      let curIdx = -1;
      for (let i = 0; i < times.length; i++) {
        if (times[i] <= ct) curIdx = i; else break;
      }
      if (curIdx < 0) return;
      const t = times[curIdx];
      const x = _teTimeToX(t, cW);
      if (x < -20 || x > cW + 20) return;
      const s    = syls[curIdx];
      const guru = s && s.type === 'guru';
      const rC   = (guru ? CIRCLE_R : CIRCLE_R * 0.7) * zoomF + 5;
      // Glow on cheatsheet circle only
      const cheatYArr = TAP.cheatY[key];
      const row = (cheatYArr[curIdx] !== undefined) ? cheatYArr[curIdx] : (s ? s.row : 2);
      dc.beginPath();
      dc.arc(x, cheatRowY(row), rC, 0, Math.PI * 2);
      dc.fillStyle = 'rgba(255, 220, 0, 0.35)';
      dc.fill();
    });

  }

  // Playhead — показываем всегда если аудио загружено (не только при воспроизведении)
  if (previewEl && previewEl.duration) {
    const px = _teTimeToX(previewEl.currentTime, cW);
    if (px >= 0 && px <= cW) {
      dc.strokeStyle = '#e44';
      dc.lineWidth = 1.5;
      dc.setLineDash([]);
      dc.beginPath(); dc.moveTo(px, 0); dc.lineTo(px, cH); dc.stroke();
    }
  }

  // Sync scrollbar and stats
  _teSyncScrollbar();
  _teUpdateStats();
}

// Drag markers in timing editor
(function() {
  function getCanvas() { return document.getElementById('timing-editor-canvas'); }

  function findNearestMarker(x, cW) {
    let best = null, bestDist = 14;
    ['s1','s2'].forEach(key => {
      (TAP.times[key] || []).forEach((t, i) => {
        const mx = _teTimeToX(t, cW);
        const d  = Math.abs(mx - x);
        if (d < bestDist) { bestDist = d; best = { key, idx: i }; }
      });
    });
    return best;
  }

  // Find nearest marker in cheatsheet zone by 2D distance to circle center
  function findNearestCheatMarker(x, y, cW) {
    const zoomF = Math.pow(TE.zoom, 0.4);
    let best = null, bestDist = Infinity;
    ['s1','s2'].forEach(key => {
      const times = TAP.times[key] || [];
      const syls  = DATA[key] || [];
      const cheatYArr = TAP.cheatY[key] || [];
      times.forEach((t, i) => {
        const mx  = _teTimeToX(t, cW);
        const s   = syls[i];
        const guru = s && s.type === 'guru';
        const row  = cheatYArr[i] !== undefined ? cheatYArr[i] : (s ? s.row : 2);
        // Approximate cheatRowY inline (mirrors _teRender logic)
        const cheatH    = TE._cheatH || 0;
        const padTop    = 60;
        const padBot    = 8;
        const rowStep   = (cheatH - padTop - padBot) / 4;
        const cy        = padTop + row * rowStep;
        const rC        = (guru ? 5 : 3.5) * zoomF;
        const hitR      = Math.max(rC + 6, 14);  // generous hit area
        const d = Math.sqrt((mx - x) ** 2 + (cy - y) ** 2);
        if (d < hitR && d < bestDist) { bestDist = d; best = { key, idx: i }; }
      });
    });
    return best;
  }

  function _teHandleDown(e) {
    const c = getCanvas();
    if (!c || e.target !== c) return;
    e.preventDefault();
    const ne = _normEv(e);
    const rect = c.getBoundingClientRect();
    const y = ne.clientY - rect.top;
    const xClick = ne.clientX - rect.left;
    if (isPanZone(y) || isInPadaGap(xClick, rect.width)) {
      TE.pan = { startX: ne.clientX, startOffset: TE.offset };
      c.style.cursor = 'grabbing';
      return;
    }
    // Click on hovered syllable → select it
    if (TE.hover) {
      TE.selected = { ...TE.hover };
      const selT = TAP.times[TE.selected.key]?.[TE.selected.idx];
      if (selT !== undefined) TE._playStartT = selT;
      const selS = DATA[TE.selected.key]?.[TE.selected.idx];
      const info = document.getElementById('timing-editor-info');
      if (info && selS) info.textContent =
        `${TE.selected.key==='s1'?'Строфа 1':'Строфа 2'}, слог ${TE.selected.idx+1}: ${selS.syl} — ${selT.toFixed(3)}с`;
      _teRender();
    }
    // Check if click is in cheatsheet zone → select + vertical drag
    if (TE._cheatH && y < TE._cheatH) {
      const nearest = findNearestCheatMarker(ne.clientX - rect.left, y, rect.width);
      if (nearest) {
        // Select syllable (red fill + yellow hover area)
        TE.selected = { key: nearest.key, idx: nearest.idx };
        TE.hover    = { key: nearest.key, idx: nearest.idx };
        const selT = TAP.times[nearest.key]?.[nearest.idx];
        if (selT !== undefined) TE._playStartT = selT;
        const selS = DATA[nearest.key]?.[nearest.idx];
        const info = document.getElementById('timing-editor-info');
        if (info && selS) info.textContent =
          `${nearest.key==='s1'?'Строфа 1':'Строфа 2'}, слог ${nearest.idx+1}: ${selS.syl} — ${selT.toFixed(3)}с`;
        // Start vertical drag
        const cheatYArr = TAP.cheatY[nearest.key];
        const s = DATA[nearest.key][nearest.idx];
        const curRow = (cheatYArr[nearest.idx] !== undefined) ? cheatYArr[nearest.idx] : (s ? s.row : 2);
        TE._cheatDrag = { key: nearest.key, idx: nearest.idx, startY: y, startRow: curRow };
        // Also start horizontal drag (same marker)
        c.setPointerCapture && c.setPointerCapture(e.pointerId);
        TE.drag = { key: nearest.key, idx: nearest.idx };
        _teRender();
        return;
      }
    }

    TE.drag = findNearestMarker(ne.clientX - rect.left, rect.width);
    if (TE.drag) {
      const t = TAP.times[TE.drag.key][TE.drag.idx];
      const s = DATA[TE.drag.key][TE.drag.idx];
      TE._lastSelected = { key: TE.drag.key, idx: TE.drag.idx };
      TE._playStartT = t;
      document.getElementById('timing-editor-info').textContent =
        `${TE.drag.key === 's1' ? 'Строфа 1' : 'Строфа 2'}, слог ${TE.drag.idx+1}: ${s?.syl || ''} — ${t.toFixed(3)}с`;
    }
  }
  document.addEventListener('mousedown', _teHandleDown);
  document.addEventListener('touchstart', _teHandleDown, {passive: false});

  function isPanZone(y) {
    // Pan zone: only below the axis (bottom strip) — cheatsheet is NOT a pan zone
    return TE._cH > 0 && y > TE._lineEndY - 2;
  }

  function isInPadaGap(x, cW) {
    // Returns true if x falls in a silence gap between padas
    if (!_padaBounds || _padaBounds.length < 2) return false;
    const preview = document.getElementById('audio-preview');
    const dur = preview ? preview.duration || 1 : 1;
    const t = _teXToTime(x, cW);
    // Check if t is between end of one pada and start of next
    for (let i = 0; i < _padaBounds.length - 1; i++) {
      if (t > _padaBounds[i][1] && t < _padaBounds[i+1][0]) return true;
    }
    // Also before first pada and after last
    if (t < _padaBounds[0][0] || t > _padaBounds[_padaBounds.length-1][1]) return true;
    return false;
  }

  function _teHandleMove(e) {
    const c = getCanvas();
    if (!c) return;
    const ne = _normEv(e);
    if (TE.pan) {
      const rect = c.getBoundingClientRect();
      const dx = ne.clientX - TE.pan.startX;
      const dur = _teDur();
      const visible = dur / TE.zoom;
      TE.offset = TE.pan.startOffset - (dx / rect.width) * visible;
      _teClampOffset();
      _teRender();
      return;
    }
    if (!TE.drag) {
      const rect = c.getBoundingClientRect();
      const y = ne.clientY - rect.top;
      const x = ne.clientX - rect.left;
      const inGrab = isPanZone(y) || isInPadaGap(x, rect.width);
      if (ne.target === c) c.style.cursor = inGrab ? 'grab' : 'crosshair';
      if (!inGrab) {
        const tCursor = _teXToTime(x, rect.width);
        let newHover = null;
        ['s1','s2'].forEach(key => {
          const times = TAP.times[key] || [];
          for (let i = times.length - 1; i >= 0; i--) {
            if (times[i] <= tCursor) {
              if (!newHover || times[i] > (TAP.times[newHover.key]?.[newHover.idx] ?? -1))
                newHover = { key, idx: i };
              break;
            }
          }
        });
        if (JSON.stringify(newHover) !== JSON.stringify(TE.hover)) { TE.hover = newHover; _teRender(); }
      } else if (TE.hover) { TE.hover = null; _teRender(); }
    }
    // Cheatsheet vertical drag
    if (TE._cheatDrag) {
      const rect = c.getBoundingClientRect();
      const dy = ne.clientY - rect.top - TE._cheatDrag.startY;
      const cheatH = TE._cheatH || rect.height / 3;
      const rowStep = (cheatH - 60 - 8) / 4;  // 5 rows in usable cheatH (60=CHEAT_PAD_TOP, 8=CHEAT_PAD_BOT)
      const rowDelta = Math.round(dy / rowStep);
      const newRow = Math.max(0, Math.min(4, TE._cheatDrag.startRow + rowDelta));
      if (!TAP.cheatY[TE._cheatDrag.key]) TAP.cheatY[TE._cheatDrag.key] = [];
      TAP.cheatY[TE._cheatDrag.key][TE._cheatDrag.idx] = newRow;
      // Keep hover highlight during drag
      TE.hover = { key: TE._cheatDrag.key, idx: TE._cheatDrag.idx };
      _teRender();
      return;
    }

    if (!TE.drag) return;
    const rect = c.getBoundingClientRect();
    const x = Math.max(0, Math.min(ne.clientX - rect.left, rect.width));
    const t = _teXToTime(x, rect.width);
    const times = TAP.times[TE.drag.key];
    const key   = TE.drag.key;
    const idx   = TE.drag.idx;

    // Determine pada index and boundaries for this syllable
    let padaStart = null, padaEnd = null, isFirstInPada = false, isLastInPada = false;
    if (_padaBounds) {
      const half = Math.ceil(DATA[key].length / 2);
      let padaIdx;
      if (key === 's1') padaIdx = idx < half ? 0 : 1;
      else padaIdx = idx < half ? 2 : 3;
      if (padaIdx < _padaBounds.length) {
        padaStart = _padaBounds[padaIdx][0];
        padaEnd   = _padaBounds[padaIdx][1];
        // First of pada: idx === 0 or idx === half
        const padaLocalIdx = (padaIdx % 2 === 0) ? idx : idx - half;
        isFirstInPada = padaLocalIdx === 0;
        // Last of pada: next syllable is in different pada or doesn't exist
        const nextIdx = idx + 1;
        isLastInPada = nextIdx >= times.length ||
          (key === 's1' && padaIdx === 0 && nextIdx >= half) ||
          (key === 's1' && padaIdx === 1 && nextIdx >= times.length) ||
          (key === 's2' && padaIdx === 2 && nextIdx >= half) ||
          (key === 's2' && padaIdx === 3 && nextIdx >= times.length);
      }
    }

    // First syllable of pada — locked, cannot move
    if (isFirstInPada) return;

    // Constraints: keep order with neighbours
    const prev = idx > 0 ? times[idx - 1] + 0.01 : 0;
    let next = idx < times.length - 1 ? times[idx + 1] - 0.01 : _teDur();
    // Last syllable of pada — cannot go past pada end
    if (isLastInPada && padaEnd !== null) next = Math.min(next, padaEnd - 0.01);

    times[idx] = Math.max(prev, Math.min(t, next));
    const s = DATA[TE.drag.key][TE.drag.idx];
    document.getElementById('timing-editor-info').textContent =
      `${TE.drag.key === 's1' ? 'Строфа 1' : 'Строфа 2'}, слог ${TE.drag.idx+1}: ${s?.syl || ''} — ${times[TE.drag.idx].toFixed(3)}с`;
    _teRender();
  }
  document.addEventListener('mousemove', _teHandleMove);
  document.addEventListener('touchmove', _teHandleMove, {passive: false});

  function _teHandleUp() {
    if (TE.pan) {
      TE.pan = null;
      const c = getCanvas();
      if (c) c.style.cursor = 'grab';
    }
    if (TE._cheatDrag) {
      TE._cheatDrag = null;
      _teRender();
    }
    if (TE.drag) {
      const t = TAP.times[TE.drag.key]?.[TE.drag.idx];
      if (t !== undefined) TE._playStartT = t;
      TE.drag = null;
    }
  }
  document.addEventListener('mouseup', _teHandleUp);
  document.addEventListener('touchend', _teHandleUp);
  document.addEventListener('mouseleave', e => {
    const c = getCanvas();
    if (e.target === c) { TE.hover = null; _teRender(); }
  }, true);

  // Scroll to pan
  document.addEventListener('wheel', e => {
    const c = getCanvas();
    if (!c || e.target !== c) return;
    e.preventDefault();
    const rect = c.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const tAtMouse = _teXToTime(mouseX, rect.width);
    // Zoom in on scroll up, out on scroll down
    if (e.deltaY < 0) {
      TE.zoom = Math.min(TE.zoom * 1.25, 32);
    } else {
      TE.zoom = TE.zoom / 1.25;
      if (TE.zoom < 1.05) { TE.zoom = 1; TE.offset = 0; }
    }
    // Keep mouse position fixed
    const dur = _teDur();
    const visible = dur / TE.zoom;
    TE.offset = tAtMouse - (mouseX / rect.width) * visible;
    _teClampOffset();
    _teSyncZoomLabel();
    _teRender();
  }, { passive: false });
})();


// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE DRIVE INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

const GDRIVE = {
  clientId:  '66648692430-60h3g4a5qa5j8iehjdojak436ph5h6n1.apps.googleusercontent.com',
  apiKey:    'AIzaSyDVK1eD272C7qHa-cmMokWFqfqfbsW8VVk',
  folderId:  '1L4m_UG4XMOcswDRWZUk--2xxrcasHFrs',
  scopes:    'https://www.googleapis.com/auth/drive',
  tokenClient: null,
  accessToken: null,
};

function _gdriveReady() {
  if (!GDRIVE.clientId || !GDRIVE.apiKey) {
    showMsg('Google Drive не настроен. Заполните clientId и apiKey в app.js', 'err');
    return false;
  }
  return true;
}

// ── Свой диалог выбора папки Google Drive ────────────────────────────────────
const _GD = {
  mode: 'load',
  stack: [],
  sort: 'name',
  view: 'list',
  currentFolders: [],
  currentFiles: [],
  selectedFile: null,
  selectedFolder: null,
  onConfirm: null,
  lastFolderId: null,   // последняя папка загрузки
  lastFolderName: null,
  lastStack: null,      // весь путь последней загрузки
};

function _gdOpen(mode, onConfirm) {
  _GD.mode = mode;
  _GD.onConfirm = onConfirm;
  // Восстановить настройки из localStorage
  try {
    const s = JSON.parse(localStorage.getItem('gdrive_dialog_prefs') || '{}');
    if (s.sort) _GD.sort = s.sort;
    if (s.view) _GD.view = s.view;
  } catch(e) {}
  _GD.stack = [{ id: GDRIVE.folderId, name: 'Sanskrit Wave' }];
  _GD.selectedFile = null;
  _GD.selectedFolder = null;
  _GD.currentFiles = [];

  // При сохранении — восстанавливаем весь путь последней загрузки
  if (mode === 'save' && _GD.lastStack && _GD.lastStack.length > 1) {
    _GD.stack = [..._GD.lastStack];
  }

  const startFolderId = _GD.stack[_GD.stack.length - 1].id;

  const dlg = document.getElementById('gdrive-dialog');
  dlg.style.display = 'flex';
  document.getElementById('gdrive-dialog-title').textContent =
    mode === 'load' ? 'Загрузить с Google Drive' : 'Сохранить на Google Drive';
  document.getElementById('gdrive-btn-newfolder').style.display = mode === 'save' ? '' : 'none';
  _gdSavePrefs();
  _gdUpdateToolbar();
  _gdLoadFolder(startFolderId);
}

function _gdDismiss() {
  document.getElementById('gdrive-dialog').style.display = 'none';
  _gdCancelNewFolder();
}

function _gdSavePrefs() {
  try { localStorage.setItem('gdrive_dialog_prefs', JSON.stringify({ sort: _GD.sort, view: _GD.view })); } catch(e) {}
}

function _gdUpdateToolbar() {
  document.getElementById('gdrive-btn-sort').textContent = _GD.sort === 'name' ? 'А→Я' : 'Новые↑';
  document.getElementById('gdrive-btn-view').textContent = _GD.view === 'list' ? '⊞' : '☰';
}

function _gdToggleSort() {
  _GD.sort = _GD.sort === 'name' ? 'date' : 'name';
  _gdSavePrefs(); _gdUpdateToolbar();
  _gdRenderList(_GD.currentFolders);
}

function _gdToggleView() {
  _GD.view = _GD.view === 'list' ? 'grid' : 'list';
  _gdSavePrefs(); _gdUpdateToolbar();
  _gdRenderList(_GD.currentFolders);
}

async function _gdLoadFolder(folderId) {
  const list = document.getElementById('gdrive-list');
  list.innerHTML = '<div style="padding:16px;text-align:center;color:#888;font-size:.8rem">Загрузка…</div>';
  _GD.selectedFile = null;
  _GD.selectedFolder = null;
  _gdUpdateFooter();
  _gdUpdateBreadcrumbs();

  try {
    // Загружаем папки и json-файлы одновременно
    const q = `'${folderId}' in parents and trashed=false and (mimeType='application/vnd.google-apps.folder' or name contains '.json')`;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime)&orderBy=name&includeItemsFromAllDrives=true&supportsAllDrives=true`,
      { headers: { Authorization: 'Bearer ' + GDRIVE.accessToken } }
    );
    const data = await res.json();
    const all = data.files || [];
    _GD.currentFolders = all.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    _GD.currentFiles   = all.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
    _gdRenderList();
  } catch(e) {
    list.innerHTML = '<div style="padding:16px;color:#e24b4a;font-size:.8rem">Ошибка загрузки</div>';
  }
}

function _gdRenderList() {
  const list = document.getElementById('gdrive-list');
  const folders = [..._GD.currentFolders].sort((a, b) => {
    if (_GD.sort === 'date') return new Date(b.modifiedTime) - new Date(a.modifiedTime);
    return a.name.localeCompare(b.name, 'ru');
  });
  const files = [...(_GD.currentFiles||[])].sort((a, b) => {
    if (_GD.sort === 'date') return new Date(b.modifiedTime) - new Date(a.modifiedTime);
    return a.name.localeCompare(b.name, 'ru');
  });

  if (folders.length === 0 && files.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#888;font-size:.8rem">Папок и файлов нет</div>';
    _gdUpdateFooter();
    return;
  }

  list.style.cssText = 'overflow-y:auto;flex:1;padding:4px 8px;min-height:120px;font-family:Segoe UI,system-ui,sans-serif';

  // Build rows via DOM to avoid XSS from user-controlled Drive file/folder names
  function makeRow(icon, name, colorClass, id, idPrefix) {
    const row = document.createElement('div');
    row.id = idPrefix + id;
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:5px;cursor:pointer;user-select:none;transition:background .15s';
    row.addEventListener('mouseenter', () => { if (!row.classList.contains('selected')) row.style.background = '#e8e8e8'; });
    row.addEventListener('mouseleave', () => { if (!row.classList.contains('selected')) row.style.background = ''; });
    const ic = document.createElement('span'); ic.style.fontSize = '1rem'; ic.textContent = icon;
    const nm = document.createElement('span'); nm.style.cssText = 'font-size:.85rem;flex:1;font-weight:500;color:' + colorClass; nm.textContent = name;
    row.appendChild(ic); row.appendChild(nm);
    return row;
  }

  list.textContent = '';
  folders.forEach(f => {
    const mod = new Date(f.modifiedTime);
    const row = makeRow('📁', f.name, '#1a1a1a', f.id, 'gdfolder-');
    const ts = document.createElement('span'); ts.style.cssText = 'font-size:.72rem;color:#777';
    ts.textContent = mod.toLocaleDateString('ru') + ' ' + mod.toLocaleTimeString('ru', {hour:'2-digit',minute:'2-digit'});
    row.appendChild(ts);
    row.addEventListener('click',   e => _gdClickFolder(f.id, f.name, e));
    row.addEventListener('dblclick', e => _gdEnter(f.id, f.name, e));
    list.appendChild(row);
  });

  if (folders.length > 0 && files.length > 0) {
    const sep = document.createElement('div');
    sep.style.cssText = 'height:1px;background:var(--border);margin:4px 0';
    list.appendChild(sep);
  }

  files.forEach(f => {
    const mod = new Date(f.modifiedTime);
    const row = makeRow('📄', f.name, '#357bdd', f.id, 'gdfile-');
    const ts = document.createElement('span'); ts.style.cssText = 'font-size:.72rem;color:#777';
    ts.textContent = mod.toLocaleDateString('ru') + ' ' + mod.toLocaleTimeString('ru', {hour:'2-digit',minute:'2-digit'});
    row.appendChild(ts);
    row.addEventListener('click',   e => _gdSelectFile(f.id, f.name, e));
    row.addEventListener('dblclick', () => { _gdSelectFile(f.id, f.name, event); _gdConfirm(); });
    list.appendChild(row);
  });
  _gdUpdateFooter();
}

function _gdClickFolder(id, name, e) {
  e.stopPropagation();
  // Снять выделение с предыдущего
  if (_GD.selectedFolder && _GD.selectedFolder.id !== id) {
    const prev = document.getElementById('gdfolder-' + _GD.selectedFolder.id);
    if (prev) { prev.style.background = ''; prev.classList.remove('selected'); }
  }
  if (_GD.selectedFolder && _GD.selectedFolder.id === id) {
    _GD.selectedFolder = null;
  } else {
    _GD.selectedFolder = { id, name };
    const el = document.getElementById('gdfolder-' + id);
    if (el) { el.style.background = '#d0e8ff'; el.classList.add('selected'); }
  }
  _gdUpdateFooter();
}

function _gdSelectFile(id, name, e) {
  e.stopPropagation();
  // Снять выделение с предыдущего
  if (_GD.selectedFile) {
    const prev = document.getElementById('gdfile-' + _GD.selectedFile.id);
    if (prev) { prev.style.background = ''; prev.classList.remove('selected'); }
  }
  if (_GD.selectedFile && _GD.selectedFile.id === id) {
    // Повторный клик — снять выделение
    _GD.selectedFile = null;
  } else {
    _GD.selectedFile = { id, name };
    const el = document.getElementById('gdfile-' + id);
    if (el) { el.style.background = '#d0e8ff'; el.classList.add('selected'); }
  }
  _gdUpdateFooter();
}

function _gdUpdateFooter() {
  const cur = _GD.stack[_GD.stack.length - 1];
  const label   = document.getElementById('gdrive-current-label');
  const btnConf = document.getElementById('gdrive-btn-confirm');
  if (!label || !btnConf) return;

  btnConf.textContent = 'Открыть';
  btnConf.disabled = false;

  if (_GD.mode === 'load') {
    if (_GD.selectedFile) {
      label.textContent = '📄 ' + _GD.selectedFile.name;
    } else if (_GD.selectedFolder) {
      label.textContent = '📁 ' + _GD.selectedFolder.name;
    } else {
      label.textContent = 'Папка: ' + (cur?.name || '');
      btnConf.disabled = true;
    }
  } else {
    if (_GD.selectedFile) {
      label.textContent = '📄 ' + _GD.selectedFile.name;
      btnConf.textContent = 'Заменить';
    } else if (_GD.selectedFolder) {
      label.textContent = '📁 ' + _GD.selectedFolder.name;
    } else {
      label.textContent = 'Папка: ' + (cur?.name || '');
      btnConf.textContent = 'Сохранить сюда';
      btnConf.disabled = cur?.id === GDRIVE.folderId;
    }
  }
}



function _gdEnter(id, name, e) {
  e.stopPropagation();
  _GD.selectedFile = null;
  _GD.stack.push({ id, name });
  _gdLoadFolder(id);
}

function _gdUpdateBreadcrumbs() {
  const el = document.getElementById('gdrive-breadcrumbs');
  el.innerHTML = _GD.stack.map((s, i) => {
    if (i === _GD.stack.length - 1)
      return `<span style="color:var(--ink);font-weight:600">${_gdEsc(s.name)}</span>`;
    return `<span onclick="_gdGoTo(${i})" style="cursor:pointer;color:var(--accent,#357bdd)">${_gdEsc(s.name)}</span><span style="color:var(--ink-2)"> › </span>`;
  }).join('');
}

function _gdGoTo(idx) {
  _GD.selectedFile = null;
  _GD.stack = _GD.stack.slice(0, idx + 1);
  _gdLoadFolder(_GD.stack[_GD.stack.length - 1].id);
}

function _gdNewFolder() {
  const row = document.getElementById('gdrive-newfolder-row');
  row.style.display = 'flex';
  row.style.flexDirection = 'column';
  document.getElementById('gdrive-newfolder-input').value = '';
  document.getElementById('gdrive-newfolder-input').focus();
}

function _gdCancelNewFolder() {
  document.getElementById('gdrive-newfolder-row').style.display = 'none';
}

async function _gdCreateFolder() {
  const name = document.getElementById('gdrive-newfolder-input').value.trim();
  if (!name) return;
  const parentId = _GD.stack[_GD.stack.length - 1].id;
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + GDRIVE.accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
    });
    const folder = await res.json();
    _gdCancelNewFolder();
    // Заходим в созданную папку
    _GD.stack.push({ id: folder.id, name: folder.name });
    _gdLoadFolder(folder.id);
  } catch(e) {
    showMsg('Ошибка создания папки: ' + e.message, 'err');
  }
}

function _gdConfirm() {
  const cur = _GD.stack[_GD.stack.length - 1];
  // Выделена папка — открываем её
  if (_GD.selectedFolder && !_GD.selectedFile) {
    const { id, name } = _GD.selectedFolder;
    _GD.selectedFolder = null;
    _GD.stack.push({ id, name });
    _gdLoadFolder(id);
    return;
  }
  // Режим save без выбора — сохранить в текущую папку
  if (_GD.mode === 'save' && !_GD.selectedFile && cur.id === GDRIVE.folderId) {
    showMsg('Выберите папку внутри Sanskrit Wave', 'err'); return;
  }
  _gdDismiss();
  if (_GD.onConfirm) _GD.onConfirm(cur.id, cur.name, _GD.selectedFile || null);
}

function _gdEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function gdriveLoad() {
  if (!_gdriveReady()) return;
  try {
    await _gdriveEnsureToken();
    _gdOpen('load', async (folderId, folderName, selectedFile) => {
      showMsg('Google Drive: загрузка…', 'ok');
      try {
        let sessionFileId, sessionFileName;

        if (selectedFile) {
          // Пользователь выбрал конкретный json — ищем аудио в той же папке
          sessionFileId   = selectedFile.id;
          sessionFileName = selectedFile.name;

          const filesRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&fields=files(id,name,mimeType)&includeItemsFromAllDrives=true&supportsAllDrives=true`,
            { headers: { Authorization: 'Bearer ' + GDRIVE.accessToken } }
          );
          const files = (await filesRes.json()).files || [];
          const audioEntry = files.find(f => f.mimeType?.startsWith('audio/'));
          if (audioEntry) {
            const audioBlob = await (await fetch(
              `https://www.googleapis.com/drive/v3/files/${audioEntry.id}?alt=media`,
              { headers: { Authorization: 'Bearer ' + GDRIVE.accessToken } }
            )).blob();
            readAudioFile(new File([audioBlob], audioEntry.name, { type: audioBlob.type }), false);
            await new Promise(r => setTimeout(r, 300));
          }
        } else {
          // Ищем session.json или любой json в папке
          const filesRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&fields=files(id,name,mimeType)&includeItemsFromAllDrives=true&supportsAllDrives=true`,
            { headers: { Authorization: 'Bearer ' + GDRIVE.accessToken } }
          );
          const files = (await filesRes.json()).files || [];
          const sf = files.find(f => f.name === 'session.json') || files.find(f => f.name.endsWith('.json'));
          if (!sf) {
            const names = files.map(f => f.name).join(', ') || '(пусто)';
            showMsg(`JSON не найден в «${folderName}». Файлы: ${names}`, 'err'); return;
          }
          sessionFileId   = sf.id;
          sessionFileName = sf.name;

          // Загружаем аудио
          const audioEntry = files.find(f => f.mimeType?.startsWith('audio/'));
          if (audioEntry) {
            const audioBlob = await (await fetch(
              `https://www.googleapis.com/drive/v3/files/${audioEntry.id}?alt=media`,
              { headers: { Authorization: 'Bearer ' + GDRIVE.accessToken } }
            )).blob();
            readAudioFile(new File([audioBlob], audioEntry.name, { type: audioBlob.type }), false);
            await new Promise(r => setTimeout(r, 300));
          }
        }

        const state = await (await fetch(
          `https://www.googleapis.com/drive/v3/files/${sessionFileId}?alt=media`,
          { headers: { Authorization: 'Bearer ' + GDRIVE.accessToken } }
        )).json();

        _applySession(state);
        _GD.lastFolderId   = folderId;
        _GD.lastFolderName = folderName;
        _GD.lastStack      = [..._GD.stack]; // запоминаем весь путь
        showMsg(`✓ Загружено: «${sessionFileName}»`, 'ok');
      } catch(e) {
        showMsg('Ошибка Drive: ' + e.message, 'err');
      }
    });
  } catch(e) {
    showMsg('Ошибка Drive: ' + e.message, 'err');
  }
}

async function gdriveSave() {
  if (!_gdriveReady()) return;
  try {
    await _gdriveEnsureToken();
    _gdOpen('save', async (folderId, folderName, selectedFile) => {
      showMsg('Google Drive: сохранение…', 'ok');
      try {
        await _gdriveWithRetry(async () => {
          async function uploadFile(name, blob, mimeType, parentId, oldFileId) {
            // Всегда создаём новый файл (избегаем проблем с правами на PATCH чужих файлов)
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify({
              name, mimeType, parents: [parentId]
            })], { type: 'application/json' }));
            form.append('file', blob);
            const uploadResp = await fetch(
              'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
              { method: 'POST', headers: { Authorization: 'Bearer ' + GDRIVE.accessToken }, body: form }
            );
            if (!uploadResp.ok) {
              const err = await uploadResp.text();
              const e = new Error('Upload failed: ' + err.slice(0, 200));
              e.status = uploadResp.status;
              throw e;
            }
            const newFile = await uploadResp.json();
            // Удаляем старый файл после успешной загрузки нового
            if (oldFileId) {
              await fetch(`https://www.googleapis.com/drive/v3/files/${oldFileId}`,
                { method: 'DELETE', headers: { Authorization: 'Bearer ' + GDRIVE.accessToken } }
              ).catch(() => {}); // игнорируем ошибку удаления
            }
            return newFile;
          }

          const sessionBlob = new Blob([JSON.stringify(_buildSessionState(), null, 2)], { type: 'application/json' });
          const saveFileName = selectedFile ? selectedFile.name : 'session.json';
          const saveFileId   = selectedFile ? selectedFile.id  : null;
          await uploadFile(saveFileName, sessionBlob, 'application/json', folderId, saveFileId);

          if (typeof audioFile !== 'undefined' && audioFile instanceof File && audioFile.size > 0) {
            // Запрашиваем содержимое папки для поиска аудио-файлов
            const audioMimes = ['audio/mpeg','audio/wav','audio/ogg','audio/mp4','audio/aac',
              'audio/flac','audio/opus','audio/x-ms-wma','audio/webm'];
            const audioExts  = ['mp3','wav','ogg','m4a','aac','flac','opus','wma','webm'];
            const qAudio = `'${folderId}' in parents and trashed=false and mimeType contains 'audio/'`;
            const qExt   = audioExts.map(e => `name contains '.${e}'`).join(' or ');
            const qFull  = `'${folderId}' in parents and trashed=false and (mimeType contains 'audio/' or (${qExt}))`;
            const checkResp = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qFull)}&fields=files(id,name)&pageSize=5`,
              { headers: { Authorization: 'Bearer ' + GDRIVE.accessToken } }
            );
            const checkData = checkResp.ok ? await checkResp.json() : { files: [] };
            const existingAudio = (checkData.files || []).find(f => {
              const ext = f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : '';
              return audioExts.includes(ext) || audioMimes.some(m => f.mimeType?.startsWith('audio/'));
            });
            if (existingAudio) {
              showMsg(`✓ Сохранено «${saveFileName}» в «${folderName}» (аудио не загружено — уже есть «${existingAudio.name}»)`, 'ok');
            } else {
              const ext = audioFile.name.includes('.') ? audioFile.name.split('.').pop() : 'mp3';
              await uploadFile('audio.' + ext, audioFile, audioFile.type || 'audio/mpeg', folderId, null);
              showMsg(`✓ Сохранено «${saveFileName}» в «${folderName}» + audio`, 'ok');
            }
          } else {
            showMsg(`✓ Сохранено «${saveFileName}» в «${folderName}»`, 'ok');
          }
        });
      } catch(e) {
        showMsg('Ошибка Drive: ' + e.message, 'err');
      }
    });
  } catch(e) {
    showMsg('Ошибка Drive: ' + e.message, 'err');
  }
}

function _gdriveEnsureToken(readonly) {
  // Всегда запрашиваем write-скоуп — он включает и чтение
  return new Promise((resolve, reject) => {
    const cacheKey = 'gdrive_token_rw';
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (cached && cached.token && cached.expires > Date.now() + 60000 &&
          cached.scope === GDRIVE.scopes) {
        GDRIVE.accessToken = cached.token;
        resolve();
        return;
      }
    } catch(e) {}
    GDRIVE.accessToken = null;
    localStorage.removeItem(cacheKey);
    if (!window.google?.accounts?.oauth2) {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = () => _gdriveRequestToken(cacheKey, resolve, reject);
      s.onerror = () => reject(new Error('Не удалось загрузить Google Sign-In'));
      document.head.appendChild(s);
    } else {
      _gdriveRequestToken(cacheKey, resolve, reject);
    }
  });
}

async function _gdriveWithRetry(fn) {
  try {
    return await fn();
  } catch(e) {
    if (e && (e.status === 401 || e.status === 403 || String(e.message).includes('401') || String(e.message).includes('403'))) {
      GDRIVE.accessToken = null;
      localStorage.removeItem('gdrive_token_rw');
      await _gdriveEnsureToken();
      return await fn();
    }
    throw e;
  }
}

function _gdriveRequestToken(cacheKey, resolve, reject) {
  const scopes = GDRIVE.scopes; // всегда write (включает read)

  // Try cached token first
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached && cached.token && cached.expires > Date.now() + 60000) {
      GDRIVE.accessToken = cached.token;
      resolve();
      return;
    }
  } catch(e) {}

  GDRIVE.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GDRIVE.clientId,
    scope: scopes,
    callback: resp => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      GDRIVE.accessToken = resp.access_token;
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          token: resp.access_token,
          expires: Date.now() + 55 * 60 * 1000,
          scope: GDRIVE.scopes
        }));
      } catch(e) {}
      resolve();
    }
  });
  GDRIVE.tokenClient.requestAccessToken({ prompt: '' });
}

function getGroupFromLabel(label) {
  const syllableGroups = {
    4:  { name: 'gāyatrī',     anchor: 'grp-metreswith4syllablesinaq' },
    5:  { name: 'supratiṣṭhā',  anchor: 'grp-metreswith5syllablesinaq' },
    6:  { name: 'gāyatrī',     anchor: 'grp-metreswith6syllablesinaq' },
    7:  { name: 'uṣṇih',       anchor: 'grp-metreswith7syllablesinaq' },
    8:  { name: 'anuṣṭubh',    anchor: 'grp-metreswith8syllablesinaq' },
    9:  { name: 'bṛhatī',       anchor: 'grp-metreswith9syllablesinaq' },
    10: { name: 'paṅkti',      anchor: 'grp-metreswith10syllablesina' },
    11: { name: 'triṣṭubh',    anchor: 'grp-metreswith11syllablesina' },
    12: { name: 'jagatī',      anchor: 'grp-metreswith12syllablesina' },
    13: { name: 'atijagatī',   anchor: 'grp-metreswith13syllablesina' },
    14: { name: 'śakvarī',     anchor: 'grp-metreswith14syllablesina' },
    15: { name: 'atiśakvarī',  anchor: 'grp-metreswith15syllablesina' },
    16: { name: 'aṣṭi',        anchor: 'grp-metreswith16syllablesina' },
    17: { name: 'atyaṣṭi',     anchor: 'grp-metreswith17syllablesina' },
    18: { name: 'dhṛti',       anchor: 'grp-metreswith18syllablesina' },
    19: { name: 'atidhṛti',    anchor: 'grp-metreswith19syllablesina' },
    20: { name: 'kṛti',        anchor: 'grp-metreswith20syllablesina' },
    21: { name: 'prakṛti',     anchor: 'grp-metreswith21syllablesina' },
    26: { name: 'utkṛti',      anchor: 'grp-metreswith26syllablesina' },
  };
  // Extract ALL syllable counts from all atha vā variants
  const counts = [...label.matchAll(/ajñātasamavṛtta\s*\[(\d+):/g)].map(m => parseInt(m[1]));
  if (!counts.length) return null;
  // Only return group if ALL variants have the same syllable count
  const allSame = counts.every(n => n === counts[0]);
  if (!allSame) return null;
  return syllableGroups[counts[0]] || null;
}

function meterLabelForFooter(label) {
  if (!label) return label;
  if (!label.includes('ajñātasamavṛtta')) return label.replace(/\s*\[.*?\]/g, '').replace(/\s*atha vā.*/,'').trim();
  const group = getGroupFromLabel(label);
  if (group && group.name) {
    const counts = [...label.matchAll(/ajñātasamavṛtta\s*\[(\d+):/g)].map(m => parseInt(m[1]));
    const n = counts[0];
    return group.name + ' (' + n + ' s.)';
  }
  // Mixed syllable counts — just show ajñātasamavṛtta
  return 'ajñātasamavṛtta';
}


// ── Випула: пометить слоги в DATA ────────────────────────────────────────────
function detectAndMarkVipula(meterLabel) {
  // Сбрасываем старые пометки
  ['s1','s2'].forEach(key => (DATA[key]||[]).forEach(s => { delete s.vipula; }));

  if (!meterLabel || !meterLabel.includes('vipulā')) return null;
  if (!meterLabel.includes('anuṣṭubh') && !meterLabel.includes('śloka')) return null;

  // Паттерны для нечётной пады (из METER_DATA.anustubh.odd)
  const ODD_PATTERNS = METER_DATA?.anustubh?.odd
    ? Object.entries(METER_DATA.anustubh.odd)
    : [
        ["^(?!.ll.).{4}lgg.$", "pathyā"],
        ["^.glgggg.$",          "ma-vipulā"],
        ["^.glggll.$",          "bha-vipulā"],
        ["^.ggggll.$",          "bha-vipulā (ma-gaṇa-pūrvikā!)"],
        ["^(?!.ll).{3}glll.$",  "na-vipulā"],
        ["^(?!.ll).{3}gglg.$",  "ra-vipulā"],
      ];

  // Определяем тип пады по её слогам
  function classifyOddPada(syls, fromIdx) {
    const pat = syls.slice(fromIdx, fromIdx + 8).map(s => s.type === 'guru' ? 'g' : 'l').join('');
    if (pat.length < 8) return null;
    for (const [re, name] of ODD_PATTERNS) {
      if (new RegExp(re).test(pat)) return name;
    }
    return null;
  }

  const VIPULA_CULPRIT = 4;
  const VIPULA_GROUP   = [4, 5, 6];
  const found = [];

  function markPada(key, fromIdx, padaNum) {
    const syls = DATA[key] || [];
    if (syls.length < fromIdx + 8) return;
    const type = classifyOddPada(syls, fromIdx);
    if (!type || type === 'pathyā' || !type.includes('vipulā')) return; // не випула — не помечаем
    const sylNums = [];
    VIPULA_GROUP.forEach(padaPos => {
      const sylIdx = fromIdx + padaPos;
      if (syls[sylIdx]) {
        syls[sylIdx].vipula = (padaPos === VIPULA_CULPRIT) ? 'culprit' : 'group';
        syls[sylIdx].vipulaType = type;
        sylNums.push(padaPos + 1);
      }
    });
    if (sylNums.length) {
      // Паттерн слогов 5-7 (g/l)
      const pat57 = [4,5,6].map(pos => {
        const s = syls[fromIdx + pos];
        return s ? (s.type === 'guru' ? 'g' : 'l') : '?';
      }).join('');
      found.push({ pada: padaNum, type, syls: sylNums, pat57 });
    }
  }

  // s1: пада 1 (нечётная) — индексы 0..7
  markPada('s1', 0, 1);
  // s2: пада 3 (нечётная) — индексы 0..7
  markPada('s2', 0, 3);

  if (!found.length) return null;
  // Собираем итоговый тип из найденных пад
  const types = [...new Set(found.map(p => p.type))];
  return { type: types.join(' / '), padas: found };
}



function ftDetectMeter() {
  // Use already-identified meter if available, otherwise run identification
  const field = document.getElementById('ft-meter');
  if (!field) return;
  if (DATA.s1.length) {
    const w1 = DATA.s1.map(s => s.type === 'guru' ? 'g' : 'l').join('');
    const w2 = DATA.s2.map(s => s.type === 'guru' ? 'g' : 'l').join('');
    const mr = identifyMeterLocal(w1, w2, DATA.s1.map(s=>s.syl), DATA.s2.map(s=>s.syl));
    if (mr && mr.label) {
      const groupEntry = getGroupFromLabel(mr.label);
      const groupLabel = groupEntry ? groupEntry.name : null;
      field.value = meterLabelForFooter(mr.label);
      const msgLabel = groupLabel && mr.label.includes('ajñātasamavṛtta')
        ? groupLabel + ': ' + mr.label
        : mr.label;
      showMsg('✓ Размер определён: ' + msgLabel, 'ok');
      // Пометить слоги випулы и перестроить SVG
      _lastVipulaLabel = mr.label;
      const vipulaInfo = detectAndMarkVipula(mr.label);
      ['s1','s2'].forEach(k => {
        const bl = document.getElementById('block-' + k);
        if (!bl) return;
        const oldWrap = bl.querySelector('.wave-svg-wrap');
        if (oldWrap) bl.replaceChild(buildWaveSVG(k), oldWrap);
      });
      if (vipulaInfo) {
        const vipLines = vipulaInfo.padas.map(p =>
          `${p.type}: П${p.pada}, слоги 5-7, ${p.pat57};`
        ).join('\n');
        showMsg(`✓ Размер: ${msgLabel}\n${vipLines}`, 'ok');
      }
    } else {
      showMsg('Не удалось определить размер', 'err');
    }
  } else {
    showMsg('Сначала постройте диаграмму', 'err');
  }
}

function openHelp() {
  document.getElementById('help-overlay').style.display = '';
}
function closeHelp() {
  document.getElementById('help-overlay').style.display = 'none';
}

function openSettings() {
  document.getElementById('settings-overlay').style.display = '';
  document.getElementById('settings-modal').style.display = '';
}
function applyCheatOpenSetting() {
  const open = document.getElementById('opt-cheat-open').checked;
  ['s1','s2'].forEach(key => {
    const body = document.getElementById('cheat-body-' + key);
    const head = document.querySelector('#cheat-wrap-' + key + ' div[style*="cursor:pointer"]');
    if (!body) return;
    body.style.display = open ? '' : 'none';
    if (head) {
      const arr = head.querySelector('span');
      if (arr) arr.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)';
    }
  });
}

function closeSettings() {
  document.getElementById('settings-overlay').style.display = 'none';
  document.getElementById('settings-modal').style.display = 'none';
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeSettings(); return; }
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyS') { e.preventDefault(); saveSession(); return; }
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyZ') {
    e.preventDefault();
    if (HISTORY.s1) undoRows('s1');
    else if (HISTORY.s2) undoRows('s2');
    return;
  }
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyK') { e.preventDefault(); openCrossCheck(); }
});

function waveScaleChanged(val) {
  document.getElementById('opt-wave-scale-val').textContent = parseFloat(val).toFixed(2);
  rebuildAll();
}

// KEEP: danda-stripping test function — do not remove during optimization
function testStripDandas() {
  const raw = document.getElementById('dev-input').value;
  const lines = raw.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const result = lines.map(l => {
    const main = l.replace(/\s*[\u0964\u0965|]+(?:\s*[\d\u0966-\u096F0-9]+\s*[\u0964\u0965|]+)?\s*$/, '').trim();
    const suffix = l.slice(main.length).trim();
    return suffix ? main + ' + ' + suffix : main;
  });
  const msg = document.getElementById('msg');
  msg.style.cssText = 'color:green;font-size:.85rem;margin-top:6px;white-space:pre-line';
  msg.textContent = result.join('\n');
}

function getMsgPos() {
  if (document.getElementById('msg-pos-header') && document.getElementById('msg-pos-header').checked) return 'header';
  if (document.getElementById('msg-pos-both')   && document.getElementById('msg-pos-both').checked)   return 'both';
  return 'sidebar';
}

function applyMsgPosSetting() {
  const pos = getMsgPos();
  const sidebar = document.getElementById('msg');
  const header  = document.getElementById('msg-header');
  if (pos === 'header') {
    if (sidebar) { sidebar.style.display = 'none'; sidebar.textContent = ''; }
  } else if (pos === 'sidebar') {
    if (header) { header.style.display = 'none'; header.textContent = ''; }
  }
}

function showMsg(t, type) {
  const pos = getMsgPos();
  const colors = {
    info: { bg: '#e6edfb', color: '#1a3480' },
    ok:   { bg: '#e8f7ee', color: '#1a5c2a' },
    err:  { bg: '#fceaea', color: '#7a1515' }
  };
  const c = colors[type] || { bg: '#eee', color: '#333' };

  const _html = t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>');
  const el = document.getElementById('msg');
  if (el) {
    if (pos === 'sidebar' || pos === 'both') {
      el.className = 'msg ' + type; el.innerHTML = _html;
    } else {
      el.style.display = 'none'; el.innerHTML = '';
    }
  }
  const hel = document.getElementById('msg-header');
  if (hel) {
    if (pos === 'header' || pos === 'both') {
      hel.style.background = c.bg; hel.style.color = c.color;
      hel.innerHTML = _html; hel.style.display = 'block';
    } else {
      hel.style.display = 'none'; hel.textContent = '';
    }
  }
}

function setBusy(b) {
  const btn = document.getElementById('btn-go');
  if (!btn) return;
  btn.disabled = b;
  document.getElementById('btn-label') && (document.getElementById('btn-label').innerHTML =
    b ? '<span class="spin"></span> Анализ...' : 'Построить диаграмму');
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

window.onload = () => {
  loadDefaults();  // restore user's saved defaults

  document.getElementById('dev-input').value =
    'व्याप्तचराचरभावविशेषं चिन्मयमेकमनन्तमनादिम् ।\nभैरवनाथमनाथशरण्यं त्वन्मयचित्ततया हृदि वन्दे॥१॥';

  // Auto-detect scheme for pre-filled text
  const text = document.getElementById('dev-input').value.trim();
  if (text) applySchemeDetect(text, document.getElementById('scheme-select'));
};


// ══ CROSS-CHECK LOGIC ══

function openCrossCheck() {
  document.getElementById('crosscheck-overlay').style.display = '';
}
function closeCrossCheck() {
  document.getElementById('crosscheck-overlay').style.display = 'none';
}

// Extract plain text from Ex. field inside Apte HTML
function extractExFromHtml(html) {
  // Parse HTML to get text content of spans following "Ex."
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = div.innerText || div.textContent || '';
  // Find "Ex." then take everything after it, stopping at "||" or end
  const exIdx = text.indexOf('Ex.');
  if (exIdx === -1) return null;
  let ex = text.slice(exIdx + 3).trim();
  // Remove trailing content after || followed by citation like "R. 1. 1."
  // Keep up to and including first ||
  const danda = ex.indexOf('||');
  if (danda !== -1) ex = ex.slice(0, danda + 2).trim();
  return ex;
}

// Split example into lines (by | separators and newlines)
// Returns array of lines with Sanskrit content
function splitExLines(ex) {
  if (!ex) return [];
  // Normalize: replace || with |, split on | or newline
  let lines = ex.replace(/\|\|/g, '|').split(/[|\n]/)
    .map(l => l.trim()).filter(l => l.length > 2);
  return lines;
}

// Try to figure out what meter the Apte entry is for (from its "name" field)
function apteCleanName(entry) {
  // Strip numbering like "(1)" and trailing pipe
  return entry.name.replace(/^\s*\(\d+\)\s*/, '').replace(/[|।॥]/g,'').trim();
}

// Normalize meter name for comparison (remove diacritics variants, lowercase, strip brackets)
function normMeterName(s) {
  if (!s) return '';
  return s.toLowerCase()
    .replace(/\s*\[.*?\]/g,'')
    .replace(/\s*atha vā.*/,'')
    .replace(/anuṣṭubh.*/, 'anuṣṭubh')
    .replace(/[āa]/g,'a').replace(/[īi]/g,'i').replace(/[ūu]/g,'u')
    .replace(/ṛ/g,'r').replace(/ḷ/g,'l')
    .replace(/[śṣ]/g,'s').replace(/[ṭ]/g,'t').replace(/[ḍ]/g,'d')
    .replace(/[ṇṅñ]/g,'n').replace(/ṃ/g,'m').replace(/ḥ/g,'h')
    .replace(/\s+/g,' ').replace(/[^\w\s]/g,'').trim();
}

// Extract all "also called" alternative names from Apte HTML
function apteAlsoCalledNames(html) {
  const div = document.createElement('div');
  // Replace <br> with comma so names split across lines are handled correctly
  div.innerHTML = html.replace(/<br\s*\/?>/gi, ', ');
  const text = div.textContent || '';
  const names = [];
  const m = text.match(/[Aa]lso called\s+([^.\n\r|]+)/g);
  if (!m) return names;
  for (const chunk of m) {
    const rest = chunk.replace(/[Aa]lso called\s+/, '');
    for (const n of rest.split(/\s+and\s+|\s+or\s+|,/)) {
      const clean = n.replace(/[|।॥()]/g, '').trim();
      if (clean.length > 1) names.push(clean);
    }
  }
  return names;
}

// Check if computed meter matches Apte meter name
function metersMatch(apteName, computed, alsoCalledNames) {
  const na = normMeterName(apteName);
  const nc = normMeterName(computed);
  if (!na || !nc) return false;
  // Direct substring match on primary name
  if (nc.includes(na) || na.includes(nc)) return true;
  // Try first significant word of primary name
  const wa = na.split(/\s+/)[0];
  const wc = nc.split(/\s+/)[0];
  if (wa && wc && (wc.startsWith(wa) || wa.startsWith(wc))) return true;
  // Check alternative names (also called ...)
  if (alsoCalledNames) {
    for (const alt of alsoCalledNames) {
      const na2 = normMeterName(alt);
      if (!na2) continue;
      if (nc.includes(na2) || na2.includes(nc)) return true;
      const wa2 = na2.split(/\s+/)[0];
      if (wa2 && wc && (wc.startsWith(wa2) || wa2.startsWith(wc))) return true;
    }
  }
  return false;
}

// Convert IAST to syllabified IAST weights using existing functions
function computeWeightsFromIast(iastText) {
  try {
    const syls = syllabifyIast(iastText);
    const w = syls.map(s => s.type === 'guru' ? 'g' : 'l').join('');
    return { w, syls: syls.map(s => s.syl) };
  } catch(e) { return null; }
}

// Main cross-check runner
async function runCrossCheck() {
  const onlyMismatch  = document.getElementById('cc-only-mismatch').checked;
  const useApte2      = document.getElementById('cc-source-apte2').checked;
  const filterSection = document.getElementById('cc-filter-section').value;
  const tbody  = document.getElementById('cc-tbody');
  const table  = document.getElementById('cc-table');
  const status = document.getElementById('cc-status');
  const summary = document.getElementById('cc-summary');

  tbody.innerHTML = '';
  table.style.display = 'none';
  summary.style.display = 'none';
  status.textContent = '⏳ Обработка…';
  try { await loadApteMeters(); }
  catch (e) { status.textContent = '✗ Не удалось загрузить базу метров Апте'; return; }

  // Split example into half-strophes for meter identification
  // APTE2: padas separated by \n; strip | signs within each pada
  // APTE1: split by | or \n (HTML-extracted text uses | as pada boundary)
  function splitToHalves(exText, isApte2) {
    if (!exText) return null;
    let lines;
    if (isApte2) {
      // Split by \n first, then by single | within each line
      lines = [];
      for (const raw of exText.split('\n')) {
        const padas = raw.replace(/\|\|/g,'\x01').split('|')
          .map(p => p.replace(/\x01/g,'').replace(/[।॥]+/g,'').trim())
          .filter(p => p.length > 2);
        lines.push(...padas);
      }
    } else {
      // Legacy: | and \n are both pada boundaries
      lines = exText.replace(/\|\|/g, '|').split(/[|\n]/)
        .map(l => l.trim()).filter(l => l.length > 2);
    }
    if (lines.length < 2) return null;
    let half1, half2;
    if (lines.length >= 4)       { half1 = lines[0]+' '+lines[1]; half2 = lines[2]+' '+lines[3]; }
    else if (lines.length === 3)  { half1 = lines[0]+' '+lines[1]; half2 = lines[2]; }
    else                          { half1 = lines[0]; half2 = lines[1]; }
    return { half1, half2, exDisplay: lines.slice(0,4).join(' | ') };
  }

  // Build entry list from selected source
  let entries;
  if (useApte2) {
    entries = Object.values(APTE_METERS2).map(e => ({
      apteName:   e.name.replace(/^\s*\(\d+\)\s*/,'').trim(),
      section:    e.section || '',
      exText:     e.example || null,
      alsoCalled: e.also_called || [],
      isApte2:    true
    }));
  } else {
    entries = Object.entries(APTE_METERS).map(([, v]) => ({
      apteName:   apteCleanName(v),
      section:    v.section || '',
      exText:     extractExFromHtml(v.html),
      alsoCalled: apteAlsoCalledNames(v.html),
      isApte2:    false
    }));
  }

  let rows = [];
  let matchCount = 0, mismatchCount = 0, skipCount = 0;

  for (const entry of entries) {
    if (filterSection && !entry.section.includes(filterSection)) continue;

    const split = splitToHalves(entry.exText, entry.isApte2);

    if (!split) {
      skipCount++;
      rows.push({ apteName: entry.apteName, section: entry.section,
        exText: entry.exText||'—', computed: '(нет примера)', match: null });
      continue;
    }

    const r1 = computeWeightsFromIast(split.half1);
    const r2 = computeWeightsFromIast(split.half2);
    if (!r1||!r2||!r1.w||!r2.w) {
      skipCount++;
      rows.push({ apteName: entry.apteName, section: entry.section,
        exText: split.exDisplay, computed: '(ошибка слогоделения)', match: null });
      continue;
    }

    const computed = identifyMeterLocal(r1.w, r2.w, r1.syls, r2.syls).label;
    const match = metersMatch(entry.apteName, computed, entry.alsoCalled);

    if (match===true) matchCount++; else if (match===false) mismatchCount++;
    rows.push({ apteName: entry.apteName, section: entry.section,
      exText: split.exDisplay, computed, match });
  }

  // Render table
  let rowNum = 0;
  const icon = m => m===true?'✅':m===false?'❌':'⬜';
  const ttl  = m => m===true?'Совпадает':m===false?'Расходится':'Нет данных';

  for (const r of rows) {
    if (onlyMismatch && r.match!==false) continue;
    rowNum++;
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border)';
    if (r.match===false) tr.style.background='#fff5f5';
    if (r.match===true)  tr.style.background='#f5fff8';

    tr.innerHTML = `
      <td style="padding:5px 8px;color:var(--ink2);white-space:nowrap;width:28px">${rowNum}</td>
      <td style="padding:5px 8px;font-weight:600;color:var(--accent);width:130px;word-break:break-word">${escXml(r.apteName)}</td>
      <td style="padding:5px 8px;color:var(--ink2);font-size:.62rem;width:80px;word-break:break-word">${escXml(r.section.replace('SECTION ','§').replace(' - ','·'))}</td>
      <td style="padding:5px 8px;color:var(--ink)${r.match===false?';font-weight:600':''};width:180px;word-break:break-word">${escXml(r.computed)}</td>
      <td style="padding:5px 8px;text-align:center;font-size:1rem;width:44px" title="${ttl(r.match)}">${icon(r.match)}</td>
      <td style="padding:5px 8px;color:var(--ink2);font-family:'Charter Indologique','Cormorant Garamond',serif;font-size:.75rem;word-break:break-word" title="${escXml(r.exText)}">${escXml(r.exText)}</td>
    `;
    tbody.appendChild(tr);
  }

  table.style.display = rowNum > 0 ? '' : 'none';
  if (rowNum===0 && onlyMismatch) {
    status.textContent = '✅ Все расхождения отсутствуют!';
  } else {
    const src = useApte2 ? 'APTE2' : 'APTE1';
    status.textContent = `[${src}] Обработано: ${rows.length} | ✅ ${matchCount} | ❌ ${mismatchCount} | ⬜ ${skipCount}`;
  }

  const total = matchCount + mismatchCount;
  if (total > 0) {
    const pct = Math.round(matchCount/total*100);
    summary.style.display = '';
    summary.innerHTML = `
      <b>Итого проверено:</b> ${total} метров с примерами<br>
      <b>Совпадений:</b> ${matchCount} (${pct}%)<br>
      <b>Расхождений:</b> ${mismatchCount} (${100-pct}%)<br>
      <b>Без примера/ошибка:</b> ${skipCount}<br><br>
      <span style="color:var(--ink2);font-size:.65rem">
        Расхождения: (1) иное слогоделение; (2) 4 пады объединяются попарно; (3) нестрогое соответствие названий.
      </span>`;
  }
}

// ── Горячие клавиши редактора тайминга ───────────────────────────────────────
document.addEventListener('keydown', function(e) {
  // Работаем только когда открыт редактор тайминга и не фокус на input/textarea
  const overlay = document.getElementById('timing-editor-overlay');
  if (!overlay || overlay.style.display === 'none') return;
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  if (TE_MODE === 'timing') {
    if (e.key === 'Tab') {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      _teJumpToNextUncertain(dir);
      return;
    }
    // ← / → — выбрать предыдущий/следующий слог
    if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
      e.preventDefault(); teSelectAdjacentSyl(-1); return;
    }
    if (e.key === 'ArrowRight' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
      e.preventDefault(); teSelectAdjacentSyl(+1); return;
    }
    // Ctrl+← / Ctrl+→ — сдвиг слога на 0.01с
    if (e.key === 'ArrowLeft' && e.ctrlKey) {
      e.preventDefault(); teShiftSyl(-0.01); return;
    }
    if (e.key === 'ArrowRight' && e.ctrlKey) {
      e.preventDefault(); teShiftSyl(+0.01); return;
    }
    // Home — выровнять к началу
    if (e.key === 'Home') {
      e.preventDefault(); teAlignToStart(); return;
    }
    // Enter — проиграть текущий слог
    if (e.key === 'Enter' && !e.ctrlKey) {
      e.preventDefault(); timingEditorPlaySyl(); return;
    }
    // Space — проиграть слог и перейти к следующему
    if (e.key === ' ' && !e.ctrlKey) {
      e.preventDefault(); timingEditorPlayStep(); return;
    }
    // Ctrl+Space — до конца
    if (e.key === ' ' && e.ctrlKey) {
      e.preventDefault(); timingEditorPlayOrPause('end'); return;
    }
    // Ctrl+Enter — до конца пады
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault(); timingEditorPlayOrPause('pada'); return;
    }
  }
});

// ── Library Export ──────────────────────────────────────────────────────────
window.exportToLibrary = function() {
  const id = document.getElementById('lib-id').value.trim() || 'verse_0_0';
  const titleRu = document.getElementById('lib-title-ru').value.trim() || 'Без названия';
  const titleEn = document.getElementById('lib-title-en').value.trim() || 'Untitled';
  const transRu = document.getElementById('lib-trans-ru').value.trim();
  const transEn = document.getElementById('lib-trans-en').value.trim();
  const diff = parseInt(document.getElementById('lib-diff').value) || 1;
  const tags = document.getElementById('lib-tags').value.split(',').map(s => s.trim()).filter(Boolean);
  
  const meter = document.getElementById('ft-meter').value.trim();
  const source = document.getElementById('ft-source').value.trim();
  const author = document.getElementById('ft-author').value.trim();
  
  // Minimal session to recreate the diagram
  const sessionData = {
    DATA: DATA,
    TAP: { 
      times: TAP.times,
      cheatY: TAP.cheatY
    },
    _padaBounds: window._padaBounds || null,
    // Note: audioB64 is NOT included in the library JSON to keep it small.
    // The library expects audio to be served via drive_file_id.
    // However, for immediate authoring re-import, one might want it.
    // Here we follow the roadmap: JSON for the library catalogue.
  };
  
  const verseData = {
    version: 1,
    id: id,
    title: { ru: titleRu, en: titleEn },
    source: source,
    meter: meter,
    difficulty: diff,
    tags: tags,
    s1: document.getElementById('s1dev').value.trim(),
    s2: document.getElementById('s2dev').value.trim(),
    translation: { ru: transRu, en: transEn },
    audio: {
      author: author,
      drive_file_id: "TODO"
    },
    session: {
      drive_file_id: "TODO",
      data: sessionData
    },
    created_at: new Date().toISOString().split('T')[0]
  };
  
  const blob = new Blob([JSON.stringify(verseData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = id + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  if (typeof showMsg === 'function') {
    showMsg('JSON для библиотеки скачан. Добавьте его в verses/data/', 'ok');
  }
};

window.downloadTimingJson = function() {
  const id = document.getElementById('lib-id')?.value?.trim();
  if (!id) { showMsg('Укажи ID шлоки в секции Library Export', 'err'); return; }

  const patch = {
    timing: {
      s1: TAP.times.s1 || [],
      s2: TAP.times.s2 || [],
      confidence: TAP.confidence || { s1: [], s2: [] },
      auto_generated: true,
      generator: 'browser-v1'
    }
  };

  const blob = new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${id}_timing_patch.json`;
  a.click();
  showMsg(`Скачай ${id}_timing_patch.json и вручную добавь поле timing в verses/data/${id}.json`, 'info');
};

// ── Global handler exposure (required when app.js runs as ES module) ─────────
// onclick= and SVG inline event handlers need these on window.
window.runPipeline             = runPipeline;
window._applySession           = _applySession; // student.html session loader + waitForApp gate
window.rebuildAll              = rebuildAll;
window.openSettings            = openSettings;
window.closeSettings           = closeSettings;
window.openHelp                = openHelp;
window.closeHelp               = closeHelp;
window.openTimingEditor        = openTimingEditor;
window.closeTimingEditor       = closeTimingEditor;
window.teSwitchMode            = teSwitchMode;
window.teMarkPadas             = teMarkPadas;
window.teAlignToStart          = teAlignToStart;
window.teAutoTimingAndSwitch   = teAutoTimingAndSwitch;
window.teResetTiming           = teResetTiming;
window.teSelectAdjacentSyl     = teSelectAdjacentSyl;
window.teShiftSyl              = teShiftSyl;
window.teR1Play                = teR1Play;
window.timingEditorPlayOrPause = timingEditorPlayOrPause;
window.timingEditorPlayStep    = timingEditorPlayStep;
window.timingEditorPlaySyl     = timingEditorPlaySyl;
window.timingEditorSetZoom     = timingEditorSetZoom;
window.downloadPng             = downloadPng;
window.downloadMp4             = downloadMp4;
window.downloadMp4Muxer        = downloadMp4Muxer;
window.downloadKaraokeMp4      = downloadKaraokeMp4;
window.downloadTelegramStoryMp4 = downloadTelegramStoryMp4;
window.showMeterInfo           = showMeterInfo;
window.ftDetectMeter           = ftDetectMeter;
window.forceSchemeDetect       = forceSchemeDetect;
window.scheduleSchemeDetect    = scheduleSchemeDetect;
window.waveScaleChanged        = waveScaleChanged;
window.applyColors             = applyColors;
window.applyColorPreset        = applyColorPreset;
window.applyCheatOpenSetting   = applyCheatOpenSetting;
window.applyMsgPosSetting      = applyMsgPosSetting;
window.saveDefaults            = saveDefaults;
window.onAudioFile             = onAudioFile;
window.onAudioDrop             = onAudioDrop;
window.saveSession             = saveSession;
window.loadSession             = loadSession;
window.runCrossCheck           = runCrossCheck;
window.closeCrossCheck         = closeCrossCheck;
window.showPng                 = showPng;
window.gdriveSave              = gdriveSave;
window.gdriveLoad              = gdriveLoad;
window._gdConfirm              = _gdConfirm;
window._gdDismiss              = _gdDismiss;
window._gdNewFolder            = _gdNewFolder;
window._gdCancelNewFolder      = _gdCancelNewFolder;
window._gdCreateFolder         = _gdCreateFolder;
window._gdToggleSort           = _gdToggleSort;
window._gdToggleView           = _gdToggleView;
window._mainHighlightStart     = _mainHighlightStart;
window._mainHighlightStop      = _mainHighlightStop;
window.ctxDelete               = ctxDelete;
window.ctxMoveRow              = ctxMoveRow;
window.ctxSetType              = ctxSetType;
// SVG node inline handlers (onmousedown/ontouchstart/oncontextmenu in SVG strings)
window.svgDragStart            = svgDragStart;
window.svgTouchStart           = svgTouchStart;
window.onSylCtx                = onSylCtx;
// Drive picker inline handlers (injected into innerHTML strings)
window._gdClickFolder          = _gdClickFolder;
window._gdSelectFile           = _gdSelectFile;
window._gdGoTo                 = _gdGoTo;
