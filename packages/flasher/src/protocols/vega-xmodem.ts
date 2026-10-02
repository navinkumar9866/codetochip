import { CancelledError, FlasherError } from '../errors.ts';
import { applyReset } from '../reset.ts';
import type { Protocol } from '../types.ts';
import { xmodemSend } from './xmodem.ts';

/** VEGA ROM bootloader quirk: after EOT is ACKed it waits for ENTER before jumping to the program. */
const ENTER = new Uint8Array([0x0d]);

/**
 * VEGA processors' ROM bootloader (C-DAC ARIES boards), as observed at Hardware Gate 0:
 * banner, then a lone "C" every 190 ms; XMODEM-CRC with 128-byte blocks; ENTER after EOT.
 * Persistent (flash) uploads are not supported until the procedure is confirmed
 * (docs/PLAN.md open question 2).
 */
export const vegaXmodemProtocol: Protocol = {
  id: 'vega-xmodem',
  async flash(transport, image, opts, onProgress, signal) {
    if (opts.target === 'persistent') {
      throw new FlasherError(
        'Saving to flash isn’t supported for this board yet. Choose “Run from RAM” instead.',
      );
    }
    if (image.length === 0) {
      throw new FlasherError('This program is empty. Compile it again, then upload.');
    }
    if (opts.maxImageBytes && image.length > opts.maxImageBytes) {
      throw new FlasherError(
        `This program is ${kb(image.length)} but the board accepts at most ${kb(opts.maxImageBytes)} ` +
          'in this mode. Remove unused code or libraries and try again.',
      );
    }

    onProgress({ stage: 'waiting-for-bootloader', message: 'Looking for the board…' });
    const manualPrompt = opts.reset.method === 'manual' ? opts.reset.prompt : '';
    await applyReset(transport, opts.reset, signal);
    try {
      await xmodemSend(
        transport,
        image,
        {
          ...(opts.handshakeTimeoutMs !== undefined && {
            handshakeTimeoutMs: opts.handshakeTimeoutMs,
          }),
          afterEot: ENTER,
          ...(opts.reset.method === 'manual' && {
            onStillWaiting: () =>
              onProgress({ stage: 'waiting-for-bootloader', message: manualPrompt }),
          }),
          onHandshake: () => onProgress({ stage: 'handshake' }),
          onProgress: (bytesSent, totalBytes) =>
            onProgress({ stage: 'transferring', bytesSent, totalBytes }),
        },
        signal,
      );
    } catch (e) {
      if (e instanceof CancelledError && opts.afterCancel === 'reset-required') {
        throw new CancelledError(
          `Upload cancelled. ${resetPrompt(opts.reset)} before uploading again.`,
        );
      }
      throw e;
    }
    onProgress({ stage: 'done', message: 'Upload complete. Your program is running.' });
  },
};

const resetPrompt = (reset: { method: string; prompt?: string }) =>
  (reset.prompt ?? 'Reset the board').replace(/\.$/, '');

const kb = (bytes: number) => `${Math.ceil(bytes / 1024)} KB`;
