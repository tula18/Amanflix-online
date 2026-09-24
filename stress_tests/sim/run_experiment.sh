#!/bin/bash
# One complete, repeatable run: start backend → wait → Locust (150 users) → save reports → stop backend.
#
#   stress_tests/sim/run_experiment.sh <local|slowfs> <label> [minutes=5] [users=150]
#   PROFILE=1 stress_tests/sim/run_experiment.sh slowfs B-profiled
#
# Reports land in stress_tests/sim/reports/<label>/ (Locust HTML/CSV, backend output, profile, slowfs stats).
# Live dashboard while it runs: http://localhost:8089

set -euo pipefail

SIM_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SIM_DIR/../.." && pwd)"
MODE="${1:?usage: $0 <local|slowfs> <label> [minutes] [users]}"
LABEL="${2:?label required}"
MINUTES="${3:-5}"
USERS="${4:-150}"
OUT_DIR="$SIM_DIR/reports/$LABEL"
mkdir -p "$OUT_DIR"
# Clear the previous run's files so readiness and reports can't pick up stale data
rm -f "$SIM_DIR/reports/backend-$MODE.out" "$SIM_DIR/reports/profile-$MODE.txt" "$SIM_DIR/reports/slowfs-stats.txt"

# Idle sleep mid-run freezes everything and ruins the timings; keep the Mac awake until this script exits.
# (Closing the lid on battery still sleeps: keep it open and on power.)
caffeinate -i -w $$ &
if pmset -g batt | grep -q "Battery Power"; then echo "⚠ On battery: plug in, or the Mac may sleep and invalidate the run"; fi

"$SIM_DIR/run_backend.sh" "$MODE" > "$OUT_DIR/run_backend.log" 2>&1 &
RUNNER=$!
cleanup() {
  kill "$RUNNER" 2>/dev/null || true
  P=$(lsof -t -iTCP:5001 -sTCP:LISTEN 2>/dev/null | head -1 || true)
  [ -n "$P" ] && kill "$P" 2>/dev/null || true
  wait "$RUNNER" 2>/dev/null || true
}
trap cleanup EXIT

STARTED="$(date "+%Y-%m-%d %H:%M:%S")"
echo "• [$LABEL] starting backend ($MODE, PROFILE=${PROFILE:-0})"
for _ in $(seq 1 120); do
  grep -q "Debug mode: off" "$SIM_DIR/reports/backend-$MODE.out" 2>/dev/null && break
  if ! kill -0 "$RUNNER" 2>/dev/null; then echo "✗ backend exited:"; cat "$OUT_DIR/run_backend.log"; exit 1; fi
  sleep 1
done

echo "• [$LABEL] Locust: $USERS users for ${MINUTES}m → http://localhost:8089"
"$SIM_DIR/../venv/bin/locust" -f "$SIM_DIR/locustfile.py" --host http://127.0.0.1:5001 --autostart \
  -u "$USERS" -r 5 -t "${MINUTES}m" --autoquit 3 \
  --html "$OUT_DIR/locust.html" --csv "$OUT_DIR/locust" --csv-full-history > "$OUT_DIR/locust.out" 2>&1 || true

sleep 6  # let the profiler/slowfs write their final snapshot
cp "$SIM_DIR/reports/backend-$MODE.out" "$OUT_DIR/backend.out"
[ -f "$SIM_DIR/reports/profile-$MODE.txt" ] && cp "$SIM_DIR/reports/profile-$MODE.txt" "$OUT_DIR/profile.txt"
[ "$MODE" = "slowfs" ] && cp "$SIM_DIR/reports/slowfs-stats.txt" "$OUT_DIR/slowfs-stats.txt"
# A run is only valid if the Mac never slept during it
SLEPT=$(pmset -g log | awk -v s="$STARTED" '$0 >= s && / (Sleep|Maintenance Sleep) / && /Entering Sleep/' | head -3)
if [ -n "$SLEPT" ]; then
  echo "✗ [$LABEL] INVALID: the Mac slept during the run:"; echo "$SLEPT" | cut -c1-100
  echo "INVALID: Mac slept during run" > "$OUT_DIR/INVALID.txt"
else
  echo "✓ [$LABEL] no sleep during the run"
fi
echo "• [$LABEL] done → $OUT_DIR"
