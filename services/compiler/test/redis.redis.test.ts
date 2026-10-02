// BullMQ queue + Redis stores against a real Redis. Run with:
//   docker run -d --rm -p 6390:6379 --name ctc-redis-test redis:7-alpine
//   REDIS_TEST_URL=redis://127.0.0.1:6390 pnpm --filter @codetochip/compiler test:redis
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { BullJobQueue, connectRedis, RedisArtifactStore, RedisResultCache } from '../src/redis.ts';
import { CompileService } from '../src/service.ts';
import { blink, FakeAdapter } from './helpers.ts';

const url = process.env.REDIS_TEST_URL;

describe.skipIf(!url)('compile service on Redis (separate API and worker processes)', () => {
  const redis = url ? connectRedis(url) : null!;
  afterAll(async () => {
    await redis?.flushdb();
    redis?.disconnect();
  });

  it('an API process enqueues; a worker process compiles; the API serves the result', async () => {
    await redis.flushdb();
    const adapter = new FakeAdapter();
    const deps = () => ({
      adapter,
      artifacts: new RedisArtifactStore(redis),
      cache: new RedisResultCache(redis),
    });
    // Two services sharing only Redis, like two processes would.
    const apiQueue = new BullJobQueue(redis);
    const api = new CompileService({ queue: apiQueue, ...deps() });
    const workerQueue = new BullJobQueue(redis.duplicate());
    const worker = new CompileService({ queue: workerQueue, ...deps() });

    const app = buildApp(api);
    let release!: () => void;
    adapter.gate = new Promise((r) => (release = r));
    workerQueue.start(worker.process, 1);

    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/compile',
        payload: blink(`// ${i}\nvoid setup(){}`),
      });
      expect(r.statusCode).toBe(202);
      ids.push(r.json<{ jobId: string }>().jobId);
    }
    await new Promise((r) => setTimeout(r, 300));
    const queued = await Promise.all(
      ids.map(async (id) => (await app.inject({ url: `/api/compile/${id}` })).json()),
    );
    expect(queued.map((s) => [s.state, s.position])).toEqual([
      ['running', undefined],
      ['queued', 0],
      ['queued', 1],
    ]);

    release();
    let last: { state: string; outcome?: { artifact?: { url: string } } } = { state: 'queued' };
    for (let i = 0; i < 100 && last.state !== 'succeeded'; i++) {
      last = (await app.inject({ url: `/api/compile/${ids[2]}` })).json();
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(last.state).toBe('succeeded');
    const art = await app.inject({ url: last.outcome!.artifact!.url });
    expect(art.statusCode).toBe(200);
    expect(
      await redis.ttl(`artifact:${last.outcome!.artifact!.url.split('/').pop()}`),
    ).toBeGreaterThan(3500);

    // Cached on Redis: the API answers without the worker.
    const again = await app.inject({
      method: 'POST',
      url: '/api/compile',
      payload: blink('// 2\nvoid setup(){}'),
    });
    expect(again.json()).toMatchObject({ cached: true });
    expect(adapter.calls).toHaveLength(3);

    await app.close();
    await workerQueue.close();
    await apiQueue.close();
  }, 30_000);
});
