# CodeToChip — Implementation Plan

Owner: Navin. Implementer: Claude Code. Read `CLAUDE.md` first.

## Vision

Make microcontroller development easy for everyone, on any board, from any device. CodeToChip supports **all microcontroller families**; C-DAC ARIES v3 is the first board onboarded and the reference for the onboarding process. Success means: a beginner with only an Android phone and a board goes from zero to a blinking LED in under 2 minutes, and adding a new board family takes weeks, not months.

Each phase lists goals, tasks, acceptance criteria, and **HARDWARE GATES**. At a hardware gate, Claude Code stops, summarises what to test, and waits for Navin's results before continuing.

---

## Default decisions (change here if Navin decides otherwise)

| Topic      | Default                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audience   | Students and beginners first; advanced users later                                                                                                                                                                        |
| Code style | Arduino-style sketches first (the widest-supported API across MCU families). Native SDKs (VEGA SDK, ESP-IDF, Pico SDK, Zephyr) arrive later as "advanced mode" per board                                                  |
| Toolchain  | `ToolchainAdapter` layer; `arduino-cli` adapter first, since one adapter covers Vega, ESP32, RP2040, AVR, STM32 and more                                                                                                  |
| Accounts   | Firebase Auth (Google first, then email link / phone OTP; anonymous guests can upgrade). Arrive with the desktop MVP in Phase 3. See ADR 0001                                                                             |
| Frontend   | Vite + React + TypeScript, Tailwind, CodeMirror 6, `vite-plugin-pwa`                                                                                                                                                      |
| Backend    | Firebase (Auth, Firestore, Storage) for accounts, saved code and content, behind `packages/data`. Admin: FireCMS (`apps/admin`). Compiler: Node + Fastify, BullMQ on Redis, Docker workers (gVisor in prod). See ADR 0001 |
| Licence    | Apache-2.0. Open source; one official hosted site (not designed for self-hosting). See ADR 0001                                                                                                                           |
| Browsers   | Chromium on desktop (Chrome, Edge, Brave, Opera). Chrome on Android. iOS: compile + download only                                                                                                                         |
| Hosting    | Firebase Hosting for web and admin; compiler on Google Cloud (Mumbai, `asia-south1`). Exact compiler host decided in Phase 2                                                                                              |

---

## Phase 0 — Scaffolding and risk spikes

**Goal:** prove the three risky pieces work before building product.

### 0.1 Monorepo scaffold

- pnpm workspaces with the layout in `CLAUDE.md`, shared `tsconfig`, ESLint, Prettier, Vitest, Playwright.
- GitHub Actions: lint, typecheck, test on every PR.
- `docker-compose.yml` with Redis, compiler API, one worker.

### 0.2 Compile spike

- Build a worker Docker image containing `arduino-cli` with the VEGA core installed from the package index. Install the core at **image build time**, never at compile time (workers have no network).
- Run `arduino-cli compile --fqbn vega:riscv:aries_v3 --output-dir /out` on the Blink example.
- Find out which artifacts come out (`.elf`, `.bin`, `.hex`). If there is no raw `.bin`, produce one with the core's `riscv*-objcopy -O binary`.
- Run `arduino-cli board details --fqbn vega:riscv:aries_v3` and record any board menu options (e.g. flash mode) in `packages/boards/aries-v3.json`.
- Measure cold vs warm compile time. Record in `docs/decisions/0003-toolchain.md`.

### 0.3 Desktop flashing spike

- A throwaway page in `apps/web` (route `/spike/flash`) using **Web Serial** to:
  1. `requestPort({ filters: [{ usbVendorId: 0x10C4, usbProductId: 0xEA60 }] })`, open at 115200.
  2. Show everything received, as text and hex (the boot banner).
  3. Try resetting via DTR/RTS pulses (try each combination; log what happens).
  4. Wait for a lone `C`, send the `.bin` over XMODEM-CRC, send EOT, then `\r`.
- Also a **recorder**: saves the full byte stream with direction and timestamps as JSON into `packages/test-fixtures/transcripts/`.

### 0.4 Android flashing spike

- Same page, WebUSB path: `navigator.usb.requestDevice({ filters: [{ vendorId: 0x10C4, productId: 0xEA60 }] })`.
- Minimal CP210x driver (see Appendix B). Open, configure 115200 8N1, raise DTR/RTS, bulk read/write.
- Reuse the XMODEM code from 0.3 through a shared `Transport` interface.

### Phase 0 status (2026-10-01)

- 0.1 done. 0.2 done (ADR 0003): ~1.4 s warm compiles in the sandbox.
- 0.3/0.4 built and unit-tested, but **not yet tried on hardware**: `/spike/flash` page, XMODEM sender with VEGA quirks, Web Serial and WebUSB/CP210x transports, transcript recorder.
- Next: Navin runs Gate 0 using [`docs/hardware/gate-0.md`](hardware/gate-0.md).

### HARDWARE GATE 0

**Desktop findings (2026-10-02, macOS 26.4, Chrome 154, ARIES v3 via CP2102N):**

- **Bootloader:** ROM bootloader v1.0.0 (Dec 2020). Banner says `IRAM: [0x200000 - 0x23E7FF] [250 KB]` and "Please send file using XMODEM and then press ENTER key." After `\r` it prints "Starting program ..." and runs the image.
- **Handshake:**
  - While waiting, the bootloader sends a lone `C` every **190 ms**, indefinitely.
  - The first `C` arrives **in the same USB chunk as the end of the banner** (`"ENTER key.\n\r C"`), so "a chunk that is exactly `C`" would miss it. We detect a `C` followed by ≥50 ms of silence instead.
- **Transfer:** 128-byte blocks ACKed in ~15 ms each (4.4 KB in 0.5 s), with no NAKs in any run.
- **Cancel:** after `CAN CAN` the bootloader goes **silent**. It does not resume sending `C`, so the user must press RESET. The next upload then works normally.
- **Stray bytes:** we saw one `0xFF` when the port opened, and one `0x19` between "Starting program" and the program's first output. Parsers must tolerate both.
- **Opening the port** does not reset the board.

Navin tests and reports:

- [x] Banner received on desktop Chrome. **macOS 26.4 + Chrome 154 (2026-10-02): works, no driver install** (Apple's built-in `AppleUSBSLCOM`). Windows/Linux still to test.
- [x] Does DTR/RTS reset the board? **No.** DTR low, RTS low, both low, both high: no reset (transcript `aries-v3-reset-experiments-dtr-rts.json`). Desktop flow = "Press RESET". Bridge-GPIO reset still to try on Android.
- [x] Blink uploaded to RAM and running from desktop (green LED blinks); hello-serial prints over serial.
- [ ] Blink uploaded from at least one Android phone via OTG. Record phone model, Android version, and whether the phone powers the board.
- [ ] Transcripts recorded: ~~boot banner~~ (inside `upload-ram-blink-manual-reset`), ~~successful upload~~, ~~failed/aborted upload~~ (`upload-ram-cancelled-midway`, `upload-ram-recover-after-cancel`); persistent flash mode still to do.
- [ ] How persistent flash mode works in practice: jumper position, where `flasher.bin` comes from, and its licence.

**Exit:** all three spikes work, or we have written up what blocks them and decided a fallback.

---

## Phase 1 — `packages/flasher` done properly

### 1.1 Interfaces

```ts
export interface Transport {
  open(opts: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  /** Async stream of received chunks. */
  readable: AsyncIterable<Uint8Array>;
  setSignals(s: { dtr?: boolean; rts?: boolean }): Promise<void>;
  readonly kind: 'webserial' | 'webusb-cp210x' | 'mock';
}

export interface FlashProgress {
  stage: 'waiting-for-bootloader' | 'handshake' | 'transferring' | 'finishing' | 'done' | 'error';
  bytesSent?: number;
  totalBytes?: number;
  message?: string;
}

export interface Protocol {
  id: string; // e.g. 'vega-xmodem'
  flash(
    t: Transport,
    image: Uint8Array,
    opts: FlashOptions,
    onProgress: (p: FlashProgress) => void,
    signal: AbortSignal,
  ): Promise<void>;
}
```

### 1.2 Mock serial device

- `MockTransport` replays a transcript and reacts to writes (e.g. ACK each XMODEM block, NAK on a bad CRC).
- Scenarios: happy path, noisy banner containing `C`, NAK and retry, timeout, cancel (`CAN`), user unplugs mid-transfer.

### 1.3 `VegaXmodemProtocol`

- XMODEM-CRC per Appendix A, with checksum-mode fallback if the device sends NAK instead of `C`.
- Handshake: a read chunk that is exactly `C` (after trimming nothing), not a banner containing `C`.
- Retries up to 10 per block, then abort with `CAN CAN`.
- After EOT is ACKed, send `\r`.
- Reset strategy comes from the board manifest: `'dtr-rts'` with a pulse sequence, or `'manual'` (emit a progress stage telling the UI to ask the user to press RESET).
- Persistent mode: send `flasher.bin`, wait for its ready prompt, then send the program (exact prompts from Gate 0 transcripts).

### 1.4 Transports

- `WebSerialTransport` wrapping `navigator.serial`.
- `WebUsbSerialTransport` with a `BridgeDriver` interface (`open`, `setBaud`, `setLineCoding`, `setSignals`, `close`). First driver: `Cp210xDriver` per Appendix B. Design so `Ch34xDriver`, `FtdiDriver` and `CdcAcmDriver` drop in later. Handle `disconnect` events, and release the interface on close.
- `detectTransport()`: Web Serial on desktop, WebUSB on Android, "unsupported" on iOS/Firefox/Safari with a reason string.

### 1.5 Board registry

- JSON Schema for manifests (Appendix C) and `aries-v3.json`.
- Validation in CI.
- Board picker data comes only from the registry: family → board → variant, with search, photos, and a "which board do I have?" helper (match by USB VID/PID when the user plugs it in).
- Add a second, fake board manifest (`test-board`) that uses the mock transport and a different protocol stub. It proves nothing in the app is hard-wired to ARIES.

**Acceptance:** 100% of protocol paths covered by tests against the mock; no test needs hardware.

---

## Phase 2 — Compiler service

### 2.1 API

- `POST /api/compile` `{ board, files: [{ path, content }], options }` returns `{ jobId }`.
- `GET /api/compile/:jobId` returns status, logs, errors with file/line/column, and artifact URL when done.
- (Optional) Server-sent events for live logs.
- `GET /api/artifacts/:id` returns the `.bin` (expires after 1 hour).
- `GET /api/boards` returns manifests and examples.

### 2.2 Worker sandbox (non-negotiable)

- One container per job. `--network none`, `--read-only`, tmpfs `/work` (e.g. 64 MB), `--pids-limit`, `--memory 512m`, `--cpus 1`, wall-clock timeout 60 s, non-root user, all capabilities dropped, `no-new-privileges`, seccomp default. gVisor `runsc` runtime in production.
- Toolchain and cores baked into the image, read-only.
- Input validation: file count, total size (e.g. 256 KB), allowed extensions (`.ino .c .cpp .h .hpp`), no path traversal, no absolute `#include` or `..` includes outside the sketch.
- Cap log output size. Strip host paths from compiler messages before returning them.

### 2.3 Speed and cost

- Keep a pool of warm workers.
- Cache the prebuilt core (arduino-cli build cache) in the image.
- Cache results keyed by hash of (board manifest version + files + options).
- Rate limit per IP (and per user later). Queue with visible position for classroom bursts.

### 2.4 Toolchain adapters

```ts
export interface ToolchainAdapter {
  kind: 'arduino-cli' | 'platformio' | 'vendor-sdk' | 'zephyr';
  image: string; // worker Docker image for this toolchain family
  compile(job: CompileJob): Promise<CompileResult>; // runs inside the sandbox
  parseDiagnostics(log: string): Diagnostic[]; // file/line/col/severity/message
}
```

- Implement `arduino-cli` only. One image per core family is fine; keep images small and pinned by version.
- Core and library versions are pinned in the manifest so builds are reproducible.

**Acceptance:** Blink compiles warm in under 5 s on a dev machine. Sandbox tests prove a sketch cannot read `/etc/passwd`, reach the network, or fork-bomb the host. Load test: 60 concurrent compiles complete without errors.

---

## Phase 3 — Desktop MVP web app

### Features

- Board picker (just ARIES v3 for now) and example browser (examples from the VEGA core).
- CodeMirror 6 editor with C/C++ highlighting, multiple files, autosave (Firestore offline cache; works signed out as an anonymous guest).
- Accounts: Google sign-in, profile, "My projects" (create, rename, delete, open). Guests upgrade to a full account without losing work.
- Admin (`apps/admin`, FireCMS): editors manage examples, lessons, pages and site settings; admins manage roles. Roles are Firebase custom claims (`student`, `teacher`, `editor`, `admin`), enforced by Firestore/Storage rules with emulator tests in CI.
- Compile button with inline error markers from the compiler's file/line output.
- Flash button: connect, reset guidance, progress bar, clear success/failure messages. Options: "Run from RAM" vs "Save to flash".
- Serial monitor: baud selector, send line, autoscroll, clear, timestamps, download log. Must release the port before flashing and reopen after.
- "Download .bin" always available.
- Compatibility banner: explains unsupported browsers (Firefox, Safari, iOS) and suggests Chrome.
- Troubleshooting help: CP210x driver on Windows, `dialout` group on Linux, BOOT SEL jumper, bad USB cables (charge-only cables are common).
- PWA: installable, app shell cached offline, projects available offline (compile needs network).

### Testing

- Playwright e2e with `MockTransport` injected (feature flag), covering: open example → compile → flash → serial output shows.

### HARDWARE GATE 3

- [ ] Full flow on Windows Chrome, Windows Edge, macOS Chrome, Ubuntu Chrome.
- [ ] Beginner test: someone new goes from landing page to Blink in under 2 minutes.

---

## Phase 4 — Android and mobile UX

- Responsive layout designed for about 380px width: editor full-screen, bottom action bar (Compile / Flash / Monitor), drawers for files and output.
- Symbol toolbar above the keyboard: `{ } ( ) [ ] ; < > = " ' # / &`, plus Tab.
- Harden `WebUsbSerialTransport` and `Cp210xDriver`: reconnect on replug, handle Android permission prompts, and handle the page going to background during a flash.
- OTG guidance screen with pictures.
- Device test matrix in `docs/hardware-matrix.md`: phone model, Android version, Chrome version, powers board (Y/N), flash OK (Y/N), notes.

### HARDWARE GATE 4

- [ ] Works on at least 5 Android phones including Samsung, Pixel, and one budget phone (e.g. Redmi/Realme).

---

## Phase 5 — Platform features

- More sign-in methods (email magic link, phone OTP); role management UI in the admin backed by a Cloud Function that sets custom claims.
- Save, share read-only links, fork a shared project.
- Classroom: teacher creates a class, shares starter projects, sees submissions.
- Observability: compile success rate, flash success rate by transport/OS/browser (anonymous telemetry, opt-out), error logs.

---

## Phase 6 — Simulator

- `packages/emulator`: Rust → WASM, running in a Web Worker.
- 6.1 RV32IM CPU. Pass `riscv-arch-test` / `riscv-tests` for RV32IM in CI.
- 6.2 Memory map and peripherals from THEJAS32 documentation: UART, GPIO, then timers (`mtime`/`mtimecmp`) and interrupts, then PWM, then I2C/SPI.
- 6.3 Cycle counting with throttling so `delay()`/`millis()` match real time.
- 6.4 Virtual board panel: LEDs, RGB LED, buttons, potentiometer, 7-segment display, serial console. Later: virtual I2C sensors and an OLED.
- 6.5 Differential testing: run the same `.bin` in the emulator and on real ARIES, compare serial output (HARDWARE GATE).
- The simulator is the main experience for iOS users.
- Before starting: Navin checks whether Wokwi could support ARIES via partnership. Record the outcome as an ADR.

---

## Phase 7 — Board onboarding program

From here on, adding boards is the main growth loop. Make it a repeatable process, not one-off engineering.

### Board onboarding kit (checklist per board)

1. Manifest in `packages/boards` (validates against schema).
2. Toolchain: existing adapter + pinned core version, or a new adapter/image.
3. USB: bridge driver exists for Android (CP210x, CH34x, FTDI, CDC-ACM), or add one.
4. Protocol: existing protocol module, or a new one with mock-transport tests and recorded transcripts.
5. Reset and boot-mode guidance (text + pictures) for the flash UI.
6. At least 5 curated examples that compile in CI.
7. Hardware gate: desktop Chrome + 2 Android phones, recorded in `docs/hardware-matrix.md`.
8. Simulator support (optional, later): CPU and peripheral models.

### Suggested order (by reach in India's student/maker market; Navin to confirm)

| Family                                   | Protocol                   | Android USB driver               | Notes                                     |
| ---------------------------------------- | -------------------------- | -------------------------------- | ----------------------------------------- |
| ESP32 / ESP32-C3 / S3                    | esptool (`esptool-js`)     | CP210x, CH34x, native CDC        | Huge user base; Wi-Fi projects            |
| Arduino Uno / Nano (AVR)                 | STK500 v1                  | CH34x (clones), CDC (ATmega16U2) | Most common school board                  |
| RP2040 / RP2350                          | UF2 file copy              | none (USB drive)                 | May work even on iOS via Files app — test |
| STM32                                    | WebDFU / serial bootloader | CDC or DFU                       | Windows needs WinUSB for DFU              |
| Other Indian RISC-V boards (e.g. Shakti) | per board                  | per board                        | Strategic alignment with Vega             |

### Longer-term ideas (not scheduled)

- A library manager and a parts catalogue ("add a DHT11 sensor" inserts wiring diagram + code).
- Guided lessons and classroom packs per board.
- AI helper that explains compiler errors in simple English/Hindi.
- Wireless flashing (OTA) for Wi-Fi boards, which would also bring flashing to iOS.
- **Offline in-browser compilation** (see below).

### Later scope: offline in-browser compilation

MVP compiles on the server (Phase 2). Later, add an optional offline mode that compiles in the browser so classrooms with poor connectivity can work without a network after the first load.

- Approach: clang/LLVM + `lld` compiled to WASM, run in a Web Worker. Each board's Arduino core is prebuilt on our side into a static library plus headers, and downloaded once and cached (IndexedDB / Cache Storage).
- Fits the `ToolchainAdapter` model as a new client-side adapter kind (e.g. `wasm-clang`), selected per board via the manifest. Server compile stays the default.
- Start with families LLVM supports well: RV32IM (ARIES) and ARM (RP2040, STM32). Xtensa (ESP32) and AVR only once LLVM support is solid.
- Risks to evaluate first: download size (tens of MB per toolchain; make it opt-in, never on first visit), compile speed on budget phones, and clang vs the vendor GCC the core was built with (attributes, linker scripts, binary differences). Verify output against the server build on real hardware before shipping per board.

---

## Appendix A — XMODEM-CRC summary

- Bytes: `SOH 0x01`, `EOT 0x04`, `ACK 0x06`, `NAK 0x15`, `CAN 0x18`, `SUB 0x1A` (padding), `C 0x43` (receiver requests CRC mode).
- Packet: `SOH`, block number (starts at 1, wraps at 255→0), `255 - block`, 128 data bytes (pad the last one with `0x1A`), CRC-16 high byte, low byte.
- CRC-16/XMODEM: poly `0x1021`, init `0x0000`, no reflection, no final XOR.
- Checksum mode (receiver sends NAK to start): 1-byte sum of data instead of the CRC.
- Receiver replies ACK (next block) or NAK (resend). After the last block send EOT; expect ACK (resend EOT on NAK).
- VEGA-specific: after the final ACK, send `\r`.

## Appendix B — CP210x over WebUSB (verify against Silicon Labs AN571)

- Select configuration 1, claim interface 0, find bulk IN and bulk OUT endpoints from the descriptors (don't hard-code).
- Control transfers: `requestType: 'vendor'`, `recipient: 'interface'`, `index: 0` (interface number).
  - `IFC_ENABLE` request `0x00`, value `0x0001` to enable, `0x0000` to disable on close.
  - `SET_BAUDRATE` request `0x1E`, value `0`, data = 4-byte little-endian baud rate.
  - `SET_LINE_CTL` request `0x03`, value `0x0800` for 8 data bits, no parity, 1 stop bit.
  - `SET_MHS` request `0x07` for DTR/RTS. Bit 0 = DTR, bit 1 = RTS, bits 8/9 = write masks for DTR/RTS.
  - `PURGE` request `0x12`, value `0x000F` to flush buffers.
- Reference implementation to study: `usb-serial-for-android` `Cp21xxSerialDriver` (MIT licence). Credit it in the file header.
- Loop `transferIn` with a 64-byte (or `wMaxPacketSize`) length; handle `disconnect`.

## Appendix C — Board manifest (draft)

```json
{
  "id": "aries-v3",
  "name": "ARIES v3.0 (THEJAS32)",
  "vendor": "C-DAC",
  "arch": "rv32im",
  "family": "vega-thejas32",
  "toolchain": { "kind": "arduino-cli", "fqbn": "vega:riscv:aries_v3", "coreVersion": "PIN_ME" },
  "artifact": { "format": "bin" },
  "usb": [{ "vendorId": "0x10C4", "productId": "0xEA60", "bridge": "cp210x" }],
  "serial": { "baudRate": 115200 },
  "flash": {
    "protocol": "vega-xmodem",
    "modes": [
      { "id": "ram", "label": "Run from RAM (lost on power-off)", "bootSel": "open" },
      { "id": "persistent", "label": "Save to flash", "bootSel": "TBD", "helper": "flasher.bin" }
    ],
    "reset": { "method": "TBD (dtr-rts | manual)" }
  },
  "memory": { "ramBytes": 262144 },
  "docsUrl": "https://vegaprocessors.in/ariesv3.php"
}
```

---

## Open questions (Claude Code: add here, don't guess)

1. Can DTR/RTS reset ARIES v3? **Answered for desktop: no** (Gate 0, 2026-10-02); UI must ask the user to press RESET. Still open: does a CP2102N GPIO (WebUSB/Android) reset it? VEGA's Linux `reset` tool uses `/dev/gpiochip`.
2. Exact persistent-flash procedure and prompts; source and licence of `flasher.bin`. (Gate 0) — _0.2 lead:_ the helper is `bootloaders/flasher_arduino.bin` in the VEGA core, written by the core's "BootBurn" programmer over plain XMODEM. Flash builds use `link1.lds` (origin `0x202000`, leaving 8 KB for the helper). VEGA's flash uploader is the same XMODEM sender as the RAM one, plus printing serial output afterwards. Hypothesis: burn the helper once (BOOT SEL = boot from flash), then each upload is a normal XMODEM transfer of a `serialMethod` build that the helper writes to flash. No licence is stated for the helper. Confirm the steps and prompts at Gate 0.
3. ~~Does the VEGA Arduino core output a `.bin` directly?~~ **Answered (0.2): yes**, `<sketch>.ino.bin`. See ADR 0003.
4. ~~Does macOS need a CP210x driver install for Web Serial?~~ **Answered: no** on macOS 26.4 (built-in `AppleUSBSLCOM`). Re-check older macOS at Gate 3.
5. Which Android phones fail to power the board over OTG? (Gate 4)
6. Licences: VEGA Arduino core, VEGA SDK, vegadude, `flasher.bin`. OK to redistribute in our Docker image? — _0.2:_ the core has no top-level licence file; its sources carry GPL and LGPL headers. `flasher_arduino.bin` and the VEGA upload tools state no licence. We install the core from the public index at image build time and never commit compiled binaries. Navin to confirm with C-DAC before we serve `flasher_arduino.bin` from our site.
7. Completeness of THEJAS32 register-level documentation for the simulator. (Before Phase 6)
8. Offline compile: does the VEGA Arduino core build and run correctly with clang instead of GCC? (Before starting offline mode)
9. The VEGA toolchain only runs on x86-64. Do we ever need ARM build hosts? (Phase 2 hosting)
