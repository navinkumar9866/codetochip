import { describe, expect, it } from 'vitest';
import { detectTransport } from '../src/detect.ts';
import { ByteStream } from '../src/io/byte-stream.ts';
import { createRecorder, fromHex, toHex } from '../src/recording.ts';
import { createFakeDevice } from './helpers/fake-device.ts';

describe('createRecorder', () => {
  it('records tx, rx, signals and notes with timestamps, only while recording', async () => {
    let clock = 0;
    const dev = createFakeDevice((data, d) => d.send(data)); // echo
    const rec = createRecorder(dev.transport, () => clock);

    await rec.transport.write(Uint8Array.from([0xff])); // before start: not recorded
    rec.start();
    clock = 5;
    await rec.transport.setSignals({ dtr: false });
    clock = 10;
    await rec.transport.write(Uint8Array.from([0x43]));
    const stream = new ByteStream(rec.transport.readable);
    await stream.readByte(100); // the 0xff echo
    await stream.readByte(100); // the 0x43 echo
    rec.note('pressed RESET');
    rec.stop();
    await stream.close();

    expect(rec.entries).toEqual([
      { dir: 'signal', t: 5, hex: '', signals: { dtr: false } },
      { dir: 'tx', t: 10, hex: '43' },
      { dir: 'rx', t: 10, hex: 'ff' },
      { dir: 'rx', t: 10, hex: '43' },
      { dir: 'note', t: 10, hex: '', text: 'pressed RESET' },
    ]);
    const t = rec.toTranscript({ board: 'test-board', transport: 'mock', description: 'echo' });
    expect(t.entries).toHaveLength(5);
  });

  it('round-trips hex', () => {
    expect(toHex(fromHex('00ff1a43'))).toBe('00ff1a43');
  });
});

describe('detectTransport', () => {
  const chromeMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140.0 Safari/537.36';
  const chromeAndroid =
    'Mozilla/5.0 (Linux; Android 15; Pixel 8) Chrome/140.0 Mobile Safari/537.36';
  const iPhone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1';

  it('uses Web Serial on desktop Chromium', () => {
    expect(detectTransport({ userAgent: chromeMac, serial: {} }).kind).toBe('webserial');
  });
  it('uses WebUSB on Android even if Web Serial exists', () => {
    expect(detectTransport({ userAgent: chromeAndroid, serial: {}, usb: {} }).kind).toBe('webusb');
  });
  it('explains iOS and unsupported browsers', () => {
    expect(detectTransport({ userAgent: iPhone })).toMatchObject({
      kind: 'unsupported',
      reason: /\.bin/,
    });
    expect(
      detectTransport({ userAgent: 'Mozilla/5.0 (Macintosh) Gecko/20100101 Firefox/140.0' }),
    ).toMatchObject({ kind: 'unsupported', reason: /Chrome or Edge/ });
    // iPadOS reports itself as a Mac with touch.
    expect(
      detectTransport({ userAgent: chromeMac, platform: 'MacIntel', maxTouchPoints: 5 }).kind,
    ).toBe('unsupported');
  });
});
