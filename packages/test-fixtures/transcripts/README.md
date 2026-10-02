# Transcripts

Recorded from real hardware, one JSON file per scenario (shape: `Transcript` in `src/index.ts`).
Name files `<board>-<scenario>.json`, e.g. `aries-v3-boot-banner.json`.

Never hand-edit a recorded transcript. If a synthetic scenario is needed, name it `*-synthetic.json`
and say in `description` what it simulates.

## Recorded so far (Gate 0, ARIES v3, macOS + Chrome, 2026-10-02)

| File | What happened |
|---|---|
| `aries-v3-reset-experiments-dtr-rts.json` | Bootloader waiting; DTR/RTS pulses; no reset |
| `aries-v3-upload-ram-hello-serial.json` | Board already waiting; hello-serial to RAM |
| `aries-v3-upload-ram-blink-manual-reset.json` | Program running, RESET pressed (full banner), blink to RAM |
| `aries-v3-upload-ram-cancelled-midway.json` | 200 KB random image cancelled at block 408; bootloader then silent |
| `aries-v3-upload-ram-recover-after-cancel.json` | RESET after the cancel; normal upload works |

Record more with the "Save to repo" button on `/spike/flash` (dev server only).
