import type { FlashOptions, FlashProgress, SessionState } from '@codetochip/flasher';

/** Identifies the port the user picked on the page, so the worker can reopen it. */
export type PortRef =
  | { via: 'webserial'; usbVendorId?: number; usbProductId?: number }
  | { via: 'webusb'; vendorId: number; productId: number; serialNumber?: string; bridge: string };

export type ToWorker =
  | { id: number; type: 'capabilities' }
  | { id: number; type: 'open'; port: PortRef; baudRate: number }
  | { id: number; type: 'close' }
  | { id: number; type: 'write'; data: Uint8Array }
  | { id: number; type: 'baud'; baudRate: number }
  | { id: number; type: 'flash'; protocol: string; image: Uint8Array; options: FlashOptions }
  | { id: number; type: 'cancel' };

export type DeviceEvent =
  | { type: 'serial'; data: Uint8Array }
  | { type: 'progress'; progress: FlashProgress }
  | { type: 'state'; state: SessionState }
  | { type: 'disconnect'; message: string };

export type FromWorker =
  | { type: 'reply'; id: number; ok: true; value?: unknown }
  | { type: 'reply'; id: number; ok: false; message: string }
  | ({ type: 'event' } & { event: DeviceEvent });
