import { readdirSync, readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  allBoards,
  boards,
  boardsByFamily,
  boardsForUsbDevice,
  fqbnFor,
  getBoard,
  searchBoards,
} from '../src/index.ts';

const dir = new URL('../manifests/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const schema = JSON.parse(
  readFileSync(new URL('../schema/board-manifest.schema.json', import.meta.url), 'utf8'),
) as object;
const validate = new Ajv2020({ allErrors: true }).compile(schema);

describe('manifests', () => {
  it.each(files)('%s is valid against the schema', (file) => {
    const manifest = JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as { id: string };
    const valid = validate(manifest);
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
    expect(`${manifest.id}.json`).toBe(file);
  });

  it('every manifest file is registered', () => {
    expect(allBoards.map((b) => `${b.id}.json`).sort()).toEqual([...files].sort());
  });

  it('rejects a manifest that breaks the schema', () => {
    const broken = {
      ...allBoards[0],
      usb: [{ vendorId: '10c4', productId: '0xEA60', bridge: 'cp210x' }],
    };
    expect(validate(broken)).toBe(false);
  });

  it('has unique ids', () => {
    const ids = allBoards.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('registry', () => {
  it('hides test-only boards from users', () => {
    expect(boards.some((b) => b.testOnly)).toBe(false);
    expect(getBoard('test-board')).toBeUndefined();
    expect(getBoard('test-board', { includeTest: true })?.flash.protocol).toBe('mock-echo');
    expect(getBoard('aries-v3')?.vendor).toBe('C-DAC');
  });

  it('groups boards by family and searches them', () => {
    expect(boardsByFamily(allBoards).map((f) => f.family)).toEqual(['vega-thejas32', 'test']);
    expect(searchBoards('cdac aries').map((b) => b.id)).toEqual(['aries-v3']);
    expect(searchBoards('esp32')).toEqual([]);
    expect(searchBoards('C-DAC thejas').map((b) => b.id)).toEqual(['aries-v3']);
    expect(searchBoards('MOCK', allBoards).map((b) => b.id)).toEqual(['test-board']);
  });

  it('finds candidate boards from a plugged-in USB device', () => {
    expect(boardsForUsbDevice(0x10c4, 0xea60).map((b) => b.id)).toEqual(['aries-v3']);
    expect(boardsForUsbDevice(0x1209, 0x0001)).toEqual([]);
    expect(boardsForUsbDevice(0x1209, 0x0001, allBoards).map((b) => b.id)).toEqual(['test-board']);
  });
});

describe('fqbnFor', () => {
  it('appends the mode’s board-menu options', () => {
    const board = getBoard('aries-v3')!;
    expect(fqbnFor(board, 'ram')).toBe('vega:riscv:aries_v3:upload_method=xmodemMethod');
    expect(fqbnFor(board, 'persistent')).toBe('vega:riscv:aries_v3:upload_method=serialMethod');
    expect(fqbnFor(getBoard('test-board', { includeTest: true })!, 'ram')).toBe('test:mock:board');
    expect(() => fqbnFor(board, 'nope')).toThrow(/no flash mode/);
  });
});
