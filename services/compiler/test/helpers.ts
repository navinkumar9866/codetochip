import { InMemoryArtifactStore, InMemoryJobQueue, InMemoryResultCache } from '../src/jobs.ts';
import { CompileService } from '../src/service.ts';
import type { CompileJob, CompileResult, ToolchainAdapter } from '../src/types.ts';

/** A toolchain that "compiles" instantly; sketches containing ERROR fail like GCC would. */
export class FakeAdapter implements ToolchainAdapter {
  readonly kind = 'arduino-cli';
  calls: CompileJob[] = [];
  gate: Promise<void> | null = null;
  crash = false;

  async compile(job: CompileJob): Promise<CompileResult> {
    this.calls.push(job);
    await this.gate;
    if (this.crash) throw new Error('docker exploded');
    const main = job.files.find((f) => f.path.endsWith('.ino'))!;
    if (main.content.includes('ERROR')) {
      return {
        ok: false,
        diagnostics: [{ file: main.path, line: 1, column: 1, severity: 'error', message: 'boom' }],
        log: `${main.path}:1:1: error: boom`,
        durationMs: 5,
      };
    }
    return {
      ok: true,
      binary: new TextEncoder().encode(`bin:${job.fqbn}:${main.content.length}`),
      diagnostics: [],
      log: '',
      durationMs: 5,
    };
  }
}

export function createTestService(concurrency = 2) {
  const adapter = new FakeAdapter();
  const queue = new InMemoryJobQueue();
  const service = new CompileService({
    queue,
    adapter,
    artifacts: new InMemoryArtifactStore(),
    cache: new InMemoryResultCache(),
  });
  queue.start(service.process, concurrency);
  return { adapter, queue, service };
}

export const blink = (content = 'void setup() {}\nvoid loop() {}\n') => ({
  board: 'aries-v3',
  mode: 'ram',
  files: [{ path: 'blink.ino', content }],
});
