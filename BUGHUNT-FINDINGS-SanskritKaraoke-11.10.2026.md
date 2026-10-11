_Created: 11-10-2026 · Last updated: 11-10-2026_

# BUGHUNT-FINDINGS — SanskritKaraoke — 11.10.2026

Nightly one-repo bug hunt (MG ruling 26-09-2026: nightly, one repo, auto-fix HIGH). Executor: GLM 5.3-flash (`zai-coding-plan/glm-5.3-flash`). Read-only static hunt over `src/`, `tools/`, `scripts/`, `agents/`, `deploy/`, `.github/` (vendored copies, lockfiles, `node_modules`, `dist/`, data giants skipped), plus live probes. **Elapsed: ~25 min** (hunt + report + landing, one pass).

Verdict up front: **1 HIGH (personal-data/infra — GTD to MG, never auto-fixed), 4 MEDIUM, 2 LOW, 2 INFO. No HIGH code bugs → Phase-3 auto-fix legitimately fired zero times** (max-3 budget unspent).

---

## 🔴 HIGH-1 — Third-party draft license agreements committed to the PUBLIC repo; the "personal data" guard only covers the Pages artifact, not git

- **Where:** [docs/legal/](https://github.com/gasyoun/SanskritKaraoke/tree/main/docs/legal) — [`Usha_Sanka_License_Agreement_DRAFT.docx`](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/legal/Usha_Sanka_License_Agreement_DRAFT.docx), [`Sementsov_Translation_License_Agreement_DRAFT.docx`](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/legal/Sementsov_Translation_License_Agreement_DRAFT.docx), [`RIGHTS_USHA_SANKA_SK-LIC-2026-001.md`](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/legal/RIGHTS_USHA_SANKA_SK-LIC-2026-001.md) + generators; all tracked in git.
- **Evidence (ran it):** `git ls-files docs/legal` → 7 tracked files; `gh repo view gasyoun/SanskritKaraoke --json visibility` → **PUBLIC**; the deploy workflow itself declares the hazard: [.github/workflows/pages.yml](https://github.com/gasyoun/SanskritKaraoke/blob/main/.github/workflows/pages.yml) comment «Draft license agreements (personal data) must not ship publicly» + `rm -rf _site/docs/legal`.
- **Why HIGH:** the `rm -rf _site/docs/legal` guard sanitizes only the **Pages deploy artifact**. The files are already public on `github.com/gasyoun/SanskritKaraoke/blob/main/docs/legal/…` regardless — third parties' draft contract documents ship in the git layer. Consistent with the repo's earlier [GCP service-account-key incident](https://github.com/gasyoun/SanskritKaraoke/blob/main/CHANGELOG.md) (v1.5.11 predecessor entry, 21-09-2026): public-repo personal/secret material.
- **Why NOT auto-fixed:** removal from HEAD and/or history purge is a credential/infra-class action (history rewrite is agent-forbidden; scope decision is MG's). **One GTD `@DO` row filed for MG** with this report linked (see [GTD_NEXT_ACTIONS.md](https://github.com/gasyoun/Uprava/blob/main/GTD_NEXT_ACTIONS.md), 11-10-2026 row).

## 🟠 MEDIUM-2 — `serve_grade.py` crashes the request on non-numeric `Content-Length` (no JSON error, empty reply)

- **Where:** [tools/serve_grade.py line 82](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/serve_grade.py#L82) — `int(self.headers.get('Content-Length') or 0)` sits **outside** the guarded block (try starts at line 94).
- **Evidence (ran it):** local server up (healthz `{"ok": true…}`), then `curl -X POST … -H 'Content-Length: abc'` → **empty reply from server**; service log shows `ValueError: invalid literal for int()…` escaping `do_POST`. A client gets connection-drop instead of the clean RU 400 the endpoint otherwise speaks; the thread survives (ThreadingHTTPServer) so impact is per-request, not service-down. Behind nginx most malformed headers are rejected upstream, but the code path is live for any direct/proxied passthrough.

## 🟠 MEDIUM-3 — `serve_grade.py` catch-all leaks internal error text (ffmpeg stderr, local temp paths) to any public caller

- **Where:** [tools/serve_grade.py lines 106-107](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/serve_grade.py#L106-L107) — `except Exception as e: self._json(500, {'error': f'internal: {e}'})`.
- **Evidence (ran it):** `curl -X POST …/api/grade?verse=bhg_2_47 --data-binary 'notaudio'` returns the **full ffmpeg stderr** — build configuration, compiler flags, homebrew paths, and the local temp-file path (`/tmp/tmpmbp9wa5z.wav`) — to an unauthenticated, CORS-open public endpoint (`samskrte.ru/sk-grade/` per [deploy/nginx-sk-grade.conf](https://github.com/gasyoun/SanskritKaraoke/blob/main/deploy/nginx-sk-grade.conf)); nginx does not sanitize response bodies. Info disclosure (CWE-209); no credentials/PII observed in the leaked text, hence MEDIUM not HIGH. Suggested fix (next fix wave, needs MG none): map decode failures to the existing clean `GradeError` surface and log details server-side only.

## 🟠 MEDIUM-4 — `record_grade.js`: `MediaRecorder` constructor failure deadlocks the button and leaves the mic stream open

- **Where:** [src/scripts/record_grade.js lines 221-239](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/scripts/record_grade.js#L221-L239) — `busy = true` (line 221) precedes the **unguarded** `new MediaRecorder(stream, …)` (lines 237-239); only `getUserMedia` is inside try/catch.
- **Evidence:** control-flow, static. If the constructor throws (rare codec/platform edge beyond the two `isTypeSupported` branches), the exception escapes `startRecording`: `busy` never resets → `btn.onclick` early-returns **for the page's lifetime** (feature deadlocks), and the granted mic `stream` is never stopped — the browser's mic-indicator stays on until reload. Contract gap: the constructor belongs inside the guarded window with `busy=false` + `stream.getTracks().forEach(t => t.stop())` on failure.

## 🟠 MEDIUM-5 — Google Drive OAuth requests full-account `drive` scope instead of least-privilege `drive.file`

- **Where:** [src/scripts/app.js lines 5871-5876](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/scripts/app.js#L5871-L5876) — `scopes: 'https://www.googleapis.com/auth/drive'`; token cache confirms write-scope is requested always ([line 6371](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/scripts/app.js#L6371) «Всегда запрашиваем write-скоуп»).
- **Evidence:** static. The app loads/saves verse-session files it creates; `drive.file` (per-file visibility, picker-created files) is the least-privilege scope for exactly that. Full `drive` grants the karaoke page read/write over the student's **entire** Drive. Deliberate-but-over-broad; migrating scope invalidates cached tokens (localStorage `gdrive_token_rw` checks `cached.scope === GDRIVE.scopes`, so a scope change self-heals via re-consent) — flagged for MG decision, not auto-changed.

## 🟡 LOW-6 — `grade_take.py`: verses with <4 syllables can never reach `too_quiet = false`

- [tools/grade_take.py line 528](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/grade_take.py#L528) — `too_quiet = attempted < 4` is absolute, not `min(4, total)`. A perfect take of a 3-syllable verse would read «Услышано слишком мало». No such verse in `verses/` today; latent only.

## 🟡 LOW-7 — `record_grade.js` status path assumes `attempted`/`total_syllables` always present

- [src/scripts/record_grade.js line 296](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/scripts/record_grade.js#L296) — `data.attempted < data.total_syllables` with missing fields silently takes the «full» branch (`undefined < undefined` is false). Cosmetic status-line divergence from `renderResult`, which guards the same fields ([line 97](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/scripts/record_grade.js#L97)).

## 🔵 INFO-8 — Client-side API keys are public-by-design; no server keys found

[src/scripts/firebase-config.js](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/scripts/firebase-config.js) (Firebase web `apiKey`) and [src/scripts/app.js line 5871](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/scripts/app.js#L5871) (GDrive OAuth client id) are identification credentials intended for browser shipment; Firestore enforcement lives server-side in [firestore.rules](https://github.com/gasyoun/SanskritKaraoke/blob/main/firestore.rules) (teacher allowlist verified in sync with `src/scripts/teacher-config.js`). Repo-wide secret scan (src/tools/scripts/agents/evals/deploy) found **no** server-side keys — past incident (GCP SA key in `my-old-tools/shloka-wave.zip`, purged 21-09-2026) stays clean.

## 🔵 INFO-9 — Service worker is cache-first for non-HTML; content ships only on `CACHE_NAME` bump

[sw.js](https://github.com/gasyoun/SanskritKaraoke/blob/main/sw.js) precaches `verses/index.json`, `src/scripts/app.js` etc. cache-first; new verse data reaches installed PWAs only when `CACHE_NAME` (currently `…v1.5.5-html-network-first`) is bumped — activate prunes old caches. Working as designed (HTML is network-first); noted as the standing deploy contract so "I pushed new verses" support tickets get the right first answer.

---

## What verified green (ran it)

- `python3 -m pytest tests/ -m 'not integration'` → **32 passed** (H6380's red-default-branch-tests lead does **not** reproduce on this clone at `4f53b19`, 11-10-2026).
- `node --check` over all `src/scripts/*.js`, `tools/*.mjs`, `tools/render_chapter.js` → zero failures.
- Template sync intact: root `student.html` ≡ [tools/templates/student.html](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/templates/student.html) (the H6379 class of drift is closed).
- Live `serve_grade` probes: `/healthz` OK; garbage body → clean RU 422; unknown verse → clean error; temp files cleaned in `finally` (unlink).
- All 5 `JSON.parse` sites in `app.js` guarded; [tools/align_chapter.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/align_chapter.py) shells out via list-form `subprocess.run` (no shell-injection surface); Firestore rules shape-guards (`hasCloudSyncShape`/`hasProfileShape`) intact vs [cloud_sync.js](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/scripts/cloud_sync.js) writers.

## Phase-3 disposition

MG ruling 26-09-2026 auto-fixes HIGH **code** bugs. This pass found none: HIGH-1 is personal-data/infra (GTD row filed, never auto-fixed — history rewrite forbidden), MEDIUM-2..5 are report-only per the same ruling. Fix budget 0/3 spent.

_Dr. Mārcis Gasūns_
