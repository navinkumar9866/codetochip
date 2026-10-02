import { afterEach, describe, expect, it } from 'vitest';
import { setTelemetryEnabled, telemetryContext, telemetryEnabled } from '../src/telemetry.ts';

afterEach(() => localStorage.clear());

describe('telemetryContext', () => {
  it.each([
    [
      'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
      'Android',
      'Chrome',
      true,
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 SamsungBrowser/27.0 Chrome/125 Mobile Safari/537.36',
      'Android',
      'Samsung Internet',
      true,
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0',
      'Windows',
      'Edge',
      false,
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/150.0 Safari/537.36',
      'macOS',
      'Chrome',
      false,
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
      'Linux',
      'Firefox',
      false,
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      'iOS',
      'Safari',
      true,
    ],
  ])('%s', (ua, os, browser, mobile) => {
    expect(telemetryContext(ua, false)).toEqual({ os, browser, mobile, app: 'web' });
  });
});

describe('opt-out', () => {
  it('is on by default and remembers turning it off', () => {
    expect(telemetryEnabled()).toBe(true);
    setTelemetryEnabled(false);
    expect(telemetryEnabled()).toBe(false);
    setTelemetryEnabled(true);
    expect(telemetryEnabled()).toBe(true);
  });
});
