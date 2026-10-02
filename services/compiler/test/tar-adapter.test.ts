import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTar } from '../src/tar.ts';
import {
  ArduinoCliAdapter,
  defaultSandbox,
  type ProcessRunner,
} from '../src/toolchains/arduino-cli.ts';
import type { CompileJob } from '../src/types.ts';

describe('createTar', () => {
  it('produces an archive the system tar extracts byte-for-byte', () => {
    const files = [
      { path: 'blink.ino', content: 'void setup() {}\n// ünïcode ✓\n' },
      { path: 'lib/helper.h', content: 'x'.repeat(1000) },
      { path: 'empty.h', content: '' },
    ];
    const dir = mkdtempSync(join(tmpdir(), 'ctc-tar-'));
    writeFileSync(join(dir, 'in.tar'), createTar(files));
    execFileSync('tar', ['-x', '-f', 'in.tar'], { cwd: dir });
    for (const f of files) expect(readFileSync(join(dir, f.path), 'utf8')).toBe(f.content);
  });
});

const job: CompileJob = {
  boardId: 'aries-v3',
  mode: 'ram',
  toolchain: 'arduino-cli',
  fqbn: 'vega:riscv:aries_v3:upload_method=xmodemMethod',
  coreVersion: '1.1.3',
  sketch: 'blink',
  files: [{ path: 'blink.ino', content: 'void setup(){}' }],
};

const runner =
  (
    result: Partial<Awaited<ReturnType<ProcessRunner>>>,
    seen: { args?: string[]; stdin?: Uint8Array } = {},
  ): ProcessRunner =>
  async (args, stdin) => {
    seen.args = args;
    seen.stdin = stdin;
    return { code: 0, stdout: '', stderr: '', timedOut: false, ...result };
  };

describe('ArduinoCliAdapter', () => {
  it('runs the job in a locked-down container and decodes the binary', async () => {
    const seen: { args?: string[]; stdin?: Uint8Array } = {};
    const adapter = new ArduinoCliAdapter(
      { ...defaultSandbox, runtime: 'runsc' },
      runner({ stdout: Buffer.from([1, 2, 3]).toString('base64') }, seen),
    );
    const r = await adapter.compile(job);
    expect(r.ok).toBe(true);
    expect([...r.binary!]).toEqual([1, 2, 3]);

    const a = seen.args!.join(' ');
    for (const flag of [
      '--network none',
      '--read-only',
      '--cap-drop ALL',
      '--security-opt no-new-privileges',
      '--user 10001:10001',
      '--pids-limit 128',
      '--cpus 1',
      '--memory 1g',
      '--runtime runsc',
    ]) {
      expect(a).toContain(flag);
    }
    expect(a).not.toMatch(/ -v | --volume | --mount /); // no host paths
    expect(seen.args!.slice(-3)).toEqual(['_', 'blink', job.fqbn]);
    expect(new TextDecoder().decode(seen.stdin!.subarray(0, 9))).toBe('blink.ino');
  });

  it.each([
    [
      { code: 1, stderr: '/work/blink/blink.ino:1:5: error: boom' },
      /blink.ino:1:5: error: boom/,
      1,
    ],
    [{ code: 124 }, /took too long/, 0],
    [{ code: 0, timedOut: true }, /took too long/, 0],
    [{ code: 137 }, /out of memory/, 0],
    [{ code: 3 }, /could not be read/, 0],
    [{ code: 2, stderr: 'linker went away' }, /build failed/, 0],
  ])('reports failures in words a user can act on (%#)', async (result, message, diags) => {
    const r = await new ArduinoCliAdapter(defaultSandbox, runner(result)).compile(job);
    expect(r.ok).toBe(false);
    expect(r.log).toMatch(message);
    expect(r.diagnostics).toHaveLength(diags);
  });
});
