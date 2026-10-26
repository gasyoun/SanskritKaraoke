# Record-and-score MVP — the student speaks (H6317 runbook)

_Created: 10-10-2026 · Last updated: 11-10-2026_

The listen-repeat-score loop: the student presses «🎙 Записать себя» on
[student.html](https://github.com/gasyoun/SanskritKaraoke/blob/main/student.html),
reads the verse aloud, and gets a per-syllable grade rendered as heat rings on
the wave diagram, a rhythm %, and three weakest-syllable drill hints (RU-first
interface).

## How it works

```
student.html ── MediaRecorder (audio/webm; video-export pattern app.js:1406)
   └─► POST /sk-grade/api/grade?verse=<id>   (raw audio body, ~≤12 MB)
        samskrte.ru nginx ──► 127.0.0.1:8791 tools/serve_grade.py (systemd sk-grade, vps92)
             └─► tools/grade_take.py
                   ├─ decode_audio_ffmpeg + detect_onsets + detect_pada_bounds
                   │  + calc_auto_timing + phoneme-rule snap  (tools/align_chapter.py
                   │  internals, H5223 layers 1/3/4; whisper warp optional via
                   │  SK_GRADE_WHISPER=1 + faster_whisper in the venv)
                   ├─ reference timing: verse.timing (real Uṣā Saṅkā alignment,
                   │  20 subh verses) else tools/fixtures/<id>_timing.json (dev)
                   └─ monotonic DP assignment of detected onsets to tempo-
                      normalised reference positions → per-syllable delta
```

**Grading semantics.** A global least-squares tempo fit (student ≈ a·ref + b,
seeded from first/last onsets, refined by 3 EM rounds with outlier trimming)
normalises uniform tempo drift out of the deltas — a student 15 % slower is
graded on rhythm, not speed. `grade = max(0, round(100·(1 − |Δ|/0.30)))` per
syllable (300 ms normalised onset error → 0); a syllable with no matched onset
is «не услышан» (0). `rhythm_percent` = mean over all syllables.

**Response JSON:** `verse_id`, `rhythm_percent`, `tempo_scale`,
`tempo_shift_s`, `reference_source`, `per_syllable.{s1,s2}[]` (`index`, `syl`,
`type`, `ref_s`, `student_s`, `snapped`, `delta_ms`, `grade`, `heat`),
`weakest3[]` (`pada`, `index`, `syl`, `delta_ms`, `grade`, RU `hint`), `meta`.
Sample: [tools/fixtures/subh_2745_grade_sample.json](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/fixtures/subh_2745_grade_sample.json).

**Frontend:** [src/scripts/record_grade.js](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/scripts/record_grade.js).
Heat rings are additive SVG overlays on `g.syl-node[data-key][data-col]`
(tooltip: syllable · points · ms); a numeric strip renders under each wave.
The wave SVG rebuilds on some UI actions and wipes the rings — the result
card survives; `window.SKRecordGrade.repaint(lastResult)` restores heat.

## Dev run (60-second manual flow)

```bash
python3 -m http.server 8123                     # repo root
SK_GRADE_PORT=8791 python3 tools/serve_grade.py # needs ffmpeg + numpy
```

Open `http://localhost:8123/student.html?id=subh_2745`, in devtools:
`localStorage.sk_grade_url = 'http://127.0.0.1:8791/api/grade'`, reload →
press «🎙 Записать себя», read the verse, press «⏹ Остановить и оценить» →
rhythm %, rings on the wave, strip numbers, three drill chips. Prod default
endpoint: `https://samskrte.ru/sk-grade/api/grade` (override:
`window.SK_GRADE_URL`).

## Deploy (vps92, alongside Systema)

**One command** (H6501). Before this script the merge-to-prod path was 8
hand-typed shell commands (the H6317 record below) with an undocumented
rollback; the deploy path is now
`git fetch → checkout origin/main → install the unit → restart → healthz gate
→ auto-rollback`:

```bash
# one-time bootstrap on the box: the script must live OUTSIDE the prod clone,
# because a deploy checks out a new revision under the script's own feet
install -m 0755 /opt/sk-grade/SanskritKaraoke/deploy/deploy_sk_grade.sh /usr/local/sbin/sk-grade-deploy

# every deploy after that — one command
/usr/local/sbin/sk-grade-deploy
```

The script ([deploy/deploy_sk_grade.sh](https://github.com/gasyoun/SanskritKaraoke/blob/main/deploy/deploy_sk_grade.sh)):

1. `git fetch --prune --tags origin` in `/opt/sk-grade/SanskritKaraoke`
   (unshallows the `--depth 1` clone first, so the previous revision stays
   rollback-able);
2. `git checkout -B main origin/main` — refuses to run on a dirty tree;
3. installs `deploy/sk-grade.service` over `/etc/systemd/system/sk-grade.service`
   (byte-equal to the repo copy; the previous unit is kept as
   `sk-grade.service.bak-<ts>`) + `systemctl daemon-reload`;
4. `systemctl restart sk-grade`;
5. **healthz gate** — `GET http://127.0.0.1:8791/healthz` must answer `200`
   (10 attempts × 3 s; the public URL is probed afterwards as a warning only,
   because nginx is not part of the deploy);
6. **auto-rollback** on a failed gate — checkout the previous revision, restore
   the previous unit, restart, re-probe.

Exit codes: `0` deploy ok · `1` preflight error (dirty tree, missing clone,
not root) · `3` deploy failed but the rollback restored a healthy service (the
new revision is suspect) · `4` deploy failed **and** the rollback did not
restore health (a human is needed). A deploy log is appended to
`/var/log/sk-grade-deploy.log`.

The manual path this replaces (H6317 record, kept for the first deploy of a
fresh box):

```bash
ssh root@100.85.73.83
mkdir -p /opt/sk-grade && cd /opt/sk-grade
git clone --depth 1 https://github.com/gasyoun/SanskritKaraoke.git
python3 -m venv venv && venv/bin/pip install numpy   # ffmpeg: apt ffmpeg
cp SanskritKaraoke/deploy/sk-grade.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now sk-grade
# nginx: add deploy/nginx-sk-grade.conf locations to sites-enabled/samskrte.ru
nginx -t && systemctl reload nginx
curl -s https://samskrte.ru/sk-grade/healthz        # {"ok": true}
```

### Rollback (H6501)

Automatic — the deploy script rolls back by itself when the healthz gate
fails. Manual rollback (if the service is already unhealthy):

```bash
cd /opt/sk-grade/SanskritKaraoke
git checkout --detach <last-good-rev>     # or: git log --oneline -5
systemctl restart sk-grade
curl -s http://127.0.0.1:8791/healthz    # {"ok": true}
```

If the unit changed with the deploy, restore it from the backup the script
kept: `ls -t /etc/systemd/system/sk-grade.service.bak-*` → `cp` the newest
over the live unit → `systemctl daemon-reload && systemctl restart sk-grade`.

## Observability — healthz uptime timer (H6502, 11-10-2026)

A systemd timer on vps92 probes `https://samskrte.ru/sk-grade/healthz` every
5 min (`OnUnitActiveSec=300s`) and alerts on non-200 through the hermes
Telegram sink (`/home/hermes/bin/hermes_notify.sh page`, the H6320 backrest
pattern): one page on the first failure, a reminder every 12th failure
(≈hourly), and a RECOVERED page after any failure run. The probe is a
read-only GET; state lives in `/var/lib/sk-grade-healthz/consecutive_failures`,
outcomes in `/var/log/sk-grade-healthz.log` (both directions witnessed live
20:47Z 11-10-2026: OK 200 → synthetic FAIL 000 → RECOVERED 200).

```bash
# install (files are byte-equal to deploy/ copies)
cp SanskritKaraoke/deploy/sk-grade-healthz-monitor.sh /usr/local/sbin/
cp SanskritKaraoke/deploy/sk-grade-healthz-monitor.{service,timer} /etc/systemd/system/
cp SanskritKaraoke/deploy/sk-grade-healthz-monitor.default /etc/default/sk-grade-healthz-monitor
systemctl daemon-reload && systemctl enable --now sk-grade-healthz-monitor.timer
systemctl list-timers sk-grade-healthz-monitor.timer          # NEXT ≈ +5 min
journalctl -u sk-grade-healthz-monitor.service -n 2           # the OK/FAIL lines
```

Residual (MG): a dedicated Better Stack heartbeat URL can be dropped into
`SK_GRADE_HEARTBEAT_URL` in `/etc/default/sk-grade-healthz-monitor` — the
script then also pings it ok//fail, mirroring `samskrte-internals-heartbeat`
(dead-man's-switch). Left empty until MG mints one.

## Limits / residuals

- No lead-strip: a student saying «subhāṣitam…» before the verse shifts the
  first pada (the span-seeded tempo fit absorbs much of it).
- Whisper warp is **ON in prod** — `SK_GRADE_WHISPER=1` in the live unit since
  the H6333 venv install, and the committed
  [deploy/sk-grade.service](https://github.com/gasyoun/SanskritKaraoke/blob/main/deploy/sk-grade.service)
  now says the same (H6501 back-ported the live truth; the H6398 audit row
  R-2 recorded the drift). The flag is the one-line switch to turn it off
  again; `faster_whisper` must be present in the prod venv
  (`venv/bin/pip install faster_whisper`) or the service must not be started
  with the flag on.
- bhg_2_47 grades against the synthetic H3261 fixture (`auto_generated: true`)
  — dev-only stand-in until the G1 rights gate ships real reference audio.
  NO reference audio is published by this feature (timing JSON only).
- Heat rings/strip do not survive a wave rebuild; the result card does.

## Tests

[tests/test_grade_take.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tests/test_grade_take.py)
(perfect take ≥85 rhythm and ≥90 % anchored; +250 ms syllable lands in
weakest3; ×1.15 tempo normalised to ≥75; subh_2745 real reference end-to-end;
error paths) ·
[tests/test_grade_server_e2e.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tests/test_grade_server_e2e.py)
(spawned server, healthz, CORS preflight, POST → grade JSON, 4xx error
contracts).

_Dr. Mārcis Gasūns_
