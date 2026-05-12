let activeQuiz = null;

async function startMeterQuiz() {
  activeQuiz = 'meter';
  const qBox = document.getElementById('quiz-content');
  qBox.innerHTML = '<p>Загрузка викторины...</p>';
  
  let meters = ['anushtubh', 'indravajra', 'mandakranta', 'upajati', 'vasantatilaka', 'sragdhara'];
  try {
    const res = await fetch('verses/index.json');
    if (res.ok) {
      const data = await res.json();
      meters = [...new Set(data.verses.map(v => v.meter))];
    }
  } catch (e) {}
  
  const correct = (currentVerse && currentVerse.meter) ? currentVerse.meter : 'unknown';
  let distractors = meters.filter(m => m !== correct);
  distractors.sort(() => 0.5 - Math.random());
  
  let options = [correct, ...distractors.slice(0, 3)];
  options.sort(() => 0.5 - Math.random());
  
  let html = `<p style="font-weight:bold; margin-bottom:15px; font-size:1.1rem; color:var(--ink);">Квиз: Какой стихотворный размер в этой шлоке?</p><div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center;">`;
  options.forEach(opt => {
    html += `<button onclick="checkMeter('${opt}', '${correct}')" style="padding:10px 20px; font-size:1rem; cursor:pointer; background:var(--bg2); color:var(--ink); border:1px solid var(--border); border-radius:6px;">${opt}</button>`;
  });
  html += `</div>`;
  qBox.innerHTML = html;
}

function checkMeter(selected, correct) {
  const qBox = document.getElementById('quiz-content');
  if (selected === correct) {
    qBox.innerHTML = `<p style="color:var(--laghu); font-size:1.2rem; font-weight:bold;">✅ Верно! Это ${correct}.</p>`;
  } else {
    qBox.innerHTML = `<p style="color:var(--guru); font-size:1.2rem; font-weight:bold;">❌ Ошибка. Правильный ответ: ${correct}.</p>`;
  }
  setTimeout(() => { activeQuiz = null; endQuiz(); }, 2500);
}

function startFillInQuiz() {
  activeQuiz = 'fillin';
  const qBox = document.getElementById('quiz-content');
  
  let allSyls = [];
  if (typeof DATA !== 'undefined') {
    if (DATA.s1) allSyls = allSyls.concat(DATA.s1);
    if (DATA.s2) allSyls = allSyls.concat(DATA.s2);
  }
  
  if (allSyls.length === 0) {
    activeQuiz = null; endQuiz(); return;
  }
  
  // Pick random valid syllable
  const validSyls = allSyls.filter(s => s.syl && s.syl.trim() !== '');
  const target = validSyls[Math.floor(Math.random() * validSyls.length)];
  const correctText = target.syl;
  
  // Hide its label in SVG
  const svgs = document.querySelectorAll('.syl-label');
  let targetNode = null;
  svgs.forEach(node => {
    if (node.textContent === target.devSyl || node.textContent === target.syl) {
      targetNode = node;
      node.style.visibility = 'hidden';
    }
  });
  
  qBox.innerHTML = `
    <p style="font-weight:bold; margin-bottom:15px; font-size:1.1rem; color:var(--ink);">Квиз (Fill-in): Во время воспроизведения впишите скрытый слог:</p>
    <div style="display:flex; justify-content:center; gap:10px;">
      <input type="text" id="fillin-input" placeholder="Введите слог..." style="padding:10px; font-size:1rem; border-radius:4px; border:1px solid var(--border); background:var(--bg); color:var(--ink); width:200px;">
      <button onclick="checkFillIn('${correctText}')" style="padding:10px 20px; font-size:1rem; cursor:pointer; background:var(--accent,#357bdd); color:#fff; border:none; border-radius:4px;">Ответить</button>
    </div>
    <p id="fillin-res" style="margin-top:15px; font-size:1.1rem;"></p>
  `;
  
  const audio = document.getElementById('audio-preview');
  audio.currentTime = 0;
  audio.play();
  if (typeof _mainHighlightStart === 'function') _mainHighlightStart();
  
  window._fillinNode = targetNode;
}

function checkFillIn(correct) {
  const val = document.getElementById('fillin-input').value.trim();
  const res = document.getElementById('fillin-res');
  let devCorrect = correct;
  if (typeof DATA !== 'undefined') {
      const f = (DATA.s1||[]).concat(DATA.s2||[]).find(s=>s.syl===correct);
      if(f) devCorrect = f.devSyl;
  }

  if (val.toLowerCase() === correct.toLowerCase() || val === devCorrect) {
    res.innerHTML = `<span style="color:var(--laghu); font-weight:bold;">✅ Верно!</span>`;
  } else {
    res.innerHTML = `<span style="color:var(--guru); font-weight:bold;">❌ Ошибка. Правильно: ${correct} (${devCorrect})</span>`;
  }
  if (window._fillinNode) window._fillinNode.style.visibility = 'visible';
  setTimeout(() => { activeQuiz = null; endQuiz(); }, 2500);
}

function startBeatTapQuiz() {
  activeQuiz = 'beattap';
  const qBox = document.getElementById('quiz-content');
  
  qBox.innerHTML = `
    <p style="font-weight:bold; margin-bottom:15px; font-size:1.1rem; color:var(--ink);">Квиз (Beat Tap): Звук отключен. Нажимайте G или L синхронно с подсветкой.</p>
    <div style="font-size:2rem; margin:15px 0;">
      <button onclick="recordTap('guru')" style="padding:15px 30px; margin:0 10px; cursor:pointer; background:var(--bg2); color:var(--ink); border:1px solid var(--border); border-radius:8px; font-weight:bold;">G (Гуру)</button>
      <button onclick="recordTap('laghu')" style="padding:15px 30px; margin:0 10px; cursor:pointer; background:var(--bg2); color:var(--ink); border:1px solid var(--border); border-radius:8px; font-weight:bold;">L (Лагху)</button>
    </div>
    <p id="beattap-res" style="font-size:1.1rem; height:1.5em;"></p>
  `;
  
  window._tapScore = 0;
  window._tapTotal = 0;
  
  const audio = document.getElementById('audio-preview');
  audio.currentTime = 0;
  audio.muted = true;
  audio.play();
  if (typeof _mainHighlightStart === 'function') _mainHighlightStart();
}

function recordTap(type) {
  const audio = document.getElementById('audio-preview');
  const t = audio.currentTime;
  
  let activeSyl = null;
  let idx = -1;
  if (typeof _currentSylIndex === 'function') {
    idx = _currentSylIndex('s1', t);
    if (idx >= 0) activeSyl = DATA.s1[idx];
    else {
      idx = _currentSylIndex('s2', t);
      if (idx >= 0) activeSyl = DATA.s2[idx];
    }
  }
  
  const res = document.getElementById('beattap-res');
  if (!activeSyl) {
    res.innerHTML = `<span style="color:var(--ink2)">Мимо (нет подсвеченного слога)</span>`;
    return;
  }
  
  window._tapTotal++;
  if (activeSyl.type === type) {
    window._tapScore++;
    res.innerHTML = `<span style="color:var(--laghu); font-weight:bold;">✅ Верно! (${activeSyl.syl} = ${activeSyl.type})</span>`;
  } else {
    res.innerHTML = `<span style="color:var(--guru); font-weight:bold;">❌ Ошибка! (${activeSyl.syl} = ${activeSyl.type})</span>`;
  }
}

function onQuizAudioEnd() {
  if (activeQuiz === 'beattap') {
    const audio = document.getElementById('audio-preview');
    audio.muted = false;
    if (typeof _mainHighlightStop === 'function') _mainHighlightStop();
    const qBox = document.getElementById('quiz-content');
    qBox.innerHTML = `<p style="font-weight:bold; font-size:1.2rem; color:var(--ink);">Тест завершен! Результат: ${window._tapScore} / ${window._tapTotal}</p>`;
    setTimeout(() => { activeQuiz = null; endQuiz(); }, 3000);
  } else if (activeQuiz === 'fillin') {
    // Audio ended but they haven't answered yet. Just leave it open.
  }
}

function triggerQuizCycle() {
  document.getElementById('srs-panel').style.display = 'none';
  document.getElementById('quiz-panel').style.display = 'block';
  
  let currentQuizType = parseInt(localStorage.getItem('shloka_quiz_type') || '0', 10);
  if (currentQuizType === 0) startMeterQuiz();
  else if (currentQuizType === 1) startFillInQuiz();
  else startBeatTapQuiz();
  
  localStorage.setItem('shloka_quiz_type', (currentQuizType + 1) % 3);
}

function endQuiz() {
  document.getElementById('quiz-panel').style.display = 'none';
  document.getElementById('srs-panel').style.display = 'block';
}
