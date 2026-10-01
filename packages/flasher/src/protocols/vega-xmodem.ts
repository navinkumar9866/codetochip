import type { Protocol } from '../types.ts';
import { xmodemSend } from './xmodem.ts';

/** VEGA ROM bootloader quirk: after EOT is ACKed it waits for ENTER before jumping to the program. */
const ENTER = new Uint8Array([0x0d]);

/**
 * VEGA processors' ROM bootloader (C-DAC ARIES boards): XMODEM-CRC, 128-byte blocks,
 * started by a lone "C" after the boot banner. Phase 0 spike: RAM uploads only.
 * Reset strategies and the persistent-flash helper arrive in Phase 1.3.
 */
export const vegaXmodemProtocol: Protocol = {
  id: 'vega-xmodem',
  async flash(transport, image, opts, onProgress, signal) {
    onProgress({
      stage: 'waiting-for-bootloader',
      message: 'Press RESET on the board to start the upload.',
    });
    await xmodemSend(
      transport,
      image,
      {
        ...(opts.handshakeTimeoutMs !== undefined && {
          handshakeTimeoutMs: opts.handshakeTimeoutMs,
        }),
        afterEot: ENTER,
        onHandshake: () => onProgress({ stage: 'handshake' }),
        onProgress: (bytesSent, totalBytes) =>
          onProgress({ stage: 'transferring', bytesSent, totalBytes }),
      },
      signal,
    );
    onProgress({ stage: 'done', message: 'Upload complete. Your program is running.' });
  },
};
