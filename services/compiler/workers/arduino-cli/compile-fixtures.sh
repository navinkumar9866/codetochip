#!/usr/bin/env bash
# Compiles every sketch in packages/test-fixtures/sketches for each FQBN below, in the sandbox,
# into packages/test-fixtures/build/<fqbn-label>/<sketch>.bin (git-ignored: the binaries contain
# LGPL core code; see docs/PLAN.md open question 6). Used by the /spike/flash page.
#
#   services/compiler/workers/arduino-cli/compile-fixtures.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
RUN="$ROOT/services/compiler/workers/arduino-cli/sandbox-run.sh"
OUT="$ROOT/packages/test-fixtures/build"
export SANDBOX_MEMORY="${SANDBOX_MEMORY:-1g}"

# label=fqbn. Phase 2 derives these from the board manifests.
TARGETS=(
  "aries-v3-ram=vega:riscv:aries_v3:upload_method=xmodemMethod"
  "aries-v3-flash=vega:riscv:aries_v3:upload_method=serialMethod"
)

for target in "${TARGETS[@]}"; do
  label="${target%%=*}"
  fqbn="${target#*=}"
  mkdir -p "$OUT/$label"
  for sketch in "$ROOT"/packages/test-fixtures/sketches/*/; do
    name="$(basename "$sketch")"
    tmp="$(mktemp -d)"
    start=$(date +%s)
    tar --no-xattrs -c -C "$sketch" . 2>/dev/null | "$RUN" --compile "$fqbn" 2>"$tmp/log" | tar -x -C "$tmp"
    cp "$tmp/$name.ino.bin" "$OUT/$label/$name.bin"
    echo "$label/$name.bin  $(wc -c < "$OUT/$label/$name.bin" | tr -d ' ') bytes  $(($(date +%s) - start))s"
    rm -rf "$tmp"
  done
done
