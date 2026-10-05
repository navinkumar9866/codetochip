import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
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
  /**
   * 'container' (default): each job runs in its own locked-down Docker container.
   * 'instance': the job runs directly in this container, which must itself be the sandbox:
   * a Cloud Run instance in gVisor with no internet, serving one compile at a time (ADR 0005).
   */
  isolation?: 'container' | 'instance';
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
    private readonly run: ProcessRunner = cfg.isolation === 'instance'
      ? instanceRunner()
      : dockerRunner(cfg.dockerBin),
  ) {}

  async compile(job: CompileJob, signal?: AbortSignal): Promise<CompileResult> {
    const started = Date.now();
    const name = `ctc-compile-${randomUUID()}`;
    const args =
      this.cfg.isolation === 'instance'
        ? compileEntry(job)
        : sandboxArgs(this.cfg, name, compileEntry(job));
    const r = await this.run(args, createTar(job.files), {
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

/**
 * Runs the job's bash command right here, one job at a time, in an emptied `workDir`. Only for
 * a container that is itself the sandbox (`isolation: 'instance'`). The job sees only the
 * toolchain's environment variables, and the whole process group is killed at the time limit.
 */
export function instanceRunner(workDir = '/work'): ProcessRunner {
  const keep = ['PATH', 'HOME', 'LANG'];
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => keep.includes(k) || k.startsWith('ARDUINO_')),
  );
  const empty = async () => {
    await mkdir(workDir, { recursive: true });
    for (const f of await readdir(workDir)) {
      await rm(join(workDir, f), { recursive: true, force: true });
    }
  };
  let last: Promise<unknown> = Promise.resolve();
  return (args, stdin, opts) => {
    const job = last.then(async () => {
      await empty();
      try {
        return await spawnCapped('bash', args, stdin, opts, { env, cwd: workDir, group: true });
      } finally {
        await empty();
      }
    });
    last = job.catch(() => {});
    return job;
  };
}

/** Spawns docker; enforces the wall-clock limit by killing the named container. */
export function dockerRunner(dockerBin: string): ProcessRunner {
  return (args, stdin, opts) =>
    spawnCapped(dockerBin, args, stdin, opts, {
      kill: () => spawn(dockerBin, ['kill', opts.name], { stdio: 'ignore' }).on('error', () => {}),
    });
}

/** Runs a process with capped output, killing it at the time limit or when aborted. */
function spawnCapped(
  bin: string,
  args: string[],
  stdin: Uint8Array,
  { timeoutMs, signal }: { timeoutMs: number; signal?: AbortSignal },
  how: {
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    /** Run in its own process group, so the time limit kills the compiler's children too. */
    group?: boolean;
    kill?: () => void;
  },
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(how.env && { env: how.env }),
      ...(how.cwd && { cwd: how.cwd }),
      detached: !!how.group,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const kill =
      how.kill ??
      (() => {
        try {
          if (child.pid) process.kill(-child.pid, 'SIGKILL');
        } catch {
          // already gone
        }
      });
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
      reject(new Error(`Could not start the compiler sandbox (${e.message}). Is Docker running?`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ code: code ?? 1, stdout, stderr, timedOut });
    });
    child.stdin.on('error', () => {}); // the job may exit before reading all input
    child.stdin.end(stdin);
  });
}
