#!/usr/bin/env bash
# Runs one command in the arduino-cli worker with the Phase 2.2 sandbox limits.
# No host paths are mounted: input arrives as a tar on stdin, output leaves as a tar on stdout.
#
#   sandbox-run.sh <arduino-cli args...>                 plain arduino-cli command
#   tar -c -C sketch . | sandbox-run.sh --compile <fqbn>  compile; writes a tar of build outputs to stdout
#
# Spike-quality (Phase 0.2). Phase 2 replaces this with the worker pool in services/compiler.
set -euo pipefail

IMAGE="${WORKER_IMAGE:-codetochip/worker-arduino-vega}"
# Add --runtime=runsc in production (gVisor); not available on Docker Desktop.
SANDBOX=(
  --rm --platform linux/amd64
  --network none
  --read-only
  --tmpfs /work:rw,exec,size=64m,uid=10001,gid=10001
  --memory "${SANDBOX_MEMORY:-512m}" --memory-swap "${SANDBOX_MEMORY:-512m}"
  --cpus 1
  --pids-limit 128
  --cap-drop ALL
  --security-opt no-new-privileges
  --user 10001:10001
)

if [[ "${1:-}" != "--compile" ]]; then
  exec docker run "${SANDBOX[@]}" "$IMAGE" "$@"
fi

FQBN="$2"
exec docker run -i "${SANDBOX[@]}" --entrypoint bash "$IMAGE" -c '
  set -euo pipefail
  export TMPDIR=/work/tmp
  mkdir -p /work/sketch /work/out /work/tmp
  # Seed the job cache with the prebuilt core so only the sketch is compiled.
  cp -r /opt/arduino/core-cache /work/cache
  tar -x -C /work/sketch
  # arduino-cli needs the sketch folder name to match the main .ino file.
  main=$(cd /work/sketch && ls *.ino | head -1)
  dir=/work/${main%.ino}
  mv /work/sketch "$dir"
  timeout 60 arduino-cli compile --fqbn "$1" --output-dir /work/out "$dir" >&2
  tar -c -C /work/out .
' _ "$FQBN"
