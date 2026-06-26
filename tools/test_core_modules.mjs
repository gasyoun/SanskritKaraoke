import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function importSource(path) {
  const source = await readFile(resolve(path), 'utf8');
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(url);
}

const timing = await importSource('src/core/timing.js');
const frame = await importSource('src/core/karaoke-frame.js');

const scaled = await timing.corpusScaleTiming({
  meter: 'anuṣṭubh',
  s1len: 2,
  s2len: 2,
  newDuration: 8,
  loadIndex: async () => ({
    verses: [
      { id: 'wrong-meter', meter: 'triṣṭubh' },
      { id: 'wrong-shape', meter: 'anuṣṭubh' },
      { id: 'match', meter: 'anuṣṭubh' },
    ],
  }),
  loadVerse: async id => ({
    'wrong-shape': { timing: { s1: [0], s2: [1, 2] }, audio: { duration_s: 4 } },
    match: { timing: { s1: [0, 1], s2: [2, 3] }, audio: { duration_s: 4 } },
  }[id]),
});

assert.deepEqual(scaled, { s1: [0, 2], s2: [4, 6] });
assert.equal(frame.currentSylIndex([0.2, 0.7, 1.4], 0.9), 1);

const camera = frame.updateCamera(
  { camX: 100, camY: 100 },
  { s1: { 0: { x: 300, y: 200, r: 8 } }, s2: {} },
  { s1: [0], s2: [] },
  { s1: [{ col: 0, type: 'laghu' }], s2: [] },
  null,
  0.1,
  { minX: 0, maxX: 500, minY: 0, maxY: 500 },
  0.5,
);
assert.deepEqual(camera, { camX: 200, camY: 150 });

console.log('core module tests passed');
