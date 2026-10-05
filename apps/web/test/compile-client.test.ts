import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileOnServer } from '../src/compile/client.ts';

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
  it('compiles on one request and decodes the binary', async () => {
    const fetchMock = serve({
      '/api/build': [
        () =>
          json({
            ok: true,
            diagnostics: [],
            log: '',
            durationMs: 5,
            artifact: { size: 3, sha256: 'x', base64: 'AQID' },
          }),
      ],
    });
    const r = await compileOnServer(req);
    expect([...r.binary!]).toEqual([1, 2, 3]);
    expect(r.outcome).toMatchObject({ ok: true, artifact: { size: 3, sha256: 'x' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns compile errors as an outcome without a binary', async () => {
    serve({
      '/api/build': [
        () =>
          json({
            ok: false,
            diagnostics: [{ file: 'a.ino', line: 2, column: 1, severity: 'error', message: 'x' }],
            log: 'x',
            durationMs: 1,
          }),
      ],
    });
    const r = await compileOnServer(req);
    expect(r.binary).toBeUndefined();
    expect(r.outcome.diagnostics[0]!.line).toBe(2);
  });

  it.each([
    ['validation error', json({ error: 'Unknown board "x".' }, 400), /Unknown board/],
    ['rate limit', json({ error: 'Wait a minute' }, 429), /Wait a minute/],
    ['server failure', json({ error: 'Please try again.' }, 503), /try again/],
    ['proxy error page', new Response('<html>502</html>', { status: 502 }), /compile server/],
  ])('explains a %s', async (_, response, message) => {
    serve({ '/api/build': [() => response] });
    await expect(compileOnServer(req)).rejects.toThrow(message);
  });

  it('sends the signed-in user’s token to the compile server', async () => {
    const fetchMock = serve({
      '/api/build': [() => json({ error: 'Sign in to compile and upload your code.' }, 401)],
    });
    await expect(
      compileOnServer(req, { baseUrl: 'https://compile.example', token: 'tok' }),
    ).rejects.toThrow(/Sign in/);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://compile.example/api/build');
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
