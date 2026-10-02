import {
  ChunkQueue,
  crc16Xmodem,
  DisconnectedError,
  type SerialSignals,
  type Transport,
} from '@codetochip/flasher';
import { recordedBannerChunks, recordedStartMessage } from './transcripts.ts';

export interface MockVegaOptions {
  /** 'bootloader' = already waiting for an upload; 'running' = a program runs until pressReset(). */
  initialState?: 'bootloader' | 'running';
  /** Real hardware: 190 ms. Tests use less. */
  handshakeIntervalMs?: number;
  /** Respond NAK to the first N attempts at these 0-based block indexes. */
  nakBlocks?: Record<number, number>;
  /** Never answer this block (host times out and retries). Applies to the first N attempts. */
  ignoreBlock?: { index: number; times: number };
  /** Send CAN CAN instead of acknowledging this block. */
  cancelAtBlock?: number;
  /** Disconnect when this block arrives. */
  unplugAtBlock?: number;
  /** Start with NAK (checksum mode) instead of C. Not seen on ARIES; covers the fallback. */
  checksumMode?: boolean;
  /** Send one stray CAN byte (line noise) before acknowledging this block. */
  strayCanAtBlock?: number;
  /** NAK the first EOT (host must resend it). */
  nakFirstEot?: boolean;
  /** Bytes the "program" prints after it starts. */
  programOutput?: string;
}

type State =
  'running' | 'banner' | 'waiting' | 'receiving' | 'awaiting-enter' | 'silent' | 'unplugged';

/**
 * Behavioural model of the VEGA ROM bootloader, built from Gate 0 recordings:
 * banner (real chunks) → lone C every interval → XMODEM-CRC receive → ACK EOT →
 * wait for ENTER → "Starting program ..." → program output. Goes silent after CAN CAN,
 * and DTR/RTS changes do nothing (both verified on hardware).
 */
export function createMockVegaBootloader(options: MockVegaOptions = {}) {
  const {
    initialState = 'bootloader',
    handshakeIntervalMs = 20,
    nakBlocks = {},
    ignoreBlock,
    cancelAtBlock,
    unplugAtBlock,
    checksumMode = false,
    nakFirstEot = false,
    strayCanAtBlock,
    programOutput = 'Hello from mock\r\n',
  } = options;

  let queue = new ChunkQueue();
  let timer: ReturnType<typeof setInterval> | null = null;
  const packetLen = checksumMode ? 132 : 133;

  const state = {
    current: initialState === 'bootloader' ? ('waiting' as State) : ('running' as State),
    received: [] as number[],
    blocksAccepted: 0,
    attempts: new Map<number, number>(),
    eotCount: 0,
    programStarted: false,
    hostCancelled: false,
    resets: 0,
    signals: [] as SerialSignals[],
    errors: [] as string[],
  };

  const send = (data: Uint8Array | string) =>
    queue.push(typeof data === 'string' ? new TextEncoder().encode(data) : data);

  const stopHandshake = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const startHandshake = () => {
    stopHandshake();
    timer = setInterval(
      () => send(new Uint8Array([checksumMode ? 0x15 : 0x43])),
      handshakeIntervalMs,
    );
  };

  const onPacket = (data: Uint8Array) => {
    if (state.current !== 'waiting' && state.current !== 'receiving') return;
    stopHandshake();
    state.current = 'receiving';
    const index = state.blocksAccepted;
    if (unplugAtBlock === index) return unplug();
    if (data.length !== packetLen)
      return state.errors.push(`block ${index}: length ${data.length}`);
    const expected = (index + 1) & 0xff;
    if (data[1] !== expected || data[2] !== 0xff - expected) {
      return state.errors.push(`block ${index}: numbered ${data[1]}/${data[2]}`);
    }
    const payload = data.subarray(3, 131);
    const crc = crc16Xmodem(payload);
    const ok = checksumMode
      ? data[131] === payload.reduce((s, b) => (s + b) & 0xff, 0)
      : data[131] === crc >> 8 && data[132] === (crc & 0xff);
    if (!ok) return send(new Uint8Array([0x15]));

    const attempt = (state.attempts.get(index) ?? 0) + 1;
    state.attempts.set(index, attempt);
    if (cancelAtBlock === index) {
      state.current = 'silent';
      return send(new Uint8Array([0x18, 0x18]));
    }
    if (ignoreBlock?.index === index && attempt <= ignoreBlock.times) return;
    if (attempt <= (nakBlocks[index] ?? 0)) return send(new Uint8Array([0x15]));
    state.received.push(...payload);
    state.blocksAccepted++;
    if (strayCanAtBlock === index) send(new Uint8Array([0x18, 0x41]));
    send(new Uint8Array([0x06]));
  };

  const transport: Transport = {
    kind: 'mock',
    get readable() {
      return queue.iterable();
    },
    open: async () => {},
    close: async () => {
      stopHandshake();
      queue.end();
    },
    setSignals: async (s) => {
      state.signals.push(s); // No effect: ARIES DTR/RTS aren't wired to reset (Gate 0).
    },
    write: async (data) => {
      if (state.current === 'unplugged') throw new DisconnectedError();
      const first = data[0];
      if (first === 0x01) onPacket(data);
      else if (first === 0x18) {
        state.hostCancelled = true;
        stopHandshake();
        state.current = 'silent'; // Gate 0: silent until RESET.
      } else if (first === 0x04 && state.current === 'receiving') {
        state.eotCount++;
        if (nakFirstEot && state.eotCount === 1) return send(new Uint8Array([0x15]));
        state.current = 'awaiting-enter';
        send(new Uint8Array([0x06]));
      } else if (first === 0x0d && state.current === 'awaiting-enter') {
        state.current = 'running';
        state.programStarted = true;
        send(recordedStartMessage);
        send(programOutput);
      }
    },
  };

  /** The user presses RESET: banner in the real chunks, then the handshake C every interval. */
  async function pressReset() {
    if (state.current === 'unplugged') return;
    stopHandshake();
    state.resets++;
    state.current = 'banner';
    for (const chunk of recordedBannerChunks) {
      send(chunk);
      await new Promise((r) => setTimeout(r, 2));
    }
    state.current = 'waiting';
    startHandshake();
  }

  function unplug() {
    stopHandshake();
    state.current = 'unplugged';
    queue.end(new DisconnectedError());
  }

  if (state.current === 'waiting') startHandshake();

  return {
    transport,
    state,
    pressReset,
    unplug,
    /** Push raw bytes as if the device sent them (e.g. stale data from earlier). */
    inject: send,
    /** Stop timers (call in afterEach). */
    dispose() {
      stopHandshake();
      queue.end();
      queue = new ChunkQueue();
    },
  };
}
