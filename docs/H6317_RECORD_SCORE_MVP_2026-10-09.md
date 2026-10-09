# Record-and-score MVP — the student speaks (H6317 runbook)

_Created: 10-10-2026 · Last updated: 10-10-2026_

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

## Limits / residuals

- No lead-strip: a student saying «subhāṣitam…» before the verse shifts the
  first pada (the span-seeded tempo fit absorbs much of it).
- Whisper warp off by default (latency + venv weight); `SK_GRADE_WHISPER=1`
  after `venv/bin/pip install faster_whisper` enables the H5223 word-times
  path over the student take.
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
