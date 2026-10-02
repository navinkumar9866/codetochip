// DeviceSession (monitor + flash on one port) against the simulated VEGA bootloader.
import { afterEach, describe, expect, it } from 'vitest';
import { flashOptionsFor, getBoard } from '@codetochip/boards';
import { DeviceSession, type FlashProgress, type SessionState } from '@codetochip/flasher';
import { createMockVegaBootloader } from '../src/index.ts';

const aries = getBoard('aries-v3')!;
const mocks: ReturnType<typeof createMockVegaBootloader>[] = [];
afterEach(() => mocks.splice(0).forEach((m) => m.dispose()));

function setup(initialState: 'bootloader' | 'running' = 'running') {
  const m = createMockVegaBootloader({
    initialState,
    handshakeIntervalMs: 60,
    programOutput: 'Hello from CodeToChip 0\r\n',
  });
  mocks.push(m);
  const serial: string[] = [];
  const progress: FlashProgress[] = [];
  const states: SessionState[] = [];
  const disconnects: string[] = [];
  const session = new DeviceSession(m.transport, aries.serial.baudRate, {
    onSerial: (c) => serial.push(new TextDecoder().decode(c)),
    onProgress: (p) => progress.push(p),
    onState: (s) => states.push(s),
    onDisconnect: (msg) => disconnects.push(msg),
  });
  return { m, session, serial, progress, states, disconnects, text: () => serial.join('') };
}

const until = async (cond: () => boolean, ms = 3000) => {
  for (const end = Date.now() + ms; !cond();) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('DeviceSession', () => {
  it('shows serial output, pauses it for a flash, and resumes with the new program’s output', async () => {
    const s = setup('running');
    await s.session.open();
    s.m.inject('old program\r\n');
    await until(() => s.text().includes('old program'));

    const flashing = s.session.flash('vega-xmodem', new Uint8Array(300).fill(7), {
      ...flashOptionsFor(aries, 'ram'),
      handshakeTimeoutMs: 3000,
    });
    await until(() => s.progress.some((p) => p.message === 'Press the RESET button on the board.'));
    await s.m.pressReset();
    await flashing;

    expect(s.states).toEqual(['open', 'flashing', 'open']);
    expect(s.progress.at(-1)?.stage).toBe('done');
    // The banner went to the protocol, not the monitor; the program's output goes to the monitor.
    await until(() => s.text().includes('Hello from CodeToChip 0'));
    expect(s.text()).not.toContain('VEGA Series');
  });

  it('reports a failed flash and keeps the monitor running', async () => {
    const s = setup('running');
    await s.session.open();
    await expect(
      s.session.flash('vega-xmodem', new Uint8Array(10), {
        ...flashOptionsFor(aries, 'ram'),
        handshakeTimeoutMs: 150,
      }),
    ).rejects.toThrow(/RESET/);
    expect(s.progress.at(-1)).toMatchObject({
      stage: 'error',
      message: expect.stringMatching(/RESET/),
    });
    expect(s.session.current).toBe('open');
    s.m.inject('still listening\r\n');
    await until(() => s.text().includes('still listening'));
  });

  it('cancels a flash on request', async () => {
    const s = setup('running');
    await s.session.open();
    const flashing = s.session.flash(
      'vega-xmodem',
      new Uint8Array(128),
      flashOptionsFor(aries, 'ram'),
    );
    s.session.cancelFlash();
    await expect(flashing).rejects.toThrow(/Upload cancelled\. Press the RESET button/);
    expect(s.session.current).toBe('open');
  });

  it('refuses unknown protocols and actions before connecting', async () => {
    const s = setup();
    await expect(s.session.write(new Uint8Array([1]))).rejects.toThrow(/Connect the board/);
    await expect(
      s.session.flash('vega-xmodem', new Uint8Array(1), flashOptionsFor(aries, 'ram')),
    ).rejects.toThrow(/Connect/);
    await s.session.open();
    await expect(
      s.session.flash('nope', new Uint8Array(1), flashOptionsFor(aries, 'ram')),
    ).rejects.toThrow(/isn’t supported yet/);
  });

  it('reports an unplugged board once', async () => {
    const s = setup();
    await s.session.open();
    s.m.unplug();
    await until(() => s.disconnects.length > 0);
    expect(s.disconnects).toEqual([expect.stringMatching(/disconnected/)]);
    expect(s.session.current).toBe('closed');
  });

  it('changes baud rate by reopening, and sends text to the board', async () => {
    const s = setup();
    await s.session.open();
    await s.session.setBaudRate(9600);
    expect(s.states).toEqual(['open']);
    await s.session.write(new TextEncoder().encode('hi\n'));
    await s.session.setSignals({ dtr: false });
    expect(s.m.state.signals).toEqual([{ dtr: false }]);
    await s.session.close();
    expect(s.session.current).toBe('closed');
  });
});
