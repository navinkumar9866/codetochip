import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileOnServer, type CompileProgress } from '../src/compile/client.ts';

const req = { board: 'aries-v3', mode: 'ram', files: [{ path: 'a.ino', content: '' }] };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

function serve(responses: Record<string, (() => Response)[]>) {
  const fetchMock = vi.fn(async (url: string) => {
    const path = url.replace(/^.*?(\/api\/)/, '/api/');
    const next = responses[path]?.shift();
    if (!next) throw new Error(`unexpected request ${path}`);
    return next();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('compileOnServer', () => {
  it('submits, reports queue position, then downloads the binary', async () => {
    serve({
      '/api/compile': [() => json({ jobId: 'j1', position: 1 }, 202)],
      '/api/compile/j1': [
        () => json({ state: 'queued', position: 1 }),
        () => json({ state: 'running' }),
        () =>
          json({
            state: 'succeeded',
            outcome: {
              ok: true,
              diagnostics: [],
              log: '',
              durationMs: 5,
              artifact: { url: '/api/artifacts/a1', size: 3, sha256: 'x', expiresAt: '' },
            },
          }),
      ],
      '/api/artifacts/a1': [() => new Response(new Uint8Array([1, 2, 3]))],
    });
    const seen: CompileProgress[] = [];
    const r = await compileOnServer(req, { pollMs: 1, onProgress: (p) => seen.push(p) });
    expect([...r.binary!]).toEqual([1, 2, 3]);
    expect(seen).toEqual([
      { state: 'submitting' },
      { state: 'queued', position: 1 },
      { state: 'running' },
    ]);
  });

  it('returns compile errors as an outcome without a binary', async () => {
    serve({
      '/api/compile': [() => json({ jobId: 'j2' }, 202)],
      '/api/compile/j2': [
        () =>
          json({
            state: 'succeeded',
            outcome: {
              ok: false,
              diagnostics: [{ file: 'a.ino', line: 2, column: 1, severity: 'error', message: 'x' }],
              log: 'x',
              durationMs: 1,
            },
          }),
      ],
    });
    const r = await compileOnServer(req, { pollMs: 1 });
    expect(r.binary).toBeUndefined();
    expect(r.outcome.diagnostics[0]!.line).toBe(2);
  });

  it.each([
    [
      'validation error',
      { '/api/compile': [() => json({ error: 'Unknown board "x".' }, 400)] },
      /Unknown board/,
    ],
    [
      'rate limit',
      { '/api/compile': [() => json({ error: 'Wait a minute' }, 429)] },
      /Wait a minute/,
    ],
    [
      'server failure',
      {
        '/api/compile': [() => json({ jobId: 'j' }, 202)],
        '/api/compile/j': [() => json({ state: 'failed', error: 'Please try again.' })],
      },
      /try again/,
    ],
    [
      'expired job',
      {
        '/api/compile': [() => json({ jobId: 'j' }, 202)],
        '/api/compile/j': [() => json({ error: 'expired. Compile again.' }, 404)],
      },
      /Compile again/,
    ],
  ])('explains a %s', async (_, responses, message) => {
    serve(responses);
    await expect(compileOnServer(req, { pollMs: 1 })).rejects.toThrow(message);
  });

  it('sends the signed-in user’s token to the compile server', async () => {
    const fetchMock = serve({
      '/api/compile': [() => json({ error: 'Sign in to check and upload your code.' }, 401)],
    });
    await expect(
      compileOnServer(req, { baseUrl: 'https://compile.example', token: 'tok' }),
    ).rejects.toThrow(/Sign in/);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://compile.example/api/compile');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok');
  });

  it('explains when the server is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(compileOnServer(req)).rejects.toThrow(/internet connection/);
  });
});
