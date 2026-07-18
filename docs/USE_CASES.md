# Use Case Scenarios — Sanskrit Karaoke

The project serves **two audiences**, and this document is organised around them:

- **Maintainers** — those who develop the application and operate the video-production
  pipeline (developers, drop producers, the rights manager, the library curator).
- **End-users** — the people it is all for: viewers arriving from social media through the
  funnel, and students systematically memorising verses.

Technically there are two layers:

1. **Browser application** (the older layer) — `index.html` for authoring, and
   `student.html` / `catalogue.html` / `progress.html` for students.
2. **Batch video-production pipeline** (the 2026 layer) — a single recording of a whole
   chapter becomes publish-ready vertical karaoke videos (`feed_v1`) with a funnel to the
   paid course.

---

# Part I. Maintainers

## 1. Developer — local setup and architecture
**Goal:** run the project locally and learn where everything lives.

### Workflow:
1. **Run:** no build step or package manager — `python -m http.server 8000`, open
   `http://localhost:8000`.
2. **Syntax check:** `node --check src/scripts/app.js`.
3. **Core architecture:** logic is extracted from the `app.js` monolith into pure ES
   modules `src/core/*` (ADR-0001): `translit`, `layout`, `svg`, `compose`,
   `karaoke-frame`, `timing`, and **`feed`** (the `feed_v1` vertical template). The modules
   have no DOM/globals; `app.js` wraps them.
4. **Headless render:** `render.html` is loaded by Puppeteer and calls
   `window.renderVerse()` — the surface for batch video rendering (no UI).
5. **Validation & index:** `python tools/validate_library.py` (schema + publish-readiness
   checks), `python tools/build_index.py` (rebuild the catalogue index).
6. **Conventions:** session journal — `.ai_state.md`; architecture decisions —
   `docs/adr/*`; all files UTF-8 **without BOM**.

---

## 2. Drop Producer — "chapter → videos → posts" in one command
**Goal:** turn a batch chapter recording into a set of publish-ready karaoke videos with
captions, hashtags, and funnel links. This is the heart of the new layer.

### Workflow:
1. **Audio:** Uṣā Saṅkā records a whole chapter in one session (batch recording). Files are
   named after the verse `id` — `bhg_2_47.m4a`, `bhg_2_48.m4a`, etc. — in one folder.
2. **Render dependency:** once — `npm install --prefix tools` (Puppeteer).
3. **One command:**
   ```sh
   python tools/build_chapter.py <audio_dir>
   ```
   which runs, in order:
   * **`align_chapter.py --write`** — auto-timing from mora weight (guru = 2, laghu = 1)
     and audio onsets; writes the `timing` field into the verse JSON;
   * **`render_chapter.js`** — renders `feed_v1` (vertical 9:16 MP4 @ 30 fps) plus
     `.srt`/`.vtt` subtitles → `dist/`;
   * **`post_kit.py`** — RU/EN captions, hashtags, and per-platform UTM CTAs →
     `drop/<chapter>/<id>/`.
4. **Useful flags:** `--dry-run` (print the plan and commands, run nothing),
   `--only id1,id2`, `--format 9:16|1:1`, `--skip-align/--skip-render/--skip-postkit`.
5. **QA:** syllables with low auto-timing confidence are highlighted orange in the Timing
   Editor — fix them there if needed. The closing readiness summary lists anything still
   blocking publication (e.g. missing audio).
6. **Scheduling & posting:** `python tools/schedule_drops.py --config schedule.yaml` builds
   the posting plan (`drop/schedule_plan.json`) from a cadence file (`schedule.example.yaml`
   → copy to `schedule.yaml`). Add `--live` to actually post via the per-platform publishers
   (Telegram, VK, Facebook, Instagram, WordPress). **Safety:** a publisher fires *only* when
   `--live` is set **and** that platform's credentials are in the environment — otherwise it
   reports `skip` and makes no network call. Credentials are listed in Appendix D.

---

## 3. Rights Manager — clearance before publishing
**Goal:** make sure no video is published until **both the audio and the translation** are
cleared. Not a formality: both the chant and the Russian translation are someone else's
intellectual property.

### What is cleared, and how:
| Layer | Source | Status | Recorded in |
| :--- | :--- | :--- | :--- |
| **EN translation** | Telang (1882) | public domain (`public-domain`) | `translation.rights.en` |
| **RU translation** | Sementsov (under copyright in Russia until end of 2056) | **licensed** via a permission letter from his daughter (heir) — `cleared` | `translation.rights.ru`, `permission_ref: SK-LIC-2026-002/…` |
| **Audio** | Uṣā Saṅkā, `SK-LIC-2026-001` | draft agreement + no recordings yet → **the only remaining gate** | `audio.license` |

### Workflow:
1. **Rights field:** in every `verses/data/*.json`, the `translation.rights` block stores
   the rights holder, source, license, `permission_ref`, and `status`.
2. **Automatic blocking:** `validate_library.py` and `post_kit.py` refuse to publish
   anything not cleared — only `public-domain`, `own-work`, or `cleared` may go out. An
   un-cleared RU translation produces `caption_ru.BLOCKED.txt` instead of a caption and
   drops the verse's "ready to publish" flag.
3. **Agreements:** generated by scripts — `docs/legal/make_agreement.js` (audio,
   SK-LIC-2026-001) and `docs/legal/make_sementsov_agreement.js` (translation,
   SK-LIC-2026-002). The `.docx` drafts keep blank fields (name/address/date/scope) until
   the rights holder's details arrive.

---

## 4. The Curator — Teaching Pipeline and Evals
**Goal:** maintain the quality of the verse library and monitor platform efficiency.

### Workflow:
1. **Content ingestion:** review a Pull Request containing new verse JSONs.
2. **Automated validation** — the **Teaching Pipeline** (LangGraph) runs:
   * **VerseCurator** checks schema compliance;
   * **ContentEnricher** (via Gemini Flash) fills in missing RU/EN translations and tags —
     machine translations are marked in `provenance`;
   * **QualityGate** ensures the meter name matches the metrical structure;
   * **StudentAnalyzer** analyses SRS history and recommends the next study queue.
3. **Observability check:** `python tools/cost_dashboard.py` (budget ≈ **$0.10/verse**),
   `python tools/student_stats.py` (verses that turned out harder than expected).
4. **Eval benchmarking:** `python evals/judge.py` — a "golden set" of 8 cases in
   `evals/golden/`; confirm the LLM translations did not regress after a pipeline change.

---

# Part II. End-users

## 5. Viewer → Student — the social-media funnel
**Goal (for the project):** a free vertical video brings a viewer to the paid course. There
is no paywall — the video *is* the funnel.

### The viewer's path:
1. **Sees a `feed_v1` clip** on Telegram / VK / Facebook / Instagram (or as a WordPress post): a dark vertical frame —
   ॐ, title and meter (hook) → Devanagari with a per-line syllable highlight under the chant
   (karaoke-fill) → an end-card with the translation and a button in the final seconds.
2. **Taps the CTA** `samskrtam.ru/usha-sanka` — the link is UTM-tagged by platform and
   verse, so it is visible **which verses and templates convert**.
3. **Becomes a course student**, and/or moves into the browser player below.

---

## 6. The Content Creator (Teacher / Scholar)
**Goal:** transform a raw Sanskrit text and an audio recording into a structured lesson for
the library — which then becomes source material for the video pipeline.

### Workflow:
1. **Text input:** open `index.html`, paste the half-verses (s1/s2). The meter is detected
   automatically and the wave diagram is rendered.
2. **Audio integration:** load the `.mp3`/`.wav`.
3. **Metrical polish:** right-click syllables to correct weights (Guru/Laghu) if
   auto-detection missed a nuance (e.g. *muta cum liquida*).
4. **Timing approval:** auto-alignment detects phrases/pauses and produces one timestamp per
   syllable at its earliest audible onset. Existing chandas logic supplies pāda/mātrā constraints
   for ślokas; no manual sūtra boundaries are required. Open the **Timing Editor** to review only
   flagged points, with a target of under one minute per clip. A real pause clears the red dot.
5. **Metadata & export:** fill in the **Library Export** form (translations, difficulty,
   tags), download `[id].json` into `verses/data/`. Export a high-resolution **PNG** for
   handouts and a **Karaoke MP4** for social media.
6. **Cloud save:** save the session to Google Drive for future corrections.

> Verses from the library are then rendered in batch with the `feed_v1` template (see
> scenario 2), so clean metadata and timing here save work for the drop producer.

---

## 7. The Active Learner (Student)
**Goal:** systematically memorize a verse and master its metrical rhythm using spaced
repetition.

### Workflow:
1. **Discovery:** `catalogue.html` (or the Telegram Mini App), filter by difficulty/meter.
2. **Study session:**
   * **Phase A (Full mode):** listen to the audio while watching the syllable labels.
   * **Phase B (Dots mode):** hide the text, follow the metrical pulse, chanting aloud.
   * **Phase C (Blind mode):** only the moving highlight dot — recall from memory.
3. **Self-assessment:** **Quizzes** (identify the meter, fill in the hidden syllable,
   beat-tap the rhythm), then rate recall (😊/😐/😕) — SM-2 schedules the repetitions.
4. **Cloud sync:** **Cloud Sync** saves progress to Firebase across devices.

---

## 8. The Offline Practitioner (Mobile/Traveler)
**Goal:** keep studying during a commute or in areas with poor connectivity.

### Workflow:
1. **Preparation:** load a verse once while online — the session data is cached.
2. **Offline:** open `student.html?id=[id]`; the **Service Worker** serves the UI and the
   **Drive Fallback** loads the verse from local cache.
3. **Indicator:** the header shows **"Offline Mode (Cached)"**.
4. **Sync-back:** when connectivity returns, `progress.html` syncs the results to Firebase.

---

# Appendix A — First-drop checklist (Drop Producer)

End to end, from a chapter's audio to scheduled posts:

1. ☐ **Verses exist** in `verses/data/` for every recorded line; `python tools/validate_library.py` passes.
2. ☐ **Rights cleared** — `validate_library.py` reports no *"not cleared to publish"* warnings (EN/RU), and the audio license is in place.
3. ☐ **Audio named** `<verse_id>.<ext>` (e.g. `bhg_2_47.m4a`), all in one folder.
4. ☐ **Puppeteer installed** — `npm install --prefix tools` (once).
5. ☐ **Dry run** — `python tools/build_chapter.py <audio_dir> --dry-run` shows the right verses matched and no orphan audio.
6. ☐ **Build** — `python tools/build_chapter.py <audio_dir>` → `dist/*.mp4` + `.srt`/`.vtt` + `.png`, and `drop/<chapter>/<id>/`.
7. ☐ **QA timing** — review orange (low-confidence) syllables in the Timing Editor; re-align or hand-fix where needed.
8. ☐ **Readiness** — every verse's `manifest.json` shows `ready_to_publish: true` (no gates).
9. ☐ **Schedule** — copy `schedule.example.yaml` → `schedule.yaml`, then `python tools/schedule_drops.py` → `drop/schedule_plan.json`.
10. ☐ **Publish** — `python tools/schedule_drops.py --live` posts to every platform whose credentials are set (Telegram needs only a BotFather token); the rest are skipped cleanly. Credentials → Appendix D.

---

# Appendix B — Command reference

| Command | What it does |
| :--- | :--- |
| `python -m http.server 8000` | Serve the browser app locally |
| `node --check src/scripts/app.js` | Syntax-check the app monolith |
| `python tools/validate_library.py` | Validate all verses + publish-readiness gates |
| `python tools/validate_verse.py <file>` | Validate a single verse JSON |
| `python tools/build_index.py` | Rebuild the catalogue index |
| `python tools/build_chapter.py <audio_dir>` | **Full pipeline:** align → render → post-kit (`--dry-run` to preview) |
| `python tools/align_chapter.py <audio_dir> --write` | Auto-timing → verse JSON `timing` field |
| `node tools/render_chapter.js <audio_dir>` | Render `feed_v1` MP4 + `.srt`/`.vtt` → `dist/` |
| `python tools/post_kit.py --all` | Captions + hashtags + per-platform UTM CTAs → `drop/` |
| `python tools/schedule_drops.py --config schedule.yaml` | Posting plan → `drop/schedule_plan.json` |
| `python tools/make_student.py` | Regenerate `student.html` from the template |
| `python tools/cost_dashboard.py` | LLM enrichment cost report (Teaching Pipeline) |
| `python tools/student_stats.py` | Per-verse difficulty from student statistics |
| `python evals/judge.py` | LLM-as-judge eval over the golden set |

**Output layout:**

- `dist/` — `<id>_9x16.mp4`, `<id>.srt`, `<id>.vtt`, `<id>.png` (thumbnail). *(git-ignored)*
- `drop/<chapter>/<id>/` — `caption_en.txt`, `caption_ru.txt` (or `caption_ru.BLOCKED.txt`), `hashtags.txt`, `manifest.json`. *(git-ignored)*

---

# Appendix C — Glossary

- **guru / laghu** — heavy / light syllable; the metrical weights the wave diagram shows (guru dark red, laghu dark green).
- **pada** — a quarter of a verse; an anuṣṭubh has 4 padas of 8 syllables.
- **mora** — prosodic timing unit; the aligner weights guru = 2 morae, laghu = 1.
- **feed_v1** — the native-vertical (1080 × 1920) social karaoke template (`src/core/feed.js`).
- **drop kit** — the `drop/<chapter>/<id>/` folder: captions, hashtags, UTM CTAs, and a `manifest.json`.
- **publish gate** — a reason a verse may not be published yet (un-cleared rights, missing audio); enforced by `validate_library.py` and `post_kit.py`.
- **UTM** — campaign tags appended to the CTA link so the funnel can measure which verses and templates convert.
- **clearance / `cleared`** — a translation or audio source confirmed legal to publish (`public-domain`, `own-work`, or licensed).

---

# Appendix D — Publisher credentials

`python tools/schedule_drops.py --live` posts via `tools/publishers.py`. A publisher runs
**only** when `--live` is set **and** all of its environment variables are present; otherwise
it is skipped with no network call. Keep these in a git-ignored `.env` — never commit them.

| Platform | Env vars | Where to get them | Notes |
| :--- | :--- | :--- | :--- |
| **Telegram** | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID` | @BotFather → `/newbot`; add the bot as a channel admin | No review — easiest, start here. Uploads the local MP4. |
| **VK** | `VK_ACCESS_TOKEN`, `VK_OWNER_ID` | a VK app / community access token; `VK_OWNER_ID` = the community wall id (negative) | Uploads via `video.save` → `wall.post`. |
| **Facebook** | `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN` | developers.facebook.com → app → Page access token | Posts to the Page's videos. |
| **Instagram** | `IG_BUSINESS_ACCOUNT_ID`, `IG_ACCESS_TOKEN`, `IG_VIDEO_BASE_URL` | Meta app + IG Business/Creator account; App Review for `instagram_content_publish` | **Needs the MP4 at a public URL** (`IG_VIDEO_BASE_URL`/`<id>_9x16.mp4`) — IG can't take a local file. |
| **WordPress** | `WP_BASE_URL`, `WP_USER`, `WP_APP_PASSWORD` | WP Admin → Users → Application Passwords | Uploads the video and creates a **draft** post (review before publish). |

### `.env` quick start

Copy **`.env.example`** → **`.env`** (git-ignored), fill in the platforms you want, then:

```sh
python tools/schedule_drops.py --live
```

`--live` auto-loads `.env`. A platform posts only when **all** its vars are set; the rest are
skipped with no network call. Without `--live` (or without creds) every entry shows
`skip` / `dry-run` and nothing is sent. Telegram, VK, Facebook and WordPress upload the local
`dist/` MP4 directly; Instagram is the exception — it fetches the file from a public URL
(`IG_VIDEO_BASE_URL`).

### Where to get each

**Telegram** — no review, start here.
1. Message **@BotFather** → `/newbot` → copy the bot **token** → `TELEGRAM_BOT_TOKEN`.
2. Create your channel and add the bot as an **admin** with post rights.
3. `TELEGRAM_CHANNEL_ID` = `@publicusername`, or the numeric `-100…` id for a private channel (forward a channel post to `@userinfobot` to read it).

**VK**
1. Create a **Standalone** app at [dev.vk.com](https://dev.vk.com/).
2. Get a token with the `video` + `wall` scopes — a community token (Community → Manage → API usage → Create token) or an OAuth token with `scope=video,wall,offline` → `VK_ACCESS_TOKEN`.
3. `VK_OWNER_ID` = the community wall id as a **negative** number (e.g. `-123456789`); find the numeric id via [regvk.com/id](https://regvk.com/id/) or the group page source.

**Facebook** (Page)
1. [developers.facebook.com](https://developers.facebook.com/) → **Create App** (Business).
2. In the Graph API Explorer, select your Page and grant `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`.
3. Exchange for a **long-lived Page token** (Access Token Debugger → "Extend Access Token") → `FB_PAGE_ACCESS_TOKEN`.
4. `FB_PAGE_ID` = Page → About → "Page transparency" (or `GET /me/accounts`).

**Instagram** (Reels — needs a public video URL)
1. Make the IG account **Business/Creator** and link it to the Facebook Page.
2. Same Meta app; request `instagram_basic` + `instagram_content_publish` (**App Review** + business verification for live use) → `IG_ACCESS_TOKEN`.
3. `IG_BUSINESS_ACCOUNT_ID` = `GET /{page-id}?fields=instagram_business_account`.
4. `IG_VIDEO_BASE_URL` = a public base URL serving `dist/<id>_9x16.mp4` (e.g. `https://samskrtam.ru/karaoke/video`).

**WordPress** (creates a draft)
1. `WP_BASE_URL` = site root, e.g. `https://samskrtam.ru` (no trailing slash).
2. WP Admin → **Users → Profile → Application Passwords** → name it → "Add New Application Password" → copy → `WP_APP_PASSWORD` (WordPress 5.6+ over HTTPS).
3. `WP_USER` = your WordPress login.
