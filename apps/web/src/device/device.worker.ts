/// <reference lib="webworker" />
// Runs the board connection off the main thread: Chrome throttles timers in background tabs
// (seen at Gate 0), but not like this in a dedicated worker. The page asks for permission
// (requestPort needs a click); the worker reopens the same port via getPorts()/getDevices().
import {
  createBridgeDriver,
  DeviceSession,
  WebSerialTransport,
  WebUsbSerialTransport,
  type Transport,
} from '@codetochip/flasher';
import type { DeviceEvent, FromWorker, PortRef, ToWorker } from './messages.ts';
import { Reconnector } from './reconnect.ts';

declare const self: DedicatedWorkerGlobalScope;
let session: DeviceSession | null = null;
let current: { port: PortRef; baudRate: number } | null = null;

async function openSession(port: PortRef, baudRate: number) {
  await session?.close();
  const transport = await findTransport(port);
  session = new DeviceSession(transport, baudRate, {
    onSerial: (data) => emit({ type: 'serial', data }),
    onProgress: (progress) => emit({ type: 'progress', progress }),
    onState: (state) => emit({ type: 'state', state }),
    onDisconnect: (message) => {
      if (current) reconnector.disconnected(current.port);
      emit({ type: 'disconnect', message });
    },
  });
  await session.open();
  current = { port, baudRate };
}

const reconnector = new Reconnector(
  [
    (navigator as Navigator & { usb?: EventTarget }).usb,
    (navigator as Navigator & { serial?: EventTarget }).serial,
  ],
  async (port) => {
    if (!current) return;
    // Give the OS a moment to finish enumerating the device.
    await new Promise((r) => setTimeout(r, 500));
    try {
      await openSession(port, current.baudRate);
      emit({ type: 'reconnected' });
    } catch {
      // Still not usable; the user can connect again by hand.
    }
  },
);

const emit = (event: DeviceEvent) => {
  const msg: FromWorker = { type: 'event', event };
  if (event.type === 'serial') self.postMessage(msg, [event.data.buffer as ArrayBuffer]);
  else self.postMessage(msg);
};

async function findTransport(port: PortRef): Promise<Transport> {
  if (port.via === 'webserial') {
    const ports = await navigator.serial.getPorts();
    // Two identical boards plugged in at once can't be told apart here; the first match wins.
    const match = ports.find((p) => {
      const info = p.getInfo();
      return info.usbVendorId === port.usbVendorId && info.usbProductId === port.usbProductId;
    });
    if (!match)
      throw new Error('The board isn’t available any more. Plug it in and connect again.');
    return new WebSerialTransport(match);
  }
  const devices = await navigator.usb.getDevices();
  const device = devices.find(
    (d) =>
      d.vendorId === port.vendorId &&
      d.productId === port.productId &&
      (port.serialNumber === undefined || d.serialNumber === port.serialNumber),
  );
  if (!device) throw new Error('The board isn’t available any more. Plug it in and connect again.');
  const driver = createBridgeDriver(port.bridge, device);
  if (!driver) throw new Error('This board’s USB chip isn’t supported on this device yet.');
  return new WebUsbSerialTransport(device, driver, 'webusb-cp210x');
}

async function handle(msg: ToWorker): Promise<unknown> {
  switch (msg.type) {
    case 'capabilities':
      return { serial: 'serial' in navigator, usb: 'usb' in navigator };
    case 'open':
      reconnector.forget();
      await openSession(msg.port, msg.baudRate);
      return;
    case 'close':
      reconnector.forget();
      current = null;
      await session?.close();
      session = null;
      return;
    case 'write':
      return session?.write(msg.data);
    case 'baud':
      if (current) current.baudRate = msg.baudRate;
      return session?.setBaudRate(msg.baudRate);
    case 'flash':
      if (!session) throw new Error('Connect the board first.');
      return session.flash(msg.protocol, msg.image, msg.options);
    case 'cancel':
      session?.cancelFlash();
      return;
  }
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  handle(msg).then(
    (value) =>
      self.postMessage({ type: 'reply', id: msg.id, ok: true, value } satisfies FromWorker),
    (err: unknown) =>
      self.postMessage({
        type: 'reply',
        id: msg.id,
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      } satisfies FromWorker),
  );
};
