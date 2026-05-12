import sys
import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Inject hidden div with required IDs
hidden_ids = [
    'dev-input', 's1dev', 's2dev', 's1iast', 's2iast', 'syl-mode-user', 
    'syl-mode-std', 'btn-go', 'msg', 'scheme-select', 'shloka-num', 
    'ft-year', 'ft-url', 'ft-author', 'ft-source', 'ft-meter', 
    'dl-wrap', 'mp4-block', 'audio-drop', 'audio-file', 'audio-name', 
    'tap-block', 'te-padas-info', 'tap-status', 'waveform-canvas', 
    'btn-mp4-muxer', 'btn-mp4', 'btn-karaoke-mp4', 'btn-story-mp4'
]

hidden_elements = '<div id="student-hidden-bridge" style="display:none !important;">'
for hid in hidden_ids:
    # We create empty versions of these to satisfy app.js
    if 'mode' in hid:
        hidden_elements += f'<input type="radio" id="{hid}">'
    elif 'btn' in hid:
        hidden_elements += f'<button id="{hid}"></button>'
    elif 'select' in hid:
        hidden_elements += f'<select id="{hid}"></select>'
    elif hid == 'audio-file':
        hidden_elements += f'<input type="file" id="{hid}">'
    elif 'input' in hid or 'ft-' in hid or hid == 'shloka-num':
        hidden_elements += f'<input type="text" id="{hid}">'
    else:
        hidden_elements += f'<div id="{hid}"></div>'
hidden_elements += '</div>'

# Remove sidebar entirely
html = re.sub(r'<aside class="sidebar">.*?</aside>', hidden_elements, html, flags=re.DOTALL)

# Fix CSS
html = html.replace('</head>', """
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
</style>
</head>
""")

# Inject student player controls into header
header_div_pattern = r'<div style="display:flex;align-items:center;gap:14px">.*?</div>'
header_controls = """<div style="display:flex;align-items:center;gap:14px">
    <button id="btn-mode" onclick="cycleMode()" style="font-size:.72rem;font-family:'JetBrains Mono',monospace;padding:4px 12px;border:1px solid rgba(247,243,236,.3);border-radius:4px;background:transparent;color:#f7f3ec;cursor:pointer;letter-spacing:.08em" data-i18n="modeFull">Mode: Full</button>
    <button id="btn-lang" onclick="toggleLang()" style="font-size:.72rem;font-family:'JetBrains Mono',monospace;padding:4px 12px;border:1px solid rgba(247,243,236,.3);border-radius:4px;background:transparent;color:#f7f3ec;cursor:pointer;letter-spacing:.08em">🌐 RU</button>
    <span class="om">ॐ</span>
  </div>"""
html = re.sub(header_div_pattern, header_controls, html, flags=re.DOTALL)

# Add SRS and Quiz panels after main content
main_end_tag = '</main>'
panels = """
  <div style="max-width: 800px; margin: 40px auto 0; text-align: center; padding: 20px;">
    <audio id="audio-preview" controls onplay="_mainHighlightStart()" onpause="_mainHighlightStop()" onended="onVerseEnded()" style="width:100%; max-width:600px; margin-bottom:15px; display:none;"></audio>
    <div id="translation-box" style="font-size:1.1rem; line-height:1.5; padding:15px; background:var(--card); border-radius:8px; border:1px solid var(--border); display:none;"></div>
    
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
"""
html = html.replace(main_end_tag, panels + main_end_tag)

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
  if (typeof updateSrsRecord === 'function') {
    updateSrsRecord(currentVerse.id, quality);
    updateStreak();
    window.location.href = 'progress.html';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(loadStudentData, 300);
});
</script>
</body>
""")

with open('student.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("student.html generated")
