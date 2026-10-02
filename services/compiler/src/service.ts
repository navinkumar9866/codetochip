import { createHash } from 'node:crypto';
import type { ArtifactStore, JobOutcome, JobQueue, JobStatus, ResultCache } from './jobs.ts';
import type { CompileJob, ToolchainAdapter } from './types.ts';

export const ARTIFACT_TTL_SECONDS = 60 * 60;
const CACHE_PREFIX = 'c_';

/** Same toolchain, board options, core version and sources → same result (docs/PLAN.md 2.3). */
export function cacheKey(job: CompileJob): string {
  const files = [...job.files].sort((a, b) => a.path.localeCompare(b.path));
  return createHash('sha256')
    .update(
      JSON.stringify({ v: 1, t: job.toolchain, fqbn: job.fqbn, core: job.coreVersion, files }),
    )
    .digest('hex');
}

export class CompileService {
  constructor(
    private readonly deps: {
      queue: JobQueue;
      adapter: ToolchainAdapter;
      artifacts: ArtifactStore;
      cache: ResultCache;
    },
  ) {}

  /** Returns a cached result straight away if we built these exact sources recently. */
  async submit(job: CompileJob): Promise<{ id: string; position: number; cached: boolean }> {
    const key = cacheKey(job);
    const hit = await this.deps.cache.get(key);
    if (hit && (!hit.artifact || (await this.deps.artifacts.get(hit.artifact.id)))) {
      return { id: CACHE_PREFIX + key, position: 0, cached: true };
    }
    const { id, position } = await this.deps.queue.enqueue(job);
    return { id, position, cached: false };
  }

  async status(id: string): Promise<JobStatus | null> {
    if (id.startsWith(CACHE_PREFIX)) {
      const outcome = await this.deps.cache.get(id.slice(CACHE_PREFIX.length));
      return outcome ? { id, state: 'succeeded', outcome: { ...outcome, cached: true } } : null;
    }
    return this.deps.queue.status(id);
  }

  artifact(id: string): Promise<Uint8Array | null> {
    return this.deps.artifacts.get(id);
  }

  /** The worker's job handler. */
  readonly process = async (job: CompileJob): Promise<JobOutcome> => {
    const r = await this.deps.adapter.compile(job);
    const outcome: JobOutcome = {
      ok: r.ok,
      diagnostics: r.diagnostics,
      log: r.log,
      durationMs: r.durationMs,
    };
    if (r.ok && r.binary) {
      const id = await this.deps.artifacts.put(r.binary, ARTIFACT_TTL_SECONDS);
      outcome.artifact = {
        id,
        size: r.binary.length,
        sha256: createHash('sha256').update(r.binary).digest('hex'),
        expiresAt: new Date(Date.now() + ARTIFACT_TTL_SECONDS * 1000).toISOString(),
      };
    }
    // Cache successes and genuine compile errors; not timeouts or crashes, which may pass next time.
    if (r.ok || r.diagnostics.some((d) => d.severity === 'error')) {
      await this.deps.cache.set(cacheKey(job), outcome, ARTIFACT_TTL_SECONDS);
    }
    return outcome;
  };
}
