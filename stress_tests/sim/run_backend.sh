#!/bin/bash
# Start the backend like production (debug off, threaded dev server):
#
#   stress_tests/sim/run_backend.sh local    # run A: code + Data on this Mac's SSD
#   stress_tests/sim/run_backend.sh slowfs   # run B: same tree, but every file op under the repo pays
#                                            #        NAS costs (slowfs/slowfs.c, no root needed)
#   stress_tests/sim/run_backend.sh nas      # run B alt: through the loopback SMB mount (nas_sim.sh up, needs sudo)
#
#   PROFILE=1 ...   also run the in-process sampling profiler → reports/profile-<mode>.txt (no sudo)
#   slowfs knobs: SLOWFS_RTT_US (1000), SLOWFS_BW_MBPS (100), SLOWFS_FSYNC_MS (5), SLOWFS_APPEND_RTT (0)
#
# Console output goes to stress_tests/sim/reports/backend-<mode>.out, like pm2 capturing stdout.

set -euo pipefail

SIM_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SIM_DIR/../.." && pwd)"
MODE="${1:-}"
TREE="$REPO_DIR"
ENV_EXTRA=()

case "$MODE" in
  local) ;;
  slowfs)
    DYLIB="$SIM_DIR/slowfs/slowfs.dylib"
    if [ ! -f "$DYLIB" ] || [ "$SIM_DIR/slowfs/slowfs.c" -nt "$DYLIB" ]; then
      echo "• Building slowfs"
      cc -O2 -Wall -dynamiclib -o "$DYLIB" "$SIM_DIR/slowfs/slowfs.c"
    fi
    ENV_EXTRA=(DYLD_INSERT_LIBRARIES="$DYLIB" SLOWFS_PREFIX="$REPO_DIR"
               SLOWFS_STATS="$SIM_DIR/reports/slowfs-stats.txt") ;;
  nas)
    TREE="$HOME/amanflix_nas"
    if ! mount | grep -q " on $TREE "; then
      echo "✗ $TREE is not mounted. Run: stress_tests/sim/nas_sim.sh up"; exit 1
    fi ;;
  *) echo "usage: [PROFILE=1] $0 local|slowfs|nas"; exit 1 ;;
esac

if lsof -nP -iTCP:5001 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✗ Something is already listening on port 5001 (your dev backend?). Stop it first:"
  lsof -nP -iTCP:5001 -sTCP:LISTEN
  exit 1
fi

# Prefer the venv inside the tree (in prod the venv lives on the share too)
PYTHON="$TREE/api/venv/bin/python"
if ! "$PYTHON" -c 'import flask' >/dev/null 2>&1; then
  echo "• venv in $TREE not usable, falling back to $REPO_DIR/api/venv"
  PYTHON="$REPO_DIR/api/venv/bin/python"
fi

mkdir -p "$SIM_DIR/reports"
OUT="$SIM_DIR/reports/backend-$MODE.out"
ENTRY=(app.py)
if [ "${PROFILE:-0}" = "1" ]; then
  ENTRY=("$SIM_DIR/profiled_app.py")
  ENV_EXTRA+=(SIM_PROFILE_OUT="$SIM_DIR/reports/profile-$MODE.txt" SIM_PROFILE_INTERVAL="${SIM_PROFILE_INTERVAL:-0.05}")
  echo "• Profiler on → $SIM_DIR/reports/profile-$MODE.txt (refreshed every 5s)"
fi

echo "• Starting backend from $TREE/api  (mode: $MODE, debug off)"
echo "• Console output → $OUT   (tail -f it to follow)"
echo "• Ready when 'Debug mode: off' appears in that file (≈10s). Ctrl+C here stops the server."

cd "$TREE/api"
env AMANFLIX_DEBUG=0 PYTHONUNBUFFERED=1 ${ENV_EXTRA[@]+"${ENV_EXTRA[@]}"} "$PYTHON" "${ENTRY[@]}" > "$OUT" 2>&1 &
PID=$!
echo "• PID $PID"
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null; echo "• Backend stopped"' INT TERM
wait $PID
