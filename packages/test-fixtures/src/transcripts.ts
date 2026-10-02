// Real recordings from Hardware Gate 0 (ARIES v3, macOS + Chrome, 2026-10-02).
import { fromHex, type Transcript } from '@codetochip/flasher';
import blinkManualReset from '../transcripts/aries-v3-upload-ram-blink-manual-reset.json' with { type: 'json' };
import cancelledMidway from '../transcripts/aries-v3-upload-ram-cancelled-midway.json' with { type: 'json' };
import helloSerial from '../transcripts/aries-v3-upload-ram-hello-serial.json' with { type: 'json' };
import recoverAfterCancel from '../transcripts/aries-v3-upload-ram-recover-after-cancel.json' with { type: 'json' };
import resetExperiments from '../transcripts/aries-v3-reset-experiments-dtr-rts.json' with { type: 'json' };

export const transcripts = {
  /** Board already waiting in the bootloader; hello-serial uploaded to RAM. */
  helloSerial: helloSerial as Transcript,
  /** Program running; user pressed RESET (full banner recorded); blink uploaded. */
  blinkManualReset: blinkManualReset as Transcript,
  /** 200 KB random image, cancelled after ~25% (CAN CAN); bootloader then silent. */
  cancelledMidway: cancelledMidway as Transcript,
  /** RESET after the cancel, then a normal hello-serial upload. */
  recoverAfterCancel: recoverAfterCancel as Transcript,
  /** DTR/RTS pulses while the bootloader waits: none of them reset the board. */
  resetExperiments: resetExperiments as Transcript,
};

const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

/**
 * The ROM bootloader's banner as the real USB chunks it arrived in, from pressing RESET up to
 * (and including) the chunk carrying the first handshake "C", which is glued to the last line.
 */
export const recordedBannerChunks: Uint8Array[] = (() => {
  const t = transcripts.blinkManualReset;
  const firstTx = t.entries.findIndex((e) => e.dir === 'tx');
  const rx = t.entries
    .slice(0, firstTx)
    .filter((e) => e.dir === 'rx')
    .map((e) => fromHex(e.hex));
  const start = rx.findIndex((c) => text(c).includes('+---'));
  const end = rx.findIndex((c, i) => i > start && text(c).endsWith(' C'));
  if (start < 0 || end < 0) throw new Error('Banner not found in recorded transcript');
  const first = rx[start]!;
  const at = text(first).indexOf('\n\r +');
  return [first.slice(Math.max(0, at)), ...rx.slice(start + 1, end + 1)];
})();

/**
 * What the bootloader prints after it receives ENTER, before the program's own output
 * (includes a stray 0x19 seen on real hardware).
 */
export const recordedStartMessage: Uint8Array = (() => {
  const e = transcripts.helloSerial.entries;
  const enter = e.findIndex((x) => x.dir === 'tx' && x.hex === '0d');
  const first = e.slice(enter + 1).find((x) => x.dir === 'rx');
  if (!first) throw new Error('Start message not found in recorded transcript');
  const bytes = fromHex(first.hex);
  return bytes.slice(0, text(bytes).indexOf('Hello'));
})();
