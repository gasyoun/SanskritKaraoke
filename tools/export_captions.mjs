#!/usr/bin/env node
/**
 * tools/export_captions.mjs — sidecar SRT/VTT from verse JSON + timing (H3261).
 *
 * Does NOT render MP4. Reuses src/core/karaoke-frame.js (buildCues / toSrt / toVtt)
 * and src/core/translit.js (syllabifyVerse).
 *
 * Usage:
 *   node tools/export_captions.mjs <verse.json> [--timing <timing.json>] [--out <dir>]
 *
 * Timing comes from verse.timing or --timing overlay ({s1:[...], s2:[...]} seconds).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { syllabifyVerse } from '../src/core/translit.js';
import { buildCues, toSrt, toVtt } from '../src/core/karaoke-frame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function getArg(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

function loadTiming(verse, overlay) {
  const src = overlay || verse.timing || {};
  const s1 = src.s1;
  const s2 = src.s2;
  if (!Array.isArray(s1) || !Array.isArray(s2) || (!s1.length && !s2.length)) {
    throw new Error('timing.s1 and timing.s2 must be non-empty number arrays (verse.timing or --timing)');
  }
  return { s1, s2 };
}

export function exportCaptions(verse, timing) {
  const syllables = syllabifyVerse(verse);
  if (syllables.s1.length !== timing.s1.length) {
    throw new Error(`s1 syllable count ${syllables.s1.length} != timing.s1 length ${timing.s1.length}`);
  }
  if (syllables.s2.length !== timing.s2.length) {
    throw new Error(`s2 syllable count ${syllables.s2.length} != timing.s2 length ${timing.s2.length}`);
  }
  const cues = buildCues(syllables, timing);
  return { cues, srt: toSrt(cues) + '\n', vtt: toVtt(cues) + '\n' };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    console.log('Usage: node tools/export_captions.mjs <verse.json> [--timing timing.json] [--out dir]');
    process.exit(args.length ? 0 : 1);
  }

  const versePath = path.resolve(args[0]);
  const timingPath = getArg(args, '--timing');
  const outDir = path.resolve(getArg(args, '--out') || path.join(ROOT, 'dist'));

  const verse = JSON.parse(await readFile(versePath, 'utf8'));
  if (!verse.id) verse.id = path.basename(versePath, '.json');
  const overlay = timingPath
    ? JSON.parse(await readFile(path.resolve(timingPath), 'utf8'))
    : null;
  const timing = loadTiming(verse, overlay);
  const { srt, vtt } = exportCaptions(verse, timing);

  await mkdir(outDir, { recursive: true });
  const srtPath = path.join(outDir, `${verse.id}.srt`);
  const vttPath = path.join(outDir, `${verse.id}.vtt`);
  await writeFile(srtPath, srt, 'utf8');
  await writeFile(vttPath, vtt, 'utf8');
  console.log(`wrote ${srtPath}`);
  console.log(`wrote ${vttPath}`);
}
