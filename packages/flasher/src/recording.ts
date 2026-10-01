import type { SerialSignals, Transport } from './types.ts';

/** One recorded event. Transcripts are replayed by the mock device in tests (Phase 1.2). */
export interface TranscriptEntry {
  /** rx = device to host, tx = host to device, signal = DTR/RTS change, note = human marker. */
  dir: 'rx' | 'tx' | 'signal' | 'note';
  /** Milliseconds since recording started. */
  t: number;
  /** Bytes as lowercase hex, e.g. "0106ff". Empty for 'signal' and 'note'. */
  hex: string;
  signals?: SerialSignals;
  text?: string;
}

export interface Transcript {
  board: string;
  transport: string;
  description: string;
  recordedAt: string;
  entries: TranscriptEntry[];
}

export const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const fromHex = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));

/**
 * Wraps a transport so every byte and signal change through it is recorded.
 * Records only while `recording` is true; `entries` is cleared by `start()`.
 */
export function createRecorder(inner: Transport, now: () => number = () => performance.now()) {
  let t0 = now();
  let recording = false;
  const entries: TranscriptEntry[] = [];
  const log = (e: Omit<TranscriptEntry, 't'>) => {
    if (recording) entries.push({ ...e, t: Math.round((now() - t0) * 10) / 10 });
  };

  const transport: Transport = {
    get kind() {
      return inner.kind;
    },
    open: (opts) => inner.open(opts),
    close: () => inner.close(),
    async write(data) {
      log({ dir: 'tx', hex: toHex(data) });
      await inner.write(data);
    },
    async setSignals(signals) {
      log({ dir: 'signal', hex: '', signals });
      await inner.setSignals(signals);
    },
    get readable(): AsyncIterable<Uint8Array> {
      const source = inner.readable;
      return {
        [Symbol.asyncIterator]() {
          const it = source[Symbol.asyncIterator]();
          return {
            async next() {
              const r = await it.next();
              if (!r.done) log({ dir: 'rx', hex: toHex(r.value) });
              return r;
            },
            async return() {
              await it.return?.();
              return { done: true, value: undefined };
            },
          };
        },
      };
    },
  };

  return {
    transport,
    entries,
    get recording() {
      return recording;
    },
    start() {
      entries.length = 0;
      t0 = now();
      recording = true;
    },
    stop() {
      recording = false;
    },
    note(text: string) {
      log({ dir: 'note', hex: '', text });
    },
    toTranscript(meta: Omit<Transcript, 'entries' | 'recordedAt'>): Transcript {
      return { ...meta, recordedAt: new Date().toISOString(), entries: [...entries] };
    },
  };
}
