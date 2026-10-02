import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { blink, createTestService } from './helpers.ts';

const apps: ReturnType<typeof buildApp>[] = [];
const setup = (opts: { concurrency?: number; compilesPerMinute?: number } = {}) => {
  const t = createTestService(opts.concurrency);
  const app = buildApp(t.service, { compilesPerMinute: opts.compilesPerMinute ?? 1000 });
  apps.push(app);
  return { ...t, app };
};
afterEach(async () => {
  for (const a of apps.splice(0)) await a.close();
});

type Status = {
  state: string;
  position?: number;
  error?: string;
  outcome?: Record<string, unknown> & { artifact?: { url: string; size: number } };
};

async function waitDone(app: ReturnType<typeof buildApp>, id: string): Promise<Status> {
  for (let i = 0; i < 100; i++) {
    const s = (await app.inject({ method: 'GET', url: `/api/compile/${id}` })).json<Status>();
    if (s.state === 'succeeded' || s.state === 'failed') return s;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('job never finished');
}

describe('compile API', () => {
  it('reports health and lists only user-visible boards', async () => {
    const { app } = setup();
    expect((await app.inject({ url: '/health' })).json()).toEqual({ ok: true });
    const ids = (await app.inject({ url: '/api/boards' }))
      .json<{ id: string }[]>()
      .map((b) => b.id);
    expect(ids).toContain('aries-v3');
    expect(ids).not.toContain('test-board');
  });

  it('compiles, reports status and serves the artifact', async () => {
    const { app } = setup();
    const post = await app.inject({ method: 'POST', url: '/api/compile', payload: blink() });
    expect(post.statusCode).toBe(202);
    const { jobId, cached } = post.json<{ jobId: string; cached: boolean }>();
    expect(cached).toBe(false);
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/); // random, not guessable

    const done = await waitDone(app, jobId);
    expect(done).toMatchObject({ state: 'succeeded', outcome: { ok: true, diagnostics: [] } });
    const art = await app.inject({ url: done.outcome!.artifact!.url });
    expect(art.statusCode).toBe(200);
    expect(art.headers['content-type']).toBe('application/octet-stream');
    expect(art.body).toBe(
      `bin:vega:riscv:aries_v3:upload_method=xmodemMethod:${blink().files[0]!.content.length}`,
    );
    expect(done.outcome!.artifact!.size).toBe(art.rawPayload.length);
  });

  it('returns identical sources from the cache without compiling again', async () => {
    const { app, adapter } = setup();
    const first = (
      await app.inject({ method: 'POST', url: '/api/compile', payload: blink() })
    ).json<{ jobId: string }>();
    await waitDone(app, first.jobId);
    const again = await app.inject({ method: 'POST', url: '/api/compile', payload: blink() });
    expect(again.json()).toMatchObject({ cached: true, position: 0 });
    const s = await waitDone(app, again.json<{ jobId: string }>().jobId);
    expect(s.outcome).toMatchObject({ ok: true, cached: true });
    expect(adapter.calls).toHaveLength(1);
    // A different mode is a different build (different linker script).
    await app.inject({
      method: 'POST',
      url: '/api/compile',
      payload: { ...blink(), mode: 'persistent' },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(adapter.calls).toHaveLength(2);
  });

  it('returns compile errors as diagnostics, not as a failed request', async () => {
    const { app } = setup();
    const { jobId } = (
      await app.inject({ method: 'POST', url: '/api/compile', payload: blink('ERROR') })
    ).json<{ jobId: string }>();
    const s = await waitDone(app, jobId);
    expect(s).toMatchObject({
      state: 'succeeded',
      outcome: { ok: false, diagnostics: [{ line: 1, severity: 'error' }] },
    });
    expect(s.outcome!.artifact).toBeUndefined();
  });

  it('shows queue position while waiting', async () => {
    const { app, adapter } = setup({ concurrency: 1 });
    let release!: () => void;
    adapter.gate = new Promise((r) => (release = r));
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/compile',
        payload: blink(`// ${i}\nvoid setup(){}\nvoid loop(){}`),
      });
      ids.push(r.json<{ jobId: string }>().jobId);
    }
    await new Promise((r) => setTimeout(r, 10));
    const states = await Promise.all(
      ids.map(async (id) => (await app.inject({ url: `/api/compile/${id}` })).json<Status>()),
    );
    expect(states.map((s) => [s.state, s.position])).toEqual([
      ['running', undefined],
      ['queued', 0],
      ['queued', 1],
    ]);
    release();
    await waitDone(app, ids[2]!);
  });

  it('reports a server-side failure in plain words', async () => {
    const { app, adapter } = setup();
    adapter.crash = true;
    const { jobId } = (
      await app.inject({ method: 'POST', url: '/api/compile', payload: blink() })
    ).json<{ jobId: string }>();
    expect(await waitDone(app, jobId)).toMatchObject({ state: 'failed', error: /try again/ });
  });

  it('rejects invalid requests with a message, and unknown ids with 404', async () => {
    const { app } = setup();
    const bad = await app.inject({
      method: 'POST',
      url: '/api/compile',
      payload: { ...blink(), board: 'nope' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: expect.stringMatching(/Unknown board/) });
    expect((await app.inject({ url: '/api/compile/nope' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/compile/c_nope' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/artifacts/nope' })).json()).toEqual({
      error: expect.stringMatching(/expired/),
    });
  });

  it('rate-limits compile requests per IP', async () => {
    const { app } = setup({ compilesPerMinute: 2 });
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) {
      codes.push(
        (await app.inject({ method: 'POST', url: '/api/compile', payload: blink(`// ${i}`) }))
          .statusCode,
      );
    }
    expect(codes).toEqual([202, 202, 429]);
    const limited = await app.inject({ method: 'POST', url: '/api/compile', payload: blink() });
    expect(limited.json()).toMatchObject({ error: expect.stringMatching(/Wait a minute/) });
  });
});
