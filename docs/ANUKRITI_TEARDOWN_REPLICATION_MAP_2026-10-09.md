# Anukriti teardown — what to replicate, how they do it, what to skip

_Created: 09-10-2026 · Last updated: 09-10-2026_

> H6316 (OxAlpha-minted, executed by GLM `zai-individual-coding-plan/GLM-5.3-Flash`, 09-10-2026, ~40 min).
> Seeded by §4 of [TONEPERFECT_PLAYBOOK_ADAPTATION_2026-10-09.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/TONEPERFECT_PLAYBOOK_ADAPTATION_2026-10-09.md);
> every factual row below was live-probed 09-10-2026 (probe log in §8). Product decisions stay
> canonical in [KARAOKE_PRODUCT_ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/KARAOKE_PRODUCT_ROADMAP.md) —
> this doc is the competitor map behind the verdicts, not a roadmap edit.

## 1. Who they are

| Fact | Value | Probe |
|---|---|---|
| Product | **Anukriti** — «Mantra radio & daily chanting practice», iOS + Android + web | [anukriti.ai](https://www.anukriti.ai/) |
| Seller | **Procsolve LLC** (developer page id1869208344); support mamta@procsolve.com, +1 551 482 5317 | iTunes lookup |
| Launched | **2026-03-10** (iOS release date; first update 1.1.5 on 03-12) | iTunes lookup + version history |
| iOS | id6757836905, v1.8.2 (2026-10-05), 83 MB, min iOS 15.1, **EN only**, age 4+, genres Lifestyle + Productivity | [iTunes lookup](https://itunes.apple.com/lookup?id=6757836905) |
| Android | com.rkdc.anukritimvpexpo, updated 2026-10-04, **10K+ downloads, 4.1★**, IAP yes, no ads | [Play listing](https://play.google.com/store/apps/details?id=com.rkdc.anukritimvpexpo) |
| iOS ratings | **4.83★ from 6 ratings** — social proof still fragile | iTunes lookup |
| Scale read | 10K+ Android installs in ~7 months ≈ ≥47 installs/day floor; no public revenue. Contrast: TonePerfect ~500 installs/day at ~$14K/mo — Anukriti is validated, not yet at that temperature | §8 probes |

Bundle id says `mvpexpo` and the stack confirms it: **Expo/React Native**, with release
notes «applies the latest improvements on the very first launch» (1.5.1) and
«improvements download silently between launches» (1.4.8) = **Expo EAS OTA updates**.

## 2. Feature census — and HOW they do it

| Feature | What it is | How (public fingerprint) | First shipped |
|---|---|---|---|
| **Uccharan / «Anukriti Says»** — per-word pronunciation feedback | Record a chant, get per-word tips and a score | Their own privacy policy: audio → **ElevenLabs speech-to-text**, transcript → **OpenRouter-routed LLM** for feedback; FAQ: «requires an internet connection for audio analysis». Release 1.4.0 names the mechanics: «fuzzy word boundary matching», «silence detection», «We didn't hear you» guidance. Play data-safety: shares **Audio** with third parties | 1.4.0, 2026-05-04 |
| **Anukriti Radio** — streamed mantra stations with karaoke lyrics | Passive listening; «Prangan» morning station opens the app; site gives free 30-s previews | Streaming audio infra + word-by-word highlighted lyrics (Devanāgarī + transliteration, 1.5.5); release 1.8.2 fixes «Radio picks up again after background» — streamed, not bundled | site day one; 1.3.8 (Apr); karaoke 1.5.5 (Jul) |
| **Japa 108 counter / Japa Mala** | Hands-free bead counting while chanting along | Audio-synced bead turning: «chant along with the sacred recitation, and Anukriti turns each bead for you» (1.5.3); 8 new japa tracks «bead-accurate counting and karaoke text» (1.5.9) | 1.3.3 (Apr), mala 1.5.3 (Jun) |
| **Saadhana Flows** | Guided daily ritual chaining japa → radio; 15 intent-based flows, sandhya (time-of-day) anchors | Content+state machine on top of the two features above | 1.5.9, 2026-08-01 |
| **Festival calendar + reminders** | Hindu lunar calendar → festival-based daily recommendations + push reminders | Local notifications on a panchang-derived calendar | 1.1.5–1.1.6 (Mar) |
| **Studio (B2B)** | Licensed seasonal mantra soundtrack for yoga studios | Separate web product: season calendar (Śrāvaṇa, Navarātri, Kārtik…), per-studio-type catalog lanes (Vinyasa/Dhyāna/Śakti/Bhakti/Hot), **sales-led** («Book a listening session», no public price) | [anukriti.ai/studio](https://www.anukriti.ai/studio) |
| **Rewards/contests** | Gamification layer | iOS advisory «Infrequent/Mild Contests» | 1.3.3 |

## 3. The one architectural insight that matters for us

**Their «syllable-level AI feedback» is LLM-on-STT-transcript, not acoustic timing.**
ElevenLabs returns words; an LLM (via OpenRouter) writes the tips; «fuzzy word boundary
matching» scores the transcript diff. Nothing in any public artifact indicates per-syllable
onset measurement, duration analysis, or any notion of **meter (chandas)**. Two consequences:

1. Their per-unit cost scales with recordings (paid STT + LLM per take, internet required);
   our [tools/align_chapter.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/align_chapter.py)
   whisper-alignment + onset anchoring scores timing locally on already-paid-for compute.
2. **The distinctly Sanskrit skill — guru/laghu conformance — is unscored by the incumbent.**
   The niche is validated and the devotional/radio lane is taken; the metrical + RU-market +
   school-funnel combination is open, and now proven to be technically uncontested too.

## 4. Version timeline (feature evolution, all 18 releases probed)

1.1.5 (03-12) daily reminders → 1.1.6 (03-20) festival reminders → 1.3.3 (04-19) audio Japa + rewards → 1.3.8 (04-30) Radio launch → 1.4.0 (05-04) **Anukriti Says scoring** → 1.4.5–1.4.8 (05) radio streaming, sign-in retry, offline cache + background OTA → 1.5.1 (05-25) OTA-on-first-launch → 1.5.3 (06-23) Japa Mala hands-free → 1.5.5 (07-13) **Radio karaoke lyrics** → 1.5.8 (07-21) intro-pricing display, brass-Om rebrand → 1.5.9 (08-01) **Saadhana Flows** → 1.6.1 (08-04) crash reporting both platforms → 1.7.3 (08-12), 1.8.1 (08-21) stability → 1.8.2 (10-05) sign-in timeouts, radio background resume.

Pattern: launch as reminder+calendar companion (Mar), radio by day 50, **scoring by day 55**,
then six months of retention wrappers around one scoring feature that never shipped a v2.

## 5. ASO rows

| Surface | They do | Row for us |
|---|---|---|
| iOS title / subtitle | «Anukriti» / **«Chant 108, Mantras for Sleep»** — single brand word + benefit subtitle; «Sleep» raids an adjacent search cluster | When store listings come (post-A+B, playbook §5): brand-free title with the skill noun + one adjacent-audience keyword |
| Play short description | «Perfect your prayer» | Same shape: 5-word promise, no feature list |
| Long description | Keyword-front-loaded first line: «Learn Mantra Chanting with AI Guidance» (iOS: «Learn Vedic Chanting with AI Guidance») | Front-load «śloka recitation», «meter», «anuṣṭubh» — terms they do not target at all |
| Genres | Lifestyle (primary) + Productivity — not Education | Education is defensible for us (school behind the app) |
| Languages | **EN only** | RU+EN bilingual is an open lane (no incumbent targets it) |
| Web SEO | /learn hub: **17 long-tail articles** (festival mantras, śloka meanings, question-shaped slugs like «one-syllable-heard», brand page /anukriti-meaning, /origin-story); sitemap 23 URLs; Next.js site | Their grid validates Lever B: our 60 planned per-verse pages out-index 17 articles on the exact verses we already host |
| Ratings base | 6 iOS ratings, unknown Android count (4.1★ visible) | Small bases flip with a handful of school students — low bar, only worth it post-A+B |

## 6. Pricing rows

| Tier | Price | Gate | Probe |
|---|---|---|---|
| Free | $0 | «preview a few Anukriti Radio stations» only | [landing FAQ](https://www.anukriti.ai/) |
| **Premium Monthly** | **$2.99** | Full library + AI pronunciation feedback + advanced tracking | [App Store web](https://apps.apple.com/us/app/anukriti/id6757836905) |
| **Premium Yearly** | **$24.99** (≈$2.08/mo, −30%) | same | same; intro-pricing display shipped 1.5.8 |
| Studio (B2B) | not public | Licensed commercial use for studios; sales-led booking | /studio |

Data-safety (Play): shares Audio, App activity, Device/other IDs with third parties; collects
Personal, Financial + 4 other categories; encrypted in transit; deletion on request —
the visible cost of server-side scoring, and a compliance surface our PWA does not have.

## 7. Verdict map against our positioning (school + meter + RU + free-funnel)

| Their asset | Verdict | Why / what exactly |
|---|---|---|
| Uccharan / Anukriti Says loop (record → score → tips) | **ADAPT** (= minted H6317, record&score MVP) | Keep the loop shape; replace their STT+LLM scoring with our whisper-alignment + onset anchoring; add the meter dimension they lack; runs local, free for the student |
| Radio with karaoke lyrics | **ADAPT later, SKIP their infra** | We already own per-syllable timing JSON for 22 clips — karaoke highlight is UI on existing data; static files, not streaming; publishing blocked on Lever C (Uṣā Saṅkā rights) |
| Japa Mala hands-free | **SKIP** | Habit commodity, zero tie to school or meter; crowded |
| Saadhana Flows | **SKIP** | Subscription-retention scaffolding; our retention spine is the Systema course path |
| Festival calendar/reminders | **SKIP in-app; ADAPT as content** | Their /learn festival pages own that search — cover it inside the Lever B grid, not as app plumbing |
| Studio B2B licensing | **SKIP** (watch-item) | No licensable catalog of ours; rights-gated; revisit only if the corpus grows into a catalog |
| Free web sampler + /learn grid | **REPLICATE** (= minted H6318, SEO grid) | This is Lever B almost feature-for-feature; 30-s previews map to our per-verse players |
| Subscription paywall $2.99/$24.99 | **SKIP** | Model decided 2026-06-12: free funnel into Systema courses; premium scoring tier remains a later option per roadmap |
| Expo/RN + EAS OTA + store distribution | **SKIP** | Our PWA is live on GitHub Pages with zero store friction; web-first fits the school funnel (no install to lose students to) |
| UTM tags on every CTA (header/radio/sticky/footer/cta slots) | **REPLICATE the instrumentation, not the spend** | One-line href hygiene on every surface we ship; no paid acquisition until A+B exist (playbook §5 already says this) |

Net reading for M.G.: Anukriti proves the window and, more usefully, proves its **weak
edge** — scoring by transcript-LLM, EN-only, no meter, no school. The minted wave
(H6317 record&score, H6318 SEO grid, H6319 drop package) attacks exactly that edge;
nothing in this teardown argues for changing lever order (C now, B parallel, A after scope pick).

## 8. Probe log (all 09-10-2026)

| # | Probe | Result |
|---|---|---|
| 1 | `itunes.apple.com/lookup?id=6757836905` | identity, v1.8.2, dates, 4.83★/6, EN, 83 MB, seller |
| 2 | iTunes reviews RSS id6757836905 | 2 reviews, both 5★, one confirms per-segment feedback accuracy |
| 3 | Play listing (full HTML, 1.1 MB) | 10K+ downloads, 4.1★, updated 10-04, IAP, no ads, data-safety rows, support contacts |
| 4 | `anukriti.ai` landing (309 KB) | nav (Features/Tradition/Uccharan), radio sampler with 6 named tracks, japa/sādhana sections, FAQ free-vs-subscription wording, 28 UTM-tagged links, 7 UTM source slots |
| 5 | `anukriti.ai/sitemap.xml` | 23 URLs, 17 /learn/* articles |
| 6 | `procsolve.com/anukriti/privacy-policy` (95 KB) | ElevenLabs STT + OpenRouter LLM pipeline, analytics/ad-tracking mentions, EEA transfer clauses |
| 7 | App Store web page (625 KB) | In-App Purchases: Premium Monthly $2.99, Premium Yearly $24.99; subtitle; full 18-release version history |
| 8 | `anukriti.ai/studio` (403 KB) | B2B positioning, season calendar, studio-type lanes, sales-led CTA, no public price |
| 9 | Wayback CDX for anukriti.ai | **INCONCLUSIVE** (Internet Archive temporarily offline; 1 try, not load-bearing — version history came from probe 7) |
| 10 | Android review count, paid-spend evidence, «Parikrama» utm source meaning | **INCONCLUSIVE** (not in public HTML after 3 targeted greps; no further tries spent) |

## Delivery (five fields)

- **Changed:** new [docs/ANUKRITI_TEARDOWN_REPLICATION_MAP_2026-10-09.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/ANUKRITI_TEARDOWN_REPLICATION_MAP_2026-10-09.md) + sibling metadoc + changelog_queue entry; no code touched.
- **Unchanged:** roadmap, levers and their order (§5/§7 of the TonePerfect doc stand), all code.
- **Checks:** every factual row carries its probe URL (§8); re-run probe 1 (`curl https://itunes.apple.com/lookup?id=6757836905`) to spot-check the identity/rating rows (v1.8.2, 4.83★/6, Free app price) — the $2.99/$24.99 IAP prices are NOT in the lookup API, they spot-check against probe 7 (App Store web page, In-App Purchases section).
- **Risks:** store pages drift (prices/versions are a 09-10 snapshot); «how they do it» is fingerprint-level — their internals could differ behind the privacy-policy wording; Play review count and paid-spend remain unknown, and the Wayback timeline + «Parikrama» utm meaning stayed INCONCLUSIVE (§8 rows 9–10).
- **Inspect:** §3 (the transcript-LLM vs acoustic-timing distinction) and §7 (verdict map) first.

_Dr. Mārcis Gasūns_
