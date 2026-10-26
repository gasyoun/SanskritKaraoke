#!/bin/bash
# deploy_sk_grade.sh — one-command deploy of the sk-grade endpoint, with a
# healthz gate and an automatic rollback to the previous revision.
#
# H6501 (H6398 lever 2, audit rows D-1/D-3/D-4/R-2). Before this script the
# merge-to-prod path was 8 hand-typed shell commands (H6317 runbook, "Deploy
# (vps92)"), the rollback story was undocumented, and the committed unit still
# said SK_GRADE_WHISPER=0 while prod ran with SK_GRADE_WHISPER=1.
#
# The command:
#
#   1. fetches origin (unshallowing the prod clone if it is shallow),
#   2. checks out origin/main into the prod clone,
#   3. installs deploy/sk-grade.service over the live unit (backup kept),
#   4. restarts the sk-grade systemd unit,
#   5. gates on GET /healthz (HTTP 200),
#   6. on a failed gate: rolls back to the previous revision + previous unit,
#      restarts, re-probes, and reports the outcome with a non-zero exit.
#
# Usage on the box (vps92):
#
#   install -m 0755 deploy/deploy_sk_grade.sh /usr/local/sbin/sk-grade-deploy
#   /usr/local/sbin/sk-grade-deploy
#
# Install it outside the prod clone: the script checks out a new revision
# under its own feet otherwise (it re-execs itself from a temp copy when it
# detects that case, but a stable path is nicer).
#
# Exit codes: 0 deploy ok · 1 usage/preflight error · 3 deploy failed but the
# rollback restored a healthy service · 4 deploy failed AND the rollback did
# not restore health (needs a human).
#
# Everything the script touches is overridable through environment variables
# so the whole flow can be exercised in a sandbox (see
# tests/test_deploy_sk_grade.py).
set -uo pipefail

REPO_DIR="${SK_GRADE_REPO_DIR:-/opt/sk-grade/SanskritKaraoke}"
SERVICE="${SK_GRADE_SERVICE:-sk-grade}"
BRANCH="${SK_GRADE_BRANCH:-main}"
UNIT_SRC="${SK_GRADE_UNIT_SRC:-}"
UNIT_PATH="${SK_GRADE_UNIT_PATH:-/etc/systemd/system/sk-grade.service}"
HEALTHZ_URL="${SK_GRADE_HEALTHZ_URL:-http://127.0.0.1:8791/healthz}"
HEALTHZ_PUBLIC_URL="${SK_GRADE_HEALTHZ_PUBLIC_URL:-https://samskrte.ru/sk-grade/healthz}"
HEALTHZ_RETRIES="${SK_GRADE_HEALTHZ_RETRIES:-10}"
HEALTHZ_DELAY="${SK_GRADE_HEALTHZ_DELAY:-3}"
CURL_TIMEOUT="${SK_GRADE_CURL_TIMEOUT:-10}"
LOG_FILE="${SK_GRADE_DEPLOY_LOG:-/var/log/sk-grade-deploy.log}"
SYSTEMCTL="${SK_GRADE_SYSTEMCTL:-systemctl}"
CURL="${SK_GRADE_CURL:-curl}"
GIT="${SK_GRADE_GIT:-git}"
DRY_RUN="${SK_GRADE_DRY_RUN:-0}"
SKIP_UNIT="${SK_GRADE_SKIP_UNIT:-0}"
ALLOW_NONROOT="${SK_GRADE_ALLOW_NONROOT:-0}"

usage() {
  sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
}

die() {
  log "FATAL: $*"
  echo "deploy_sk_grade: $*" >&2
  exit 1
}

ts() { date -u '+%FT%TZ'; }

log() {
  local line="$(ts) $*"
  echo "$line"
  if [ -n "$LOG_FILE" ]; then
    local dir
    dir="$(dirname "$LOG_FILE")"
    if [ -d "$dir" ] || mkdir -p "$dir" 2>/dev/null; then
      echo "$line" >> "$LOG_FILE" 2>/dev/null || true
    fi
  fi
}

run() {
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY-RUN: $*"
    return 0
  fi
  log "RUN: $*"
  "$@"
}

# ---------------------------------------------------------------- arguments
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --skip-unit) SKIP_UNIT=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
  shift
done

# --------------------------------------------------- self-relocation guard
# The script may live inside the prod clone; `git checkout` would then rewrite
# the file that bash is still reading. Copy to a temp file and re-exec.
SELF="$0"
case "$SELF" in
  /*) ;;
  *) SELF="$(pwd)/$SELF" ;;
esac
if [ -z "${SK_GRADE_RELOCATED:-}" ] && [ -e "$SELF" ]; then
  case "$SELF" in
    "$REPO_DIR"/*)
      TMP_SELF="$(mktemp /tmp/sk-grade-deploy.XXXXXX.sh)"
      cp "$SELF" "$TMP_SELF"
      chmod 0755 "$TMP_SELF"
      SK_GRADE_RELOCATED=1 export SK_GRADE_RELOCATED
      log "self-relocation: running from $TMP_SELF (script lives inside the prod clone)"
      exec bash "$TMP_SELF" "$@"
      ;;
  esac
fi

# ------------------------------------------------------------- preflight
if [ "$(id -u)" -ne 0 ] && [ "$ALLOW_NONROOT" != "1" ]; then
  die "must run as root (systemctl restart + /etc/systemd/system write); set SK_GRADE_ALLOW_NONROOT=1 only for sandbox runs"
fi
[ -d "$REPO_DIR" ] || die "prod clone not found: $REPO_DIR (set SK_GRADE_REPO_DIR)"
[ -n "$UNIT_SRC" ] || UNIT_SRC="$REPO_DIR/deploy/sk-grade.service"
command -v "$GIT" >/dev/null 2>&1 || die "git not found: $GIT"
command -v "$CURL" >/dev/null 2>&1 || die "curl not found: $CURL"
[ "$DRY_RUN" = "1" ] || command -v "$SYSTEMCTL" >/dev/null 2>&1 || die "systemctl not found: $SYSTEMCTL"

cd "$REPO_DIR" || die "cannot cd $REPO_DIR"
"$GIT" rev-parse --git-dir >/dev/null 2>&1 || die "not a git clone: $REPO_DIR"

DIRTY="$("$GIT" status --porcelain 2>/dev/null | head -5)"
if [ -n "$DIRTY" ]; then
  die "prod clone is dirty — commit or stash before deploying:
$DIRTY"
fi

PREV_REV="$("$GIT" rev-parse HEAD)" || die "cannot resolve HEAD"
log "=== sk-grade deploy · repo=$REPO_DIR · service=$SERVICE · branch=$BRANCH"
log "previous revision: $PREV_REV"

# ------------------------------------------------------------------ fetch
if [ "$DRY_RUN" = "1" ]; then
  log "DRY-RUN: git fetch --prune --tags origin (skipped — nothing is written)"
  TARGET_REV="$("$GIT" ls-remote origin "refs/heads/$BRANCH" 2>/dev/null | awk '{print $1}')"
  [ -n "$TARGET_REV" ] || die "cannot resolve origin/$BRANCH"
else
  if [ -f "$(git rev-parse --git-dir)/shallow" ]; then
    log "prod clone is shallow — unshallowing so the previous revision stays rollback-able"
    run "$GIT" fetch --unshallow --prune origin || die "git fetch --unshallow failed"
  else
    run "$GIT" fetch --prune --tags origin || die "git fetch failed"
  fi
  TARGET_REV="$("$GIT" rev-parse "origin/$BRANCH" 2>/dev/null)" || die "cannot resolve origin/$BRANCH"
fi

if [ "$TARGET_REV" = "$PREV_REV" ]; then
  log "already up to date ($TARGET_REV) — nothing to deploy"
  run "$SYSTEMCTL" restart "$SERVICE"
  exit 0
fi
log "target revision: $TARGET_REV"

if [ "$DRY_RUN" = "1" ]; then
  log "DRY-RUN plan: checkout $TARGET_REV → install $UNIT_SRC → restart $SERVICE → healthz gate on $HEALTHZ_URL → rollback to $PREV_REV on failure"
  exit 0
fi

# --------------------------------------------------------------- checkout
run "$GIT" checkout -B "$BRANCH" "origin/$BRANCH" || die "git checkout failed"
NEW_REV="$("$GIT" rev-parse HEAD)"
[ "$NEW_REV" = "$TARGET_REV" ] || die "checkout landed on $NEW_REV, expected $TARGET_REV"

# ------------------------------------------------------- unit (config-as-code)
UNIT_BACKUP=""
install_unit() {
  [ "$SKIP_UNIT" = "1" ] && { log "unit install skipped (--skip-unit)"; return 0; }
  [ -f "$UNIT_SRC" ] || { log "unit source missing: $UNIT_SRC — keeping the live unit"; return 0; }
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY-RUN: would install $UNIT_SRC -> $UNIT_PATH"
    return 0
  fi
  if [ -f "$UNIT_PATH" ] && cmp -s "$UNIT_SRC" "$UNIT_PATH"; then
    log "unit already byte-equal to the repo copy — no install needed"
    return 0
  fi
  if [ -f "$UNIT_PATH" ]; then
    UNIT_BACKUP="${UNIT_PATH}.bak-$(ts | tr ':' '-')"
    cp "$UNIT_PATH" "$UNIT_BACKUP" || { log "unit backup failed — refusing to overwrite $UNIT_PATH"; return 1; }
    log "live unit backed up to $UNIT_BACKUP"
  fi
  install -m 0644 "$UNIT_SRC" "$UNIT_PATH" || { log "unit install failed"; return 1; }
  log "unit installed from $UNIT_SRC -> $UNIT_PATH"
  run "$SYSTEMCTL" daemon-reload
  return 0
}
install_unit || die "unit install failed"

# ------------------------------------------------------------------ restart
run "$SYSTEMCTL" restart "$SERVICE" || die "systemctl restart $SERVICE failed"

# ------------------------------------------------------------- healthz gate
healthz_ok() {
  local url="$1" code body
  body="$(mktemp)"
  code="$("$CURL" -sS -o "$body" -w '%{http_code}' -m "$CURL_TIMEOUT" "$url" 2>/dev/null)" || code=000
  if [ "$code" = "200" ]; then
    log "healthz $url -> 200 $(head -c 120 "$body" 2>/dev/null)"
    rm -f "$body"
    return 0
  fi
  log "healthz $url -> $code"
  rm -f "$body"
  return 1
}

gate_healthz() {
  local i=1
  while [ "$i" -le "$HEALTHZ_RETRIES" ]; do
    if healthz_ok "$HEALTHZ_URL"; then
      return 0
    fi
    log "healthz attempt $i/$HEALTHZ_RETRIES failed — retry in ${HEALTHZ_DELAY}s"
    i=$((i + 1))
    sleep "$HEALTHZ_DELAY"
  done
  return 1
}

if gate_healthz; then
  log "DEPLOY OK: $PREV_REV -> $NEW_REV (healthz gate passed)"
  if [ -n "$HEALTHZ_PUBLIC_URL" ] && ! healthz_ok "$HEALTHZ_PUBLIC_URL"; then
    log "WARNING: public healthz did not answer 200 — local service is healthy, nginx/public path needs a look"
  fi
  exit 0
fi

# ------------------------------------------------------------------ rollback
log "DEPLOY FAILED: healthz gate did not pass — rolling back to $PREV_REV"
run "$GIT" checkout --detach "$PREV_REV" || log "WARNING: git checkout --detach $PREV_REV failed"
if [ -n "$UNIT_BACKUP" ] && [ -f "$UNIT_BACKUP" ]; then
  cp "$UNIT_BACKUP" "$UNIT_PATH" && log "unit restored from $UNIT_BACKUP"
  run "$SYSTEMCTL" daemon-reload
fi
run "$SYSTEMCTL" restart "$SERVICE" || log "WARNING: restart during rollback failed"

if gate_healthz; then
  log "ROLLBACK OK: service back on $PREV_REV and healthz is green — the new revision $NEW_REV is suspect"
  exit 3
fi

log "ROLLBACK FAILED: healthz is still not green on $PREV_REV — manual intervention required"
exit 4
