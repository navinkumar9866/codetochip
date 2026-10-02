import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_LOG_BYTES, parseDiagnostics, sanitizeLog } from '../src/diagnostics.ts';

// Real output from the sandboxed VEGA toolchain (Phase 2), including colour codes.
const real = readFileSync(new URL('./fixtures/arduino-cli-errors.log', import.meta.url), 'utf8');

describe('sanitizeLog + parseDiagnostics on real compiler output', () => {
  const log = sanitizeLog(real, 'broken');

  it('removes colour codes and sandbox/toolchain paths', () => {
    expect(log.includes('\u001b')).toBe(false);
    expect(log).not.toContain('/work/');
    expect(log).not.toContain('/opt/arduino');
    expect(log).toContain('broken.ino:2:31: error');
  });

  it('extracts file, line, column, severity and message', () => {
    expect(parseDiagnostics(log)).toEqual([
      {
        file: 'broken.ino',
        line: 2,
        column: 31,
        severity: 'error',
        message: "expected ';' before '}' token",
      },
      {
        file: 'broken.ino',
        line: 6,
        column: 3,
        severity: 'error',
        message: "'undefinedThing' was not declared in this scope",
      },
    ]);
  });

  it('handles warnings, notes, fatal errors and other build paths', () => {
    const raw = [
      '/work/s/lib/a.h:3:9: warning: unused variable',
      '/work/s/s.ino:1:1: note: here',
      '/work/s/s.ino:4:10: fatal error: nope.h: No such file or directory',
      '/work/cache/sketches/ABC/x.cpp:1:1: error: in generated code',
    ].join('\n');
    expect(parseDiagnostics(sanitizeLog(raw, 's'))).toEqual([
      { file: 'lib/a.h', line: 3, column: 9, severity: 'warning', message: 'unused variable' },
      { file: 's.ino', line: 1, column: 1, severity: 'note', message: 'here' },
      {
        file: 's.ino',
        line: 4,
        column: 10,
        severity: 'error',
        message: 'nope.h: No such file or directory',
      },
      { file: '<build>', line: 1, column: 1, severity: 'error', message: 'in generated code' },
    ]);
  });

  it('caps huge output', () => {
    const out = sanitizeLog('x'.repeat(MAX_LOG_BYTES * 2), 's');
    expect(out.length).toBeLessThan(MAX_LOG_BYTES + 100);
    expect(out).toMatch(/truncated/);
  });
});
