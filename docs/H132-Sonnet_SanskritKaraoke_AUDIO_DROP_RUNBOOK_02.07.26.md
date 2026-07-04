# Audio Drop Runbook — "I have the recordings, what now?"

_Created: 02-07-2026 · Last updated: 02-07-2026_

This is the exact sequence from **audio files in hand** to **scheduled posts**. Written for
M.G. (the human) and for the agent session that executes it. The pipeline is code-complete
and has never run on real audio — this document is the contract for that first run.
A **synthetic end-to-end run** (fake chanting-like audio, 02-07-2026) passed: 3/3 aligned,
3/3 rendered (MP4 + SRT/VTT + thumbnail), post-kits correctly gated. It also caught and
fixed a real blocker (renderer `file://` ES-module CORS), so real audio won't be run #1.

**TL;DR — one command does the heavy lifting:**

```sh
python tools/build_chapter.py <audio_dir>
```

---

## Step 0 — What M.G. hands over (the only human inputs)

1. **A folder of audio files**, one per verse, named `<verse_id>.<ext>` — e.g.
   `bhg_2_47.mp3`. Accepted extensions: `.mp3 .wav .ogg .m4a .flac .opus .aac`.
   Every file must match a verse JSON in
   [verses/data/](https://github.com/gasyoun/SanskritKaraoke/tree/main/verses/data)
   (currently `bhg_2_47`, `bhg_2_48`, `bhg_2_49`). Audio for a verse without JSON is
   reported as an orphan and skipped, not an error.
2. **Telegram bot credentials** (only if this drop should post live): `TELEGRAM_BOT_TOKEN`
   + `TELEGRAM_CHAT_ID` in `.env` — see
   [.env.example](https://github.com/gasyoun/SanskritKaraoke/blob/main/.env.example)
   and Appendix D of
   [docs/USE_CASES.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/USE_CASES.md).
   Without creds the scheduler still produces the full plan; it just skips posting.

Nothing else is on M.G. — everything below is agent-executable.

## Step 1 — Pre-flight (agent, ~5 min)

- `npm install --prefix tools` — Puppeteer for the headless renderer
  ([tools/render_chapter.js](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/render_chapter.js)).
  First install triggered 02-07-2026; re-verify with `node tools/render_chapter.js --help`.
- `python tools/validate_library.py` — must show 0 errors (warnings about missing audio
  will disappear as timings land).
- `python tools/build_chapter.py <audio_dir> --dry-run` — readiness report: which verses
  have audio, which are orphans, node/puppeteer pre-flight. Fix anything red before the
  real run.

## Step 2 — The batch run (agent, one command)

```sh
python tools/build_chapter.py <audio_dir>
```

What it does, in order
([tools/build_chapter.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/build_chapter.py)):

1. **Align** — [tools/align_chapter.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/align_chapter.py)
   writes per-syllable timings into each verse JSON (`--no-write` keeps them as sidecars
   instead).
2. **Render** — Puppeteer drives
   [render.html](https://github.com/gasyoun/SanskritKaraoke/blob/main/render.html) with the
   `feed_v1` template → `dist/<id>_9x16.mp4` + `dist/<id>.png` thumbnail per verse.
3. **Post-kit** — [tools/post_kit.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/post_kit.py)
   writes `drop/<id>/` with `caption_en.txt`, `caption_ru.txt`, hashtags, per-platform UTM
   CTAs to https://samskrtam.ru/usha-sanka, and a readiness manifest.

`dist/` and `drop/` are gitignored — outputs are artifacts, not repo content.

## Step 3 — QA (human + agent, target ≤2 min/verse)

- **Watch each MP4** in `dist/` — highlight must track the chanting; this is the go/no-go.
- If a verse's timing is off: open it in the app's Timing Editor (auto-timings load from
  the verse JSON), nudge only the bad syllables, re-export, re-render that one verse with
  `--only <id>`.
- Optionally quantify: `python tools/eval_alignment.py --audio <audio_dir>` (acceptance
  target: ≥90% of syllables within ±50 ms). First real audio also activates the parked
  eval harness — export a session per verse for
  [tools/extract_timing_from_session.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/extract_timing_from_session.py).

## Step 4 — Schedule the drop

```sh
cp schedule.example.yaml schedule.yaml   # once; edit start date / slots / platform order
python tools/schedule_drops.py           # plan only — review it
python tools/schedule_drops.py --live    # posts; fires ONLY where platform creds exist
```

[tools/schedule_drops.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/schedule_drops.py)
spaces the chapter's verses across days/platforms per
[schedule.example.yaml](https://github.com/gasyoun/SanskritKaraoke/blob/main/schedule.example.yaml).
Publishers: Telegram / VK / Facebook / Instagram / WordPress
([tools/publishers.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/publishers.py));
each is hard-gated on its own env credentials — no creds, no network call. Gated verses
(manifest not `ready_to_publish`) are excluded unless `--include-gated`.

## Step 5 — Close the loop (agent, same session)

- Commit updated verse JSONs (timings) + `schedule.yaml`; bump
  [changelog.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/changelog.md).
- Record the run in [.ai_state.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/.ai_state.md)
  and check off the Phase 6 deliverable in
  [MY_ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/MY_ROADMAP.md).
- UTM click-through review after 1–2 weeks → which verses/captions convert.

---

## Session starter

When the audio folder exists, start the session with:

```
Read C:\Users\user\Documents\GitHub\SanskritKaraoke\docs\AUDIO_DROP_RUNBOOK.md and execute it. Audio is in <audio_dir>.
```

_Dr. Mārcis Gasūns_
