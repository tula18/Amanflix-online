#!/bin/bash
# Simulate the production NAS on this Mac: mount the repo over SMB on loopback and throttle it.
#
#   stress_tests/sim/nas_sim.sh up       # share + mount + throttle (asks for sudo / SMB password)
#   stress_tests/sim/nas_sim.sh down     # remove throttle + unmount
#   stress_tests/sim/nas_sim.sh status
#
# Knobs (env): BW (default 800Mbit/s ≈ 100 MB/s, the NAS cap), DELAY_MS (default 1, per direction)
#              MODE=nfs to use a loopback NFS export instead of SMB (fallback)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SHARE_NAME="Amanflix-online"
MOUNT_POINT="$HOME/amanflix_nas"
ANCHOR="com.apple/amanflix-sim"
PIPE_READ=41    # server -> client (reads from the NAS)
PIPE_WRITE=42   # client -> server (writes to the NAS)
TOKEN_FILE="/tmp/amanflix_sim_pf_token"
BW="${BW:-800Mbit/s}"
DELAY_MS="${DELAY_MS:-1}"
MODE="${MODE:-smb}"

if [ "$MODE" = "nfs" ]; then PORT=2049; else PORT=445; fi

is_mounted() { mount | grep -q " on $MOUNT_POINT "; }

share_smb() {
  if ! nc -z -G 1 127.0.0.1 445 2>/dev/null; then
    cat <<EOF
✗ SMB file sharing is off. One-time setup:
  1. System Settings → General → Sharing → turn on "File Sharing"
  2. Click (i) next to File Sharing → Options… → turn on "Share files and folders using SMB"
     and tick your account under "Windows File Sharing" (enter your Mac password)
  3. Run this script again.
EOF
    exit 1
  fi
  if ! sharing -l 2>/dev/null | grep -q "path:[[:space:]]*$REPO_DIR\$"; then
    echo "• Sharing $REPO_DIR as '$SHARE_NAME' (SMB only)"
    sudo sharing -a "$REPO_DIR" -S "$SHARE_NAME" -s 001 -g 000
  fi
  mkdir -p "$MOUNT_POINT"
  echo "• Mounting //$USER@127.0.0.1/$SHARE_NAME → $MOUNT_POINT (enter your Mac password if asked)"
  if ! mount_smbfs -o nobrowse "//$USER@127.0.0.1/$SHARE_NAME" "$MOUNT_POINT"; then
    echo "✗ macOS refused the loopback SMB mount. Try the fallback:  MODE=nfs $0 up"
    exit 1
  fi
}

share_nfs() {
  local line="\"$REPO_DIR\" -alldirs -mapall=$(id -u):$(id -g) 127.0.0.1"
  if ! grep -qF "$REPO_DIR" /etc/exports 2>/dev/null; then
    echo "• Adding NFS export for $REPO_DIR to /etc/exports"
    echo "$line" | sudo tee -a /etc/exports >/dev/null
  fi
  sudo nfsd enable 2>/dev/null || true
  sudo nfsd update
  mkdir -p "$MOUNT_POINT"
  echo "• Mounting 127.0.0.1:$REPO_DIR → $MOUNT_POINT"
  if ! sudo mount -t nfs -o resvport,rw,vers=3,nobrowse "127.0.0.1:$REPO_DIR" "$MOUNT_POINT"; then
    echo "✗ NFS mount failed. nfsd may need Full Disk Access to read ~/Documents"
    echo "  (System Settings → Privacy & Security → Full Disk Access → add /sbin/nfsd)"
    exit 1
  fi
}

throttle_on() {
  echo "• Throttling tcp port $PORT on lo0: $BW, +${DELAY_MS}ms each way"
  sudo dnctl pipe $PIPE_READ config bw "$BW" delay "$DELAY_MS"
  sudo dnctl pipe $PIPE_WRITE config bw "$BW" delay "$DELAY_MS"
  printf 'dummynet in quick on lo0 proto tcp from any port %s to any pipe %s\ndummynet in quick on lo0 proto tcp from any to any port %s pipe %s\n' \
    "$PORT" "$PIPE_READ" "$PORT" "$PIPE_WRITE" | sudo pfctl -q -a "$ANCHOR" -f -
  if [ ! -s "$TOKEN_FILE" ]; then
    sudo pfctl -E 2>&1 | awk '/Token/ {print $NF}' > "$TOKEN_FILE"
  fi
}

throttle_off() {
  sudo pfctl -q -a "$ANCHOR" -F all 2>/dev/null || true
  sudo dnctl pipe delete $PIPE_READ 2>/dev/null || true
  sudo dnctl pipe delete $PIPE_WRITE 2>/dev/null || true
  if [ -s "$TOKEN_FILE" ]; then
    sudo pfctl -q -X "$(cat "$TOKEN_FILE")" 2>/dev/null || true
    rm -f "$TOKEN_FILE"
  fi
  echo "• Throttle removed"
}

status() {
  if is_mounted; then mount | grep " on $MOUNT_POINT "; else echo "Not mounted ($MOUNT_POINT)"; fi
  echo "--- dummynet pipes"
  sudo dnctl list 2>/dev/null | grep -E "^0*(${PIPE_READ}|${PIPE_WRITE}):" || echo "no sim pipes"
  echo "--- pf rules in $ANCHOR"
  sudo pfctl -a "$ANCHOR" -s dummynet 2>/dev/null || true
}

case "${1:-}" in
  up)
    if is_mounted; then echo "• Already mounted at $MOUNT_POINT"
    elif [ "$MODE" = "nfs" ]; then share_nfs
    else share_smb
    fi
    throttle_on
    echo "✓ Simulated NAS ready. Start the backend with: stress_tests/sim/run_backend.sh nas"
    echo "  Check speed: dd if=$MOUNT_POINT/Data/uploads/10138.mp4 of=/dev/null bs=1m count=300"
    ;;
  down)
    throttle_off
    if is_mounted; then
      if [ "$MODE" = "nfs" ]; then sudo umount "$MOUNT_POINT"; else umount "$MOUNT_POINT"; fi
      echo "• Unmounted $MOUNT_POINT"
    fi
    ;;
  status) status ;;
  *) echo "usage: $0 up|down|status   (env: BW, DELAY_MS, MODE=smb|nfs)"; exit 1 ;;
esac
