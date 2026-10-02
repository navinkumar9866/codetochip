import type { PortRef } from './messages.ts';

interface UsbLike {
  vendorId: number;
  productId: number;
  serialNumber?: string | undefined;
}
interface SerialPortLike {
  getInfo(): { usbVendorId?: number | undefined; usbProductId?: number | undefined };
}

/** Whether a newly plugged-in device is the board we were connected to. */
export function isSamePort(ref: PortRef, device: UsbLike | SerialPortLike): boolean {
  if (ref.via === 'webusb') {
    const d = device as UsbLike;
    return (
      d.vendorId === ref.vendorId &&
      d.productId === ref.productId &&
      (ref.serialNumber === undefined || d.serialNumber === ref.serialNumber)
    );
  }
  if (!('getInfo' in device)) return false;
  const info = device.getInfo();
  return info.usbVendorId === ref.usbVendorId && info.usbProductId === ref.usbProductId;
}

/**
 * Reopens the board when it is plugged back in after an unexpected disconnect (OTG cables get
 * knocked; some phones drop USB briefly). A deliberate disconnect forgets the board.
 * Permission survives the replug, so no new picker is needed.
 */
export class Reconnector {
  private lost: PortRef | null = null;
  private readonly onConnect = (e: Event) => {
    const lost = this.lost;
    // WebUSB puts the device on the event; Web Serial's connect event targets the port itself.
    const device =
      (e as Event & { device?: UsbLike }).device ?? (e.target as unknown as SerialPortLike);
    if (!lost || !device || !isSamePort(lost, device)) return;
    this.lost = null;
    void this.reopen(lost);
  };

  constructor(
    private readonly sources: (EventTarget | undefined)[],
    private readonly reopen: (port: PortRef) => Promise<void>,
  ) {
    for (const s of sources) s?.addEventListener('connect', this.onConnect);
  }

  /** The connection dropped without the user asking: watch for the board to come back. */
  disconnected(port: PortRef) {
    this.lost = port;
  }

  /** The user disconnected (or connected to something else): stop watching. */
  forget() {
    this.lost = null;
  }

  dispose() {
    for (const s of this.sources) s?.removeEventListener('connect', this.onConnect);
  }
}
