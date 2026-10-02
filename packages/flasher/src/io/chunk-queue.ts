type Waiter = {
  resolve: (r: IteratorResult<Uint8Array, undefined>) => void;
  reject: (e: unknown) => void;
};

const DONE: IteratorResult<Uint8Array, undefined> = { done: true, value: undefined };

/**
 * Received chunks from a transport's background read loop. One consumer reads at a time
 * (e.g. the serial monitor, then a protocol during a flash). A consumer that stops
 * iterating detaches without closing the queue, so the next one picks up where it left off.
 */
export class ChunkQueue {
  private chunks: Uint8Array[] = [];
  private buffered = 0;
  /** Bytes dropped because nobody was reading and the buffer was full. */
  dropped = 0;

  /** With no reader attached, keep at most this many bytes (oldest are dropped first). */
  constructor(private readonly maxBufferedBytes = 1 << 20) {}

  private waiter: Waiter | null = null;
  private closed = false;
  private failure: unknown = null;

  push(chunk: Uint8Array): void {
    if (this.closed || chunk.length === 0) return;
    const w = this.waiter;
    if (w) {
      this.waiter = null;
      w.resolve({ done: false, value: chunk });
    } else {
      this.chunks.push(chunk);
      this.buffered += chunk.length;
      while (this.buffered > this.maxBufferedBytes && this.chunks.length > 1) {
        const old = this.chunks.shift()!;
        this.buffered -= old.length;
        this.dropped += old.length;
      }
    }
  }

  /** No more data. With an error, consumers' pending and future reads reject with it. */
  end(error?: unknown): void {
    if (this.closed) return;
    this.closed = true;
    this.failure = error ?? null;
    const w = this.waiter;
    this.waiter = null;
    if (w) {
      if (error) w.reject(error);
      else w.resolve(DONE);
    }
  }

  iterable(): AsyncIterable<Uint8Array> {
    return {
      [Symbol.asyncIterator]: (): AsyncIterator<Uint8Array, undefined> => {
        let detached = false;
        return {
          next: () => {
            if (detached) return Promise.resolve(DONE);
            const chunk = this.chunks.shift();
            if (chunk) {
              this.buffered -= chunk.length;
              return Promise.resolve({ done: false, value: chunk });
            }
            if (this.closed) {
              return this.failure ? Promise.reject(this.failure) : Promise.resolve(DONE);
            }
            return new Promise((resolve, reject) => {
              this.waiter = { resolve, reject };
            });
          },
          return: () => {
            detached = true;
            const w = this.waiter;
            this.waiter = null;
            w?.resolve(DONE);
            return Promise.resolve(DONE);
          },
        };
      },
    };
  }
}
