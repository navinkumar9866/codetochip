import { CancelledError, ProtocolError } from '../errors.ts';
import { ByteStream } from '../io/byte-stream.ts';
import type { Transport } from '../types.ts';
import { crc16Xmodem } from './crc16-xmodem.ts';

// XMODEM sender (128-byte blocks, CRC-16 with checksum fallback). docs/PLAN.md Appendix A.
export const SOH = 0x01;
export const EOT = 0x04;
export const ACK = 0x06;
export const NAK = 0x15;
export const CAN = 0x18;
export const SUB = 0x1a;
export const C = 0x43;
const BLOCK = 128;

export type XmodemMode = 'crc' | 'checksum';

export interface XmodemOptions {
  /** How long to wait for the receiver to ask for data. Users may need to press RESET first. */
  handshakeTimeoutMs?: number;
  /**
   * A handshake byte (C or NAK) only counts if nothing else arrives for this long.
   * Boot banners contain capital C's ("C-DAC", "CPU"); the real request is a lone C.
   */
  quietMs?: number;
  ackTimeoutMs?: number;
  /** Retries per block (and for EOT) before giving up. */
  maxRetries?: number;
  /** Sent after EOT is acknowledged (VEGA needs "\r" to start the program). */
  afterEot?: Uint8Array;
  onHandshake?: (mode: XmodemMode) => void;
  onProgress?: (bytesSent: number, totalBytes: number) => void;
}

export async function xmodemSend(
  transport: Transport,
  image: Uint8Array,
  options: XmodemOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  const {
    handshakeTimeoutMs = 60_000,
    quietMs = 50,
    ackTimeoutMs = 3_000,
    maxRetries = 10,
    afterEot,
    onHandshake,
    onProgress,
  } = options;
  const stream = new ByteStream(transport.readable);

  const cancel = async () => {
    await transport.write(new Uint8Array([CAN, CAN])).catch(() => {});
  };

  /** Reads until ACK/NAK, ignoring noise (e.g. repeated C's). null on timeout. */
  const awaitReply = async (): Promise<typeof ACK | typeof NAK | null> => {
    const deadline = Date.now() + ackTimeoutMs;
    for (;;) {
      const b = await stream.readByte(deadline - Date.now(), signal);
      if (b === null) return null;
      if (b === ACK || b === NAK) return b;
      if (b === CAN && (await stream.readByte(1_000, signal)) === CAN) {
        throw new ProtocolError('The board cancelled the upload. Reset the board and try again.');
      }
    }
  };

  const sendWithRetries = async (packet: Uint8Array, what: string) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      await transport.write(packet);
      if ((await awaitReply()) === ACK) return;
    }
    await cancel();
    throw new ProtocolError(
      `The board stopped accepting data (${what}). Check the USB cable, reset the board and try again.`,
    );
  };

  try {
    const mode = await waitForHandshake(stream, handshakeTimeoutMs, quietMs, signal);
    onHandshake?.(mode);

    const blocks = Math.max(1, Math.ceil(image.length / BLOCK));
    for (let i = 0; i < blocks; i++) {
      const data = image.subarray(i * BLOCK, (i + 1) * BLOCK);
      await sendWithRetries(buildPacket(i + 1, data, mode), `block ${i + 1} of ${blocks}`);
      onProgress?.(Math.min((i + 1) * BLOCK, image.length), image.length);
    }
    await sendWithRetries(new Uint8Array([EOT]), 'end of transfer');
    if (afterEot) await transport.write(afterEot);
  } catch (e) {
    if (signal?.aborted) {
      await cancel();
      throw new CancelledError();
    }
    throw e;
  } finally {
    await stream.close();
  }
}

async function waitForHandshake(
  stream: ByteStream,
  timeoutMs: number,
  quietMs: number,
  signal?: AbortSignal,
): Promise<XmodemMode> {
  const deadline = Date.now() + timeoutMs;
  let next: number | null = null;
  for (;;) {
    const b = next ?? (await stream.readByte(deadline - Date.now(), signal));
    next = null;
    if (b === null) {
      throw new ProtocolError(
        'The board didn’t start receiving. Press RESET on the board, then try uploading again.',
      );
    }
    if (b === C || b === NAK) {
      next = await stream.readByte(quietMs, signal);
      if (next === null) return b === C ? 'crc' : 'checksum';
    }
  }
}

export function buildPacket(blockNumber: number, data: Uint8Array, mode: XmodemMode): Uint8Array {
  const n = blockNumber & 0xff;
  const packet = new Uint8Array(3 + BLOCK + (mode === 'crc' ? 2 : 1));
  packet[0] = SOH;
  packet[1] = n;
  packet[2] = 0xff - n;
  packet.fill(SUB, 3, 3 + BLOCK);
  packet.set(data.subarray(0, BLOCK), 3);
  const payload = packet.subarray(3, 3 + BLOCK);
  if (mode === 'crc') {
    const crc = crc16Xmodem(payload);
    packet[3 + BLOCK] = crc >> 8;
    packet[4 + BLOCK] = crc & 0xff;
  } else {
    packet[3 + BLOCK] = payload.reduce((sum, b) => (sum + b) & 0xff, 0);
  }
  return packet;
}
