import { describe, expect, it } from 'vitest';
import { createBridgeDriver, Cp210xDriver } from '../src/bridges/cp210x.ts';
import { DisconnectedError } from '../src/errors.ts';
import { ByteStream } from '../src/io/byte-stream.ts';
import { ChunkQueue } from '../src/io/chunk-queue.ts';
import { getProtocol, registerProtocol } from '../src/protocols/registry.ts';
import { createRecorder } from '../src/recording.ts';
import { WebSerialTransport } from '../src/transports/web-serial.ts';
import { WebUsbSerialTransport } from '../src/transports/webusb-serial.ts';
import type { Protocol } from '../src/types.ts';
import { createFakeDevice } from './helpers/fake-device.ts';
import { createFakeUsbDevice } from './helpers/fake-usb.ts';

function fakeSerialPort() {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  const written: number[][] = [];
  const signals: SerialOutputSignals[] = [];
  const port = {
    readable: null as ReadableStream<Uint8Array> | null,
    writable: null as WritableStream<Uint8Array> | null,
    openedWith: null as SerialOptions | null,
    closed: false,
    async open(options: SerialOptions) {
      port.openedWith = options;
      port.readable = new ReadableStream({ start: (c) => void (source = c) });
      port.writable = new WritableStream({ write: (chunk) => void written.push([...chunk]) });
    },
    async close() {
      port.closed = true;
    },
    async setSignals(s: SerialOutputSignals) {
      signals.push(s);
    },
  };
  return {
    port,
    serialPort: port as unknown as SerialPort,
    receive: (text: string) => source.enqueue(new TextEncoder().encode(text)),
    fail: (e: unknown) => source.error(e),
    written,
    signals,
  };
}

describe('WebSerialTransport', () => {
  it('opens at the baud rate, moves bytes, maps signals, closes', async () => {
    const f = fakeSerialPort();
    const t = new WebSerialTransport(f.serialPort);
    await t.open({ baudRate: 115200 });
    expect(f.port.openedWith).toMatchObject({ baudRate: 115200 });

    const stream = new ByteStream(t.readable);
    f.receive('C');
    expect(await stream.readByte(100)).toBe(0x43);
    await stream.close();

    await t.write(Uint8Array.from([1, 2]));
    expect(f.written).toEqual([[1, 2]]);

    await t.setSignals({ dtr: false });
    await t.setSignals({ rts: true });
    expect(f.signals).toEqual([{ dataTerminalReady: false }, { requestToSend: true }]);

    await t.close();
    expect(f.port.closed).toBe(true);
  });

  it('turns a read error (unplugged) into DisconnectedError', async () => {
    const f = fakeSerialPort();
    const t = new WebSerialTransport(f.serialPort);
    await t.open({ baudRate: 9600 });
    const pending = new ByteStream(t.readable).readByte(1000);
    f.fail(new DOMException('The device has been lost.', 'NetworkError'));
    await expect(pending).rejects.toBeInstanceOf(DisconnectedError);
  });

  it('refuses to write when the port is gone', async () => {
    const f = fakeSerialPort();
    const t = new WebSerialTransport(f.serialPort);
    await expect(t.write(Uint8Array.from([1]))).rejects.toBeInstanceOf(DisconnectedError);
    f.port.writable = new WritableStream({
      write: () => {
        throw new Error('gone');
      },
    });
    await expect(t.write(Uint8Array.from([1]))).rejects.toBeInstanceOf(DisconnectedError);
  });
});

describe('ChunkQueue and ByteStream', () => {
  it('drops the oldest data when nobody reads and the buffer is full', async () => {
    const q = new ChunkQueue(4);
    for (const b of [1, 2, 3, 4, 5, 6]) q.push(Uint8Array.from([b]));
    expect(q.dropped).toBe(2);
    const s = new ByteStream(q.iterable());
    expect(await s.readByte(10)).toBe(3);
  });

  it('treats a normal end of data as a disconnect, every time it is read', async () => {
    const q = new ChunkQueue();
    q.push(Uint8Array.from([9]));
    q.end();
    const s = new ByteStream(q.iterable());
    expect(await s.readByte(10)).toBe(9);
    await expect(s.readByte(10)).rejects.toBeInstanceOf(DisconnectedError);
    await expect(s.readByte(10)).rejects.toBeInstanceOf(DisconnectedError);
  });
});

describe('protocol registry', () => {
  it('finds registered protocols by the id a manifest names', () => {
    expect(getProtocol('nope')).toBeUndefined();
    const fake: Protocol = { id: 'fake-test', targets: ['ram'], flash: async () => {} };
    registerProtocol(fake);
    expect(getProtocol('fake-test')).toBe(fake);
  });
});

describe('recorder', () => {
  it('passes open, close and kind through', async () => {
    const dev = createFakeDevice(() => {});
    const rec = createRecorder(dev.transport);
    expect(rec.transport.kind).toBe('mock');
    await rec.transport.open({ baudRate: 1 });
    await rec.transport.close();
  });
});

describe('USB bridge errors', () => {
  it('has a driver only for supported bridge chips', () => {
    const usb = createFakeUsbDevice();
    expect(createBridgeDriver('cp210x', usb.device)).toBeInstanceOf(Cp210xDriver);
    expect(createBridgeDriver('ch34x', usb.device)).toBeNull();
  });

  it('explains a chip that rejects a request or has no serial interface', async () => {
    await expect(
      new Cp210xDriver(createFakeUsbDevice({ controlStatus: 'stall' }).device).open(),
    ).rejects.toThrow(/rejected request 0x0.*Unplug and replug/);
    await expect(
      new Cp210xDriver(createFakeUsbDevice({ noBulk: true }).device).open(),
    ).rejects.toThrow(/no serial data interface/);
  });

  it('clears a stalled IN endpoint and keeps reading; reports failed writes', async () => {
    const usb = createFakeUsbDevice({ stallFirstIn: true, outStatus: 'stall' });
    const t = new WebUsbSerialTransport(
      usb.device,
      new Cp210xDriver(usb.device),
      'webusb-cp210x',
      undefined,
    );
    await t.open({ baudRate: 115200 });
    const s = new ByteStream(t.readable);
    usb.receive('x');
    expect(await s.readByte(200)).toBe(0x78);
    expect(usb.halts()).toBe(1);
    await expect(t.write(Uint8Array.from([1]))).rejects.toBeInstanceOf(DisconnectedError);
  });
});
