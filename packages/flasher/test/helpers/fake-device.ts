import { DisconnectedError } from '../../src/errors.ts';
import { ChunkQueue } from '../../src/io/chunk-queue.ts';
import { crc16Xmodem } from '../../src/protocols/crc16-xmodem.ts';
import type { Transport } from '../../src/types.ts';

export interface FakeDevice {
  transport: Transport;
  /** Bytes or text the device sends to the host. */
  send(data: Uint8Array | string): void;
  unplug(): void;
  writes: Uint8Array[];
}

/** A transport whose far end is scripted by `onWrite`. */
export function createFakeDevice(onWrite: (data: Uint8Array, dev: FakeDevice) => void): FakeDevice {
  const queue = new ChunkQueue();
  const dev: FakeDevice = {
    writes: [],
    send: (data) => queue.push(typeof data === 'string' ? new TextEncoder().encode(data) : data),
    // Real transports turn a lost device into DisconnectedError; so does this one.
    unplug: () => queue.end(new DisconnectedError()),
    transport: {
      kind: 'mock',
      readable: queue.iterable(),
      open: async () => {},
      close: async () => queue.end(),
      setSignals: async () => {},
      write: async (data) => {
        dev.writes.push(data.slice());
        onWrite(data, dev);
      },
    },
  };
  return dev;
}

export interface BootloaderOptions {
  /** Respond NAK to the first N attempts at these block indexes (0-based). */
  nakBlocks?: Record<number, number>;
  /** NAK the first EOT. */
  nakFirstEot?: boolean;
  /** Use checksum mode (the device starts with NAK instead of C). */
  checksum?: boolean;
  /** Send CAN CAN instead of acknowledging this block index. */
  cancelAtBlock?: number;
}

/** Simulates the VEGA ROM bootloader's receive side. */
export function createVegaBootloader(opts: BootloaderOptions = {}) {
  const state = {
    received: [] as number[],
    blocksAccepted: 0,
    attempts: new Map<number, number>(),
    handshakeSent: false,
    packetBeforeHandshake: false,
    eotCount: 0,
    jumped: false,
    cancelledByHost: false,
    errors: [] as string[],
  };
  const pktLen = opts.checksum ? 132 : 133;

  const device = createFakeDevice((data, dev) => {
    const first = data[0];
    if (first === 0x01) {
      if (!state.handshakeSent) state.packetBeforeHandshake = true;
      if (data.length !== pktLen) return state.errors.push(`packet length ${data.length}`);
      const index = state.blocksAccepted;
      const expected = (index + 1) & 0xff;
      if (data[1] !== expected || data[2] !== 0xff - expected) {
        return state.errors.push(`block ${index}: got number ${data[1]}/${data[2]}`);
      }
      const payload = data.subarray(3, 131);
      const ok = opts.checksum
        ? data[131] === payload.reduce((s, b) => (s + b) & 0xff, 0)
        : data[131] === crc16Xmodem(payload) >> 8 && data[132] === (crc16Xmodem(payload) & 0xff);
      if (!ok) return state.errors.push(`block ${index}: bad check`);

      const attempt = (state.attempts.get(index) ?? 0) + 1;
      state.attempts.set(index, attempt);
      if (opts.cancelAtBlock === index) return dev.send(new Uint8Array([0x18, 0x18]));
      if (attempt <= (opts.nakBlocks?.[index] ?? 0)) return dev.send(new Uint8Array([0x15]));
      state.received.push(...payload);
      state.blocksAccepted++;
      dev.send(new Uint8Array([0x06]));
    } else if (first === 0x04) {
      state.eotCount++;
      dev.send(new Uint8Array([opts.nakFirstEot && state.eotCount === 1 ? 0x15 : 0x06]));
    } else if (first === 0x0d && state.eotCount > 0) {
      state.jumped = true;
    } else if (first === 0x18) {
      state.cancelledByHost = true;
    }
  });

  return {
    device,
    state,
    /** Banner text full of capital C's, then (after a pause) the lone handshake byte. */
    async boot(
      bannerChunks = ['\r\nC-DAC VEGA ', 'Processor\r\nCPU: ET1031\r\n', 'C', '-DAC ready\r\n'],
    ) {
      for (const chunk of bannerChunks) {
        device.send(chunk);
        await sleep(5);
      }
      await sleep(100);
      state.handshakeSent = true;
      device.send(new Uint8Array([opts.checksum ? 0x15 : 0x43]));
    },
  };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
