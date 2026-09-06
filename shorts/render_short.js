#!/usr/bin/env node
/**
 * shorts/render_short.js — deterministic 9:16 short renderer (H4265 video pilot).
 *
 * A clip is a self-contained 1080x1920 storyboard page under
 * shorts/clips/<name>/index.html exposing:
 *   window.__meta   — { id, title, duration, captions: [{t0, t1, text}] }
 *   window.__seek(t) — sets the whole frame state for time t (no CSS timers:
 *                      every visual is a pure function of t, so frames are
 *                      deterministic and re-renders are byte-stable).
 *
 * This script loads the page in headless Chrome, walks t frame by frame,
 * screenshots each frame, and muxes the sequence with ffmpeg into
 * dist/shorts/<id>_9x16.mp4 (+ <id>.srt caption sidecar). A silent AAC
 * track is added for platform compatibility.
 *
 * Usage:
 *   node shorts/render_short.js <name> [more names...] [--fps 30] [--out dist/shorts]
 *                               [--quality 92] [--keep-frames]
 *
 * Depends on: puppeteer (npm install --prefix tools), ffmpeg on PATH.
 * MP4s stay local (dist/ is gitignored) — the committed artifact is the
 * template under shorts/.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawnSync } = require('child_process');
const puppeteer = require(path.join(__dirname, '..', 'tools', 'node_modules', 'puppeteer'));

// ── CLI ────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const clips = [];
let fps = 30;
let outDir = path.resolve('dist', 'shorts');
let quality = 92;
let keepFrames = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--fps') fps = parseInt(argv[++i], 10);
  else if (a === '--out') outDir = path.resolve(argv[++i]);
  else if (a === '--quality') quality = parseInt(argv[++i], 10);
  else if (a === '--keep-frames') keepFrames = true;
  else if (a === '--help' || a === '-h') { console.log(__docHint()); process.exit(0); }
  else clips.push(a);
}
if (!clips.length) { console.error('No clips given. Usage: node shorts/render_short.js <name>... [--fps 30] [--out dist/shorts]'); process.exit(1); }
for (const name of clips) {
  const p = path.join(__dirname, 'clips', name, 'index.html');
  if (!fs.existsSync(p)) { console.error(`Unknown clip: ${name} (missing ${p})`); process.exit(1); }
}

function __docHint() { return 'node shorts/render_short.js <name>... [--fps 30] [--out dist/shorts] [--quality 92] [--keep-frames]'; }

// ── Static server (Google-Fonts pages still fetch remote CSS; everything
//    local must be http because headless Chrome + file:// is flaky) ────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
};

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(rootDir, path.normalize(urlPath).replace(/^([.][.][\\/])+/, ''));
      if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ── Captions → SRT ─────────────────────────────────────────────────────────────
function srtTime(t) {
  const ms = Math.round(t * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  const mmm = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${mmm}`;
}

function buildSrt(captions) {
  return captions.map((c, i) =>
    `${i + 1}\n${srtTime(c.t0)} --> ${srtTime(c.t1)}\n${c.text}\n`).join('\n') + '\n';
}

// ── Render one clip ────────────────────────────────────────────────────────────
async function renderClip(browser, baseUrl, name) {
  const t0 = Date.now();
  const page = await browser.newPage();
  page.on('pageerror', err => console.error(`  page error: ${err.message}`));
  page.on('console', msg => { if (msg.type() === 'error') console.error(`  browser: ${msg.text()}`); });
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}/shorts/clips/${name}/index.html`, { waitUntil: 'networkidle0', timeout: 90_000 });
  await page.waitForFunction(() => window.__ready === true, { timeout: 45_000 });

  const meta = await page.evaluate(() => JSON.parse(JSON.stringify(window.__meta)));
  const duration = meta.duration;
  const total = Math.round(duration * fps);
  const framesDir = path.join(outDir, `.frames-${meta.id}`);
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  console.log(`[RENDER] ${meta.id} — "${meta.title}" · ${duration}s @ ${fps}fps = ${total} frames`);
  for (let i = 0; i < total; i++) {
    const t = i / fps;
    await page.evaluate(tt => window.__seek(tt), t);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ type: 'jpeg', quality, path: path.join(framesDir, `f${String(i).padStart(5, '0')}.jpg`) });
    if ((i + 1) % (fps * 5) === 0) console.log(`  … ${i + 1}/${total} frames`);
  }
  await page.close();

  const srtPath = path.join(outDir, `${meta.id}.srt`);
  fs.writeFileSync(srtPath, buildSrt(meta.captions), 'utf-8');

  const mp4Path = path.join(outDir, `${meta.id}_9x16.mp4`);
  const ff = spawnSync('ffmpeg', [
    '-y', '-framerate', String(fps), '-i', path.join(framesDir, 'f%05d.jpg'),
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
    mp4Path,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (ff.status !== 0) {
    console.error(`  ffmpeg failed:\n${ff.stderr.toString().split('\n').slice(-12).join('\n')}`);
    process.exit(1);
  }
  if (!keepFrames) fs.rmSync(framesDir, { recursive: true, force: true });

  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', mp4Path,
  ]);
  let w = '?', h = '?', dur = '?';
  for (const ln of probe.stdout.toString().trim().split('\n').map(s => s.replace(/,+$/, '').trim()).filter(Boolean)) {
    const parts = ln.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) { w = parts[0]; h = parts[1]; }
    else if (/^\d+(\.\d+)?$/.test(parts[0] || '')) dur = parts[0];
  }
  const mb = (fs.statSync(mp4Path).size / 1e6).toFixed(1);
  console.log(`  ✓ ${mp4Path} — ${w}x${h}, ${parseFloat(dur).toFixed(1)}s, ${mb} MB (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  return mp4Path;
}

// Chrome resolution: puppeteer's downloaded "Chrome for Testing" is killed by
// macOS Gatekeeper on some boxes (SIGKILL on spawn, errno -88) — fall back to
// a system Chrome. Env override wins.
function chromeExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  return candidates.find(p => fs.existsSync(p)) || undefined;
}

// ── Main ───────────────────────────────────────────────────────────────────────
(async () => {
  for (const bin of ['ffmpeg', 'ffprobe']) {
    if (spawnSync(bin, ['-version']).status !== 0) { console.error(`${bin} not on PATH`); process.exit(1); }
  }
  fs.mkdirSync(outDir, { recursive: true });
  const server = await startStaticServer(path.resolve(__dirname, '..'));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromeExecutablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-color-profile=srgb'],
  });

  try {
    for (const name of clips) await renderClip(browser, baseUrl, name);
  } finally {
    await browser.close();
    server.close();
  }
  console.log('Done.');
})();
