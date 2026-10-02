import { randomUUID } from 'node:crypto';
import type { CompileJob, Diagnostic } from './types.ts';

/** What a finished job reports. `ok: false` with diagnostics is a normal compile error. */
export interface JobOutcome {
  ok: boolean;
  artifact?: { id: string; size: number; sha256: string; expiresAt: string };
  diagnostics: Diagnostic[];
  log: string;
  durationMs: number;
  cached?: boolean;
}

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed';

export interface JobStatus {
  id: string;
  state: JobState;
  /** Jobs ahead of this one (0 = next). Only while queued. */
  position?: number;
  outcome?: JobOutcome;
  /** Infrastructure failure (not a compile error), worded for users. */
  error?: string;
}

export type JobHandler = (job: CompileJob) => Promise<JobOutcome>;

export interface JobQueue {
  enqueue(job: CompileJob): Promise<{ id: string; position: number }>;
  status(id: string): Promise<JobStatus | null>;
  /** Start processing in this process. */
  start(handler: JobHandler, concurrency: number): void;
  close(): Promise<void>;
}

export interface ArtifactStore {
  put(bytes: Uint8Array, ttlSeconds: number): Promise<string>;
  get(id: string): Promise<Uint8Array | null>;
}

export interface ResultCache {
  get(key: string): Promise<JobOutcome | null>;
  set(key: string, outcome: JobOutcome, ttlSeconds: number): Promise<void>;
}

export const newId = () => randomUUID();

/** Single-process queue for development and tests (no Redis). */
export class InMemoryJobQueue implements JobQueue {
  private waiting: { id: string; job: CompileJob }[] = [];
  private states = new Map<string, JobStatus>();
  private handler: JobHandler | null = null;
  private running = 0;
  private concurrency = 1;
  private closed = false;

  constructor(private readonly keepMs = 60 * 60 * 1000) {}

  async enqueue(job: CompileJob) {
    const id = newId();
    this.waiting.push({ id, job });
    this.states.set(id, { id, state: 'queued' });
    const position = this.waiting.length - 1;
    queueMicrotask(() => this.pump());
    return { id, position };
  }

  async status(id: string): Promise<JobStatus | null> {
    const s = this.states.get(id);
    if (!s) return null;
    if (s.state !== 'queued') return s;
    return { ...s, position: this.waiting.findIndex((w) => w.id === id) };
  }

  start(handler: JobHandler, concurrency: number) {
    this.handler = handler;
    this.concurrency = concurrency;
    this.pump();
  }

  private pump() {
    while (!this.closed && this.handler && this.running < this.concurrency && this.waiting.length) {
      const { id, job } = this.waiting.shift()!;
      this.running++;
      this.states.set(id, { id, state: 'running' });
      this.handler(job)
        .then(
          (outcome) => this.states.set(id, { id, state: 'succeeded', outcome }),
          () =>
            this.states.set(id, {
              id,
              state: 'failed',
              error: 'The compile server had a problem. Please try again.',
            }),
        )
        .finally(() => {
          this.running--;
          setTimeout(() => this.states.delete(id), this.keepMs).unref?.();
          this.pump();
        });
    }
  }

  async close() {
    this.closed = true;
  }
}

export class InMemoryArtifactStore implements ArtifactStore {
  private items = new Map<string, { bytes: Uint8Array; expires: number }>();
  async put(bytes: Uint8Array, ttlSeconds: number) {
    const id = newId();
    this.items.set(id, { bytes, expires: Date.now() + ttlSeconds * 1000 });
    return id;
  }
  async get(id: string) {
    const item = this.items.get(id);
    if (!item || item.expires < Date.now()) {
      this.items.delete(id);
      return null;
    }
    return item.bytes;
  }
}

export class InMemoryResultCache implements ResultCache {
  private items = new Map<string, { outcome: JobOutcome; expires: number }>();
  constructor(private readonly maxEntries = 1000) {}
  async get(key: string) {
    const item = this.items.get(key);
    if (!item || item.expires < Date.now()) return null;
    return item.outcome;
  }
  async set(key: string, outcome: JobOutcome, ttlSeconds: number) {
    if (this.items.size >= this.maxEntries) {
      this.items.delete(this.items.keys().next().value!);
    }
    this.items.set(key, { outcome, expires: Date.now() + ttlSeconds * 1000 });
  }
}
