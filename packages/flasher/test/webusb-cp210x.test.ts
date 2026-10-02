import { describe, expect, it } from 'vitest';
import { Cp210xDriver } from '../src/bridges/cp210x.ts';
import { DisconnectedError } from '../src/errors.ts';
import { ByteStream } from '../src/io/byte-stream.ts';
import { WebUsbSerialTransport } from '../src/transports/webusb-serial.ts';
import { createFakeUsbDevice } from './helpers/fake-usb.ts';

const open = async () => {
  const usb = createFakeUsbDevice();
  const transport = new WebUsbSerialTransport(
    usb.device,
    new Cp210xDriver(usb.device),
    'webusb-cp210x',
  );
  await transport.open({ baudRate: 115200 });
  return { usb, transport };
};

const summary = (c: { setup: USBControlTransferParameters; data?: number[] }) => ({
  type: `${c.setup.requestType}/${c.setup.recipient}`,
  request: c.setup.request,
  value: c.setup.value,
  index: c.setup.index,
  ...(c.data && { data: c.data }),
});

describe('Cp210xDriver + WebUsbSerialTransport', () => {
  it('configures the chip for 115200 8N1 and raises DTR/RTS on open', async () => {
    const { usb } = await open();
    expect(usb.claimed.has(0)).toBe(true);
    expect(usb.controls.map(summary)).toEqual([
      { type: 'vendor/interface', request: 0x00, value: 0x0001, index: 0 }, // IFC_ENABLE
      { type: 'vendor/interface', request: 0x03, value: 0x0800, index: 0 }, // SET_LINE_CTL 8N1
      { type: 'vendor/interface', request: 0x12, value: 0x000f, index: 0 }, // PURGE all
      // SET_BAUDRATE, 115200 little-endian
      {
        type: 'vendor/interface',
        request: 0x1e,
        value: 0,
        index: 0,
        data: [0x00, 0xc2, 0x01, 0x00],
      },
      { type: 'vendor/interface', request: 0x07, value: 0x0303, index: 0 }, // SET_MHS DTR+RTS
    ]);
  });

  it('sets DTR and RTS independently with write masks', async () => {
    const { usb, transport } = await open();
    usb.controls.length = 0;
    await transport.setSignals({ dtr: false });
    await transport.setSignals({ rts: true });
    await transport.setSignals({ dtr: true, rts: false });
    expect(usb.controls.map((c) => c.setup.value)).toEqual([0x0100, 0x0202, 0x0301]);
  });

  it('moves bytes both ways', async () => {
    const { usb, transport } = await open();
    await transport.write(Uint8Array.from([1, 2, 3]));
    expect(usb.bulkOut).toEqual([[1, 2, 3]]);

    const stream = new ByteStream(transport.readable);
    usb.receive('OK');
    expect(await stream.readByte(100)).toBe(0x4f);
    expect(await stream.readByte(100)).toBe(0x4b);
    await stream.close();
  });

  it('writes CP2102N GPIO latch as a device-level vendor request', async () => {
    const usb = createFakeUsbDevice();
    const driver = new Cp210xDriver(usb.device);
    await driver.open();
    usb.controls.length = 0;
    await driver.writeGpioLatch(0b0100, 0b0000);
    expect(usb.controls.map(summary)).toEqual([
      { type: 'vendor/device', request: 0xff, value: 0x37e1, index: 0x0004 },
    ]);
  });

  it('reports an unplugged board to readers and writers', async () => {
    const { usb, transport } = await open();
    const stream = new ByteStream(transport.readable);
    const pending = stream.readByte(1000);
    usb.unplug();
    await expect(pending).rejects.toBeInstanceOf(DisconnectedError);
    await expect(transport.write(Uint8Array.from([1]))).rejects.toBeInstanceOf(DisconnectedError);
  });

  it('disables the UART and releases the interface on close', async () => {
    const { usb, transport } = await open();
    usb.controls.length = 0;
    await transport.close();
    expect(usb.controls.map(summary)).toEqual([
      { type: 'vendor/interface', request: 0x00, value: 0x0000, index: 0 },
    ]);
    expect(usb.claimed.size).toBe(0);
  });

  it('ends reads as soon as the browser reports this device unplugged', async () => {
    const usbEvents = new EventTarget();
    const usb = createFakeUsbDevice();
    const transport = new WebUsbSerialTransport(
      usb.device,
      new Cp210xDriver(usb.device),
      'webusb-cp210x',
      usbEvents,
    );
    await transport.open({ baudRate: 115200 });
    const stream = new ByteStream(transport.readable);
    const pending = stream.readByte(5000);

    const other = Object.assign(new Event('disconnect'), { device: {} });
    usbEvents.dispatchEvent(other); // a different device: ignored
    usbEvents.dispatchEvent(Object.assign(new Event('disconnect'), { device: usb.device }));
    await expect(pending).rejects.toBeInstanceOf(DisconnectedError);
    await expect(transport.write(Uint8Array.from([1]))).rejects.toBeInstanceOf(DisconnectedError);
  });
});
