# Toolchain worker for the arduino-cli adapter (ADR 0003).
# Everything is installed at image build time; at run time the container has no
# network, a read-only root filesystem and a tmpfs /work (docs/PLAN.md, Phase 2.2).
#
# The VEGA toolchain ships only x86-64 Linux binaries, so this image is linux/amd64.
# On Apple Silicon it runs under emulation (slower; see ADR 0003 for timings).
#
# Build from the repo root:
#   docker build --platform linux/amd64 -t codetochip/worker-arduino-vega services/compiler/workers/arduino-cli

FROM debian:bookworm-slim

ARG ARDUINO_CLI_VERSION=1.5.1
ARG ARDUINO_CLI_SHA256=28a8e119c498a25607821c36cb2dc49e8463941b261a0d99091baa7bc692dd2b
# Board package indexes and cores to bake in. Adding a board family = one more index/core here
# (or one more image per family; see ADR 0003).
ARG BOARD_INDEX_URLS=https://gitlab.com/riscv-vega/vega-arduino/-/raw/main/package_vega_index.json
ARG CORES="vega:riscv@1.1.3"

ENV ARDUINO_DIRECTORIES_DATA=/opt/arduino/data \
    ARDUINO_DIRECTORIES_DOWNLOADS=/opt/arduino/staging \
    ARDUINO_DIRECTORIES_USER=/opt/arduino/user \
    ARDUINO_BUILD_CACHE_PATH=/work/cache \
    ARDUINO_BOARD_MANAGER_ADDITIONAL_URLS=${BOARD_INDEX_URLS} \
    ARDUINO_UPDATER_ENABLE_NOTIFICATION=false \
    HOME=/work

# The VEGA GCC 13.2 build was linked on Ubuntu 20.04. It needs libmpc/libmpfr (in Debian) and
# libisl.so.22 (not in Debian), which we take from Ubuntu focal, pinned by the SHA256 in focal's
# signed Packages index. (gdb's libpython3.8 is also missing; gdb is not used for compiling.)
ARG LIBISL22_URL=http://archive.ubuntu.com/ubuntu/pool/main/i/isl/libisl22_0.22.1-1_amd64.deb
ARG LIBISL22_SHA256=67cadab06a50a29cde11c1c1d02847afbae6f0465686481c9106577777b88a44

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl bzip2 libmpc3 libmpfr6 libgmp10 \
 && curl -fsSL -o /tmp/libisl22.deb "${LIBISL22_URL}" \
 && echo "${LIBISL22_SHA256}  /tmp/libisl22.deb" | sha256sum -c - \
 && dpkg -i /tmp/libisl22.deb \
 && rm /tmp/libisl22.deb \
 && curl -fsSL -o /tmp/cli.tgz \
      "https://github.com/arduino/arduino-cli/releases/download/v${ARDUINO_CLI_VERSION}/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz" \
 && echo "${ARDUINO_CLI_SHA256}  /tmp/cli.tgz" | sha256sum -c - \
 && tar -xzf /tmp/cli.tgz -C /usr/local/bin arduino-cli \
 && rm /tmp/cli.tgz \
 && mkdir -p /work \
 && arduino-cli core update-index \
 && for core in ${CORES}; do arduino-cli core install "$core"; done \
 && rm -rf /opt/arduino/staging/* /work/* \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

# Prebuild each board variant's core once, so a job only compiles the sketch (~1 s instead of a
# full core build). Jobs copy this into their tmpfs cache (see sandbox-run.sh). Phase 2 generates
# this list from the board manifests; FQBN options change the core build, so each variant is listed.
ARG PREBUILD_FQBNS="vega:riscv:aries_v3:upload_method=xmodemMethod vega:riscv:aries_v3:upload_method=serialMethod"
RUN mkdir -p /tmp/prebuild/prebuild \
 && printf 'void setup() {}\nvoid loop() {}\n' > /tmp/prebuild/prebuild/prebuild.ino \
 && for fqbn in ${PREBUILD_FQBNS}; do \
      ARDUINO_BUILD_CACHE_PATH=/opt/arduino/core-cache arduino-cli compile --fqbn "$fqbn" /tmp/prebuild/prebuild; \
    done \
 && rm -rf /opt/arduino/core-cache/sketches /tmp/prebuild /work/* \
 && chmod -R a+rX /opt/arduino/core-cache

# Unprivileged user; /opt/arduino stays root-owned and is read-only at run time anyway.
RUN useradd --uid 10001 --no-create-home --home-dir /work builder
USER builder
WORKDIR /work

ENTRYPOINT ["arduino-cli"]
