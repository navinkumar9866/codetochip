import { describe, expect, it } from 'vitest';
import { boards, fqbnFor, getBoard } from '../src/index.ts';

describe('board registry', () => {
  it('has unique board ids', () => {
    const ids = boards.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('looks boards up by id', () => {
    expect(getBoard('aries-v3')?.vendor).toBe('C-DAC');
    expect(getBoard('no-such-board')).toBeUndefined();
  });
});

describe('fqbnFor', () => {
  it('appends the mode’s board-menu options', () => {
    const board = getBoard('aries-v3')!;
    expect(fqbnFor(board, 'ram')).toBe('vega:riscv:aries_v3:upload_method=xmodemMethod');
    expect(fqbnFor(board, 'persistent')).toBe('vega:riscv:aries_v3:upload_method=serialMethod');
    expect(() => fqbnFor(board, 'nope')).toThrow(/no flash mode/);
  });
});
