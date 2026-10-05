import { cpus } from 'node:os';
import {
  InMemoryArtifactStore,
  InMemoryJobQueue,
  InMemoryResultCache,
  type ArtifactStore,
  type JobQueue,
  type ResultCache,
} from './jobs.ts';
import { BullJobQueue, connectRedis, RedisArtifactStore, RedisResultCache } from './redis.ts';
import { CompileService } from './service.ts';
import { ArduinoCliAdapter, defaultSandbox } from './toolchains/arduino-cli.ts';

/**
 * Wires the service from environment variables:
 * - REDIS_URL: use BullMQ + Redis (API and workers can run as separate processes).
 *   Unset: single process, in-memory (local development).
 * - WORKER_CONCURRENCY: parallel compiles in this process (default: CPU count - 1).
 * - WORKER_IMAGE, SANDBOX_MEMORY, SANDBOX_RUNTIME (e.g. runsc): sandbox settings.
 * - SANDBOX_ISOLATION=instance: compile inside this container instead of starting one per job
 *   (Cloud Run, where the instance is the sandbox; deploy/cloud-run).
 */
export function createRuntime(env: NodeJS.ProcessEnv = process.env) {
  const redis = env.REDIS_URL ? connectRedis(env.REDIS_URL) : null;
  const queue: JobQueue = redis ? new BullJobQueue(redis) : new InMemoryJobQueue();
  const artifacts: ArtifactStore = redis
    ? new RedisArtifactStore(redis)
    : new InMemoryArtifactStore();
  const cache: ResultCache = redis ? new RedisResultCache(redis) : new InMemoryResultCache();
  const adapter = new ArduinoCliAdapter({
    ...defaultSandbox,
    ...(env.WORKER_IMAGE && { image: env.WORKER_IMAGE }),
    ...(env.SANDBOX_MEMORY && { memory: env.SANDBOX_MEMORY }),
    ...(env.SANDBOX_RUNTIME && { runtime: env.SANDBOX_RUNTIME }),
    ...(env.SANDBOX_ISOLATION === 'instance' && { isolation: 'instance' as const }),
  });
  const service = new CompileService({ queue, adapter, artifacts, cache });
  const concurrency = Number(env.WORKER_CONCURRENCY) || Math.max(1, cpus().length - 1);

  return {
    service,
    distributed: !!redis,
    startWorker: () => queue.start(service.process, concurrency),
    concurrency,
    async close() {
      await queue.close();
      redis?.disconnect();
    },
  };
}
