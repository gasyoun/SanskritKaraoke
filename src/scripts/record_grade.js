// record_grade.js — «запиши себя и получи оценку» (H6317, RU-first).
//
// Record flow: MediaRecorder (audio-only; the video-export pattern lives in
// app.js:1406) -> POST raw audio to the scoring endpoint (tools/serve_grade.py
// on vps92) -> render: rhythm %, per-syllable heat rings on the existing wave
// SVG (g.syl-node[data-key][data-col]), a numeric per-syllable strip under
// each wave, and the 3-weakest-syllables drill hints.
//
// Endpoint: window.SK_GRADE_URL > localStorage.sk_grade_url > production
// default (samskrte.ru/sk-grade). Heat rings are additive overlays — the
// original SVG is untouched and restored on re-record.

(() => {
  'use strict';

  const DEFAULT_ENDPOINT = 'https://samskrte.ru/sk-grade/api/grade';
  const MAX_RECORD_S = 90;
  const HEAT = {
    ok:   '#2E7D32',
    warn: '#F9A825',
    bad:  '#EF6C00',
    miss: '#C62828',
  };

  const gradeEndpoint = () =>
    (window.SK_GRADE_URL || localStorage.getItem('sk_grade_url') ||
     DEFAULT_ENDPOINT).trim();

  const verseId = () => {
    const qp = new URLSearchParams(location.search).get('id');
    if (qp) return qp;
    const cv = window.currentVerse;
    return cv && cv.id ? cv.id : null;
  };

  // ── UI ───────────────────────────────────────────────────────────────────
  function buildCard() {
    const card = document.createElement('div');
    card.id = 'record-grade-card';
    card.style.cssText =
      'border:1px solid var(--border);border-radius:6px;padding:10px 12px;' +
      'margin:12px 0;background:var(--card)';
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button id="rg-record-btn"
          style="font-size:.85rem;padding:7px 16px;border:1px solid var(--gold);
                 border-radius:5px;background:var(--bg2);color:var(--gold);
                 cursor:pointer;font-family:inherit">🎙 Записать себя</button>
        <span id="rg-status" style="font-size:.72rem;color:var(--ink2);
              font-family:'JetBrains Mono',monospace"></span>
      </div>
      <div id="rg-result" style="display:none;margin-top:10px"></div>`;
    const style = document.createElement('style');
    style.textContent = `
      #rg-record-btn.rg-rec-live {
        background: #C62828 !important;
        border-color: #C62828 !important;
        color: #fff !important;
        animation: rg-pulse 1.2s ease-in-out infinite;
      }
      @keyframes rg-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(198, 40, 40, .45); }
        50% { box-shadow: 0 0 0 7px rgba(198, 40, 40, 0); }
      }`;
    card.appendChild(style);
    return card;
  }

  const status = (msg, cls) => {
    const el = document.getElementById('rg-status');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = cls === 'err' ? '#C62828'
      : cls === 'ok' ? '#2E7D32'
      : cls === 'rec' ? '#C62828'
      : 'var(--ink2)';
    el.style.fontWeight = cls === 'rec' ? '700' : '400';
  };

  function verdict(rhythm) {
    if (rhythm >= 85) return 'Отличный ритм!';
    if (rhythm >= 70) return 'Хороший ритм, есть куда расти.';
    return 'Ритм плывёт — отработай слабые слоги ниже.';
  }

  function renderResult(res) {
    const box = document.getElementById('rg-result');
    if (!box) return;
    const chips = (res.weakest3 || []).map((w) =>
      `<span title="пада ${w.pada === 's1' ? '1' : '2'}, слог №${w.index + 1} (${w.grade} баллов)"
        style="display:inline-block;margin:2px 6px 2px 0;padding:3px 10px;
               border:1px solid ${HEAT[w.grade >= 60 ? 'warn' : 'bad']};
               border-radius:12px;font-size:.78rem;
               color:${HEAT[w.grade >= 60 ? 'warn' : 'bad']}">
        ${w.hint}
      </span>`).join('');
    box.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
        <span style="font-size:1.7rem;font-weight:700;color:var(--gold)">
          ${Math.round(res.rhythm_percent)}%</span>
        <span style="font-size:.85rem">${verdict(res.rhythm_percent)}</span>
        <span style="font-size:.65rem;color:var(--ink2);
              font-family:'JetBrains Mono',monospace">
          ритм · эталон: ${res.reference_source === 'verse.timing'
            ? 'звуковая дорожка Уши Санка' : 'dev-фикстура'}</span>
      </div>
      ${res.weakest3 && res.weakest3.length ? `
        <div style="margin-top:6px;font-size:.72rem;color:var(--ink2)">
          Отработай три самых слабых слога:</div>
        <div style="margin-top:2px">${chips}</div>` : ''}
      <div style="margin-top:6px;font-size:.62rem;color:var(--ink2)">
        Кольца на диаграмме: <span style="color:${HEAT.ok}">зелёный ≥80</span>
        · <span style="color:${HEAT.warn}">жёлтый ≥60</span>
        · <span style="color:${HEAT.bad}">оранжевый ≥40</span>
        · <span style="color:${HEAT.miss}">красный &lt;40 / не услышан</span>
      </div>`;
    box.style.display = '';
  }

  // ── heat-map on the wave SVG ─────────────────────────────────────────────
  function clearHeat() {
    document.querySelectorAll('.rg-ring, .rg-strip').forEach((el) => el.remove());
  }

  function heatClass(grade) {
    if (grade >= 80) return 'ok';
    if (grade >= 60) return 'warn';
    if (grade >= 40) return 'bad';
    return 'miss';
  }

  function paintHeat(res) {
    clearHeat();
    ['s1', 's2'].forEach((key) => {
      const rows = (res.per_syllable && res.per_syllable[key]) || [];
      if (!rows.length) return;

      rows.forEach((row) => {
        const node = document.querySelector(
          `g.syl-node[data-key="${key}"][data-col="${row.index}"]`);
        if (!node) return;
        const svg = node.ownerSVGElement;
        const circle = node.querySelector('circle');
        if (!circle || !svg) return;
        const color = HEAT[heatClass(row.grade)];
        const ns = 'http://www.w3.org/2000/svg';
        const ring = document.createElementNS(ns, 'circle');
        ring.setAttribute('class', 'rg-ring');
        ring.setAttribute('cx', circle.getAttribute('cx'));
        ring.setAttribute('cy', circle.getAttribute('cy'));
        ring.setAttribute('r', (+circle.getAttribute('r') || 8) + 3);
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', color);
        ring.setAttribute('stroke-width', '2.5');
        const sign = row.delta_ms === null ? ''
          : (row.delta_ms > 0 ? '+' : '') + row.delta_ms + ' мс';
        const title = document.createElementNS(ns, 'title');
        title.textContent = row.snapped
          ? `${row.syl} — ${row.grade} баллов (${sign})`
          : `${row.syl} — не услышан`;
        ring.appendChild(title);
        node.appendChild(ring);
      });

      const block = document.getElementById(`block-${key}`);
      const wave = block && block.querySelector('.wave-svg-wrap');
      if (!wave) return;
      const strip = document.createElement('div');
      strip.className = 'rg-strip';
      strip.style.cssText =
        'display:flex;flex-wrap:wrap;gap:2px;margin-top:4px;font-size:.6rem;' +
        "font-family:'JetBrains Mono',monospace";
      strip.innerHTML = rows.map((row) => {
        const cls = heatClass(row.grade);
        return `<span title="${row.syl} ${row.snapped
          ? (row.delta_ms > 0 ? '+' : '') + row.delta_ms + ' мс'
          : 'не услышан'}"
          style="min-width:2.1em;text-align:center;padding:1px 2px;
                 border-radius:2px;color:#fff;background:${HEAT[cls]}">
          ${row.grade}</span>`;
      }).join('');
      wave.insertAdjacentElement('afterend', strip);
    });
  }

  // ── record + grade ───────────────────────────────────────────────────────
  let recorder = null;
  let recordTimer = null;
  let busy = false;

  function stopRecorder() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  async function startRecording(btn) {
    const id = verseId();
    if (!id) {
      status('Не найден стих (?id=…)', 'err');
      return;
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      status('Браузер не поддерживает запись звука', 'err');
      return;
    }
    busy = true;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      busy = false;
      status('Микрофон недоступен: ' + e.message, 'err');
      return;
    }

    const mimeType =
      MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';
    recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      busy = false;
      delete btn.dataset.recording;
      btn.classList.remove('rg-rec-live');
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(recordTimer);
      btn.textContent = '🎙 Записать себя';
      btn.disabled = false;
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      if (blob.size < 2000) {
        status('Запись пустая — попробуй ещё раз', 'err');
        return;
      }
      await gradeBlob(blob, btn);
    };

    // The button shows the recording state itself: red, pulsing dot, live
    // seconds — no way to miss that the take is under way.
    btn.classList.add('rg-rec-live');
    btn.dataset.recording = '1';
    btn.textContent = '⏹ 0 с — остановить и оценить';
    status('● ИДЁТ ЗАПИСЬ — прочитай стих вслух, затем нажми остановить', 'rec');
    const t0 = Date.now();
    recordTimer = setInterval(() => {
      const s = Math.round((Date.now() - t0) / 1000);
      btn.textContent = `⏹ ${s} с — остановить и оценить`;
      status(`● ИДЁТ ЗАПИСЬ… ${s} с (максимум ${MAX_RECORD_S})`, 'rec');
      if (s >= MAX_RECORD_S) stopRecorder();
    }, 500);

    recorder.onerror = () => stopRecorder();
    recorder.start(500);
    busy = false;
  }

  async function gradeBlob(blob, btn) {
    status('Оцениваю…', '');
    btn.disabled = true;
    try {
      const res = await fetch(
        `${gradeEndpoint()}?verse=${encodeURIComponent(verseId() || '')}`,
        { method: 'POST', body: blob,
          headers: { 'Content-Type': blob.type || 'audio/webm' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        status(data.error || `Ошибка сервера (${res.status})`, 'err');
        return;
      }
      renderResult(data);
      paintHeat(data);
      status(`Готово: ритм ${Math.round(data.rhythm_percent)}%`, 'ok');
    } catch (e) {
      status('Сеть недоступна — сервер оценки не отвечает', 'err');
    } finally {
      btn.disabled = false;
    }
  }

  // ── init ─────────────────────────────────────────────────────────────────
  function init() {
    if (document.getElementById('rg-record-btn')) return;
    const anchor = document.getElementById('audio-preview');
    if (!anchor || !anchor.parentNode) return;
    const card = buildCard();
    anchor.insertAdjacentElement('afterend', card);
    const btn = document.getElementById('rg-record-btn');
    // ONE permanent handler for the button's whole life: stop while recording,
    // start otherwise. startRecording used to overwrite onclick with a bare
    // stop-recorder — after one graded take the button no-op'd (user report
    // 10-10-2026). The busy flag guards the async getUserMedia window.
    btn.onclick = () => {
      if (busy) return;
      if (recorder && recorder.state === 'recording') stopRecorder();
      else startRecording(btn);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.SKRecordGrade = { init, repaint: paintHeat, render: renderResult, clear: clearHeat };
})();
