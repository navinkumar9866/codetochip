// The VEGA protocol driven by the real ARIES v3 manifest, against the simulated bootloader.
import { afterEach, describe, expect, it } from 'vitest';
import { flashOptionsFor, getBoard } from '@codetochip/boards';
import {
  CancelledError,
  FlasherError,
  getProtocol,
  vegaXmodemProtocol,
  type FlashOptions,
  type FlashProgress,
} from '@codetochip/flasher';
import { createMockVegaBootloader, type MockVegaOptions } from '../src/index.ts';

const aries = getBoard('aries-v3')!;
const ram: FlashOptions = { ...flashOptionsFor(aries, 'ram'), handshakeTimeoutMs: 3000 };

const mocks: ReturnType<typeof createMockVegaBootloader>[] = [];
const mock = (o: MockVegaOptions = {}) => {
  const m = createMockVegaBootloader({ handshakeIntervalMs: 60, ...o });
  mocks.push(m);
  return m;
};
afterEach(() => mocks.splice(0).forEach((m) => m.dispose()));

const run = (
  m: ReturnType<typeof mock>,
  image: Uint8Array,
  opts: FlashOptions = ram,
  signal = new AbortController().signal,
) => {
  const progress: FlashProgress[] = [];
  const done = vegaXmodemProtocol.flash(m.transport, image, opts, (p) => progress.push(p), signal);
  return { done, progress };
};

describe('vegaXmodemProtocol with the ARIES v3 manifest', () => {
  it('is the protocol the manifest names', () => {
    expect(getProtocol(aries.flash.protocol)).toBe(vegaXmodemProtocol);
  });

  it('uploads without asking for RESET when the board is already waiting', async () => {
    const m = mock({ initialState: 'bootloader' });
    const { done, progress } = run(m, new Uint8Array(300).fill(1));
    await done;
    expect(progress.map((p) => p.stage)).toEqual([
      'waiting-for-bootloader',
      'handshake',
      'transferring',
      'transferring',
      'transferring',
      'done',
    ]);
    expect(progress.some((p) => p.message?.includes('RESET'))).toBe(false);
  });

  it('asks the user to press RESET (manifest prompt) when the board is running a program', async () => {
    const m = mock({ initialState: 'running' });
    const { done, progress } = run(m, new Uint8Array(10));
    const prompt = aries.flash.reset.method === 'manual' ? aries.flash.reset.prompt : '';
    for (let i = 0; i < 100 && !progress.some((p) => p.message === prompt); i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(progress.find((p) => p.message === 'Press the RESET button on the board.')).toBeTruthy();
    await m.pressReset();
    await done;
    expect(m.state.programStarted).toBe(true);
  });

  it('says what to do after a cancel when the board needs a reset', async () => {
    const m = mock();
    const controller = new AbortController();
    const { done } = run(m, new Uint8Array(128 * 40), ram, controller.signal);
    setTimeout(() => controller.abort(), 30);
    const error = await done.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CancelledError);
    expect((error as Error).message).toBe(
      'Upload cancelled. Press the RESET button on the board before uploading again.',
    );
  });

  it('refuses persistent mode until the procedure is confirmed', async () => {
    const m = mock();
    const { done } = run(m, new Uint8Array(10), flashOptionsFor(aries, 'persistent'));
    await expect(done).rejects.toThrow(/Saving to flash isn’t supported/);
    expect(m.state.attempts.size).toBe(0);
  });

  it('rejects images larger than the mode allows, before touching the board', async () => {
    const m = mock();
    const { done } = run(m, new Uint8Array(ram.maxImageBytes! + 1));
    await expect(done).rejects.toThrow(/at most 249 KB/);
    await expect(run(m, new Uint8Array(0)).done).rejects.toThrow(FlasherError);
    expect(m.state.attempts.size).toBe(0);
  });

  it('runs a DTR/RTS reset sequence for boards that use one', async () => {
    const m = mock({ initialState: 'bootloader' });
    const opts: FlashOptions = {
      target: 'ram',
      reset: {
        method: 'dtr-rts',
        sequence: [
          { dtr: false, delayMs: 5 },
          { dtr: true, rts: false, delayMs: 0 },
        ],
      },
    };
    await run(m, new Uint8Array(10), opts).done;
    expect(m.state.signals).toEqual([{ dtr: false }, { dtr: true, rts: false }]);
  });

  it('passes other errors through unchanged', async () => {
    const m = mock({ initialState: 'running' });
    const { done } = run(m, new Uint8Array(10), { ...ram, handshakeTimeoutMs: 100 });
    await expect(done).rejects.toThrow(/didn’t start receiving/);
  });

  it('keeps the plain cancel message for boards that recover by themselves', async () => {
    const m = mock();
    const controller = new AbortController();
    const opts: FlashOptions = { ...ram, afterCancel: 'ready' };
    const { done } = run(m, new Uint8Array(128 * 40), opts, controller.signal);
    setTimeout(() => controller.abort(), 30);
    await expect(done).rejects.toThrow(/^Upload cancelled\.$/);
  });

  it('falls back to generic reset advice after a cancel on boards reset by DTR/RTS', async () => {
    const m = mock();
    const controller = new AbortController();
    const opts: FlashOptions = {
      target: 'ram',
      reset: { method: 'dtr-rts', sequence: [{ dtr: true, delayMs: 0 }] },
      afterCancel: 'reset-required',
    };
    const { done } = run(m, new Uint8Array(128 * 40), opts, controller.signal);
    setTimeout(() => controller.abort(), 30);
    await expect(done).rejects.toThrow('Upload cancelled. Reset the board before uploading again.');
  });
});
