import { describe, expect, it } from 'vitest';
import { CancelledError, DisconnectedError, ProtocolError } from '../src/errors.ts';
import { xmodemSend, type XmodemOptions } from '../src/protocols/xmodem.ts';
import { createVegaBootloader, sleep } from './helpers/fake-device.ts';

const CR = new Uint8Array([0x0d]);
const fast: XmodemOptions = {
  ackTimeoutMs: 50,
  handshakeTimeoutMs: 1000,
  quietMs: 30,
  afterEot: CR,
};

const image = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) & 0xff);
const padded = (img: Uint8Array) => {
  const out = new Uint8Array(Math.ceil(img.length / 128) * 128).fill(0x1a);
  out.set(img);
  return [...out];
};

describe('xmodemSend', () => {
  it('waits for a lone C (not the C in the banner), sends every block, then EOT and CR', async () => {
    const boot = createVegaBootloader();
    const img = image(300);
    const progress: number[] = [];
    const sending = xmodemSend(boot.device.transport, img, {
      ...fast,
      onProgress: (sent) => progress.push(sent),
    });
    await boot.boot();
    await sending;

    expect(boot.state.packetBeforeHandshake).toBe(false);
    expect(boot.state.errors).toEqual([]);
    expect(boot.state.received).toEqual(padded(img));
    expect(boot.state.jumped).toBe(true);
    expect(progress.at(-1)).toBe(300);
  });

  it('finds the handshake C when it arrives in the same chunk as the banner (seen on real ARIES)', async () => {
    const boot = createVegaBootloader();
    const sending = xmodemSend(boot.device.transport, image(200), fast);
    // Exact chunks from aries-v3-upload-ram-blink-manual-reset.json: "C-DAC" in the banner,
    // then the first handshake C glued to the end of the last banner line.
    boot.device.send(' | VEGA Series of Microprocessors Developed By C-DAC, INDIA |\n\r');
    await sleep(5);
    boot.state.handshakeSent = true;
    boot.device.send(
      '7FF] [250 KB]\n\r \n\r Please send file using XMODEM and then press ENTER key.\n\r C',
    );
    await sending;
    expect(boot.state.packetBeforeHandshake).toBe(false);
    expect(boot.state.received).toEqual(padded(image(200)));
  });

  it('retries a block the device NAKs', async () => {
    const boot = createVegaBootloader({ nakBlocks: { 1: 2 } });
    const sending = xmodemSend(boot.device.transport, image(400), fast);
    await boot.boot();
    await sending;
    expect(boot.state.attempts.get(1)).toBe(3);
    expect(boot.state.received).toEqual(padded(image(400)));
  });

  it('falls back to checksum mode when the device starts with NAK', async () => {
    const boot = createVegaBootloader({ checksum: true });
    let mode = '';
    const sending = xmodemSend(boot.device.transport, image(200), {
      ...fast,
      onHandshake: (m) => (mode = m),
    });
    await boot.boot();
    await sending;
    expect(mode).toBe('checksum');
    expect(boot.state.errors).toEqual([]);
    expect(boot.state.received).toEqual(padded(image(200)));
  });

  it('wraps block numbers after 255', async () => {
    const boot = createVegaBootloader();
    const img = image(300 * 128);
    const sending = xmodemSend(boot.device.transport, img, fast);
    await boot.boot();
    await sending;
    expect(boot.state.errors).toEqual([]);
    expect(boot.state.blocksAccepted).toBe(300);
  });

  it('resends EOT if the device NAKs it', async () => {
    const boot = createVegaBootloader({ nakFirstEot: true });
    const sending = xmodemSend(boot.device.transport, image(10), fast);
    await boot.boot();
    await sending;
    expect(boot.state.eotCount).toBe(2);
    expect(boot.state.jumped).toBe(true);
  });

  it('gives up after maxRetries and cancels with CAN CAN', async () => {
    const boot = createVegaBootloader({ nakBlocks: { 0: 99 } });
    const sending = xmodemSend(boot.device.transport, image(10), { ...fast, maxRetries: 3 });
    const outcome = expect(sending).rejects.toBeInstanceOf(ProtocolError);
    await boot.boot();
    await outcome;
    expect(boot.state.attempts.get(0)).toBe(4);
    expect(boot.state.cancelledByHost).toBe(true);
  });

  it('times out with advice when the bootloader never asks for data', async () => {
    const boot = createVegaBootloader();
    await expect(
      xmodemSend(boot.device.transport, image(10), { ...fast, handshakeTimeoutMs: 100 }),
    ).rejects.toThrow(/reset/i);
  });

  it('stops when the device cancels', async () => {
    const boot = createVegaBootloader({ cancelAtBlock: 1 });
    const sending = xmodemSend(boot.device.transport, image(400), fast);
    const outcome = expect(sending).rejects.toThrow(/cancel/i);
    await boot.boot();
    await outcome;
  });

  it('cancels the transfer when aborted', async () => {
    const boot = createVegaBootloader();
    const controller = new AbortController();
    const sending = xmodemSend(
      boot.device.transport,
      image(128 * 50),
      {
        ...fast,
        onProgress: (sent) => sent >= 128 * 5 && controller.abort(),
      },
      controller.signal,
    );
    const outcome = expect(sending).rejects.toBeInstanceOf(CancelledError);
    await boot.boot();
    await outcome;
    expect(boot.state.cancelledByHost).toBe(true);
    expect(boot.state.blocksAccepted).toBeLessThan(50);
  });

  it('reports an unplugged board', async () => {
    const boot = createVegaBootloader();
    const sending = xmodemSend(boot.device.transport, image(10), fast);
    const outcome = expect(sending).rejects.toBeInstanceOf(DisconnectedError);
    await sleep(10);
    boot.device.unplug();
    await outcome;
  });
});
