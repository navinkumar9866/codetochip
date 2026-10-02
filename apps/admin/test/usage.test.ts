import { describe, expect, it } from 'vitest';
import { rates, topErrors, type EventRow } from '../src/usage.ts';

const ev = (p: Partial<EventRow>): EventRow => ({
  kind: 'flash',
  ok: true,
  board: 'aries-v3',
  os: 'Android',
  browser: 'Chrome',
  transport: 'webusb',
  durationMs: 1000,
  ...p,
});

describe('usage aggregation', () => {
  it('computes success rate and median time per group, busiest first', () => {
    const events = [
      ev({ durationMs: 1000 }),
      ev({ durationMs: 3000, ok: false, error: 'DisconnectedError' }),
      ev({ durationMs: 2000 }),
      ev({ os: 'Windows', transport: 'webserial', durationMs: 500 }),
    ];
    expect(rates(events, (e) => `${e.os}`)).toEqual([
      { key: 'Android', attempts: 3, succeeded: 2, rate: 2 / 3, medianMs: 2000 },
      { key: 'Windows', attempts: 1, succeeded: 1, rate: 1, medianMs: 500 },
    ]);
  });

  it('ranks failure categories', () => {
    const events = [
      ev({ ok: false, error: 'CancelledError' }),
      ev({ ok: false, error: 'DisconnectedError' }),
      ev({ ok: false, error: 'DisconnectedError' }),
      ev({ ok: false }),
      ev({}),
    ];
    expect(topErrors(events)).toEqual([
      { error: 'DisconnectedError', count: 2 },
      { error: 'CancelledError', count: 1 },
      { error: 'unknown', count: 1 },
    ]);
  });
});
