import type { ProjectFile } from '@codetochip/data';

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'note';
  message: string;
}

export interface CompileOutcome {
  ok: boolean;
  diagnostics: Diagnostic[];
  log: string;
  durationMs: number;
  cached?: boolean;
  artifact?: { url: string; size: number; sha256: string; expiresAt: string };
}

export type CompileProgress =
  { state: 'submitting' } | { state: 'queued'; position: number } | { state: 'running' };

export interface CompileResult {
  outcome: CompileOutcome;
  /** The .bin, when compiling succeeded. */
  binary?: Uint8Array;
}

interface Status {
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  position?: number;
  outcome?: CompileOutcome;
  error?: string;
}

const OFFLINE = 'Can’t reach the compile server. Check your internet connection, then try again.';

/** Compiles on the server (services/compiler) and downloads the result. */
export async function compileOnServer(
  req: { board: string; mode: string; files: ProjectFile[] },
  opts: {
    onProgress?: (p: CompileProgress) => void;
    signal?: AbortSignal;
    baseUrl?: string;
    pollMs?: number;
    timeoutMs?: number;
  } = {},
): Promise<CompileResult> {
  const { onProgress, signal, baseUrl = '', pollMs = 400, timeoutMs = 120_000 } = opts;
  const request = async (path: string, init?: RequestInit) => {
    try {
      return await fetch(baseUrl + path, { ...init, ...(signal && { signal }) });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new Error(OFFLINE, { cause: e });
    }
  };

  onProgress?.({ state: 'submitting' });
  const res = await request('/api/compile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  const body = (await res.json().catch(() => ({}))) as {
    jobId?: string;
    position?: number;
    error?: string;
  };
  if (!res.ok || !body.jobId) throw new Error(body.error ?? OFFLINE);

  const deadline = Date.now() + timeoutMs;
  for (let first = true; ; first = false) {
    if (!first) await sleep(pollMs, signal);
    if (Date.now() > deadline) {
      throw new Error('The compile server is very busy. Please try again in a minute.');
    }
    const s = await request(`/api/compile/${body.jobId}`);
    const status = (await s.json().catch(() => ({}))) as Status & { error?: string };
    if (!s.ok) throw new Error(status.error ?? OFFLINE);
    if (status.state === 'failed') throw new Error(status.error ?? 'The build failed. Try again.');
    if (status.state === 'queued')
      onProgress?.({ state: 'queued', position: status.position ?? 0 });
    if (status.state === 'running') onProgress?.({ state: 'running' });
    if (status.state !== 'succeeded' || !status.outcome) continue;

    const outcome = status.outcome;
    if (!outcome.ok || !outcome.artifact) return { outcome };
    const art = await request(outcome.artifact.url);
    if (!art.ok) throw new Error('The build expired before it could be downloaded. Compile again.');
    return { outcome, binary: new Uint8Array(await art.arrayBuffer()) };
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(signal.reason);
      },
      { once: true },
    );
  });
