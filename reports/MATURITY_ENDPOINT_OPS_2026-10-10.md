# Maturity audit: SanskritKaraoke live endpoint ops (sk-grade) — verdict 2.4/5

_Audited: 2026-10-10 scope (probes executed 2026-10-11T18:45–18:48Z) · H6398 · Report-only, zero prod mutations._

**Frame (locked before data).** Five axes, each scored 0–5 by a machine-pullable threshold rule stated per axis below; headline = mean of the five. Adapted for a single-endpoint service: (1) deploy maturity, (2) public-endpoint security surface, (3) service observability, (4) scoring-path test coverage, (5) static-site↔endpoint drift. Same discipline as /maturity-audit (C60): the audit is an instrument, not a repair crew — findings mint handoffs, nothing was edited, restarted or fixed on .92 during the audit.

**Provenance.** Executor: OxAlpha (opencode, z-ai/glm-5.3-flash). Prod access: read-only ssh per the .92 runbook (H6317 pattern). Base of record: SanskritKaraoke origin/main `b1e2c74`; prod clone `/opt/sk-grade/SanskritKaraoke` @ `9b97a97`.

## Headline: 2.4 / 5  (deploy 1 · security 2 · observability 2 · tests 4 · drift 3)

**Top-3 levers** (cheapest moves, each with its evidence row):

1. **Throttle and bound the grading endpoint** — add an nginx `limit_req` zone on `/sk-grade/` (pattern already on the box for admin/login) and an app-level concurrency cap. Evidence: §2 rows S-4/S-5 (12×200 burst, unbounded `ThreadingHTTPServer`, whisper ON, peak 1.5 G). Moves security 2→4.
2. **One-command deploy + rollback script, and back-port the prod unit** — `deploy/deploy_sk_grade.sh` (git fetch/checkout → restart → healthz gate → auto-rollback to previous rev) and commit the live `SK_GRADE_WHISPER=1` into `deploy/sk-grade.service`. Evidence: §1 rows D-1/D-3/D-4 (8 manual steps, no rollback doc), §5 row R-2 (config drift). Moves deploy 1→3, drift 3→4.
3. **Wire `healthz` into a real uptime probe with alerting** — a 5-min timer on .92 (the `samskrte-internals-heartbeat.timer` pattern already exists on the same host) curling `/sk-grade/healthz` and alerting on non-200. Evidence: §3 rows O-3/O-4 (no monitor of any kind; only one-off acceptance bursts). Moves observability 2→4.

---

## Axis 1 — Deploy maturity: 1/5

Threshold: 5 = CI/one-command deploy + documented tested rollback + config-as-code; 3 = scripted deploy + rollback doc; 2 = scripted but unverified rollback; 1 = manual runbook exists, rollback undocumented; 0 = no deploy record.

| # | Metric | Value | Source command | Timestamp (UTC) |
|---|---|---|---|---|
| D-1 | Merge-to-prod path | fully manual, **8 shell commands / 5 logical steps**, zero CI | `docs/H6317_RECORD_SCORE_MVP_2026-10-09.md` "Deploy (vps92)" section (the H6317 deploy record): ssh → mkdir → `git clone --depth 1` → venv+`pip install numpy`+apt ffmpeg → `cp` unit + `daemon-reload` + `enable --now` → hand-insert nginx locations → `nginx -t && reload` → `curl …/healthz` | 2026-10-11T18:46Z (read) |
| D-2 | CI-to-prod automation | none — CI runs tests/CodeQL only; prod updates are hand-pulls on the box | `gh api repos/gasyoun/SanskritKaraoke/actions/runs` (workflow list has no deploy job) | 2026-10-11T18:46Z |
| D-3 | Rollback story | **undocumented** — no rollback section in runbook or unit; implied path is manual `git checkout <rev>` + `systemctl restart` | grep over runbook + `deploy/` dir: no rollback mention | 2026-10-11T18:46Z |
| D-4 | Prod update frequency | 1 update (#176 H6317c hotfix, landed 10-10 08:21 restart window) in 2 days of service life | `systemctl status sk-grade` (active since 2026-10-10 08:21:18) + prod clone reflog | 2026-10-11T18:45:50Z |
| D-5 | Crash self-healing | `Restart=always`, `RestartSec=3`, `NRestarts=0` | `systemctl show sk-grade -p Restart,RestartSec,NRestarts` | 2026-10-11T18:45:50Z |

## Axis 2 — Public-endpoint security surface: 2/5

Threshold: 5 = scoped auth + rate limit + hardened errors + least-privilege unit; 4 = rate limit + least-privilege, auth not needed by design and documented; 3 = rate limit present; 2 = size cap + least-privilege but no throttle, open CORS, error leakage; ≤1 = unbounded and undocumented.

| # | Metric | Value | Source command | Timestamp (UTC) |
|---|---|---|---|---|
| S-1 | Auth | **none, by documented design** (anonymous student feature; "no auth and no PII — audio only, never stored") | `tools/serve_grade.py:11-12` header + code read | 2026-10-11T18:46Z |
| S-2 | Rate limiting (public) | **absent** — 12/12 rapid GETs all `200`, no 429; nginx `limit_req` exists only on `^/(admin\|login)` (H4273 zone) | `for i in $(seq 1 12); curl -o /dev/null -w %{http_code} https://samskrte.ru/sk-grade/healthz` → `200`×12; `nginx -T` lines 328-348 | 2026-10-11T18:47:44Z |
| S-3 | Body cap | 12 MB at both layers (`client_max_body_size 12m` nginx; `MAX_BODY = 12*1024*1024` app; 413 contract) | `nginx -T` (location /sk-grade/); `serve_grade.py:30,86-88` | 2026-10-11T18:46Z |
| S-4 | Compute-abuse surface | unbounded `ThreadingHTTPServer` (no worker/concurrency cap); `SK_GRADE_WHISPER=1` makes each POST a whisper job; unit already peaked **1.5 G** RAM / 330 M swap | `serve_grade.py:125`; `systemctl status` (Memory: 345.2M peak: 1.5G, swap: 330.1M) | 2026-10-11T18:45:50Z |
| S-5 | Data retention | none — audio graded via tempfile, deleted in `finally`; no takes dir exists on disk | `serve_grade.py:108-113`; `find /opt/sk-grade -maxdepth 3 -name "*.wav"` → empty; `ls data/takes` → absent | 2026-10-11T18:46:50Z |
| S-6 | Process hygiene | binds `127.0.0.1:8791` only; `User=deploy` (non-root); `UMask=0077`; no secrets in unit env (host/port/flag only) | `systemctl show sk-grade -p ExecStart,User,Environment`; unit file `UMask=0077` | 2026-10-11T18:45:50Z |
| S-7 | Error leakage | 500 path returns `internal: {e}` — raw exception text to client | `serve_grade.py:106-107` | 2026-10-11T18:46Z |
| S-8 | CORS | `Access-Control-Allow-Origin: *` on all responses (live preflight 204 confirmed at the edge) | `curl -X OPTIONS https://samskrte.ru/sk-grade/api/grade` → 204 + `access-control-allow-origin: *`; `serve_grade.py:46` | 2026-10-11T18:47:44Z |
| S-9 | Edge headers | HSTS max-age=31536000, nosniff, X-Frame-Options SAMEORIGIN, referrer-policy, permissions-policy `microphone=()` — note: `microphone=()` on the API host does not affect the GitHub-Pages student page | `curl -sI https://samskrte.ru/sk-grade` | 2026-10-11T18:45:29Z |

## Axis 3 — Service observability: 2/5

Threshold: 5 = uptime SLO + alerting + dashboards; 4 = automated probe wired to an alert; 3 = persistent structured logs + synthetic probe (even unalerted); 2 = journald access/error logs + healthz endpoint, no automation; 1 = logs only; 0 = blind.

| # | Metric | Value | Source command | Timestamp (UTC) |
|---|---|---|---|---|
| O-1 | Request logging | every request to journald (access+errors): e.g. `OPTIONS /api/grade 204`, `POST 400`, `POST?verse=… 422`, `GET /healthz 200` | `journalctl -u sk-grade --since "-24h"` (tail shown in evidence) | 2026-10-11T18:46:50Z |
| O-2 | Health endpoint | `GET /healthz` → `{"ok": true, "service": "sk-grade"}` — 200 in 1.2 ms locally, 1.28 s publicly | `curl http://127.0.0.1:8791/healthz` (on box); `curl https://samskrte.ru/sk-grade/healthz` | 2026-10-11T18:46:50Z / 18:47:44Z |
| O-3 | Continuous uptime probe / alerting | **none** — no crontab entry, no systemd timer for sk-grade (host runs unrelated `samskrte-internals-heartbeat.timer` every 5 min); no metrics endpoint, no error-rate alert | `crontab -l \| grep -iE "sk\|grade\|health"` → none; `systemctl list-timers \| grep -iE "sk\|grade"` → none | 2026-10-11T18:46:50Z |
| O-4 | Historical probe evidence | only one-off acceptance burst: 8× `GET /healthz` 200 + preflight + 2 POSTs within 2 s at 19:44:44Z on 10-10 (H6317c verification) | `journalctl -u sk-grade --since "-24h"` timestamps | 2026-10-11T18:46:50Z |
| O-5 | Uptime record | 1 d 10 h since last (re)start 2026-10-10 08:21:18 UTC; host up 74 days; 0 unplanned restarts | `systemctl status sk-grade`; `uptime` | 2026-10-11T18:45:50Z |

## Axis 4 — Scoring-path test coverage: 4/5

Threshold: 5 = unit + server e2e + perf/load + synthetic prod check in CI; 4 = unit grading-semantics suite + spawned-server e2e incl. error contracts, green in CI; 3 = unit only; ≤2 = gaps in the graded path.

| # | Metric | Value | Source command | Timestamp (UTC) |
|---|---|---|---|---|
| T-1 | Test count (scoring path) | **12** — `tests/test_grade_take.py` 7 (perfect take ≥85 + ≥90 % anchored; +250 ms → weakest3; ×1.15 tempo normalised ≥75; real-reference e2e subh_2745; error paths) + `tests/test_grade_server_e2e.py` 5 (spawned server, healthz, CORS preflight, POST→grade JSON, 4xx contracts) | `grep -c "def test_" tests/test_grade_take.py tests/test_grade_server_e2e.py` → 7 / 5 | 2026-10-11T18:47Z |
| T-2 | CI green on main | Tests ✅ success (run [38097611776](https://github.com/gasyoun/SanskritKaraoke/actions/runs/38097611776), 2026-10-11T00:12Z); CodeQL ✅; Changelog lint ✅ — post-H6368/H6380 ffmpeg repair | `gh api repos/gasyoun/SanskritKaraoke/actions/runs?branch=main` | 2026-10-11T18:47Z |
| T-3 | CI green on open PRs | Tests ✅ on `h6375-drain` 2026-10-11T18:34Z | same API, per-branch runs | 2026-10-11T18:47Z |
| T-4 | Fake-mic fixtures | parametrized synthetic fixtures merged in #174; sample grade JSON committed (`tools/fixtures/subh_2745_grade_sample.json`) | repo tree + runbook "Tests" section | 2026-10-11T18:46Z |
| T-5 | Missing coverage | no load/latency test (whisper path unbenchmarked in CI), no synthetic prod canary | test file inventory | 2026-10-11T18:47Z |

## Axis 5 — Static site ↔ endpoint drift: 3/5

Threshold: 5 = config-as-code, prod provably byte-equal to repo; 4 = benign commit lag, documented; 3 = benign commit lag + one undocumented config divergence; ≤2 = functional/static drift affecting users.

| # | Metric | Value | Source command | Timestamp (UTC) |
|---|---|---|---|---|
| R-1 | Prod clone vs main | `9b97a97` (PR #176) vs main `b1e2c74` (PRs #177–179) — **2 commits behind**; diff touches only README/docs/`tools/templates/student.html` (student page is served from GitHub Pages, not from this clone): **zero grade-path files changed** → endpoint behaviour matches main | `git -C /opt/sk-grade/SanskritKaraoke rev-parse HEAD`; `git diff --name-only 9b97a97..b1e2c74 \| grep -E "grade\|serve\|site/"` → empty | 2026-10-11T18:46:50Z |
| R-2 | **Config drift (real)** | live unit has `SK_GRADE_WHISPER=1`; committed `deploy/sk-grade.service` has `SK_GRADE_WHISPER=0`; runbook still says "whisper off by default" — the prod flag was set by hand and never back-ported (NB: H6333 step 1 assumed whisper not yet enabled — it already is) | `systemctl show sk-grade -p Environment` vs `deploy/sk-grade.service:11-12` | 2026-10-11T18:45:50Z / 18:46Z |
| R-3 | nginx ↔ repo | live `/sk-grade/` block is byte-equal to `deploy/nginx-sk-grade.conf` (12m cap, proxy to 127.0.0.1:8791, 120 s read timeout, Host+XFF headers); hand-insertion documented in runbook | `nginx -T` vs `deploy/nginx-sk-grade.conf` | 2026-10-11T18:46Z |
| R-4 | Frontend ↔ endpoint contract | student page default `https://samskrte.ru/sk-grade/api/grade` matches live route (400/422/200 contracts verified publicly); `/sk-grade` → 301 → `/sk-grade/` handled at the edge | `curl -sI https://samskrte.ru/sk-grade` → 301 location `/sk-grade/`; P2/P3/P1 probes | 2026-10-11T18:45:29Z / 18:47:44Z |
| R-5 | Static verse data | `site/verse` timing JSONs come from the GitHub-Pages build, independent of the prod clone; reference timing used by grading lives in the prod clone's `verses/` (same commit lineage as R-1) | repo tree inspection | 2026-10-11T18:46Z |

## Endpoint probe log (evidence appendix)

All read-only HTTP probes; no POST with real audio (no grading load placed on prod):

```
2026-10-11T18:45:29Z  curl -sI https://samskrte.ru/sk-grade
  → HTTP/2 301 → /sk-grade/ · server: nginx · HSTS/nosniff/frame-options present
2026-10-11T18:47:44Z  curl -s https://samskrte.ru/sk-grade/healthz
  → 200 {"ok": true, "service": "sk-grade"} in 1.280431s
2026-10-11T18:47:44Z  curl -X POST https://samskrte.ru/sk-grade/api/grade
  → 400 {"error": "пустой параметр verse (id стиха)"} in 0.027s
2026-10-11T18:47:44Z  curl -X POST "https://samskrte.ru/sk-grade/api/grade?verse=bhg_2_47"
  → 400 {"error": "пустое тело — аудио записи обязательно"} in 0.034s
2026-10-11T18:47:44Z  curl -X OPTIONS https://samskrte.ru/sk-grade/api/grade
  → 204 · access-control-allow-origin: * · methods GET, POST, OPTIONS
2026-10-11T18:47:44Z  burst: 12× GET /healthz → 200 ×12 (no 429 — no rate limit)
```

Read-only .92 session (2026-10-11T18:45:50–18:46:50Z): `systemctl show/status sk-grade`, `cat /etc/systemd/system/sk-grade.service`, `nginx -T` (dump), `journalctl -u sk-grade --since "-24h"`, `git -C /opt/sk-grade/SanskritKaraoke rev-parse HEAD/status`, `pip list` (faster-whisper 1.2.1, numpy 2.5.3), `ffmpeg -version` (7.1.5), `df -h /` (39 % used), `crontab -l`/`systemctl list-timers` (no sk-grade monitors). Nothing edited, restarted or installed; `systemctl show/status`, `nginx -T`, `journalctl`, `git rev-parse` are read-only by construction.

## Findings → handoffs

Per the audit discipline, repairs mint handoffs (not executed here): (1) rate-limit + concurrency cap on `/sk-grade/` (levers 1); (2) deploy script + rollback + unit back-port incl. the `SK_GRADE_WHISPER` truth (lever 2, also unblocks the H6333 premise); (3) healthz uptime timer + alert (lever 3). Mints registered from this session under H6398 provenance.

---

_Prepared under H6398 (report-only; executor OxAlpha, opencode/z-ai/glm-5.3-flash). Next audit validates movement against this baseline: target ≥3.4/5 (levers 1–3 executed)._
