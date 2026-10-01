import { describe, expect, it } from 'vitest';
import { crc16Xmodem } from '../src/index.ts';

describe('crc16Xmodem', () => {
  it('matches the standard check value', () => {
    expect(crc16Xmodem(new TextEncoder().encode('123456789'))).toBe(0x31c3);
  });

  it('is zero for empty input', () => {
    expect(crc16Xmodem(new Uint8Array())).toBe(0);
  });
});
