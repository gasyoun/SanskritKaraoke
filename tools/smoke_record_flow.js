// smoke_record_flow.js — H6317: the REAL record flow in a headless browser.
//
// Launches Chrome with --use-fake-device-for-media-stream (fake microphone
// playing a tone), opens student.html pointed at a LOCAL sk-grade server,
// clicks «🎙 Записать себя», records ~4 s, stops, and asserts the loop
// completes: MediaRecorder blob -> POST /api/grade -> rhythm % + drill hints
// rendered. The fake mic produces a steady tone, so the GRADE is meaningless
// (most syllables unsnapped) — this smoke proves the FLOW, not accuracy.
//
// Usage:
//   SK_GRADE_PORT=8791 python3 tools/serve_grade.py &
//   python3 -m http.server 8123 &            # repo root
//   node tools/smoke_record_flow.js [verseId]
const puppeteer = require('puppeteer');

const VERSE = process.argv[2] || 'subh_2745';
const HTTP = 'http://127.0.0.1:8123';
const GRADE = 'http://127.0.0.1:8791/api/grade';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.CHROME_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1400 });
  const netlog = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/grade')) netlog.push(r.url());
  });

  await page.goto(`${HTTP}/student.html?id=${VERSE}`,
                  { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate((u) => localStorage.setItem('sk_grade_url', u), GRADE);
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector('#rg-record-btn', { timeout: 30000 });

  // real click -> getUserMedia(fake mic) -> MediaRecorder
  await page.click('#rg-record-btn');
  const recording = await page.waitForFunction(
    () => {
      const el = document.getElementById('rg-status');
      return el && /идёт запись/i.test(el.textContent);
    },
    { timeout: 15000 }).then(() => true).catch(() => false);
  console.log('recording started (fake mic):', recording);
  if (!recording) {
    console.log('status was:',
      await page.$eval('#rg-status', (e) => e.textContent).catch(() => '?'));
    await browser.close(); process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 4000)); // ~4 s take
  await page.evaluate(() => {
    const b = document.getElementById('rg-record-btn');
    if (b && b.dataset.recording === '1') b.click();
  });

  // wait for the grade round-trip to finish rendering (a steady fake-mic
  // tone has no onsets -> the too_quiet path is the expected outcome)
  await page.waitForFunction(
    () => {
      const s = document.getElementById('rg-status');
      return s && (s.textContent.includes('Готово') ||
                   s.textContent.includes('слишком мало') ||
                   s.textContent.includes('Ошибка') ||
                   s.textContent.includes('недоступна'));
    }, { timeout: 60000 });

  const status = await page.$eval('#rg-status', (e) => e.textContent);
  const resultVisible = await page.$eval('#rg-result',
    (el) => el.style.display !== 'none' &&
            (/\d+%/.test(el.textContent) ||
             el.textContent.includes('Слишком мало услышано')));
  const resultText = await page.$eval('#rg-result',
    (el) => el.textContent.replace(/\s+/g, ' ').trim().slice(0, 160));
  const rings = (await page.$$('.rg-ring')).length;
  const greyCells = await page.$$eval('.rg-strip span',
    (spans) => spans.filter((s) => s.textContent.trim() === '—').length);
  console.log('status:', status);
  console.log('POST seen:', netlog.length, netlog[0] || '-');
  console.log('result card rendered:', resultVisible, '|', resultText);
  console.log('heat rings painted:', rings, '| grey not-sounded cells:', greyCells);

  const pass = resultVisible && netlog.length === 1;

  // re-record regression (user report 10-10-2026): after one graded take the
  // button must start a NEW recording, not no-op
  let reRecord = false;
  if (pass) {
    await page.click('#rg-record-btn');
    reRecord = await page.waitForFunction(
      () => {
        const el = document.getElementById('rg-status');
        return el && /идёт запись/i.test(el.textContent);
      },
      { timeout: 15000 }).then(() => true).catch(() => false);
    console.log('second recording starts:', reRecord);
    await page.evaluate(() => {
      const b = document.getElementById('rg-record-btn');
      if (b && b.dataset.recording === '1') b.click();
    });
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(pass && reRecord ? 'RECORD-FLOW SMOKE PASS' : 'RECORD-FLOW SMOKE FAIL');
  const card = await page.$('#record-grade-card');
  if (card) await card.screenshot({ path: '/tmp/h6317_record_flow.png' });
  await browser.close();
  process.exit(pass && reRecord ? 0 : 1);
})();
