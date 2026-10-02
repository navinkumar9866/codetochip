// Real compiles and sandbox probes. Needs Docker and the worker image (pnpm worker:build).
// Run with: pnpm --filter @codetochip/compiler test:docker
import { userInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  ArduinoCliAdapter,
  defaultSandbox,
  dockerRunner,
  sandboxArgs,
} from '../src/toolchains/arduino-cli.ts';
import { validateCompileRequest } from '../src/validate.ts';

const enabled = !!process.env.DOCKER_TESTS;
const adapter = new ArduinoCliAdapter(defaultSandbox);
const run = dockerRunner(defaultSandbox.dockerBin);

const jobFor = (mode: string, content: string) => {
  const v = validateCompileRequest({
    board: 'aries-v3',
    mode,
    files: [{ path: 'sketch.ino', content }],
  });
  if (!v.ok) throw new Error(v.error);
  return v.job;
};
const BLINK =
  'void setup() { pinMode(LED_BUILTIN, OUTPUT); }\nvoid loop() { digitalWrite(LED_BUILTIN, HIGH); delay(500); digitalWrite(LED_BUILTIN, LOW); delay(500); }\n';

/** Runs a shell snippet inside the exact sandbox compiles use. */
const probe = (script: string) =>
  run(sandboxArgs(defaultSandbox, `ctc-probe-${Date.now()}`, ['-c', script]), new Uint8Array(), {
    timeoutMs: 30_000,
    name: `ctc-probe-${Date.now()}`,
  });

describe.skipIf(!enabled)('real compiles in the sandbox', () => {
  it('builds Blink for RAM in a few seconds', async () => {
    const r = await adapter.compile(jobFor('ram', BLINK));
    expect(r.log).not.toMatch(/error/i);
    expect(r.ok).toBe(true);
    expect(r.binary!.length).toBeGreaterThan(1000);
    // RAM builds start with the same startup code seen in Phase 0.2 (auipc gp, ...).
    expect([...r.binary!.subarray(0, 4)]).toEqual([0x97, 0x11, 0x00, 0x00]);
    expect(r.durationMs).toBeLessThan(15_000);
  }, 60_000);

  it('builds a different image for flash mode', async () => {
    const [ram, flash] = await Promise.all([
      adapter.compile(jobFor('ram', BLINK)),
      adapter.compile(jobFor('persistent', BLINK)),
    ]);
    expect(flash.ok).toBe(true);
    expect(Buffer.compare(Buffer.from(ram.binary!), Buffer.from(flash.binary!))).not.toBe(0);
  }, 60_000);

  it('returns compile errors with lines in the user’s own file', async () => {
    const r = await adapter.compile(
      jobFor('ram', 'void setup() {\n  nope();\n}\nvoid loop() {}\n'),
    );
    expect(r.ok).toBe(false);
    expect(r.diagnostics).toContainEqual(
      expect.objectContaining({ file: 'sketch.ino', line: 2, severity: 'error' }),
    );
    expect(r.log).not.toContain('/work/');
  }, 60_000);

  it('a macro-built #include can only ever see the container’s files, never the host’s', async () => {
    // The validator's include check is a usability guard; the sandbox is the real boundary.
    const job = jobFor(
      'ram',
      '#define F "/etc/passwd"\n#include F\nvoid setup(){}\nvoid loop(){}\n',
    );
    const r = await adapter.compile(job);
    expect(r.ok).toBe(false);
    expect(r.log).not.toContain(userInfo().username);
  }, 60_000);
});

describe.skipIf(!enabled)('sandbox probes (docs/PLAN.md 2.2)', () => {
  it('runs as an unprivileged user with no network', async () => {
    const r = await probe(
      'id -u; (exec 3<>/dev/tcp/1.1.1.1/443) 2>/dev/null && echo NET-OPEN || echo net-blocked; getent hosts example.com || echo dns-blocked',
    );
    expect(r.stdout).toContain('10001');
    expect(r.stdout).toContain('net-blocked');
    expect(r.stdout).toContain('dns-blocked');
  }, 60_000);

  it('cannot write the root filesystem or the toolchain, and /work is capped', async () => {
    const r = await probe(
      'touch /etc/x 2>/dev/null && echo ROOT-RW || echo root-ro; touch /opt/arduino/x 2>/dev/null && echo TOOL-RW || echo tool-ro; head -c 70m /dev/zero > /work/big 2>/dev/null && echo TMPFS-UNCAPPED || echo tmpfs-capped',
    );
    expect(r.stdout).toContain('root-ro');
    expect(r.stdout).toContain('tool-ro');
    expect(r.stdout).toContain('tmpfs-capped');
  }, 60_000);

  it('survives a fork bomb: the process limit stops it and the host is unaffected', async () => {
    const started = Date.now();
    const r = await probe('bomb() { bomb | bomb & }; bomb; sleep 2; echo survived');
    expect(Date.now() - started).toBeLessThan(30_000);
    expect(r.timedOut).toBe(false);
    const after = await probe('echo host-still-fine');
    expect(after.stdout).toContain('host-still-fine');
  }, 90_000);
});
