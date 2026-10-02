import type { Diagnostic } from './types.ts';

export const MAX_LOG_BYTES = 64 * 1024;

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

const RWX_NOISE = ' has a LOAD segment with RWX permissions';

/**
 * Makes compiler output safe and readable for users: no colour codes, no sandbox or
 * toolchain paths (/work/<sketch>/ becomes the user's own file name), capped in size.
 * Output can be shaped by user code, so everything here is linear-time on capped input.
 */
export function sanitizeLog(raw: string, sketch: string): string {
  const truncated = raw.length > MAX_LOG_BYTES;
  let log = dropRwxNoise((truncated ? raw.slice(0, MAX_LOG_BYTES) : raw).replace(ANSI, ''))
    .replaceAll(`/work/${sketch}/`, '')
    .replace(/\/work\/[^\s:'"]*/g, '<build>')
    .replace(/\/opt\/arduino\/[^\s:'"]*\//g, '');
  if (truncated) log += '\n… (output truncated)';
  return log;
}

/**
 * Removes the linker's "ld: warning: <file> has a LOAD segment with RWX permissions" (the VEGA
 * linker script maps RAM as RWX; users can't act on it). It is often glued to the next message.
 */
function dropRwxNoise(log: string): string {
  let out = '';
  let from = 0;
  for (let at = log.indexOf(RWX_NOISE); at >= 0; at = log.indexOf(RWX_NOISE, from)) {
    const ld = log.lastIndexOf('ld: warning:', at);
    const lineStart = log.lastIndexOf('\n', at) + 1;
    const start = ld >= lineStart ? Math.max(lineStart, log.lastIndexOf(' ', ld) + 1) : at;
    out += log.slice(from, start);
    from = at + RWX_NOISE.length;
  }
  return out + log.slice(from);
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
