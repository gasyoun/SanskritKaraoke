#!/bin/bash
# sk-grade-healthz-monitor.sh — uptime probe of https://samskrte.ru/sk-grade/healthz
# (H6502, H6398 lever 3 / rows O-3+O-4). Runs every 5 min via systemd timer;
# alerts on non-200 through the hermes Telegram sink
# (/home/hermes/bin/hermes_notify.sh, the H6320 backrest pattern) with
# transition + hourly dedupe. An optional Better Stack heartbeat URL in
# /etc/default/sk-grade-healthz-monitor mirrors samskrte-internals-heartbeat.sh
# (dead-man's-switch + explicit /fail); probe itself is a read-only GET.
set -uo pipefail
URL="https://samskrte.ru/sk-grade/healthz"
[ -f /etc/default/sk-grade-healthz-monitor ] && . /etc/default/sk-grade-healthz-monitor
URL="${SK_GRADE_HEALTHZ_URL:-$URL}"
HB="${SK_GRADE_HEARTBEAT_URL:-}"
STATE_DIR="${SK_GRADE_STATE_DIR:-/var/lib/sk-grade-healthz}"
STATE="$STATE_DIR/consecutive_failures"
LOG="${SK_GRADE_LOG:-/var/log/sk-grade-healthz.log}"
TIMEOUT="${SK_GRADE_CURL_TIMEOUT:-20}"

mkdir -p "$STATE_DIR"
fail_n=0
[ -f "$STATE" ] && read -r fail_n < "$STATE" 2>/dev/null || fail_n=0
ts() { date -u '+%FT%TZ'; }
page() { /home/hermes/bin/hermes_notify.sh page "$1" >/dev/null 2>&1 || true; }

code=$(curl -sS -o /dev/null -w '%{http_code}' -m "$TIMEOUT" "$URL" 2>/dev/null) || code=000
if [ "$code" = "200" ]; then
  if [ "$fail_n" -gt 0 ]; then
    page "sk-grade healthz RECOVERED after $fail_n failure(s): $URL -> 200 ($(ts))"
  fi
  echo 0 > "$STATE"
  [ -n "$HB" ] && curl -fsS -m 15 -X POST "$HB" --data-binary "ok" >/dev/null 2>&1 || true
  echo "$(ts) OK: $URL -> 200 (prior consecutive failures: $fail_n)" | tee -a "$LOG"
  exit 0
fi

fail_n=$((fail_n + 1))
echo "$fail_n" > "$STATE"
[ -n "$HB" ] && curl -fsS -m 15 -X POST "$HB/fail" --data-binary "healthz HTTP $code" >/dev/null 2>&1 || true
if [ "$fail_n" -eq 1 ] || [ $((fail_n % 12)) -eq 0 ]; then
  page "sk-grade healthz NON-200: HTTP $code (consecutive $fail_n) — $URL ($(ts))"
fi
echo "$(ts) FAIL: $URL -> HTTP $code (consecutive $fail_n)" | tee -a "$LOG"
exit 1
