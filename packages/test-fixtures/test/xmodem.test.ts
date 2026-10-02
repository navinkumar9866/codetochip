// XMODEM sender against the simulated VEGA bootloader (real banner chunks, real behaviour).
import { afterEach, describe, expect, it } from 'vitest';
import {
  CancelledError,
  DisconnectedError,
  ProtocolError,
  xmodemSend,
  type XmodemOptions,
} from '@codetochip/flasher';
import { createMockVegaBootloader, type MockVegaOptions } from '../src/index.ts';

// The mock's handshake interval (40 ms) must exceed quietMs, like the real 190 ms vs 50 ms.
const fast: XmodemOptions = {
  ackTimeoutMs: 60,
  handshakeTimeoutMs: 1500,
  quietMs: 15,
  afterEot: new Uint8Array([0x0d]),
};
const mocks: ReturnType<typeof createMockVegaBootloader>[] = [];
const mock = (o: MockVegaOptions = {}) => {
  const m = createMockVegaBootloader({ handshakeIntervalMs: 40, ...o });
  mocks.push(m);
  return m;
};
afterEach(() => mocks.splice(0).forEach((m) => m.dispose()));

const image = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) & 0xff);
const padded = (img: Uint8Array) => {
  const out = new Uint8Array(Math.ceil(img.length / 128) * 128).fill(0x1a);
  out.set(img);
  return [...out];
};

describe('xmodemSend vs simulated VEGA bootloader', () => {
  it('ignores the C’s in the real banner, starts on the lone C, sends all blocks, EOT and ENTER', async () => {
    const m = mock({ initialState: 'running' });
    const img = image(300);
    const sending = xmodemSend(m.transport, img, fast);
    await m.pressReset();
    await sending;
    expect(m.state.errors).toEqual([]);
    expect(m.state.received).toEqual(padded(img));
    expect(m.state.programStarted).toBe(true);
  });

  it('still starts when timers are throttled (background tab): uses the C rhythm, not silence', async () => {
    // A 2 s "silence" window never completes between C's that arrive every 40 ms, which is
    // what a throttled setTimeout looked like at Gate 0. The repeat rule must take over.
    const m = mock({ initialState: 'running' });
    const sending = xmodemSend(m.transport, image(10), {
      ...fast,
      quietMs: 2000,
      repeatGapMs: 30,
      handshakeTimeoutMs: 1500,
    });
    await m.pressReset();
    await sending;
    expect(m.state.programStarted).toBe(true);
  });

  it('starts straight away when the board is already waiting', async () => {
    const m = mock({ initialState: 'bootloader' });
    let stillWaiting = false;
    await xmodemSend(m.transport, image(10), {
      ...fast,
      stillWaitingAfterMs: 300,
      onStillWaiting: () => (stillWaiting = true),
    });
    expect(stillWaiting).toBe(false);
    expect(m.state.programStarted).toBe(true);
  });

  it('reports "still waiting" once, then continues when the board is reset', async () => {
    const m = mock({ initialState: 'running' });
    let calls = 0;
    const sending = xmodemSend(m.transport, image(10), {
      ...fast,
      stillWaitingAfterMs: 50,
      onStillWaiting: () => {
        calls++;
        void m.pressReset();
      },
    });
    await sending;
    expect(calls).toBe(1);
    expect(m.state.programStarted).toBe(true);
  });

  it('ignores a stale C left in the buffer from earlier', async () => {
    const m = mock({ initialState: 'running' });
    m.inject('C');
    await expect(
      xmodemSend(m.transport, image(10), { ...fast, handshakeTimeoutMs: 200 }),
    ).rejects.toThrow(/RESET/);
    expect(m.state.blocksAccepted).toBe(0);
  });

  it('retries NAKed blocks and blocks that get no answer', async () => {
    const m = mock({ nakBlocks: { 1: 2 }, ignoreBlock: { index: 2, times: 1 } });
    await xmodemSend(m.transport, image(500), fast);
    expect(m.state.attempts.get(1)).toBe(3);
    expect(m.state.attempts.get(2)).toBe(2);
    expect(m.state.received).toEqual(padded(image(500)));
  });

  it('falls back to checksum mode when the bootloader asks with NAK', async () => {
    const m = mock({ checksumMode: true });
    let mode = '';
    await xmodemSend(m.transport, image(200), { ...fast, onHandshake: (x) => (mode = x) });
    expect(mode).toBe('checksum');
    expect(m.state.errors).toEqual([]);
    expect(m.state.received).toEqual(padded(image(200)));
  });

  it('wraps block numbers after 255', async () => {
    const m = mock();
    await xmodemSend(m.transport, image(300 * 128), fast);
    expect(m.state.errors).toEqual([]);
    expect(m.state.blocksAccepted).toBe(300);
  });

  it('resends EOT when it is NAKed', async () => {
    const m = mock({ nakFirstEot: true });
    await xmodemSend(m.transport, image(10), fast);
    expect(m.state.eotCount).toBe(2);
    expect(m.state.programStarted).toBe(true);
  });

  it('gives up after maxRetries and cancels with CAN CAN', async () => {
    const m = mock({ nakBlocks: { 0: 99 } });
    await expect(xmodemSend(m.transport, image(10), { ...fast, maxRetries: 3 })).rejects.toThrow(
      ProtocolError,
    );
    expect(m.state.attempts.get(0)).toBe(4);
    expect(m.state.hostCancelled).toBe(true);
  });

  it('times out with advice when the bootloader never asks for data', async () => {
    const m = mock({ initialState: 'running' });
    await expect(
      xmodemSend(m.transport, image(10), { ...fast, handshakeTimeoutMs: 150 }),
    ).rejects.toThrow(/Press RESET/);
  });

  it('stops when the bootloader cancels', async () => {
    const m = mock({ cancelAtBlock: 1 });
    await expect(xmodemSend(m.transport, image(400), fast)).rejects.toThrow(/cancelled/i);
  });

  it('cancels on abort without sending another block', async () => {
    const m = mock();
    const controller = new AbortController();
    const sending = xmodemSend(
      m.transport,
      image(128 * 50),
      { ...fast, onProgress: (sent) => sent >= 128 * 5 && controller.abort() },
      controller.signal,
    );
    await expect(sending).rejects.toBeInstanceOf(CancelledError);
    expect(m.state.hostCancelled).toBe(true);
    expect(m.state.attempts.size).toBe(5);
  });

  it('reports an unplugged board', async () => {
    const m = mock({ unplugAtBlock: 2 });
    await expect(xmodemSend(m.transport, image(1000), fast)).rejects.toBeInstanceOf(
      DisconnectedError,
    );
  });

  it('treats a single stray CAN as noise (only CAN CAN aborts)', async () => {
    const m = mock({ strayCanAtBlock: 1 });
    await xmodemSend(m.transport, image(400), fast);
    expect(m.state.received).toEqual(padded(image(400)));
  });

  it('sends nothing after EOT unless asked to', async () => {
    const m = mock();
    const noEnter: XmodemOptions = { ...fast };
    delete noEnter.afterEot;
    await xmodemSend(m.transport, image(10), noEnter);
    expect(m.state.eotCount).toBe(1);
    expect(m.state.programStarted).toBe(false);
  });

  it('still reports the cancel if sending CAN CAN fails (board just vanished)', async () => {
    const m = mock();
    const write = m.transport.write;
    m.transport.write = async (data) => {
      if (data[0] === 0x18) throw new DisconnectedError();
      return write(data);
    };
    const controller = new AbortController();
    const sending = xmodemSend(
      m.transport,
      image(128 * 20),
      { ...fast, onProgress: (sent) => sent >= 128 * 2 && controller.abort() },
      controller.signal,
    );
    await expect(sending).rejects.toBeInstanceOf(CancelledError);
  });
});
