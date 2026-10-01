// Silicon Labs CP210x USB-UART bridge over WebUSB (used on Android, where we drive the
// chip ourselves). Request codes per Silicon Labs AN571, cross-checked against the Linux
// cp210x driver's constants (drivers/usb/serial/cp210x.c); no code is copied from either.
import type { SerialSignals } from '../types.ts';

const REQ = {
  IFC_ENABLE: 0x00,
  SET_LINE_CTL: 0x03,
  SET_MHS: 0x07,
  PURGE: 0x12,
  SET_BAUDRATE: 0x1e,
  VENDOR_SPECIFIC: 0xff,
} as const;
const UART_ENABLE = 0x0001;
const UART_DISABLE = 0x0000;
const LINE_8N1 = 0x0800;
const PURGE_ALL = 0x000f;
const MHS_DTR = 0x0001;
const MHS_RTS = 0x0002;
const MHS_WRITE_DTR = 0x0100;
const MHS_WRITE_RTS = 0x0200;
/** CP2102N GPIO latch (vendor-specific; wValue selects the function). */
const WRITE_LATCH = 0x37e1;

export interface BridgeEndpoints {
  interfaceNumber: number;
  inEndpoint: number;
  outEndpoint: number;
  packetSize: number;
}

/** Chip-specific control for a USB-serial bridge. Transports stay chip-agnostic. */
export interface BridgeDriver {
  open(): Promise<BridgeEndpoints>;
  setBaudRate(baudRate: number): Promise<void>;
  setSignals(signals: SerialSignals): Promise<void>;
  close(): Promise<void>;
}

export class Cp210xDriver implements BridgeDriver {
  private interfaceNumber = 0;

  constructor(private readonly device: USBDevice) {}

  async open(): Promise<BridgeEndpoints> {
    const d = this.device;
    if (!d.opened) await d.open();
    if (d.configuration?.configurationValue !== 1) await d.selectConfiguration(1);

    const alt = d.configuration?.interfaces
      .map((i) => i.alternates[0])
      .find((a) => a?.endpoints.some((e) => e.type === 'bulk'));
    if (!alt) throw new Error('This USB device has no serial data interface.');
    const iface = d.configuration!.interfaces.find((i) => i.alternates[0] === alt)!;
    this.interfaceNumber = iface.interfaceNumber;

    const inEp = alt.endpoints.find((e) => e.type === 'bulk' && e.direction === 'in');
    const outEp = alt.endpoints.find((e) => e.type === 'bulk' && e.direction === 'out');
    if (!inEp || !outEp) throw new Error('This USB device has no serial data endpoints.');

    await d.claimInterface(this.interfaceNumber);
    await this.control(REQ.IFC_ENABLE, UART_ENABLE);
    await this.control(REQ.SET_LINE_CTL, LINE_8N1);
    await this.control(REQ.PURGE, PURGE_ALL);
    return {
      interfaceNumber: this.interfaceNumber,
      inEndpoint: inEp.endpointNumber,
      outEndpoint: outEp.endpointNumber,
      packetSize: inEp.packetSize,
    };
  }

  async setBaudRate(baudRate: number): Promise<void> {
    const data = new Uint8Array(4);
    new DataView(data.buffer).setUint32(0, baudRate, true);
    await this.control(REQ.SET_BAUDRATE, 0, data);
  }

  async setSignals({ dtr, rts }: SerialSignals): Promise<void> {
    let value = 0;
    if (dtr !== undefined) value |= MHS_WRITE_DTR | (dtr ? MHS_DTR : 0);
    if (rts !== undefined) value |= MHS_WRITE_RTS | (rts ? MHS_RTS : 0);
    if (value) await this.control(REQ.SET_MHS, value);
  }

  /**
   * EXPERIMENTAL (Gate 0): drive CP2102N GPIO pins. VEGA's Linux reset tool toggles a
   * bridge GPIO, so ARIES RESET may be wired to one. Which pin, and its polarity, are unknown.
   */
  async writeGpioLatch(mask: number, state: number): Promise<void> {
    const result = await this.device.controlTransferOut({
      requestType: 'vendor',
      recipient: 'device',
      request: REQ.VENDOR_SPECIFIC,
      value: WRITE_LATCH,
      index: ((state & 0xff) << 8) | (mask & 0xff),
    });
    assertOk(result, 'GPIO write');
  }

  async close(): Promise<void> {
    const d = this.device;
    if (!d.opened) return;
    await this.control(REQ.IFC_ENABLE, UART_DISABLE).catch(() => {});
    await d.releaseInterface(this.interfaceNumber).catch(() => {});
    await d.close().catch(() => {});
  }

  private async control(request: number, value: number, data?: Uint8Array<ArrayBuffer>) {
    const setup: USBControlTransferParameters = {
      requestType: 'vendor',
      recipient: 'interface',
      request,
      value,
      index: this.interfaceNumber,
    };
    const result = await this.device.controlTransferOut(setup, data);
    assertOk(result, `request 0x${request.toString(16)}`);
  }
}

function assertOk(result: USBOutTransferResult, what: string) {
  if (result.status !== 'ok') {
    throw new Error(
      `The USB serial chip rejected ${what} (${result.status}). Unplug and replug the board.`,
    );
  }
}

/** Driver for a manifest's `usb[].bridge` value, or null if we don't have one yet. */
export function createBridgeDriver(bridge: string, device: USBDevice): Cp210xDriver | null {
  return bridge === 'cp210x' ? new Cp210xDriver(device) : null;
}
