import { DisconnectedError } from '../../src/errors.ts';
import { ChunkQueue } from '../../src/io/chunk-queue.ts';
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

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
