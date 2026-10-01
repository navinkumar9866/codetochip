import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';

const app = buildApp();
afterAll(() => app.close());

describe('compiler API', () => {
  it('reports health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('lists boards from the registry', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/boards' });
    expect(res.statusCode).toBe(200);
    expect(res.json<unknown[]>().length).toBeGreaterThan(0);
  });
});
