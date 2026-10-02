import { Job, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import {
  newId,
  type ArtifactStore,
  type JobHandler,
  type JobOutcome,
  type JobQueue,
  type JobStatus,
  type ResultCache,
} from './jobs.ts';
import type { CompileJob } from './types.ts';

const QUEUE = 'compile';
const KEEP_SECONDS = 60 * 60;

/** BullMQ on Redis: API and worker processes can run separately and scale out. */
export class BullJobQueue implements JobQueue {
  private readonly queue: Queue<CompileJob, JobOutcome>;
  private worker: Worker<CompileJob, JobOutcome> | null = null;

  constructor(private readonly connection: Redis) {
    this.queue = new Queue(QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: KEEP_SECONDS },
        removeOnFail: { age: KEEP_SECONDS },
      },
    });
  }

  async enqueue(job: CompileJob) {
    // Random ids: job results include users' code diagnostics, so ids must not be guessable.
    const added = await this.queue.add('compile', job, { jobId: newId() });
    const position = Math.max(0, (await this.queue.getWaitingCount()) - 1);
    return { id: added.id!, position };
  }

  async status(id: string): Promise<JobStatus | null> {
    const job = await Job.fromId<CompileJob, JobOutcome>(this.queue, id);
    if (!job) return null;
    const state = await job.getState();
    if (state === 'completed') return { id, state: 'succeeded', outcome: job.returnvalue };
    if (state === 'failed') {
      return { id, state: 'failed', error: 'The compile server had a problem. Please try again.' };
    }
    if (state === 'active') return { id, state: 'running' };
    // Oldest first (verified against Redis in test/redis.redis.test.ts).
    const waiting = await this.queue.getWaiting(0, -1);
    return {
      id,
      state: 'queued',
      position: Math.max(
        0,
        waiting.findIndex((j) => j.id === id),
      ),
    };
  }

  start(handler: JobHandler, concurrency: number) {
    this.worker = new Worker<CompileJob, JobOutcome>(QUEUE, (job) => handler(job.data), {
      connection: this.connection.duplicate({ maxRetriesPerRequest: null }),
      concurrency,
    });
  }

  async close() {
    await this.worker?.close();
    await this.queue.close();
  }
}

export class RedisArtifactStore implements ArtifactStore {
  constructor(private readonly redis: Redis) {}
  async put(bytes: Uint8Array, ttlSeconds: number) {
    const id = newId();
    await this.redis.set(`artifact:${id}`, Buffer.from(bytes), 'EX', ttlSeconds);
    return id;
  }
  async get(id: string) {
    const b = await this.redis.getBuffer(`artifact:${id}`);
    return b ? new Uint8Array(b) : null;
  }
}

export class RedisResultCache implements ResultCache {
  constructor(private readonly redis: Redis) {}
  async get(key: string) {
    const v = await this.redis.get(`result:${key}`);
    return v ? (JSON.parse(v) as JobOutcome) : null;
  }
  async set(key: string, outcome: JobOutcome, ttlSeconds: number) {
    await this.redis.set(`result:${key}`, JSON.stringify(outcome), 'EX', ttlSeconds);
  }
}

export function connectRedis(url: string): Redis {
  // BullMQ workers need maxRetriesPerRequest: null.
  return new Redis(url, { maxRetriesPerRequest: null });
}
