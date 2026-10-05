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
  artifact?: { size: number; sha256: string };
}

export interface CompileResult {
  outcome: CompileOutcome;
  /** The .bin, when compiling succeeded. */
  binary?: Uint8Array;
}

const OFFLINE = 'Can’t reach the compile server. Check your internet connection, then try again.';

/**
 * Where the compile API lives. Empty means this site's own /api (Vite proxies it in dev); the
 * hosted app sets VITE_COMPILE_URL to the compile VM (ADR 0005).
 */
const COMPILE_URL = (import.meta.env.VITE_COMPILE_URL ?? '').replace(/\/+$/, '');

/** The hosted compile server only serves signed-in users (guests can't compile there). */
export const compileNeedsSignIn = COMPILE_URL !== '';

/** Compiles on the server (services/compiler) and returns the result with the .bin. */
export async function compileOnServer(
  req: { board: string; mode: string; files: ProjectFile[] },
  opts: {
    signal?: AbortSignal;
    baseUrl?: string;
    /** The signed-in user's ID token; the hosted compile API only serves signed-in users. */
    token?: string | null;
  } = {},
): Promise<CompileResult> {
  const { signal, baseUrl = COMPILE_URL, token } = opts;
  // One request that answers with the result: on Cloud Run, a follow-up request could reach a
  // different server that never saw this compile (ADR 0005).
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/build`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(req),
      ...(signal && { signal }),
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error(OFFLINE, { cause: e });
  }
  const body = (await res.json().catch(() => ({}))) as Partial<BuildResponse> & {
    error?: string;
  };
  if (!res.ok || !Array.isArray(body.diagnostics)) throw new Error(body.error ?? OFFLINE);
  const { artifact, ...outcome } = body as BuildResponse;
  if (!outcome.ok || !artifact) return { outcome };
  return {
    outcome: { ...outcome, artifact: { size: artifact.size, sha256: artifact.sha256 } },
    binary: fromBase64(artifact.base64),
  };
}

interface BuildResponse extends Omit<CompileOutcome, 'artifact'> {
  artifact?: { size: number; sha256: string; base64: string };
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
