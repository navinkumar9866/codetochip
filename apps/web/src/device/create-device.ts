import {
  createBridgeDriver,
  WebSerialTransport,
  WebUsbSerialTransport,
  type Transport,
} from '@codetochip/flasher';
import type { BoardManifest } from '@codetochip/boards';
import { InPageDevice, WorkerDevice, type Device } from './device.ts';

const hex = (s: string) => parseInt(s, 16);

/** In-page transports, used when a browser lacks serial/USB inside workers. */
async function openInPage(board: BoardManifest): Promise<Transport> {
  if ('serial' in navigator && !/Android/i.test(navigator.userAgent)) {
    const port = await navigator.serial.requestPort({
      filters: board.usb.map((u) => ({
        usbVendorId: hex(u.vendorId),
        usbProductId: hex(u.productId),
      })),
    });
    return new WebSerialTransport(port);
  }
  const d = await navigator.usb.requestDevice({
    filters: board.usb.map((u) => ({ vendorId: hex(u.vendorId), productId: hex(u.productId) })),
  });
  const bridge = board.usb.find((u) => hex(u.vendorId) === d.vendorId)?.bridge ?? 'unknown';
  const driver = createBridgeDriver(bridge, d);
  if (!driver) throw new Error('This board’s USB chip isn’t supported on this device yet.');
  return new WebUsbSerialTransport(d, driver, 'webusb-cp210x');
}

/**
 * The board connection for this page. `?device=mock` (dev builds only) uses a simulated
 * VEGA bootloader so the whole flow can be tested without hardware (Playwright).
 */
let shared: Promise<Device> | null = null;

/** One board connection per page (React StrictMode mounts effects twice in development). */
export function createDevice(): Promise<Device> {
  return (shared ??= makeDevice());
}

async function makeDevice(): Promise<Device> {
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('device') === 'mock') {
    const { createMockDevice } = await import('./mock-device.ts');
    return createMockDevice();
  }
  const worker = new WorkerDevice(
    new Worker(new URL('./device.worker.ts', import.meta.url), { type: 'module' }),
  );
  const caps = await worker.capabilities().catch(() => ({ serial: false, usb: false }));
  const android = /Android/i.test(navigator.userAgent);
  return (android ? caps.usb : caps.serial) ? worker : new InPageDevice(openInPage);
}
