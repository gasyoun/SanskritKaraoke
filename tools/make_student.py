import sys
import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Inject hidden div with required IDs (Bug 11 improvements)
hidden_ids = [
    'dev-input', 's1dev', 's2dev', 's1iast', 's2iast', 'syl-mode-user', 
    'syl-mode-std', 'btn-go', 'msg', 'shloka-num', 
    'ft-year', 'ft-url', 'ft-author', 'ft-source', 'ft-meter', 
    'dl-wrap', 'mp4-block', 'audio-drop', 'audio-name', 
    'tap-block', 'te-padas-info', 'tap-status', 'waveform-canvas', 
    'btn-mp4-muxer', 'btn-mp4', 'btn-karaoke-mp4', 'btn-story-mp4'
]

# Specifically extract scheme-select with all its options
scheme_select_match = re.search(r'<select id="scheme-select".*?</select>', html, re.DOTALL)
scheme_select_stub = scheme_select_match.group(0) if scheme_select_match else '<select id="scheme-select"></select>'

hidden_elements = '<div id="student-hidden-bridge" style="display:none !important;">'
for hid in hidden_ids:
    if hid == 'dev-input':
        hidden_elements += f'<textarea id="{hid}"></textarea>'
    elif 'mode' in hid:
        hidden_elements += f'<input type="radio" id="{hid}">'
    elif hid == 'btn-go':
        hidden_elements += f'<button id="{hid}" onclick="runPipeline()"></button>'
    elif 'btn' in hid:
        hidden_elements += f'<button id="{hid}"></button>'
    elif hid == 'audio-file':
        hidden_elements += f'<input type="file" id="{hid}" onchange="onAudioFile(this)">'
    elif 'input' in hid or 'ft-' in hid or hid == 'shloka-num':
        hidden_elements += f'<input type="text" id="{hid}">'
    else:
        hidden_elements += f'<div id="{hid}"></div>'
hidden_elements += scheme_select_stub
hidden_elements += '</div>'

# Remove sidebar entirely
html = re.sub(r'<aside class="sidebar">.*?</aside>', hidden_elements, html, flags=re.DOTALL)

# Fix CSS (Bug 1: mode-blind class)
html = html.replace('</head>', """
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<link rel="manifest" href="manifest.json">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="src/icons/icon-192.png">
<style>
  .main { margin-left: 0 !important; width: 100% !important; }
  .mode-dots .syl-label { display: none !important; }
  .mode-blind .wave-layer, .mode-blind .wave-svg-wrap { display: none !important; }
  #quiz-panel, #srs-panel { 
    background: var(--card); 
    border: 1px solid var(--border); 
    border-radius: 8px; 
    padding: 20px; 
    margin: 20px auto; 
    max-width: 600px;
  }
  @media (max-width: 600px) {
    header { padding: 10px !important; flex-wrap: wrap; height: auto !important; }
    header .om { display: none; }
    .main { padding: 10px !important; }
    .shloka-block { margin-bottom: 20px !important; }
    .wave-svg-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .wave-svg-wrap svg { min-width: 600px; }
    #translation-box { font-size: 0.95rem !important; cursor: pointer; }
    #translation-box.collapsed { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    #quiz-panel, #srs-panel { margin: 10px; padding: 15px; }
    .mobile-hide { display: none !important; }
    .mobile-only { display: block !important; }
  }
  .mobile-only { display: none; }
</style>
</head>
""")

# Inject student player controls into header
header_div_pattern = r'<div style="display:flex;align-items:center;gap:14px">.*?</div>'
header_controls = """<div style="display:flex;align-items:center;gap:14px">
    <a href="catalogue.html" style="font-size:.72rem;font-family:'JetBrains Mono',monospace;padding:4px 12px;border:1px solid rgba(247,243,236,.3);border-radius:4px;background:transparent;color:#f7f3ec;text-decoration:none;cursor:pointer;letter-spacing:.08em" data-i18n="catalogHeading">📚 Каталог</a>
    <button id="btn-mode" class="mobile-hide" onclick="cycleMode()" style="font-size:.72rem;font-family:'JetBrains Mono',monospace;padding:4px 12px;border:1px solid rgba(247,243,236,.3);border-radius:4px;background:transparent;color:#f7f3ec;cursor:pointer;letter-spacing:.08em" data-i18n="modeFull">Mode: Full</button>
    <button id="btn-lang" class="mobile-hide" onclick="toggleLang()" style="font-size:.72rem;font-family:'JetBrains Mono',monospace;padding:4px 12px;border:1px solid rgba(247,243,236,.3);border-radius:4px;background:transparent;color:#f7f3ec;cursor:pointer;letter-spacing:.08em">🌐 RU</button>
    <button onclick="openHelp()" style="font-size:.72rem;font-family:'JetBrains Mono',monospace;padding:4px 12px;border:1px solid rgba(247,243,236,.3);border-radius:4px;background:transparent;color:#f7f3ec;cursor:pointer;letter-spacing:.08em">?</button>
    <span class="om">ॐ</span>
  </div>"""
html = re.sub(header_div_pattern, header_controls, html, flags=re.DOTALL)

# Bug 9: Inject panels before sentinel
main_sentinel = '<!-- END MAIN CONTENT -->'
panels = """
  <div style="max-width: 800px; margin: 40px auto 0; text-align: center; padding: 20px;">
    <audio id="audio-preview" controls onplay="_mainHighlightStart()" onpause="_mainHighlightStop()" onended="onVerseEnded()" style="width:100%; max-width:600px; margin-bottom:15px; display:none;"></audio>
    <div id="translation-box" class="collapsed" onclick="this.classList.toggle('collapsed')" style="font-size:1.1rem; line-height:1.5; padding:15px; background:var(--card); border-radius:8px; border:1px solid var(--border); display:none;"></div>
    
    <div id="quiz-panel" style="display:none;">
      <div id="quiz-content"></div>
    </div>
    
    <div id="srs-panel" style="display:none;">
      <p style="margin-bottom:15px; font-size:1.1rem; color:var(--ink); font-weight:bold;" data-i18n="srsPrompt">Как хорошо вы запомнили?</p>
      <div style="display:flex; justify-content:center; gap:20px;">
        <button onclick="submitSrs(1)" style="font-size:2rem; cursor:pointer; background:none; border:none;">😕</button>
        <button onclick="submitSrs(3)" style="font-size:2rem; cursor:pointer; background:none; border:none;">😐</button>
        <button onclick="submitSrs(5)" style="font-size:2rem; cursor:pointer; background:none; border:none;">😊</button>
      </div>
      <div style="margin-top:20px;">
        <a href="progress.html" style="color:var(--accent); text-decoration:none; font-size:0.9rem;" data-i18n="catalogHeading">Посмотреть прогресс</a>
      </div>
    </div>
  </div>

  <!-- Mobile Bottom Bar -->
  <div class="mobile-only mobile-nav">
    <button onclick="cycleMode()" style="font-size:.72rem;font-family:'JetBrains Mono',monospace;border:1px solid rgba(247,243,236,.3);border-radius:4px;background:var(--accent);color:#fff;cursor:pointer;margin-right:10px" data-i18n="modeFull">Mode: Full</button>
    <button onclick="toggleLang()" style="font-size:.72rem;font-family:'JetBrains Mono',monospace;border:1px solid rgba(247,243,236,.3);border-radius:4px;background:var(--bg2);color:var(--ink);cursor:pointer">🌐 RU/EN</button>
  </div>
"""
html = html.replace(main_sentinel, panels + main_sentinel)

# Bug 16: Replace help modal content
student_help = """
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:28px;border-bottom:2px solid var(--gold);padding-bottom:16px">
    <div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);margin-bottom:4px">Sanskrit Karaoke</div>
      <h2 style="font-size:1.5rem;font-weight:700;margin:0;color:var(--ink);letter-spacing:.03em">Помощь для ученика</h2>
    </div>
    <button onclick="closeHelp()" style="font-size:1.3rem;border:none;background:none;cursor:pointer;color:var(--ink2);line-height:1;padding:4px 8px;border-radius:4px">✕</button>
  </div>
  <p class="help-sec">Как читать волновой график</p>
  <p class="help-body">• <b>Цвет:</b> Синий = тяжелый слог (гуру), Зеленый = легкий (лагху).<br>• <b>Высота:</b> 5 рядов показывают высоту тона (мелодию). 1 — верхний, 5 — нижний.</p>
  <p class="help-sec">Режимы обучения (кнопка Mode)</p>
  <p class="help-body">• <b>Full:</b> Виден текст и мелодия.<br>• <b>Dots:</b> Текст скрыт, видны только "шарики" мелодии. Вспомните текст по ритму!<br>• <b>Blind:</b> График скрыт. Пойте полностью по памяти.</p>
  <p class="help-sec">Интервальное повторение (SRS)</p>
  <p class="help-body">После прослушивания оцените себя: 😊 (легко), 😐 (с трудом), 😕 (забыл). Система сама назначит следующее время для повторения.</p>
  <p class="help-sec">Тесты</p>
  <p class="help-body">• <b>Meter ID:</b> Угадайте название размера.<br>• <b>Fill-in:</b> Впишите пропущенный слог во время пения.<br>• <b>Beat Tap:</b> Нажимайте G (гуру) или L (лагху) в такт подсветке. Можно использовать клавиши G и L на клавиатуре.</p>
"""
html = re.sub(r'<div id="help-overlay".*?>(.*?)</div>\s*</div>', 
              r'<div id="help-overlay" style="display:none;position:fixed;inset:0;background:rgba(24,18,12,.75);z-index:300;overflow-y:auto;padding:30px 20px;box-sizing:border-box" onclick="if(event.target===this)closeHelp()"><div style="max-width:820px;margin:0 auto;background:var(--card);border-radius:12px;padding:36px 40px;font-family:\'JetBrains Mono\',monospace;font-size:.7rem;color:var(--ink);box-shadow:0 16px 60px rgba(0,0,0,.4)">' + student_help + '</div></div>', 
              html, flags=re.DOTALL)

# Update scripts
html = html.replace('</body>', """
<script src="src/scripts/strings.js"></script>
<script src="src/scripts/srs.js"></script>
<script src="src/scripts/quizzes.js"></script>
<script>
// Student Logic
document.addEventListener('contextmenu', e => {
  if (e.target.closest('svg')) e.preventDefault();
});

let currentVerse = null;
let currentMode = 1; 
let versePlayedCount = 0;

// Bug 15: Safe wait for app.js
function waitForApp(cb, retries = 20) {
  if (typeof _applySession === 'function') { cb(); return; }
  if (retries > 0) setTimeout(() => waitForApp(cb, retries - 1), 100);
  else console.error('app.js failed to load');
}

async function loadStudentData() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    document.getElementById('translation-box').textContent = "No verse ID provided. Use ?id=bhg_2_47";
    document.getElementById('translation-box').style.display = "block";
    return;
  }

  try {
    const res = await fetch(`verses/data/${id}.json`);
    if (!res.ok) throw new Error('Verse not found');
    currentVerse = await res.json();
    
    if (currentVerse.session && currentVerse.session.drive_file_id && currentVerse.session.drive_file_id !== 'TODO') {
      const sessionId = currentVerse.session.drive_file_id;
      const sessionUrl = `https://www.googleapis.com/drive/v3/files/${sessionId}?alt=media&key=${GDRIVE.apiKey}`;
      const sessionRes = await fetch(sessionUrl);
      if (sessionRes.ok) {
        const sessionJson = await sessionRes.json();
        _applySession(sessionJson);
        const empty = document.querySelector('.empty');
        if (empty) empty.style.display = 'none';
      }
    } else {
      document.getElementById('dev-input').value = currentVerse.s1 + '\\n' + currentVerse.s2;
      document.getElementById('btn-go').click();
    }

    if (currentVerse.audio && currentVerse.audio.drive_file_id && currentVerse.audio.drive_file_id !== 'TODO') {
      const audioId = currentVerse.audio.drive_file_id;
      const audioUrl = `https://www.googleapis.com/drive/v3/files/${audioId}?alt=media&key=${GDRIVE.apiKey}`;
      const audioEl = document.getElementById('audio-preview');
      audioEl.src = audioUrl;
      audioEl.style.display = 'block';
    }

    updateTranslation();

  } catch (err) {
    console.error(err);
    document.getElementById('translation-box').textContent = "Error loading verse data.";
    document.getElementById('translation-box').style.display = "block";
  }
}

function updateTranslation() {
  if (!currentVerse || !currentVerse.translation) return;
  const lang = typeof LANG !== 'undefined' ? LANG : 'ru';
  const tBox = document.getElementById('translation-box');
  tBox.style.display = 'block';
  tBox.textContent = currentVerse.translation[lang] || currentVerse.translation['ru'] || '';
}

function cycleMode() {
  currentMode = (currentMode % 3) + 1;
  const labels = {1: 'modeFull', 2: 'modeDots', 3: 'modeBlind'};
  const classes = {1: '', 2: 'mode-dots', 3: 'mode-blind'};
  
  const btn = document.getElementById('btn-mode');
  btn.setAttribute('data-i18n', labels[currentMode]);
  if (typeof t === 'function') btn.textContent = 'Mode: ' + t(labels[currentMode]);
  
  const mainArea = document.getElementById('main-area');
  mainArea.className = 'main ' + classes[currentMode];
}

function toggleLang() {
  if (typeof setLang === 'function') {
    setLang(typeof LANG !== 'undefined' && LANG === 'ru' ? 'en' : 'ru');
    updateTranslation();
  }
}

function onVerseEnded() {
  if (typeof _mainHighlightStop === 'function') _mainHighlightStop();
  versePlayedCount++;
  
  if (typeof activeQuiz !== 'undefined' && activeQuiz) {
    if (typeof onQuizAudioEnd === 'function') onQuizAudioEnd();
  } else if (versePlayedCount === 1) {
    if (typeof triggerQuizCycle === 'function') {
      triggerQuizCycle();
    } else {
      document.getElementById('srs-panel').style.display = 'block';
    }
  } else {
    if (!activeQuiz) document.getElementById('srs-panel').style.display = 'block';
  }
}

function submitSrs(quality) {
  if (!currentVerse) return;
  if (typeof updateSrs === 'function') { // Bug 10 fix
    updateSrs(currentVerse.id, quality);
    updateStreak();
    window.location.href = 'progress.html';
  }
}

// Telegram Back Button
if (window.Telegram && window.Telegram.WebApp) {
  const tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();
  if (tg.colorScheme === 'dark') document.body.classList.add('tg-dark');
  
  tg.BackButton.show();
  tg.BackButton.onClick(() => {
    window.location.href = 'catalogue.html';
  });
}

// Register Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

window.addEventListener('DOMContentLoaded', () => waitForApp(loadStudentData));
</script>
</body>
""")

with open('student.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("student.html generated")
