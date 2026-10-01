import { DisconnectedError } from '../errors.ts';

/**
 * Byte-at-a-time reads with timeouts over a transport's chunk stream.
 * Call `close()` when done so the transport's next consumer can read.
 */
export class ByteStream {
  private readonly iterator: AsyncIterator<Uint8Array>;
  private chunk: Uint8Array = new Uint8Array();
  private offset = 0;
  private pending: Promise<IteratorResult<Uint8Array>> | null = null;
  private ended = false;

  constructor(source: AsyncIterable<Uint8Array>) {
    this.iterator = source[Symbol.asyncIterator]();
  }

  /** Next byte, or null if none arrives within `timeoutMs`. */
  async readByte(timeoutMs: number, signal?: AbortSignal): Promise<number | null> {
    signal?.throwIfAborted();
    if (this.offset < this.chunk.length) return this.chunk[this.offset++] ?? null;
    if (this.ended) throw new DisconnectedError();

    // Keep one read in flight across timeouts, so no data is lost when a wait times out.
    this.pending ??= this.iterator.next();
    const result = await raceTimeout(this.pending, timeoutMs, signal);
    if (result === TIMEOUT) return null;
    this.pending = null;
    if (result.done) {
      this.ended = true;
      throw new DisconnectedError();
    }
    this.chunk = result.value;
    this.offset = 0;
    return this.readByte(timeoutMs, signal);
  }

  /** Discards bytes already received but not yet read. */
  discardBuffered(): void {
    this.offset = this.chunk.length;
  }

  async close(): Promise<void> {
    await this.iterator.return?.();
  }
}

const TIMEOUT = Symbol('timeout');

function raceTimeout<T>(
  promise: Promise<T>,
  ms: number,
  signal?: AbortSignal,
): Promise<T | typeof TIMEOUT> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(() => resolve(TIMEOUT)), Math.max(0, ms));
    const onAbort = () => finish(() => reject(signal?.reason));
    signal?.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => finish(() => resolve(v)),
      (e: unknown) => finish(() => reject(e)),
    );
    function finish(settle: () => void) {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      settle();
    }
  });
}
