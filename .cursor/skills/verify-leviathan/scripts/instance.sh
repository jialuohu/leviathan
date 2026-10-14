#!/usr/bin/env bash
# Isolated Leviathan dashboard for verification.
# stdout of `launch` is shell assignments. Logs and doctor detail go to stderr.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../../../.." && pwd)
ROOT=${LEVIATHAN_VERIFY_ROOT:-/tmp/leviathan-verify}
RUNS="$ROOT/runs"
EVIDENCE_ROOT="$ROOT/evidence"
BIN="$REPO_ROOT/bin/leviathan"

usage() {
  echo "usage: instance.sh launch|doctor|stop" >&2
  echo "  launch  build if needed, start one fixture dashboard, print RUN_ID=..." >&2
  echo "  doctor  RUN_ID=<id> instance.sh doctor" >&2
  echo "  stop    RUN_ID=<id> instance.sh stop" >&2
  exit 2
}

strip_leviathan_env() {
  local name
  while IFS='=' read -r name _; do
    case "$name" in
      LEVIATHAN_*) unset "$name" ;;
    esac
  done < <(env)
}

ensure_binary() {
  if [[ -x "$BIN" ]]; then
    return
  fi
  echo "building $BIN" >&2
  make -C "$REPO_ROOT" build-leviathan >&2
  if [[ ! -x "$BIN" ]]; then
    echo "make build-leviathan did not produce $BIN" >&2
    exit 1
  fi
}

read_state() {
  local run_id="${RUN_ID:-}"
  if [[ -z "$run_id" && -f "$ROOT/current" ]]; then
    run_id=$(<"$ROOT/current")
  fi
  if [[ -z "$run_id" ]]; then
    echo "RUN_ID is unset and $ROOT/current is missing" >&2
    exit 1
  fi
  STATE_FILE="$RUNS/$run_id/state.env"
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "no state file for RUN_ID=$run_id" >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$STATE_FILE"
  RUN_ID="$run_id"
}

kill_pid() {
  local pid="$1"
  if [[ ! -d "/proc/$pid" ]]; then
    return 0
  fi
  kill -TERM "$pid" 2>/dev/null || true
  local _i
  for _i in $(seq 1 50); do
    if [[ ! -d "/proc/$pid" ]]; then
      return 0
    fi
    sleep 0.1
  done
  kill -KILL "$pid" 2>/dev/null || true
  sleep 0.1
}

port_owned_by() {
  python3 - "$1" "$2" <<'PY'
import os, sys
pid, port = int(sys.argv[1]), int(sys.argv[2])
hexport = f"{port:04X}"
want = {f"0100007F:{hexport}", f"0000000000000000000000000100007F:{hexport}"}
inodes = set()
for table in (f"/proc/{pid}/net/tcp", f"/proc/{pid}/net/tcp6"):
    try:
        lines = open(table, encoding="ascii").read().splitlines()[1:]
    except FileNotFoundError:
        continue
    for line in lines:
        fields = line.split()
        if len(fields) < 10 or fields[3] != "0A":
            continue
        if fields[1].upper() in want:
            inodes.add(fields[9])
if not inodes:
    sys.exit(1)
fd_dir = f"/proc/{pid}/fd"
try:
    names = os.listdir(fd_dir)
except FileNotFoundError:
    sys.exit(1)
for name in names:
    try:
        target = os.readlink(os.path.join(fd_dir, name))
    except OSError:
        continue
    for inode in inodes:
        if target == f"socket:[{inode}]":
            sys.exit(0)
sys.exit(1)
PY
}

doctor_body() {
  read_state
  local pid="$PID" port="$PORT"
  if [[ ! -d "/proc/$pid" ]]; then
    echo "process $pid is not running" >&2
    return 1
  fi
  local cmdline
  cmdline=$(tr '\0' '\n' < "/proc/$pid/cmdline")
  local need
  for need in "$BIN" --config "$CONFIG" --provider fake --fixture blackwell --listen "127.0.0.1:$port" serve; do
    if ! grep -Fxq -- "$need" <<<"$cmdline"; then
      echo "process $pid cmdline is missing: $need" >&2
      echo "$cmdline" >&2
      return 1
    fi
  done
  if ! port_owned_by "$pid" "$port"; then
    echo "127.0.0.1:$port is not a listen socket of pid $pid" >&2
    return 1
  fi
  local health version_api version_bin snapshot
  if ! health=$(curl -fsS "http://127.0.0.1:$port/healthz"); then
    echo "healthz request failed" >&2
    return 1
  fi
  if ! version_api=$(curl -fsS "http://127.0.0.1:$port/api/v1/version"); then
    echo "version request failed" >&2
    return 1
  fi
  if ! version_bin=$("$BIN" version -f json); then
    echo "binary version command failed" >&2
    return 1
  fi
  if ! snapshot=$(curl -fsS "http://127.0.0.1:$port/api/v1/snapshot"); then
    echo "snapshot request failed" >&2
    return 1
  fi
  if ! python3 - "$health" "$version_api" "$version_bin" "$snapshot" "$LOG" "$XDG_STATE_HOME" <<'PY'
import json, sys
from datetime import datetime, timezone
from pathlib import Path
health, version_api, version_bin, snapshot, log_path, state_home = sys.argv[1:]
health = json.loads(health)
if health.get("status") != "ok" or not health.get("sampledAt"):
    raise SystemExit(f"healthz is not a fresh ok snapshot: {health}")
domains = health.get("domains") or {}
for name in ("system", "gpu"):
    domain = domains.get(name) or {}
    if domain.get("available") is not True or domain.get("status") != "available":
        raise SystemExit(f"healthz {name} domain is not available: {domain}")
sampled = datetime.fromisoformat(health["sampledAt"].replace("Z", "+00:00"))
age = (datetime.now(timezone.utc) - sampled).total_seconds()
if age > 30 or age < -5:
    raise SystemExit(f"healthz sampledAt is {age:.1f}s from now")
api = json.loads(version_api)
binary = json.loads(version_bin)
for key in ("version", "commit", "buildDate"):
    if api.get(key) != binary.get(key):
        raise SystemExit(f"version {key}: api={api.get(key)!r} binary={binary.get(key)!r}")
body = json.loads(snapshot)
if body.get("schemaVersion") != "v1":
    raise SystemExit(f"snapshot schemaVersion={body.get('schemaVersion')!r}")
host = (body.get("host") or {}).get("hostname")
if not host:
    raise SystemExit("snapshot has no hostname")
cpu = (body.get("system") or {}).get("cpu") or {}
if cpu.get("model") != "Leviathan fixture CPU" or cpu.get("logicalProcessors") != 32:
    raise SystemExit(f"fixture CPU mismatch: {cpu}")
gpus = body.get("gpus") or []
if len(gpus) != 2 or "Blackwell" not in (gpus[0].get("name") or ""):
    raise SystemExit(f"fixture GPUs mismatch: {[gpu.get('name') for gpu in gpus]}")
log = Path(log_path).read_text(encoding="utf-8", errors="replace")
if f"Leviathan dashboard: http://127.0.0.1:" not in log:
    raise SystemExit("serve log is missing the dashboard ready line")
if "Yggdrasil uplink enabled" in log:
    raise SystemExit("fixture serve enabled the Yggdrasil uplink")
extra = [str(path) for path in Path(state_home).rglob("*") if path.is_file()]
if extra:
    raise SystemExit("fixture serve wrote state files: " + ", ".join(extra))
PY
  then
    return 1
  fi
  echo "doctor ok run=$RUN_ID base=$BASE_URL" >&2
}

cmd_launch() {
  strip_leviathan_env
  ensure_binary
  mkdir -p "$RUNS" "$EVIDENCE_ROOT"
  local run_id port run_dir
  run_id=$(date -u +%Y%m%dT%H%M%SZ)-$$
  run_dir="$RUNS/$run_id"
  mkdir -p "$run_dir/home" "$run_dir/xdg-config" "$run_dir/xdg-state" "$EVIDENCE_ROOT/$run_id"
  port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')
  local log="$run_dir/serve.log"
  local config="$run_dir/config.toml"
  # The file is intentionally absent so LoadFile skips it. --config still
  # stops Leviathan from reading the user XDG config.
  (
    export HOME="$run_dir/home"
    export XDG_CONFIG_HOME="$run_dir/xdg-config"
    export XDG_STATE_HOME="$run_dir/xdg-state"
    cd "$run_dir"
    setsid "$BIN" \
      --config "$config" \
      --provider fake \
      --fixture blackwell \
      --listen "127.0.0.1:$port" \
      serve >"$log" 2>&1 </dev/null &
    echo $! >"$run_dir/pid"
  )
  local pid
  pid=$(<"$run_dir/pid")
  cat >"$run_dir/state.env" <<EOF
RUN_ID=$run_id
PID=$pid
PORT=$port
BASE_URL=http://127.0.0.1:$port
BIN=$BIN
LOG=$log
CONFIG=$config
RUN_DIR=$run_dir
HOME=$run_dir/home
XDG_CONFIG_HOME=$run_dir/xdg-config
XDG_STATE_HOME=$run_dir/xdg-state
EVIDENCE_DIR=$EVIDENCE_ROOT/$run_id
FIXTURE=blackwell
EOF
  echo "$run_id" >"$ROOT/current"
  local deadline=$((SECONDS + 20)) ready=0
  while (( SECONDS < deadline )); do
    if [[ ! -d "/proc/$pid" ]]; then
      echo "leviathan exited before it was ready" >&2
      cat "$log" >&2
      exit 1
    fi
    if grep -q "Leviathan dashboard: http://127.0.0.1:$port" "$log" \
      && curl -fsS "http://127.0.0.1:$port/healthz" | python3 -c 'import json,sys; d=json.load(sys.stdin); raise SystemExit(0 if d.get("status")=="ok" and d.get("sampledAt") else 1)'; then
      ready=1
      break
    fi
    sleep 0.2
  done
  if (( ready != 1 )); then
    echo "dashboard was not usable within 20s" >&2
    cat "$log" >&2
    kill_pid "$pid"
    exit 1
  fi
  RUN_ID=$run_id
  if ! doctor_body; then
    kill_pid "$pid"
    exit 1
  fi
  # Keep HOME and the XDG paths in the state file only. Printing them would
  # override the caller's environment when this stdout is eval'd.
  printf '%s\n' \
    "RUN_ID=$run_id" \
    "BASE_URL=http://127.0.0.1:$port" \
    "EVIDENCE_DIR=$EVIDENCE_ROOT/$run_id" \
    "PID=$pid" \
    "PORT=$port" \
    "LOG=$log"
}

cmd_doctor() {
  doctor_body
}

cmd_stop() {
  read_state
  kill_pid "$PID"
  rm -rf "$RUN_DIR"
  if [[ -f "$ROOT/current" ]] && [[ $(<"$ROOT/current") == "$RUN_ID" ]]; then
    rm -f "$ROOT/current"
  fi
  if [[ ! -d "$EVIDENCE_DIR" ]]; then
    echo "evidence directory disappeared: $EVIDENCE_DIR" >&2
    exit 1
  fi
  echo "stopped $RUN_ID"
  echo "EVIDENCE_DIR=$EVIDENCE_DIR"
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    launch) cmd_launch ;;
    doctor) cmd_doctor ;;
    stop) cmd_stop ;;
    *) usage ;;
  esac
}

main "$@"
