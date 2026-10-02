import type { Diagnostic } from './types.ts';

export const MAX_LOG_BYTES = 64 * 1024;

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

/**
 * Makes compiler output safe and readable for users: no colour codes, no sandbox or
 * toolchain paths (/work/<sketch>/ becomes the user's own file name), capped in size.
 */
export function sanitizeLog(raw: string, sketch: string): string {
  let log = raw
    .replace(ANSI, '')
    .replaceAll(`/work/${sketch}/`, '')
    .replace(/\/work\/[^\s:'"]*/g, '<build>')
    .replace(/\/opt\/arduino\/[^\s:'"]*\//g, '');
  if (log.length > MAX_LOG_BYTES) {
    log = log.slice(0, MAX_LOG_BYTES) + '\n… (output truncated)';
  }
  return log;
}

const LINE = /^([^\s:][^:]*):(\d+):(\d+): (fatal error|error|warning|note): (.*)$/;

/** GCC-style "file:line:col: severity: message" lines from a sanitized log. */
export function parseDiagnostics(log: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const line of log.split('\n')) {
    const m = LINE.exec(line.trimEnd());
    if (!m) continue;
    const [, file, ln, col, sev, message] = m;
    out.push({
      file: file!,
      line: Number(ln),
      column: Number(col),
      severity: sev === 'fatal error' ? 'error' : (sev as Diagnostic['severity']),
      message: message!,
    });
  }
  return out;
}
