import { ChunkQueue, fromHex, toHex, type Transcript, type Transport } from '@codetochip/flasher';

/**
 * Replays a recorded session exactly: the device sends what the real board sent, in the
 * real USB chunks, and each host write must match the next recorded write. Use it to prove
 * our protocol behaves byte-for-byte like it did on hardware.
 *
 * Call `start()` once the code under test is listening. Recorded gaps are kept as recorded,
 * capped at `maxGapMs`. The cap must stay above the protocol's "silence" window (50 ms)
 * so a lone handshake C still looks lone.
 */
export function createReplayDevice(transcript: Transcript, { maxGapMs = 100 } = {}) {
  const queue = new ChunkQueue();
  const entries = transcript.entries.filter((e) => e.dir === 'rx' || e.dir === 'tx');
  let cursor = 0;
  let generation = 0;
  const mismatches: string[] = [];
  const written: string[] = [];
  /** Recorded device output skipped because the host answered sooner than in the recording. */
  const skipped: string[] = [];

  /** Sends recorded rx entries from the cursor until the next expected tx. */
  const playUntilNextTx = async () => {
    const mine = ++generation;
    let prevT: number | null = null;
    while (cursor < entries.length && entries[cursor]!.dir === 'rx') {
      const e = entries[cursor]!;
      if (prevT !== null) await sleep(Math.min(maxGapMs, e.t - prevT));
      if (mine !== generation) return; // the host wrote meanwhile; a newer playback owns the cursor
      cursor++;
      prevT = e.t;
      queue.push(fromHex(e.hex));
    }
  };

  const transport: Transport = {
    kind: 'mock',
    readable: queue.iterable(),
    open: async () => {},
    close: async () => queue.end(),
    setSignals: async () => {},
    async write(data) {
      const hex = toHex(data);
      written.push(hex);
      // A real device stops repeating its handshake once data arrives, so if the host answers
      // earlier than it did in the recording, skip the device output still pending before it.
      while (entries[cursor]?.dir === 'rx') skipped.push(entries[cursor++]!.hex);
      generation++;
      const expected = entries[cursor];
      if (expected?.dir !== 'tx') {
        mismatches.push(`unexpected write ${hex.slice(0, 16)}… (recording had no write here)`);
        return;
      }
      if (expected.hex !== hex) {
        mismatches.push(
          `write #${written.length}: expected ${expected.hex.slice(0, 16)}…, got ${hex.slice(0, 16)}…`,
        );
      }
      cursor++;
      void playUntilNextTx();
    },
  };

  return {
    transport,
    /** Host writes that differed from the recording (empty = byte-identical). */
    mismatches,
    written,
    skipped,
    /** Recorded host writes, for comparing counts. */
    expectedWrites: entries.filter((e) => e.dir === 'tx').map((e) => e.hex),
    start: () => playUntilNextTx(),
  };
}

/** The image a recorded upload sent, reassembled from its XMODEM packets (0x1A padding kept). */
export function imageFromTranscript(transcript: Transcript): Uint8Array {
  const blocks = transcript.entries
    .filter((e) => e.dir === 'tx' && e.hex.startsWith('01') && e.hex.length === 133 * 2)
    .map((e) => fromHex(e.hex).subarray(3, 131));
  const out = new Uint8Array(blocks.length * 128);
  blocks.forEach((b, i) => out.set(b, i * 128));
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
