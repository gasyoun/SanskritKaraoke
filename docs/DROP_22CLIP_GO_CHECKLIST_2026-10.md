# 22-clip drop — GO checklist: exactly 3 human acts

_Created: 09-10-2026 · Last updated: 09-10-2026_

Unblock package for the Uṣā Saṅkā 22-clip drop (prepared in the 19-09 H4474 pass; publish row of [MY_ROADMAP.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/MY_ROADMAP.md)). Everything machine-side is green and proven below; publishing is gated by **exactly three human acts** — nothing else is owed by an agent. This packaging performed zero irreversible acts: no credentials touched, no rights act, nothing posted.

## State: 20 kits live, 2 pulled pending act ③

The drop is 22 clips; `subh_3977` / `subh_4313` verse JSONs + renders + kits were pulled until M.G. identifies their texts (19-09 mapping audit: the recitals are **not** the Böhtlingk sayings their filenames matched). The scheduling machinery is proven on the real 20-kit drop; the 2 clips rejoin after act ③.

## Dry-run proof (green, exit 0)

```
$ python3 tools/post_kit.py subh_2745 subh_0292 subh_0448 subh_0513 subh_0605 subh_1221 \
    subh_1375 subh_1584 subh_1919 subh_2307 subh_2805 subh_4156 subh_4172 subh_4488 \
    subh_4693 subh_5864 subh_5883 subh_5909 subh_6114 subh_7377
… 0/20 verse(s) ready to publish; 20 gated. Kits under drop/

$ cp schedule.example.yaml schedule.yaml   # start: 2026-10-12, campaign: subh
$ python3 tools/schedule_drops.py --include-gated
config    : schedule.yaml  (per_day=1, platforms=telegram,vk,facebook,instagram,wordpress, stagger=20m, tz=Europe/Moscow)
creds     : configured=—; missing=telegram,vk,facebook,instagram,wordpress
manifests : 20 found; 0 skipped as not-ready
plan      : 100 scheduled post(s)

when              tz             verse      platform   ready
2026-10-12 09:00  Europe/Moscow  subh_0292  telegram   gated
2026-10-12 09:20  Europe/Moscow  subh_0292  vk         gated
…
2026-10-31 09:00  Europe/Moscow  subh_7377  telegram   gated
…
Wrote plan → drop/schedule_plan.json
$ echo $?
0
```

20 verses × 5 platforms, 2026-10-12 → 2026-10-31 at 1 verse/day ([tools/schedule_drops.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/schedule_drops.py), config from [schedule.example.yaml](https://github.com/gasyoun/SanskritKaraoke/blob/main/schedule.example.yaml), committed as [schedule.yaml](https://github.com/gasyoun/SanskritKaraoke/blob/main/schedule.yaml)). Every row reads `gated` — correct: readiness flips only after the acts below. A publisher fires only with `--live` **and** its credentials present; without them it is skipped with no network call.

Kit provenance: the 19-09 pass left `drop/` + `dist/` as gitignored local artifacts on the drain box (win box, offline since 04-10; not present on this Mac). Kits are deterministic from `verses/data/`, so they were rebuilt 09-10 with [tools/post_kit.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/post_kit.py) exactly as above (verse list = the 31 high-confidence H4474 manifest nums − 9 failed anuṣṭubh screen − pulled 3977/4313; `subh_0192`'s clip is in the drop as re-identified [verses/data/subh_2745.json](https://github.com/gasyoun/SanskritKaraoke/blob/main/verses/data/subh_2745.json)). The dry-run needs no renders — `dist/` matters only at `--live` media attach; renders regenerate via the documented build/render pipeline when the drop goes live.

## ① Sign / collect the Uṣā Saṅkā agreement — ~30 min active + Uṣā's turnaround

1. Print the ready draft ([docs/USHA_SANKAR_RECORDING_PERMISSION_AGREEMENT_2026-09.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/USHA_SANKAR_RECORDING_PERMISSION_AGREEMENT_2026-09.md); print-ready docx twin is a gitignored build artifact — regenerate with `node docs/legal/make_agreement.js`, a copy already sits in the main clone's `docs/legal/`) — or send the draft to Uṣā for e-signature.
2. Collect the signed copy (scan/e-sign PDF) from Uṣā.
3. File the signed PDF at `docs/legal/` and flip the rights row [docs/legal/RIGHTS_USHA_SANKA_SK-LIC-2026-001.md](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/legal/RIGHTS_USHA_SANKA_SK-LIC-2026-001.md) (SK-LIC-2026-001) from draft to signed, with the date + file name.

## ② Create the karaoke channel bot + paste the token — ~15 min

1. In Telegram, open [@BotFather](https://t.me/BotFather) → `/newbot` → name it for the dedicated karaoke channel (default from the grill, amendable), e.g. «SanskritKaraoke Drop Bot».
2. Copy the token BotFather gives.
3. Paste into the repo-root `.env` (gitignored):

```bash
TELEGRAM_BOT_TOKEN=<token from BotFather>
TELEGRAM_CHANNEL_ID=<numeric id of the dedicated karaoke channel>
```

These are the exact keys [tools/publishers.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/publishers.py) reads for telegram (repo-root `.env`, loaded without overriding the environment). After this step `--live` can post to telegram; vk/facebook/instagram/wordpress stay skipped until their creds are added — non-blocking, the dry-run above proves the plan either way.

## ③ Identify `subh_3977` / `subh_4313` — M.G.-only, ~10 min listen + reply

Both audio files are queued locally (fetched 09-10 from `yadisk:Subhashitas-Systematic/` via the H4474 WebDAV route; byte sizes match [audio_manifest.tsv](https://github.com/gasyoun/Systema-Sanscriticum/blob/main/docs/H4474-subhashita-audio-srs/audio_manifest.tsv) exactly) at `~/Documents/backups/usha-22clip-identification-2026-10-09/`:

| clip | yadisk source | size (byte-verified) | recital opening (whisper, 19-09 pass) | filename-matcher's wrong candidate |
|---|---|---|---|---|
| `subh_3977` | `Subhashitas-Systematic/Su86-Paraih.mp3` | 322 697 B | «paraiḥ eva proktā guṇā yasya…» | Saying 3977 «paraiḥ saṃbhujyate rājyaṃ svayaṃ pāpasya bhājanam» |
| `subh_4313` | `Subhashitas-Systematic/Su29-Prana.mp3` | 305 979 B | «prāṇān… parityajya… mānaṃ… rakṣata… śubhaṃ bhūyāt» | Saying 4313 «prāṇā yathātmano 'bhīṣṭā bhūtānāmapi te tathā» |

Reply with each recital's text identity (source/anthology + saying number). A follow-up agent pass then re-imports the 2 verses + kits and the drop becomes 22.

## After all three acts

Re-run `python3 tools/schedule_drops.py` (config already committed): rows flip to ready as the gates clear (audio drive id / canonical url per verse is the remaining TODO noted in each kit), then `--live` posts per the plan. NO posting happens until that explicit command.

_Dr. Mārcis Gasūns_
