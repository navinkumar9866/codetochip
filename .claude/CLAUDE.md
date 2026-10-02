# CLAUDE.md — CodeToChip

**CodeToChip: write code, flash any microcontroller, from any device.** A browser-based platform that makes microcontroller development easy: write code, compile it on our servers, flash it over USB from the browser, watch the serial output, or run it in a simulator. No installs, no toolchain setup, no drivers where we can avoid them. Mobile-first (Android), works on Windows, macOS and Linux.

**Scope is all microcontrollers.** C-DAC **ARIES v3** (THEJAS32 SoC, VEGA ET1031 RV32IM core) is the _first board onboarded_, not the product. Every design decision must keep adding the next board cheap.

The full phased plan is in `docs/PLAN.md`. Read it before starting any phase. Work one phase at a time and stop at every **HARDWARE GATE** so Navin can test on a real board.

## Repo layout (pnpm monorepo, TypeScript strict)

```
apps/web             Vite + React PWA (CodeMirror 6 editor, serial monitor, flashing UI, accounts)
apps/admin           FireCMS staff admin: examples, lessons, pages, site settings, users
services/compiler    Fastify API + BullMQ queue + sandboxed arduino-cli workers
packages/flasher     Framework-free: transports, protocols, board registry. No React, no DOM except Web Serial/WebUSB types
packages/boards      Board manifests (JSON) + schema
packages/data        Data model + backend-agnostic services (auth, projects); Firebase impl in ./firebase
packages/emulator    (Phase 6, not created yet) Rust -> WASM RV32IM emulator + peripherals
packages/test-fixtures  Recorded bootloader transcripts, sample sketches, mock serial device
firebase/            Firestore/Storage security rules, emulator tests, seed + set-role scripts
docs/                PLAN.md, decisions (ADRs), hardware test matrix
```

## Core architecture rules

1. **Transport vs Protocol split.** A `Transport` only moves bytes and toggles DTR/RTS (`WebSerialTransport` for desktop; `WebUsbSerialTransport` for Android, with pluggable USB-serial bridge drivers: CP210x first, then CH34x, FTDI, CDC-ACM). A `Protocol` speaks one bootloader (`VegaXmodemProtocol` first). Protocols never know which transport they run on.
2. **Boards are data.** Everything board-specific (FQBN, USB VID/PID, baud, protocol, reset method, memory sizes, examples) lives in a manifest in `packages/boards`. Adding a board should mostly mean adding a manifest.
3. **Transport selection:** desktop Chromium uses Web Serial. Android uses WebUSB with our own bridge drivers (Chrome Android's Web Serial USB support only covers a limited set of devices). Never use WebUSB on desktop, because the OS driver claims the device. iOS cannot flash at all; show a clear message and offer "download .bin".
4. **All compilation is untrusted.** Workers run with no network, read-only root filesystem, a tmpfs work dir, CPU/memory/time/output-size limits, a non-root user, and gVisor (`runsc`) in production. Reject `#include` of absolute paths or `..` traversal outside the sketch dir. Never mount host paths other than the read-only toolchain cache.
5. **Nothing in `packages/flasher` may require real hardware to test.** Use the mock serial device in `packages/test-fixtures`, which replays recorded bootloader transcripts.
6. **Board-agnostic core.** No board name, VID/PID, baud rate or bootloader detail may appear outside `packages/boards`, a protocol module, or a bridge driver. The web app and compiler service only read manifests. If you are tempted to write `if (board === 'aries-v3')`, extend the manifest schema instead.
7. **Toolchains are adapters.** The compiler service calls a `ToolchainAdapter` chosen by the manifest (`arduino-cli` first; later PlatformIO, vendor SDKs, Zephyr). Each adapter has its own worker image.
8. **Backend through `packages/data` only (ADR 0001).** Firebase (Auth, Firestore, Storage) holds accounts, saved projects and content. UI code uses the `AppServices` interfaces via `useServices()`; only an app's entry point picks the Firebase implementation (ESLint enforces this in `apps/web`). Roles are the `role` custom claim (`student | teacher | editor | admin`), never a Firestore field.
9. **Security rules are code.** Every change to `firebase/*.rules` needs an emulator test in `firebase/test/`. Limits in the rules must match `PROJECT_LIMITS` in `packages/data`.
10. **Ease is the product.** Every error shown to a user must say what to do next in plain language (e.g. "Board not detected — try a different USB cable; many are charge-only").

## First board: ARIES v3 facts (from public sources; re-verify on hardware)

- USB-UART bridge: Silicon Labs **CP2102N**, VID `0x10C4`, PID `0xEA60`. Not CDC-ACM; needs vendor control requests (see PLAN.md).
- ROM bootloader, UART at **115200 8N1**, receives the program via **XMODEM** (128-byte blocks).
- Arduino board package index: `https://gitlab.com/riscv-vega/vega-arduino/-/raw/main/package_vega_index.json`, FQBN `vega:riscv:aries_v3`.
- BOOT SEL jumper (J12) open = upload over UART to RAM (lost on power-off). Closed = boot from SPI flash. Persistent flashing uses a `flasher.bin` helper sent over XMODEM first.
- **Bootloader quirks (must handle):**
  - The handshake is a **lone** `C` (sent every 190 ms while waiting). The banner contains "C-DAC", "CPU" etc., and the first real `C` arrives in the same USB chunk as the banner's last line, so detect a `C` followed by silence (≥50 ms), not "a chunk that is exactly C" (verified at Gate 0).
  - After EOT is ACKed, send `\r` (ENTER). Without it, the bootloader never jumps to the program.
- DTR/RTS do **not** reset the board (Gate 0). The desktop UI must prompt "Press RESET on the board". A CP2102N-GPIO reset over WebUSB is still untested.
- After a cancelled transfer (`CAN CAN`) the bootloader goes silent until RESET.

## Onboarding a new board

Follow the checklist in `docs/PLAN.md` → "Board onboarding kit". A board is done only when its manifest validates, its protocol passes mock tests, examples compile in CI, and it has passed its hardware gate.

## Commands

- `pnpm dev` runs Firebase emulators + web (:5173) + admin (:5174) + compile API (:3001). Needs Java 21+ for the emulators
- `pnpm seed` loads demo content and test users into the emulators (prints them)
- `pnpm set-role <email> <role>` sets a user's role (emulators by default)
- `pnpm test` runs Vitest across packages; `pnpm test:rules` runs rules + data-layer tests in the emulators
- `pnpm test:e2e` runs Playwright (web, with mocked serial)
- `pnpm lint` / `pnpm typecheck` / `pnpm format`
- `docker compose up` runs Redis and the compiler API (worker added in Phase 0.2)

## Working agreements

- Write tests first for protocol and driver code; replay transcripts rather than guessing device behaviour.
- When a device behaviour is unknown, add it to `docs/PLAN.md` → "Open questions" and ask Navin. Do not invent it.
- Keep the mobile layout working in every UI change (test at 380px width).
- Record significant decisions as short ADRs in `docs/decisions/`.
- Open source (Apache-2.0, one official hosted site; see ADR 0001). Never commit secrets or real Firebase project config; local dev uses the `demo-codetochip` emulator project.
- Check licenses before copying or porting code (vegadude, VEGA SDK, Arduino core, usb-serial-for-android). Note the license in the file header when porting.
