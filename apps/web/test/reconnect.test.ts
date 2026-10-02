import { describe, expect, it } from 'vitest';
import type { PortRef } from '../src/device/messages.ts';
import { isSamePort, Reconnector } from '../src/device/reconnect.ts';

const usbRef: PortRef = {
  via: 'webusb',
  vendorId: 0x10c4,
  productId: 0xea60,
  serialNumber: 'A1',
  bridge: 'cp210x',
};
const connect = (target: EventTarget, device: object) =>
  target.dispatchEvent(Object.assign(new Event('connect'), { device }));

describe('Reconnector', () => {
  it('reopens the same board after an unexpected disconnect, once', async () => {
    const usb = new EventTarget();
    const reopened: PortRef[] = [];
    const r = new Reconnector([usb], async (p) => void reopened.push(p));
    r.disconnected(usbRef);
    connect(usb, { vendorId: 0x10c4, productId: 0xea60, serialNumber: 'B2' }); // another identical board
    connect(usb, { vendorId: 0x2341, productId: 0x0043 }); // a different device
    expect(reopened).toEqual([]);
    connect(usb, { vendorId: 0x10c4, productId: 0xea60, serialNumber: 'A1' });
    connect(usb, { vendorId: 0x10c4, productId: 0xea60, serialNumber: 'A1' });
    expect(reopened).toEqual([usbRef]);
    r.dispose();
  });

  it('does nothing after the user disconnected on purpose', () => {
    const usb = new EventTarget();
    const reopened: PortRef[] = [];
    const r = new Reconnector([usb, undefined], async (p) => void reopened.push(p));
    r.disconnected(usbRef);
    r.forget();
    connect(usb, { vendorId: 0x10c4, productId: 0xea60, serialNumber: 'A1' });
    expect(reopened).toEqual([]);
  });

  it('matches Web Serial ports by USB IDs', () => {
    const ref: PortRef = { via: 'webserial', usbVendorId: 0x10c4, usbProductId: 0xea60 };
    expect(
      isSamePort(ref, { getInfo: () => ({ usbVendorId: 0x10c4, usbProductId: 0xea60 }) }),
    ).toBe(true);
    expect(
      isSamePort(ref, { getInfo: () => ({ usbVendorId: 0x10c4, usbProductId: 0x0001 }) }),
    ).toBe(false);
    expect(isSamePort(ref, { vendorId: 0x10c4, productId: 0xea60 })).toBe(false);
  });
});
