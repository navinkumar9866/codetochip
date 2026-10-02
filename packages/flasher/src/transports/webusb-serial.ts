import type { BridgeDriver, BridgeEndpoints } from '../bridges/cp210x.ts';
import { DisconnectedError } from '../errors.ts';
import { ChunkQueue } from '../io/chunk-queue.ts';
import type { SerialSignals, Transport, TransportKind } from '../types.ts';

/**
 * Serial over WebUSB, with a chip-specific BridgeDriver. Used on Android, where Chrome's
 * Web Serial doesn't cover USB-serial chips. Never use on desktop: the OS driver owns the device.
 */
export class WebUsbSerialTransport implements Transport {
  private queue = new ChunkQueue();
  private endpoints: BridgeEndpoints | null = null;
  private reading = false;

  /** `usb` is navigator.usb; injectable for tests. Used to notice unplugging immediately. */
  constructor(
    readonly device: USBDevice,
    readonly driver: BridgeDriver,
    readonly kind: TransportKind,
    private readonly usb: EventTarget | undefined = globalThis.navigator?.usb,
  ) {}

  private readonly onDisconnect = (event: Event) => {
    if ((event as USBConnectionEvent).device !== this.device) return;
    this.reading = false;
    this.endpoints = null;
    this.queue.end(new DisconnectedError());
  };

  get readable(): AsyncIterable<Uint8Array> {
    return this.queue.iterable();
  }

  async open({ baudRate }: { baudRate: number }): Promise<void> {
    this.queue = new ChunkQueue();
    this.usb?.addEventListener('disconnect', this.onDisconnect);
    this.endpoints = await this.driver.open();
    await this.driver.setBaudRate(baudRate);
    // Assert DTR/RTS like desktop OS drivers do on open, so both transports behave alike.
    await this.driver.setSignals({ dtr: true, rts: true });
    this.reading = true;
    void this.readLoop(this.endpoints);
  }

  private async readLoop({ inEndpoint, packetSize }: BridgeEndpoints) {
    try {
      while (this.reading) {
        const result = await this.device.transferIn(inEndpoint, packetSize * 16);
        if (result.status === 'stall') {
          await this.device.clearHalt('in', inEndpoint);
        } else if (result.data && result.data.byteLength > 0) {
          const d = result.data;
          this.queue.push(
            new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)),
          );
        }
      }
      this.queue.end();
    } catch (e) {
      this.queue.end(this.reading ? new DisconnectedError(e) : undefined);
    }
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.endpoints) throw new DisconnectedError();
    try {
      const result = await this.device.transferOut(
        this.endpoints.outEndpoint,
        new Uint8Array(data),
      );
      if (result.status !== 'ok') throw new Error(result.status);
    } catch (e) {
      throw new DisconnectedError(e);
    }
  }

  setSignals(signals: SerialSignals): Promise<void> {
    return this.driver.setSignals(signals);
  }

  async close(): Promise<void> {
    this.usb?.removeEventListener('disconnect', this.onDisconnect);
    this.reading = false;
    this.endpoints = null;
    await this.driver.close();
    this.queue.end();
  }
}
