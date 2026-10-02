# Hardware Gate 0 — test guide

Goal: answer the Gate 0 questions in `docs/PLAN.md` with a real ARIES v3, and record transcripts we can replay in tests. Expect about an hour.

## Setup (once)

```sh
pnpm install
pnpm worker:build        # compile worker image (needs Docker; ~1 min)
pnpm fixtures:compile    # builds test sketches → packages/test-fixtures/build/
pnpm --filter @codetochip/web dev
```

You get four files:

| File                            | What it does                                               |
| ------------------------------- | ---------------------------------------------------------- |
| `aries-v3-ram/blink.bin`        | Blinks the on-board LED, run from RAM                      |
| `aries-v3-ram/hello-serial.bin` | Prints a counter every second at 115200 baud, run from RAM |
| `aries-v3-persistent/*.bin`     | The same two programs, built for flash (`link1.lds`)       |

Open **http://localhost:5173/spike/flash** in Chrome or Edge. The BOOT SEL jumper (J12) must be **open** for RAM uploads.

## 1. Desktop: banner and reset

1. **Connect.** Plug in the board, click **Connect** (Web Serial), and pick the CP2102N port.
   - macOS: no driver needed. macOS includes Apple's CP210x driver (`AppleUSBSLCOM`); the board appears as `/dev/cu.usbserial-*`. If no port appears, try another cable (many are charge-only) before installing anything, and record it.
   - Windows: if no port appears, install the Silicon Labs CP210x VCP driver. Record that you needed it.
2. **Record the banner.** Set the recorder scenario to `boot-banner`, then **Start recording** and press **RESET** on the board.
   - Expect the banner in the console, then a lone `C` (hex `43`) every second or so.
   - Then **Stop recording** and **Download JSON**.
3. **Try each reset button** (Pulse DTR low, Pulse RTS low, Pulse both low, Pulse both high).
   - Does the banner reappear? Note which button (if any) resets the board.
   - Also try toggling the DTR and RTS checkboxes and leaving them off. Does the board stay in reset?

## 2. Desktop: upload to RAM

1. **Choose the mode and file.** Pick "Run from RAM" and choose `aries-v3-ram/hello-serial.bin`.
2. **Record the upload.** Scenario `upload-ram-success`, then **Start recording**, then **Upload**. When the page says "Press RESET", press RESET.
3. **Watch the result.**
   - Expect progress to reach 100%, then "Hello from CodeToChip 0, 1, 2…" in the console.
   - Stop recording and download.
4. **Repeat with `blink.bin`.** Does the LED blink?
5. **Record a failed upload.** Scenario `upload-ram-aborted`, then record, upload, and either press **Cancel** halfway or unplug the cable halfway. Download it.
   - Then reset the board and check that a normal upload still works.

## 3. Android (Chrome, USB OTG)

The phone must load the page from `localhost` or HTTPS, because WebUSB requires a secure page:

```sh
adb reverse tcp:5173 tcp:5173      # phone's localhost:5173 → your computer
```

Then open `http://localhost:5173/spike/flash` on the phone.

1. **Connect the board.** Connect it with an OTG adapter, choose **WebUSB + bridge driver**, click **Connect**, and allow the USB permission prompt.
   - Does the phone power the board?
2. **Repeat sections 1 and 2 on the phone.** Name scenarios with an `android-` prefix.
3. **Try the GPIO reset experiment.** In "Bridge GPIO", try **Pulse low** on GPIO0 to GPIO6, one at a time, and note which one (if any) resets the board.
   - This tests the theory that RESET is wired to a CP2102N GPIO (open question 1).
4. **Record the phone details:** model, Android version and Chrome version, in `docs/hardware-matrix.md`.

## 4. Persistent flash (only if you know or want to try the procedure)

This is a hypothesis from reading the VEGA core (open question 2):

1. **Find the helper.** The flash helper is `flasher_arduino.bin` in the VEGA core: `~/.arduino15/packages/vega/hardware/riscv/1.1.3/bootloaders/` if you have the Arduino IDE.
2. **Check the official procedure.** In the Arduino IDE, "Burn Bootloader" with programmer "BootBurn" sends it over XMODEM. What jumper position does C-DAC's guide say to use for each step?
3. **Try it in the spike page.** Upload `flasher_arduino.bin` (RAM mode), then upload `aries-v3-persistent/hello-serial.bin`, with recording on (scenario `persistent-flash`).
4. **Check it survived.** Power-cycle with BOOT SEL **closed**. Does hello-serial run?

Please don't spend long here. Tell me what C-DAC's documentation says, and I'll build it properly in Phase 1.3.

## What to send back

- [ ] The downloaded transcript JSON files (put them in `packages/test-fixtures/transcripts/`)
- [ ] Reset result: which DTR/RTS pulse or GPIO pin worked, or "none, button only"
- [ ] Desktop OS and browser versions tried; any driver installs
- [ ] Android phone(s): model, Android version, Chrome version, powers board (Y/N), upload OK (Y/N)
- [ ] Anything the console showed that surprised you, especially error messages that didn't tell you what to do
