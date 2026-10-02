# 0003 — Toolchain: arduino-cli worker image (compile spike results)

Date: 2026-10-01 · Status: accepted (Phase 0.2 spike)

## Decision

Compile in a per-job Docker container built from `services/compiler/workers/arduino-cli/Dockerfile`:

- **Pinned versions:**
  - arduino-cli **1.5.1**, SHA256-verified
  - VEGA core **`vega:riscv@1.1.3`** from the VEGA package index
  - GCC **13.2.0** (`riscv32-vega-elf-gcc` tool version `002`)
- **Installed at image build time.** Containers run with no network.
- **One prebuild per board variant.** The image compiles each board variant's Arduino core once into `/opt/arduino/core-cache`. Each job copies that cache into its tmpfs, so a job only compiles the sketch.
- **No host paths are mounted.** Sources go in as a tar on stdin, and build outputs come out as a tar on stdout (`sandbox-run.sh`).

## Findings

| Question          | Answer                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artifacts         | `<sketch>.ino.bin` (raw binary, from the core's `objcopy -O binary` recipe), `.elf`, and `.hex`. The `.hex` is actually **Motorola S-record**, not Intel HEX. Open question 3 is answered: a `.bin` comes out directly.                                                                                                                                                                                        |
| Board options     | ARIES v3 has one menu, **`upload_method`**: `serialMethod` ("VEGA Flasher", **the default**, linker script `link1.lds`, RAM origin `0x202000`) and `xmodemMethod` ("VEGA Xmodem", `link.lds`, origin `0x200000`). **RAM and flash builds are different binaries**, so the flash mode must be chosen _before_ compiling. The manifest now holds `buildOptions` per flash mode, and `fqbnFor()` builds the FQBN. |
| Image size limit  | The VEGA upload tool rejects images over 249 KB (`maxImageBytes: 254976`). Blink is 2,100 bytes; hello-serial is 4,396 bytes.                                                                                                                                                                                                                                                                                  |
| Reproducibility   | The same sketch and FQBN give byte-identical `.bin` files across runs, and the prebuilt-core path matches a full build byte for byte.                                                                                                                                                                                                                                                                          |
| Host architecture | The VEGA toolchain ships only **x86-64 Linux** (and Windows) binaries, so the worker image is `linux/amd64`. ARM servers would need emulation.                                                                                                                                                                                                                                                                 |
| Missing libraries | The VEGA GCC build was linked on Ubuntu 20.04. On Debian bookworm it needs `libmpc3` and `libmpfr6` (from Debian) and **`libisl.so.22`** (taken from Ubuntu focal, pinned by the SHA256 in focal's Packages index). gdb also wants `libpython3.8`, but gdb isn't used.                                                                                                                                         |
| Sandbox           | All checks were made under the full limits:<br>• arduino-cli writes to `TMPDIR` (set to `/work/tmp`) and to its downloads dir (kept empty in the image).<br>• Runs as uid 10001; network is blocked; root FS and toolchain are read-only; tmpfs is capped at 64 MB.<br>• The fork test hit `--pids-limit 128`.                                                                                                 |
| Image size        | 669 MB (one core family).                                                                                                                                                                                                                                                                                                                                                                                      |

## Compile times

Measured on an Apple Silicon Mac with Docker Desktop, so **x86-64 is emulated**. Expect native x86 servers to be faster. Every run used `--cpus 1` and was timed end to end, including container start.

| Scenario                                                        | Time                                    |
| --------------------------------------------------------------- | --------------------------------------- |
| Fresh container, no core cache (core rebuilt every job)         | **~45 s** (too close to the 60 s limit) |
| Fresh container, prebuilt core seeded from the image: first run | 3.1 s                                   |
| Same, warm (subsequent runs)                                    | **~1.4 s** (target was < 5 s)           |

Peak memory for a full core build under emulation was ~741 MB, so the 512 MB limit from Phase 2.2 OOM-killed it. The spike uses 1 GB (`SANDBOX_MEMORY`). **Re-measure on native x86 in Phase 2** and lower the limit if possible. Sketch-only builds need much less memory.

## Consequences

- **Phase 2 generates `PREBUILD_FQBNS` and the fixture targets from the board manifests** (every flash mode of every board), so no board strings stay in the Dockerfile or scripts.
- **Production workers need x86-64 hosts,** which is fine on Cloud Run or typical VMs.
- **gVisor (`--runtime=runsc`)** isn't available on Docker Desktop. Verify it in Phase 2 on a Linux host.
- **Licences:** compiled binaries statically include the core's LGPL Arduino code, and the core's files are a mix of GPL and LGPL. We don't commit compiled binaries (`packages/test-fixtures/build/` is git-ignored). Serving user-compiled binaries back to the same user is normal Arduino usage, but redistributing `flasher_arduino.bin` (no licence stated) needs Navin's check. See open question 6.

> **Update (Phase 2, ADR 0004):** `sandbox-run.sh` and `compile-fixtures.sh` were replaced by `sandboxArgs()` in `services/compiler/src/toolchains/arduino-cli.ts` and `pnpm fixtures:compile`. `PREBUILD_FQBNS`, `CORES` and index URLs now come from the board manifests via `pnpm worker:build`.
