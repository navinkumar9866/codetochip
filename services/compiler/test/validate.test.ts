import { describe, expect, it } from 'vitest';
import { validateCompileRequest } from '../src/validate.ts';

const req = (files: { path: string; content: string }[], extra: object = {}) => ({
  board: 'aries-v3',
  mode: 'ram',
  files,
  ...extra,
});
const ino = (content = 'void setup(){}\nvoid loop(){}') => ({ path: 'blink.ino', content });
const error = (body: unknown) => {
  const v = validateCompileRequest(body);
  return v.ok ? null : v.error;
};

describe('validateCompileRequest', () => {
  it('resolves board, mode and FQBN from the manifest', () => {
    const v = validateCompileRequest(req([ino(), { path: 'lib/helper.h', content: '' }]));
    expect(v).toMatchObject({
      ok: true,
      job: {
        boardId: 'aries-v3',
        fqbn: 'vega:riscv:aries_v3:upload_method=xmodemMethod',
        coreVersion: '1.1.3',
        sketch: 'blink',
      },
    });
  });

  it.each([
    [null, /JSON body/],
    [{ board: 'aries-v3' }, /JSON body/],
    [req([ino()], { board: 'nope' }), /Unknown board/],
    [req([ino()], { board: 'test-board' }), /Unknown board/],
    [req([ino()], { mode: 'turbo' }), /no mode "turbo"/],
    [req([{ path: 'blink.ino' }] as never), /path and content/],
    [req([]), /at least one file/],
    [req([{ path: 'a.h', content: '' }]), /exactly one \.ino/],
    [req([ino(), { path: 'two.ino', content: '' }]), /exactly one \.ino/],
    [req([{ path: 'src/blink.ino', content: '' }]), /exactly one \.ino/],
    [req([{ path: 'my sketch.ino', content: '' }]), /letters, numbers/],
    [req([ino(), ino()]), /same name/],
    [req([ino(), { path: 'evil.sh', content: '' }]), /Allowed file types/],
    [req([ino('x'.repeat(300 * 1024))]), /too large/],
  ])('rejects %#', (body, message) => {
    expect(error(body)).toMatch(message);
  });

  it.each([
    '#include "/etc/passwd"',
    '#include </etc/passwd>',
    '  #  include "../secret.h"',
    '#include <../../x.h>',
    '#include "lib/../../x.h"',
    '#include "~/.ssh/id_rsa"',
    '#include "C:\\\\Windows\\\\win.ini"',
  ])('rejects an include outside the sketch: %s', (line) => {
    expect(error(req([ino(`${line}\nvoid setup(){}`)]))).toMatch(/outside the sketch/);
  });

  it.each([
    '#include <Wire.h>',
    '#include "helper.h"',
    '#include "lib/helper.h"',
    '#include <SPI.h> // ../x',
  ])('allows %s', (line) => {
    expect(error(req([ino(`${line}\nvoid setup(){}`)]))).toBeNull();
  });

  it('rejects .incbin, which could embed files', () => {
    expect(error(req([ino('asm(".incbin \\"x\\"");')]))).toMatch(/incbin/);
  });
});
