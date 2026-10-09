/**
 * src/core/translit.js — Devanāgarī↔IAST transliteration + IAST syllabification.
 * Pure ES module: no document/window references.
 * Port of app.js:27–206 with DOM deps severed.
 */

// ── Devanāgarī → IAST ─────────────────────────────────────────────────────────
const DEV_CONS = {
  'क':'k','ख':'kh','ग':'g','घ':'gh','ङ':'ṅ',
  'च':'c','छ':'ch','ज':'j','झ':'jh','ञ':'ñ',
  'ट':'ṭ','ठ':'ṭh','ड':'ḍ','ढ':'ḍh','ण':'ṇ',
  'त':'t','थ':'th','द':'d','ध':'dh','न':'n',
  'प':'p','फ':'ph','ब':'b','भ':'bh','म':'m',
  'य':'y','र':'r','ल':'l','व':'v',
  'श':'ś','ष':'ṣ','स':'s','ह':'h','ळ':'ḷ',
};
const DEV_VOW_DEP = {
  'ा':'ā','ि':'i','ी':'ī','ु':'u','ू':'ū',
  'ृ':'ṛ','ॄ':'ṝ','ॢ':'ḷ','े':'e','ै':'ai','ो':'o','ौ':'au',
};
const DEV_VOW_IND = {
  'अ':'a','आ':'ā','इ':'i','ई':'ī','उ':'u','ऊ':'ū',
  'ऋ':'ṛ','ॠ':'ṝ','ए':'e','ऐ':'ai','ओ':'o','औ':'au','ऌ':'ḷ',
};
const VIRAMA = '्'; // ्
const ANUSV  = 'ं'; // ं
const VISARG = 'ः'; // ः

/** Convert Devanāgarī text to IAST. Port of app.js:48. */
export function devToIast(text) {
  const out = [];
  const chars = [...text];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (ch === ' ' || ch === '\n') { out.push(' '); i++; continue; }
    if ('।॥।॥'.includes(ch)) { out.push(ch); i++; continue; }
    if (ch === 'ॐ') { out.push('oṃ'); i++; continue; }
    if (ch >= '०' && ch <= '९') { out.push(String(ch.codePointAt(0) - 0x0966)); i++; continue; }
    if (DEV_VOW_IND[ch]) {
      out.push(DEV_VOW_IND[ch]); i++;
      if (chars[i] === ANUSV)  { out.push('ṃ'); i++; }
      else if (chars[i] === VISARG) { out.push('ḥ'); i++; }
      continue;
    }
    if (DEV_CONS[ch]) {
      out.push(DEV_CONS[ch]); i++;
      if (chars[i] === VIRAMA) { i++; continue; }
      if (DEV_VOW_DEP[chars[i]]) { out.push(DEV_VOW_DEP[chars[i]]); i++; }
      else { out.push('a'); }
      if (chars[i] === ANUSV)  { out.push('ṃ'); i++; }
      else if (chars[i] === VISARG) { out.push('ḥ'); i++; }
      continue;
    }
    i++;
  }
  return out.join('').replace(/  +/g, ' ').trim();
}

// ── IAST syllabification ───────────────────────────────────────────────────────
export const IAST_LONG_V  = ['ai','au','ā','ī','ū','ṝ','e','o'];
export const IAST_SHORT_V = ['a','i','u','ṛ','ḷ'];
export const IAST_ALL_V   = [...IAST_LONG_V, ...IAST_SHORT_V];
export const IAST_CONS    = [
  'kh','gh','ch','jh','ṭh','ḍh','th','dh','ph','bh',
  'ṅ','ñ','ṇ','ś','ṣ','ṃ','ḥ',
  'k','g','c','j','ṭ','ḍ','t','d','p','b',
  'y','r','l','v','h','m','n','s',
];

function startsVowel(s) {
  for (const v of IAST_ALL_V) if (s.startsWith(v)) return v;
  return null;
}
function startsCons(s) {
  for (const c of IAST_CONS) if (s.startsWith(c)) return c;
  return null;
}
function clusterSize(s) {
  if (s.startsWith('ṃ') || s.startsWith('ḥ')) return 0;
  let j = 0, n = 0;
  while (j < s.length) {
    if (startsVowel(s.slice(j))) return n;
    if (s.slice(j).startsWith('ṃ') || s.slice(j).startsWith('ḥ')) return n;
    const c = startsCons(s.slice(j)); if (!c) return n;
    n++; j += c.length;
  }
  return n;
}

/**
 * Syllabify an IAST string into [{syl, type: 'guru'|'laghu'}].
 * opts.strict = true: standard mode (clusters always split); default: user mode.
 * Port of app.js:101.
 */
export function syllabifyIast(iast, opts = {}) {
  const userMode = !opts.strict;
  const s = iast.toLowerCase().replace(/\s+/g, ' ').trim();
  const syls = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === ' ') { i++; continue; }
    if ('|.;।॥'.includes(s[i])) { i++; continue; }

    // Leading consonants
    let cons1 = '', j = i;
    while (j < s.length) {
      if (s[j] === ' ') { j++; continue; }
      const v = startsVowel(s.slice(j)); if (v) break;
      const c = startsCons(s.slice(j)); if (!c) break;
      cons1 += c; j += c.length;
    }
    const vow = startsVowel(s.slice(j));
    if (!vow) { i = j + 1; continue; }
    const isLong = IAST_LONG_V.includes(vow);
    j += vow.length;

    let vowSuffix = '';
    if (s.slice(j).startsWith('ṃ')) { vowSuffix = 'ṃ'; j += 'ṃ'.length; }
    else if (s.slice(j).startsWith('ḥ')) { vowSuffix = 'ḥ'; j += 'ḥ'.length; }

    let k = j;
    while (k < s.length && s[k] === ' ') k++;

    const afterBoundary = k > j;
    const nextIsVowel   = !!startsVowel(s.slice(k));
    let cons2 = '';
    if (!afterBoundary || !nextIsVowel) {
      if (k < s.length) {
        const c = startsCons(s.slice(k));
        if (c) {
          const cs = clusterSize(s.slice(k));
          if (userMode) {
            if (!isLong && !vowSuffix && cs >= 2) { cons2 = c; k += c.length; }
          } else {
            if (cs >= 2) { cons2 = c; k += c.length; }
          }
        }
      }
    }

    // Word-final consonants
    while (k < s.length) {
      if (s[k] === ' ') {
        let peek = k + 1;
        while (peek < s.length && s[peek] === ' ') peek++;
        if (peek < s.length && startsVowel(s.slice(peek))) break;
        k++; continue;
      }
      const c = startsCons(s.slice(k)); if (!c) break;
      const afterC = s.slice(k + c.length);
      if (startsVowel(afterC) || clusterSize(afterC) > 0) break;
      cons2 += c; k += c.length;
    }

    i = k;
    const heavy = isLong || vowSuffix.length > 0 || cons2.length > 0;
    syls.push({ syl: cons1 + vow + vowSuffix + cons2, type: heavy ? 'guru' : 'laghu' });
  }
  return syls;
}

const LONG_V = ['ā','ī','ū','ṝ','e','o','ai','au'];

/** Return true if IAST syllable is guru (heavy). Port of app.js:199. */
export function isGuru(syl) {
  for (const v of LONG_V) if (syl.includes(v)) return true;
  if (/[kgcjṭḍtdpbyrḷvhmnśṣṅñṇṃḥ]$/u.test(syl)) return true;
  return false;
}

/**
 * Convert a verse JSON object into syllable lists with col/row/devSyl assigned.
 * col = syllable index (0-based), row = 1 (default flat pattern).
 * Returns { s1: [{syl,type,col,row,devSyl,arrow}], s2: [...] }
 */
export function syllabifyVerse(verse, opts = {}) {
  function hydrate(devText) {
    const iast = devToIast(devText || '');
    return syllabifyIast(iast, opts).map((s, i) => ({
      ...s,
      col:    i,
      row:    1,      // default: flat, row 2 (0-indexed = 1)
      devSyl: '',     // caller fills devSyl if transliterateToDev is available
      arrow:  '',
    }));
  }
  return {
    s1: hydrate(verse.s1 || ''),
    s2: hydrate(verse.s2 || ''),
  };
}
