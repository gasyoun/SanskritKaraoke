import sys

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('<aside class="sidebar">', '<aside class="sidebar" style="display:none">')

html = html.replace('<audio id="audio-preview" controls style="display:none;width:100%;margin-top:6px" onplay="_mainHighlightStart()" onpause="_mainHighlightStop()" onended="_mainHighlightStop()"></audio>', '')

main_area_end = html.find('</main>')
if main_area_end != -1:
    addition = """
  <div style="max-width: 800px; margin: 40px auto 0; text-align: center; padding: 20px;">
    <audio id="audio-preview" controls onplay="_mainHighlightStart()" onpause="_mainHighlightStop()" onended="_mainHighlightStop()" style="width:100%; max-width:600px; margin-bottom:15px; display:none;"></audio>
    <div id="translation-box" style="font-size:1.1rem; line-height:1.5; padding:15px; background:var(--card); border-radius:8px; border:1px solid var(--border); display:none;"></div>
  </div>
"""
    html = html[:main_area_end] + addition + html[main_area_end:]

header_div = html.find('<div style="display:flex;align-items:center;gap:14px">')
if header_div != -1:
    buttons = """<button id="btn-mode" onclick="cycleMode()" style="font-size:.72rem;font-family:'JetBrains Mono',monospace;padding:4px 12px;border:1px solid rgba(247,243,236,.3);border-radius:4px;background:transparent;color:#f7f3ec;cursor:pointer;letter-spacing:.08em">Mode: Full</button>
    <button id="btn-lang" onclick="toggleLang()" style="font-size:.72rem;font-family:'JetBrains Mono',monospace;padding:4px 12px;border:1px solid rgba(247,243,236,.3);border-radius:4px;background:transparent;color:#f7f3ec;cursor:pointer;letter-spacing:.08em">🌐 RU</button>
    """
    html = html[:header_div+54] + buttons + html[header_div+54:]

html = html.replace('</head>', """
<style>
  .sidebar { display: none !important; }
  .main { margin-left: 0 !important; width: 100% !important; }
  .mode-dots .syl-label { display: none !important; }
  .mode-blind .wave-layer, .mode-blind .svg-wrap { display: none !important; }
</style>
</head>
""")

script = """
<script src="src/scripts/strings.js"></script>
<script>
// Student Logic
document.addEventListener('contextmenu', e => {
  if (e.target.closest('svg')) e.preventDefault();
});

let currentVerse = null;
let currentMode = 1; 

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
      // Create empty state if no session
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
  const labels = {1: 'Mode: Full', 2: 'Mode: Dots', 3: 'Mode: Blind'};
  const classes = {1: '', 2: 'mode-dots', 3: 'mode-blind'};
  
  document.getElementById('btn-mode').textContent = labels[currentMode];
  
  const mainArea = document.getElementById('main-area');
  mainArea.className = 'main ' + classes[currentMode];
}

function toggleLang() {
  if (typeof setLang === 'function') {
    setLang(typeof LANG !== 'undefined' && LANG === 'ru' ? 'en' : 'ru');
    document.getElementById('btn-lang').textContent = '🌐 ' + LANG.toUpperCase();
    updateTranslation();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(loadStudentData, 300); // Give app.js time to init
});
</script>
"""
html = html.replace('</body>', script + '\n</body>')

with open('student.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("student.html generated")
