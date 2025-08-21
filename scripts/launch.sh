#!/usr/bin/env bash
set -Eeuo pipefail

# Configuration
WORKDIR=${WORKDIR:-/workspace}
ENTRY=${ENTRY:-$WORKDIR/runtime.js}
LOG_DIR=${LOG_DIR:-$WORKDIR/logs}
BACKOFF_SECS=${BACKOFF_SECS:-1}

mkdir -p "$LOG_DIR"
cd "$WORKDIR"

echo "Launcher starting in $WORKDIR; logging to $LOG_DIR"

while true; do
  ts_start=$(date +%Y%m%d_%H%M%S)
  run_log="$LOG_DIR/run_${ts_start}.log"
  echo "[$(date -Is)] Starting bot: node $ENTRY" | tee -a "$run_log" "$LOG_DIR/current.log"

  set +e
  node "$ENTRY" 2>&1 | tee -a "$run_log" "$LOG_DIR/current.log"
  code=${PIPESTATUS[0]}
  set -e

  echo "[$(date -Is)] Bot exited with code $code" | tee -a "$run_log" "$LOG_DIR/current.log"

  if [ "$code" -eq 42 ]; then
    echo "[$(date -Is)] Restart requested. Sleeping $BACKOFF_SECS s..." | tee -a "$run_log" "$LOG_DIR/current.log"
    sleep "$BACKOFF_SECS"
    continue
  fi

  echo "[$(date -Is)] Non-restart exit. Stopping launcher." | tee -a "$run_log" "$LOG_DIR/current.log"
  exit "$code"
done

