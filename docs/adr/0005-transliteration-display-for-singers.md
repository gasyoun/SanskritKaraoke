# ADR-0005: Transliteration display for singers — IAST per syllable, everywhere

_Created: 05-08-2026 · Last updated: 05-08-2026_

**Status:** Accepted · 2026-08-05
**Basis:** survey of every singer-facing surface @ v1.5.3 — wave-ball labels ([src/scripts/app.js](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/scripts/app.js) `render()`/`sylLabel`), karaoke/story MP4 + PNG frames, WebVTT cue track ([src/core/karaoke-frame.js](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/core/karaoke-frame.js)), feed frames ([src/core/feed.js](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/core/feed.js)), quizzes ([src/scripts/quizzes.js](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/scripts/quizzes.js)), catalogue titles, verse library JSON (13 files, all `encoding: DEV`), and the RU recitation methodichka ([docs/METODICHKA_ANUSHTUBH_RECITATION_RU_2026.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/METODICHKA_ANUSHTUBH_RECITATION_RU_2026.md)). Executed under handoff [H1870](https://github.com/gasyoun/Uprava/blob/main/handoffs/H1870-Fable_SanskritKaraoke_transliteration-display-ruling-for-singers_29.07.26.md) (Fable 5 `claude-fable-5`).

## Context

The karaoke surfaces grew their script choices ad hoc: balls default to IAST with a देव
toggle, exported frames follow whatever the toggle happened to be, the WebVTT subtitle
track is always IAST, feed frames draw a continuous Devanāgarī line with a per-syllable
IAST line under it, quizzes answer in IAST, and Cyrillic input is rejected outright. No
document said which of these was policy and which was accident, so every new surface
(feed, story export, methodichka) had to re-decide.

The audience is Russian-speaking students learning to **sing** ślokas. The deciding
criterion for this ruling is therefore **singability, not scholarly precision** (per the
handoff's scope fence). Where the two conflict, singability wins; on the main points they
happen to agree.

## Decision

1. **IAST, lowercase, full diacritics, is the canonical per-syllable display on every
   singer-facing surface**: wave-ball labels, karaoke/story MP4 highlight units, PNG
   export, WebVTT cues, feed highlight line, quiz prompts/feedback, and pedagogical
   tables (the methodichka already complies).
2. **Devanāgarī appears only in two sanctioned roles:** (a) a *continuous* reference line
   above the IAST line (feed frames, PNG/MP4 scene header) — never split per syllable as
   the highlight carrier; (b) an explicit in-app opt-in (the देव toggle on the balls),
   which is a viewing preference, not the default, and is never the subtitle/cue text.
3. **Cyrillic practical transcription is banned on display surfaces**, matching the
   existing input-side ban («русские буквы не поддерживаются»).
4. **ASCII schemes (Harvard-Kyoto, SLP1, ITRANS, Velthuis, WX) are input-only.** They are
   accepted in the encoding combobox and never shown to singers.
5. Defaults stay as shipped (`SHOW_DEV = false`); this ADR codifies the status quo and
   makes it binding for future surfaces. No data migration — the verse library stays
   Devanāgarī-source (`encoding: DEV`) with IAST derived at render time.

## Singer-facing reasons

- **The displayed unit must equal the sung unit.** The karaoke mechanism highlights one
  metrical syllable at a time. Devanāgarī akṣaras do not align with metrical syllables
  (कर्म sings as *kar|ma*, but the *r* lives inside the second akṣara's conjunct र्म);
  splitting Devanāgarī per syllable breaks conjuncts — the exact reason
  [src/core/feed.js](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/core/feed.js)
  draws it continuously and puts the highlight on the IAST line. IAST is the only scheme
  in use where one on-screen token is one sung syllable.
- **Vowel length is the melody.** Guru/laghu durations — the thing the app teaches — are
  carried visually by the macron (a/ā, i/ī, u/ū) and by ṃ/ḥ. Russian practical
  transcription drops length and retroflexion, so singers reading it sing wrong
  durations; that alone disqualifies it regardless of audience familiarity.
- **Lowercase throughout.** `syllabifyIast` lowercases input by design: uniform
  letterforms with no capitals at pada starts are easier to track at karaoke speed, and
  case carries no phonetic information in Sanskrit. (This is the one point where
  scholarly citation practice — capitalised proper names — loses to singability.)
- **One habit, not two.** The students' school materials teach IAST; adding a second
  Latin-adjacent or Cyrillic scheme on screen would fork the reading habit mid-course.
- **ASCII schemes are visually hostile mid-word** (HK `A` for ā, SLP1 `f` for ṛ) — fine
  as typing encodings, wrong as something a singer's eye lands on.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Devanāgarī-primary per-syllable | Conjunct splitting breaks glyphs; akṣara ≠ metrical syllable, so the highlight would lie about what is being sung |
| Cyrillic practical transcription | Loses vowel length + retroflexion → wrong sung durations; already banned at input |
| Harvard-Kyoto / SLP1 / ITRANS on display | ASCII capitals/consonant reuse mid-word are jarring and unfamiliar to the students; input-only |
| ISO 15919 | Distinctions over IAST (ē/ō, ṁ) are irrelevant for Sanskrit and absent from the students' teaching materials |
| Per-verse teacher choice (persisted `showDev`) | Script flapping verse-to-verse in the student catalogue; a preference is per-viewer, not per-file |

## Consequences

- New surfaces (Telegram feed variants, print handouts, future export formats) inherit
  this ruling instead of re-deciding; deviations require a superseding ADR.
- The देव toggle stays, labelled as the opt-in it is; its tooltip now names this ADR.
- The help modal (Инструкция) states the ruling to singers in Russian — applied in the
  same pass as this ADR (v1.5.4).
- If a future surface wants per-syllable Devanāgarī (e.g. akṣara-based karaoke), that is
  a different product feature and needs its own ADR plus a conjunct-safe splitter — out
  of scope here.

_Dr. Mārcis Gasūns_
