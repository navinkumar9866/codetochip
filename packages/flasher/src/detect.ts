export type TransportSupport =
  { kind: 'webserial' } | { kind: 'webusb' } | { kind: 'unsupported'; reason: string };

/** Navigator fields we look at (injectable for tests). */
export interface NavigatorLike {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  serial?: unknown;
  usb?: unknown;
}

/**
 * Desktop Chromium → Web Serial. Android Chrome → WebUSB with our bridge drivers.
 * iOS, Firefox, Safari → unsupported, with a reason a user can act on.
 */
export function detectTransport(nav: NavigatorLike = navigator as NavigatorLike): TransportSupport {
  const ua = nav.userAgent;
  const iOS =
    /iPhone|iPad|iPod/.test(ua) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
  if (iOS) {
    return {
      kind: 'unsupported',
      reason:
        'iPhones and iPads can’t connect to boards over USB. You can still write and compile code, then download the .bin file.',
    };
  }
  if (/Android/i.test(ua)) {
    return nav.usb
      ? { kind: 'webusb' }
      : { kind: 'unsupported', reason: 'Open this page in Chrome to connect a board on Android.' };
  }
  if (nav.serial) return { kind: 'webserial' };
  return {
    kind: 'unsupported',
    reason: 'This browser can’t talk to USB boards. Use Chrome or Edge on a computer.',
  };
}
