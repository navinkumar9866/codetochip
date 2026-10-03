#!/usr/bin/env bash
# One-time setup of the compile VM (Ubuntu 24.04, x86-64): Docker, gVisor, then the
# compile server. Run on the VM from a clone of the repo:
#   sudo bash deploy/compile-vm/setup.sh
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

if ! command -v runsc >/dev/null; then
  curl -fsSL https://gvisor.dev/archive.key | gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" \
    >/etc/apt/sources.list.d/gvisor.list
  apt-get update
  apt-get install -y runsc
  runsc install
  systemctl restart docker
fi

[ -f .env ] || { cp .env.example .env; echo "Fill in deploy/compile-vm/.env, then run this again."; exit 1; }

docker compose build
# The toolchain image every compile runs in, built from the board manifests.
docker compose run --rm --no-deps compiler-worker pnpm --filter @codetochip/compiler worker:build
docker compose up -d
echo "Compile server starting. Check: curl https://\$(grep ^COMPILE_HOST .env | cut -d= -f2)/health"
