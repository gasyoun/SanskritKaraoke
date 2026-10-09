# TonePerfect playbook adaptation — the trainer axis for Sanskrit Karaoke

_Created: 09-10-2026 · Last updated: 09-10-2026_

> Trigger: M.G. chat 09-10-2026 — «Как нам проделать похожее для санскритского
> караоке, вместо китайского?» — referencing the TonePerfect September revenue
> update at <https://t.me/its_capitan/609> (channel «Короче, капитан»).
> This doc adapts that playbook to this repo and names the levers. It does not
> replace [KARAOKE_PRODUCT_ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/KARAOKE_PRODUCT_ROADMAP.md)
> (product scope stays there); it adds one axis the roadmap does not have:
> an interactive **listen → repeat → get scored** trainer product.

## 1. What the reference actually is

TonePerfect (<https://toneperfect.app/>) is a Mandarin pronunciation trainer:
the user speaks, an AI scores **every syllable** (tone, initial, final), a
2-minute placement test picks weak sounds, 5-minute daily sessions drill them.
September numbers per the post: **~$14K/month revenue** (double July), revenue
split ~70% iOS / 20% Android / 10% web, **~500 installs/day**, driven by:

1. **Ecosystem, not an app** — mobile app + browser extension + website as one
   SEO moat; the site earns ~800 Google visits/day.
2. **Free tools as the front door** — browser pronunciation tests, a pinyin
   chart of all 410 syllables, paste-any-text practice, HSK vocab lists. Free,
   no signup, indexable.
3. **Agent-run ASO** — an AI agent tunes the store listings in real time.
4. **Organic creators** — one Instagram reel ≈ $5K sales in August.

The money is in the **trainer loop**, not in videos. The videos/reels are
acquisition; the app is retention and monetisation.

## 2. What this repo already has (≈60% of that playbook)

| TonePerfect asset | Estate equivalent | Status |
|---|---|---|
| Per-syllable scoring engine | [tools/align_chapter.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/align_chapter.py): whisper word-timestamp alignment + onset anchoring (H5223) — per-syllable onset detection on real recitation audio, proven on 22 Uṣā Saṅkā clips | **built**, but pointed only at *her* audio — never at the student's |
| Tone/phoneme drills | Meter engine (guru/laghu, anuṣṭubh + vipulā variants), [WEEK4_METRE_ONLY_QUIZ_PATH_2026.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/WEEK4_METRE_ONLY_QUIZ_PATH_2026.md), kosha-mastery reader layer (H4719) | built as *quiz*, not as *feedback* |
| Content corpus | 60-verse library, rights-cleared EN/RU translations (Telang / Sementsov), 22 aligned clips + rendered 9:16 MP4s + post-kits | built, **publish gated** (G1/G2 below) |
| Web app (free tools) | Live app v1.5.5 on GitHub Pages: wave diagram, meter detection, multi-encoding, timing editor, exports | built as an *editor*, not yet as an indexable *tool grid* |
| Mobile presence | PWA, full touch support, iOS export overlays; school bot @samskrtamru_bot | no store listing, no ASO surface yet |
| Monetisation | Decided 2026-06-12: videos free → funnel into paid Systema courses («Кочергина» trajectory) | different model by design — see §5 |

The one thing TonePerfect has that this repo does not: **the student speaks and
gets scored**. Everything today is one-way (listen, watch, read).

## 3. The scoring MVP — and why our moat is the meter

Sanskrit has no phonemic tones, so tone-scoring does not transplant. What
transplants better:

- **Rhythm / meter conformance** — the app already knows each syllable's
  guru/laghu weight and the reference audio's per-syllable onsets. Recording
  the *student* and running the same aligner over their take gives
  per-syllable onset deltas and guru/laghu duration ratios. Nobody scores this;
  it is the distinctively Sanskrit skill (chandas).
- **Phoneme accuracy** — faster_whisper transcript diff vs the verse tokens
  (the machinery already exists as `whisper_word_times` string-similarity DP).

MVP shape: `student.html` gains a **Record** button (MediaRecorder) → audio to
a small endpoint (vps92) → reuse `align_chapter.py` internals on the take →
diff vs the reference timing JSON → heat-map on the existing wave diagram +
«drill your 3 weakest syllables». Engine development needs **no external
permission** (dev on the 22 local clips); only *publishing* scored-reference
audio publicly is rights-gated.

## 4. Competitive window

- **Anukriti** (<https://www.anukriti.ai>, App Store) — shloka practice with
  syllable-level AI pronunciation feedback, mantra radio. English/Hindi, no
  meter scoring, no school behind it. The niche is validated **and taken**;
  the metrical + RU-market + school-funnel combination is still open.
- Also adjacent: Indilingo, Slokas.app, LangBuddy — conversational/general,
  not recitation.

## 5. Levers (decision rows for M.G.)

| Lever | What | Gates | Size |
|---|---|---|---|
| **A. Record & score MVP** | §3 loop on the web app | none for the engine; scope choice is M.G.'s | ~1–2 lane-weeks for minimal |
| **B. Free-tools SEO grid** | /tools pages: paste-a-śloka meter detector, per-verse landing pages (60 verses = 60 indexable pages: devanāgarī + IAST + translation + player), encoding converter, sitemap; cross-link from samskrte.ru | none | ~2–4 lane-days |
| **C. Unblock the 22-clip drop** | sign/collect the Uṣā Saṅkā agreement ([draft](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/USHA_SANKAR_RECORDING_PERMISSION_AGREEMENT_2026-09.md), rights record [SK-LIC-2026-001](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/legal/RIGHTS_USHA_SANKA_SK-LIC-2026-001.md)), set Telegram credentials, run the prepared drop; also: identify `subh_3977`/`subh_4313` texts (M.G.-only) | **human: M.G.** (minutes-to-hours, zero build) | the distribution artery — everything else feeds it |

Recommendation: **C now (M.G.-only) + B on the drain lanes in parallel; A as
the main build once M.G. picks its scope.** Store apps / ASO agent / Product
Hunt come only after A+B exist (there is nothing yet to feature).

## 6. Non-goals (unchanged)

- No paywall on videos or the student platform (model stays free-funnel into
  Systema courses; a premium scoring tier is a later *option*, as the roadmap
  already phrases it).
- No browser extension, no store apps before the trainer MVP proves usage.

## 7. Decision cards put to M.G. 09-10-2026

1. **Lever order** — rec: C + B now, A after scope pick. Alternatives: A-first
   (product-first, slowest distribution), B-only (cheapest, no new product).
2. **A scope** — rec: minimal (5 verses, rhythm+timing feedback, one page in
   `student.html`). Alternative: full (placement test + drills + phoneme diff).
3. **Keep free-funnel?** — rec: yes, scoring free at entry; revisit after
   measurable course signups (success criteria already in the roadmap).

_Executor: OxAlpha (`zai-individual-coding-plan/GLM-5.3`), 09-10-2026, ~25 min._

_Dr. Mārcis Gasūns_
