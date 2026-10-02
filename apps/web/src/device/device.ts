import type { BoardManifest } from '@codetochip/boards';
import {
  DeviceSession,
  detectTransport,
  type FlashOptions,
  type SessionState,
  type Transport,
} from '@codetochip/flasher';
import type { DeviceEvent, FromWorker, PortRef, ToWorker } from './messages.ts';

export type { DeviceEvent } from './messages.ts';

/** The board connection the UI talks to. Implemented by a Web Worker, or in-page as a fallback. */
export interface Device {
  readonly state: SessionState;
  /** Must be called from a click: browsers only show the port picker on a user gesture. */
  connect(board: BoardManifest): Promise<void>;
  disconnect(): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  setBaudRate(baudRate: number): Promise<void>;
  flash(protocol: string, image: Uint8Array, options: FlashOptions): Promise<void>;
  cancelFlash(): void;
  subscribe(listener: (e: DeviceEvent) => void): () => void;
}

const hex = (s: string) => parseInt(s, 16);

/** Shows the browser's port picker for this board's USB IDs. */
async function pickPort(board: BoardManifest): Promise<PortRef> {
  const support = detectTransport();
  if (support.kind === 'unsupported') throw new Error(support.reason);
  if (support.kind === 'webserial') {
    const port = await navigator.serial.requestPort({
      filters: board.usb.map((u) => ({
        usbVendorId: hex(u.vendorId),
        usbProductId: hex(u.productId),
      })),
    });
    const info = port.getInfo();
    return {
      via: 'webserial',
      ...(info.usbVendorId !== undefined && { usbVendorId: info.usbVendorId }),
      ...(info.usbProductId !== undefined && { usbProductId: info.usbProductId }),
    };
  }
  const d = await navigator.usb.requestDevice({
    filters: board.usb.map((u) => ({ vendorId: hex(u.vendorId), productId: hex(u.productId) })),
  });
  const usb = board.usb.find(
    (u) => hex(u.vendorId) === d.vendorId && hex(u.productId) === d.productId,
  );
  return {
    via: 'webusb',
    vendorId: d.vendorId,
    productId: d.productId,
    ...(d.serialNumber && { serialNumber: d.serialNumber }),
    bridge: usb?.bridge ?? 'unknown',
  };
}

/** Friendly text for the browser's "user closed the picker" error. */
function pickerError(e: unknown): Error {
  if (e instanceof DOMException && e.name === 'NotFoundError') {
    return new Error(
      'No board was selected. Plug the board in, click Connect, and pick it from the list.',
    );
  }
  return e instanceof Error ? e : new Error(String(e));
}

abstract class BaseDevice implements Device {
  state: SessionState = 'closed';
  private listeners = new Set<(e: DeviceEvent) => void>();

  protected dispatch(e: DeviceEvent) {
    if (e.type === 'state') this.state = e.state;
    if (e.type === 'disconnect') this.state = 'closed';
    for (const l of this.listeners) l(e);
  }
  subscribe(listener: (e: DeviceEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  abstract connect(board: BoardManifest): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract write(data: Uint8Array): Promise<void>;
  abstract setBaudRate(baudRate: number): Promise<void>;
  abstract flash(protocol: string, image: Uint8Array, options: FlashOptions): Promise<void>;
  abstract cancelFlash(): void;
}

export class WorkerDevice extends BaseDevice {
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  constructor(private readonly worker: Worker) {
    super();
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data;
      if (msg.type === 'event') return this.dispatch(msg.event);
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.ok) p?.resolve(msg.value);
      else p?.reject(Object.assign(new Error(msg.message), { name: msg.name }));
    };
  }

  /** Whether this browser exposes Web Serial / WebUSB inside workers. */
  capabilities() {
    return this.call({ type: 'capabilities' }) as Promise<{ serial: boolean; usb: boolean }>;
  }

  private call(
    msg: DistributiveOmit<ToWorker, 'id'>,
    transfer: Transferable[] = [],
  ): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...msg, id }, transfer);
    });
  }

  async connect(board: BoardManifest) {
    const port = await pickPort(board).catch((e: unknown) => Promise.reject(pickerError(e)));
    await this.call({ type: 'open', port, baudRate: board.serial.baudRate });
  }
  async disconnect() {
    await this.call({ type: 'close' });
  }
  async write(data: Uint8Array) {
    await this.call({ type: 'write', data });
  }
  async setBaudRate(baudRate: number) {
    await this.call({ type: 'baud', baudRate });
  }
  async flash(protocol: string, image: Uint8Array, options: FlashOptions) {
    const copy = image.slice();
    await this.call({ type: 'flash', protocol, image: copy, options }, [copy.buffer]);
  }
  cancelFlash() {
    void this.call({ type: 'cancel' });
  }
}

/** Runs the session in the page: fallback for browsers without serial in workers, and mocks. */
export class InPageDevice extends BaseDevice {
  private session: DeviceSession | null = null;

  constructor(private readonly openTransport: (board: BoardManifest) => Promise<Transport>) {
    super();
  }

  async connect(board: BoardManifest) {
    await this.session?.close();
    const transport = await this.openTransport(board).catch((e: unknown) =>
      Promise.reject(pickerError(e)),
    );
    this.session = new DeviceSession(transport, board.serial.baudRate, {
      onSerial: (data) => this.dispatch({ type: 'serial', data }),
      onProgress: (progress) => this.dispatch({ type: 'progress', progress }),
      onState: (state) => this.dispatch({ type: 'state', state }),
      onDisconnect: (message) => this.dispatch({ type: 'disconnect', message }),
    });
    await this.session.open();
  }
  async disconnect() {
    await this.session?.close();
    this.session = null;
  }
  async write(data: Uint8Array) {
    await this.session?.write(data);
  }
  async setBaudRate(baudRate: number) {
    await this.session?.setBaudRate(baudRate);
  }
  async flash(protocol: string, image: Uint8Array, options: FlashOptions) {
    if (!this.session) throw new Error('Connect the board first.');
    await this.session.flash(protocol, image, options);
  }
  cancelFlash() {
    this.session?.cancelFlash();
  }
}

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
