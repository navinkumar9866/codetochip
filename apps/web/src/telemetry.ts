import { useCallback } from 'react';
import type { TelemetryContext, TelemetryEvent } from '@codetochip/data';
import { useServices } from './services.tsx';

const KEY = 'ctc.telemetry';

/** Coarse environment only (never the full user-agent string). */
export function telemetryContext(
  ua = navigator.userAgent,
  coarsePointer = matchMedia('(pointer: coarse)').matches,
): TelemetryContext {
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /CrOS/.test(ua)
        ? 'ChromeOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'other';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'other';
  return { os, browser, mobile: os === 'Android' || os === 'iOS' || coarsePointer, app: 'web' };
}

export function telemetryEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setTelemetryEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    // Storage blocked: nothing to remember.
  }
}

/** Records an anonymous usage event unless the user opted out. */
export function useTelemetry() {
  const { telemetry } = useServices();
  return useCallback(
    (event: TelemetryEvent) => {
      if (telemetryEnabled()) telemetry.record(event, telemetryContext());
    },
    [telemetry],
  );
}
