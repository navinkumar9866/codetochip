import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { parseDiagnostics, sanitizeLog } from '../diagnostics.ts';
import { createTar } from '../tar.ts';
import type { CompileJob, CompileResult, ToolchainAdapter } from '../types.ts';

export interface SandboxConfig {
  /** Worker image with arduino-cli and the cores baked in (workers/arduino-cli/Dockerfile). */
  image: string;
  memory: string;
  cpus: number;
  pidsLimit: number;
  tmpfsSize: string;
  /** Wall-clock limit for the whole container, including start-up. */
  timeoutMs: number;
  /** 'runsc' (gVisor) in production. Not available on Docker Desktop. */
  runtime?: string;
  dockerBin: string;
}

export const defaultSandbox: SandboxConfig = {
  image: 'codetochip/worker-arduino',
  // 512 MB OOM-killed a full core build under emulation (ADR 0003); sketch-only builds need far less.
  memory: '1g',
  cpus: 1,
  pidsLimit: 128,
  tmpfsSize: '64m',
  timeoutMs: 60_000,
  dockerBin: 'docker',
};

/** Exit codes from the container script. */
const EXIT = { badInput: 3, timeout: 124, killed: 137 } as const;
const MAX_STDOUT = 8 * 1024 * 1024;
const MAX_STDERR = 1024 * 1024;

// Runs inside the container. $1 = sketch name, $2 = FQBN. Sources arrive as a tar on stdin;
// the .bin leaves as base64 on stdout; compiler output goes to stderr.
const SCRIPT = `
set -uo pipefail
export TMPDIR=/work/tmp
mkdir -p "/work/$1" /work/out /work/tmp
cp -r /opt/arduino/core-cache /work/cache
tar -x -C "/work/$1" || { echo "Could not read the sketch files." >&2; exit ${EXIT.badInput}; }
# Capture separately: the linker's stderr and arduino-cli's stdout interleave mid-line otherwise.
timeout 50 arduino-cli compile --no-color --warnings default --fqbn "$2" --output-dir /work/out "/work/$1" >/work/cli.out 2>/work/cli.err
code=$?
cat /work/cli.err /work/cli.out >&2
if [ $code -eq 0 ]; then base64 -w0 "/work/out/$1.ino.bin"; fi
exit $code
`;

/**
 * docker run arguments for one sandboxed container: docs/PLAN.md 2.2, verified in ADR 0003.
 * `entry` is the command run inside (bash + arguments). Tests reuse this to probe the sandbox.
 */
export function sandboxArgs(cfg: SandboxConfig, name: string, entry: string[]): string[] {
  return [
    'run',
    '--rm',
    '-i',
    '--name',
    name,
    '--platform',
    'linux/amd64',
    '--network',
    'none',
    '--read-only',
    '--tmpfs',
    `/work:rw,exec,size=${cfg.tmpfsSize},uid=10001,gid=10001`,
    '--memory',
    cfg.memory,
    '--memory-swap',
    cfg.memory,
    '--cpus',
    String(cfg.cpus),
    '--pids-limit',
    String(cfg.pidsLimit),
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--user',
    '10001:10001',
    ...(cfg.runtime ? ['--runtime', cfg.runtime] : []),
    '--entrypoint',
    'bash',
    cfg.image,
    ...entry,
  ];
}

/** The in-container command for compiling one job. */
export const compileEntry = (job: CompileJob) => ['-c', SCRIPT, '_', job.sketch, job.fqbn];

export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export type ProcessRunner = (
  args: string[],
  stdin: Uint8Array,
  opts: { timeoutMs: number; name: string; signal?: AbortSignal },
) => Promise<ProcessResult>;

export class ArduinoCliAdapter implements ToolchainAdapter {
  readonly kind = 'arduino-cli';

  constructor(
    private readonly cfg: SandboxConfig = defaultSandbox,
    private readonly run: ProcessRunner = dockerRunner(cfg.dockerBin),
  ) {}

  async compile(job: CompileJob, signal?: AbortSignal): Promise<CompileResult> {
    const started = Date.now();
    const name = `ctc-compile-${randomUUID()}`;
    const r = await this.run(sandboxArgs(this.cfg, name, compileEntry(job)), createTar(job.files), {
      timeoutMs: this.cfg.timeoutMs,
      name,
      ...(signal && { signal }),
    });
    const log = sanitizeLog(r.stderr, job.sketch);
    const diagnostics = parseDiagnostics(log);
    const durationMs = Date.now() - started;

    if (r.code === 0 && !r.timedOut) {
      return {
        ok: true,
        binary: Buffer.from(r.stdout.trim(), 'base64'),
        diagnostics,
        log,
        durationMs,
      };
    }
    const reason =
      r.timedOut || r.code === EXIT.timeout
        ? 'Compiling took too long and was stopped. Simplify the sketch or try again.'
        : r.code === EXIT.killed
          ? 'The compiler ran out of memory. Simplify the sketch or try again.'
          : r.code === EXIT.badInput
            ? 'The sketch files could not be read. Try again.'
            : diagnostics.length
              ? null
              : 'The build failed. See the compiler output for details.';
    return {
      ok: false,
      diagnostics,
      log: reason ? `${log}\n${reason}`.trim() : log,
      durationMs,
    };
  }
}

/** Spawns docker; enforces the wall-clock limit by killing the named container. */
export function dockerRunner(dockerBin: string): ProcessRunner {
  return (args, stdin, { timeoutMs, name, signal }) =>
    new Promise((resolve, reject) => {
      const child = spawn(dockerBin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const kill = () =>
        spawn(dockerBin, ['kill', name], { stdio: 'ignore' }).on('error', () => {});
      const timer = setTimeout(() => {
        timedOut = true;
        kill();
      }, timeoutMs);
      const onAbort = () => kill();
      signal?.addEventListener('abort', onAbort, { once: true });

      child.stdout.setEncoding('utf8').on('data', (d: string) => {
        if (stdout.length < MAX_STDOUT) stdout += d;
      });
      child.stderr.setEncoding('utf8').on('data', (d: string) => {
        if (stderr.length < MAX_STDERR) stderr += d;
      });
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(
          new Error(`Could not start the compiler sandbox (${e.message}). Is Docker running?`),
        );
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve({ code: code ?? 1, stdout, stderr, timedOut });
      });
      child.stdin.on('error', () => {}); // container may exit before reading all input
      child.stdin.end(stdin);
    });
}
