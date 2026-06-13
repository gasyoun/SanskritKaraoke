#!/usr/bin/env node
/**
 * tools/render_chapter.js — Headless batch renderer (ADR-0002).
 *
 * For each verse in verses_dir that has an audio file in audio_dir,
 * loads render.html in Puppeteer, calls window.renderVerse(), and
 * writes dist/<id>_9x16.mp4 + <id>.srt + <id>.vtt.
 *
 * Usage:
 *   node tools/render_chapter.js <audio_dir> [options]
 *
 * Options:
 *   --verses <dir>      verse JSON directory  (default: verses/data)
 *   --out    <dir>      output directory       (default: dist)
 *   --only   <ids>      comma-separated verse IDs to render
 *   --format <fmt>      9:16 | 1:1             (default: 9:16)
 *   --fps    <n>        frames per second      (default: 30)
 *   --show-dev          render Devanāgarī labels on wave nodes
 *   --no-headless       show browser window (debug)
 *
 * Depends on: puppeteer  (npm install --prefix tools)
 */

'use strict';

const path      = require('path');
const fs        = require('fs');
const puppeteer = require('puppeteer');

// ── CLI args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (!args.length || args[0] === '--help') {
  console.log('Usage: node tools/render_chapter.js <audio_dir> [--verses dir] [--out dir] [--only id1,id2] [--format 9:16|1:1] [--fps 30] [--show-dev] [--no-headless]');
  process.exit(0);
}

const audioDir   = path.resolve(args.shift());
const versesDir  = path.resolve(getArg('--verses') || 'verses/data');
const outDir     = path.resolve(getArg('--out')    || 'dist');
const onlyIds    = (getArg('--only') || '').split(',').map(s => s.trim()).filter(Boolean);
const format     = getArg('--format') || '9:16';
const fps        = parseInt(getArg('--fps') || '30', 10);
const showDev    = args.includes('--show-dev');
const headless   = !args.includes('--no-headless');

function getArg(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function findAudio(verseId, dir) {
  const exts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.opus', '.aac'];
  for (const ext of exts) {
    const p = path.join(dir, verseId + ext);
    if (fs.existsSync(p)) return p;
  }
  // also try the verse id as a prefix match
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.startsWith(verseId + '_') || f.startsWith(verseId + '.')) {
        return path.join(dir, f);
      }
    }
  } catch (_) {}
  return null;
}

function loadVerses(dir, ids) {
  const results = [];
  let files;
  try { files = fs.readdirSync(dir); } catch (e) {
    console.error(`Cannot read verses dir: ${dir}`); process.exit(1);
  }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const id = f.replace(/\.json$/, '');
    if (ids.length && !ids.includes(id)) continue;
    try {
      const verse = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      if (!verse.id) verse.id = id;
      results.push(verse);
    } catch (e) {
      console.warn(`Skip ${f}: ${e.message}`);
    }
  }
  return results;
}

// ── Main ───────────────────────────────────────────────────────────────────────
(async () => {
  const verses = loadVerses(versesDir, onlyIds);
  if (!verses.length) { console.log('No verses found.'); process.exit(0); }

  const renderHtml = path.resolve('render.html');
  if (!fs.existsSync(renderHtml)) {
    console.error('render.html not found at project root. Run from the SanskritKaraoke directory.');
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-unsafe-webgpu'],
  });

  let ok = 0, skipped = 0, failed = 0;

  for (const verse of verses) {
    const id = verse.id;
    const audioPath = findAudio(id, audioDir);
    if (!audioPath) {
      console.log(`[SKIP] ${id} — no audio file in ${audioDir}`);
      skipped++;
      continue;
    }

    const outMp4 = path.join(outDir, `${id}_${format.replace(':', 'x')}.mp4`);
    const outSrt = path.join(outDir, `${id}.srt`);
    const outVtt = path.join(outDir, `${id}.vtt`);

    console.log(`[RENDER] ${id} …`);
    const t0 = Date.now();

    const page = await browser.newPage();
    page.on('console', msg => { if (msg.type() === 'error') console.error(`  browser: ${msg.text()}`); });
    page.on('pageerror', err => console.error(`  page error: ${err.message}`));

    try {
      // Increase default timeout for encoding long verses
      page.setDefaultTimeout(300_000);

      await page.goto(`file://${renderHtml}`, { waitUntil: 'networkidle0', timeout: 60_000 });

      // Wait for mp4-muxer CDN load + module init
      await page.waitForFunction(() => window._renderReady === true, { timeout: 30_000 });

      // Read audio as base64
      const audioB64 = fs.readFileSync(audioPath).toString('base64');

      // Footer from verse metadata
      const footer = {
        author: verse.author || verse.attribution || '',
        year:   verse.year   ? String(verse.year) : '',
        url:    verse.url    || '',
        source: verse.source || '',
        meter:  verse.meter  || '',
      };

      const opts = { format, fps, showDev, footer };

      const result = await page.evaluate(
        async (verseJson, audioBase64, renderOpts) => {
          try {
            return await window.renderVerse(verseJson, audioBase64, renderOpts);
          } catch (e) {
            return { error: e.message };
          }
        },
        verse, audioB64, opts,
      );

      if (result.error) throw new Error(result.error);

      // Write outputs
      const mp4Buf = Buffer.from(result.mp4Base64, 'base64');
      fs.writeFileSync(outMp4, mp4Buf);
      fs.writeFileSync(outSrt, result.srtText, 'utf-8');
      fs.writeFileSync(outVtt, result.vttText, 'utf-8');

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ✓  ${id} → ${path.basename(outMp4)} (${(mp4Buf.length / 1e6).toFixed(1)} MB, ${elapsed}s)`);
      ok++;

    } catch (e) {
      console.error(`  ✗  ${id}: ${e.message}`);
      failed++;
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log(`\nDone: ${ok} rendered, ${skipped} skipped, ${failed} failed.`);
  if (failed) process.exit(1);
})();
