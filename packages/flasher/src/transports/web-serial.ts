import { DisconnectedError } from '../errors.ts';
import { ChunkQueue } from '../io/chunk-queue.ts';
import type { SerialSignals, Transport } from '../types.ts';

/** Desktop Chromium's Web Serial API. The OS driver handles the USB-serial chip. */
export class WebSerialTransport implements Transport {
  readonly kind = 'webserial';
  private queue = new ChunkQueue();
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private loop: Promise<void> | null = null;

  constructor(readonly port: SerialPort) {}

  get readable(): AsyncIterable<Uint8Array> {
    return this.queue.iterable();
  }

  async open({ baudRate }: { baudRate: number }): Promise<void> {
    await this.port.open({ baudRate, bufferSize: 4096 });
    this.queue = new ChunkQueue();
    const readable = this.port.readable;
    if (!readable) throw new DisconnectedError();
    const reader = readable.getReader();
    this.reader = reader;
    this.loop = (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) this.queue.push(value);
        }
        this.queue.end();
      } catch (e) {
        this.queue.end(new DisconnectedError(e));
      } finally {
        reader.releaseLock();
      }
    })();
  }

  async write(data: Uint8Array): Promise<void> {
    const writable = this.port.writable;
    if (!writable) throw new DisconnectedError();
    const writer = writable.getWriter();
    try {
      await writer.write(data);
    } catch (e) {
      throw new DisconnectedError(e);
    } finally {
      writer.releaseLock();
    }
  }

  async setSignals({ dtr, rts }: SerialSignals): Promise<void> {
    const signals: SerialOutputSignals = {};
    if (dtr !== undefined) signals.dataTerminalReady = dtr;
    if (rts !== undefined) signals.requestToSend = rts;
    await this.port.setSignals(signals);
  }

  async close(): Promise<void> {
    await this.reader?.cancel().catch(() => {});
    await this.loop;
    this.reader = null;
    await this.port.close().catch(() => {});
  }
}
