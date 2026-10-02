import { fqbnFor, getBoard } from '@codetochip/boards';
import { validateProjectInput } from '@codetochip/data';
import type { CompileJob } from './types.ts';

export type Validation = { ok: true; job: CompileJob } | { ok: false; error: string };

// `#include` with an absolute path, a parent directory, or a home directory. Headers from the
// toolchain (#include <Wire.h>) and from the sketch itself are fine.
const UNSAFE_INCLUDE =
  /^\s*#\s*include\s*[<"]\s*(?:\/|~|[A-Za-z]:[\\/]|(?:[^>"]*[\\/])?\.\.(?:[\\/]|[>"]))/m;
const UNSAFE_ASM = /\.incbin\b/;

/**
 * Checks an untrusted compile request (docs/PLAN.md 2.2). Messages are shown to users.
 * Shares file limits with saved projects (packages/data) so anything you can save compiles.
 */
export function validateCompileRequest(body: unknown): Validation {
  if (!body || typeof body !== 'object')
    return fail('Send a JSON body with board, mode and files.');
  const { board: boardId, mode, files } = body as Record<string, unknown>;
  if (typeof boardId !== 'string' || typeof mode !== 'string' || !Array.isArray(files)) {
    return fail('Send a JSON body with board, mode and files.');
  }
  const board = getBoard(boardId);
  if (!board) return fail(`Unknown board "${boardId}". Pick a board from the list.`);
  if (board.toolchain.kind !== 'arduino-cli') {
    return fail(`${board.name} can’t be compiled online yet.`);
  }
  if (!board.flash.modes.some((m) => m.id === mode)) {
    return fail(`${board.name} has no mode "${mode}".`);
  }

  if (!files.every((f) => f && typeof f.path === 'string' && typeof f.content === 'string')) {
    return fail('Each file needs a path and content.');
  }
  const typed = files as { path: string; content: string }[];
  const fileError = validateProjectInput({ files: typed });
  if (fileError) return fail(fileError);
  if (new Set(typed.map((f) => f.path)).size !== typed.length) {
    return fail('Two files have the same name. Rename one of them.');
  }

  const mains = typed.filter((f) => f.path.endsWith('.ino') && !f.path.includes('/'));
  if (mains.length !== 1) {
    return fail('A sketch needs exactly one .ino file at the top level, e.g. "sketch.ino".');
  }
  const sketch = mains[0]!.path.slice(0, -'.ino'.length);
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(sketch)) {
    return fail('Name the .ino file with letters, numbers, - or _ only, e.g. "blink.ino".');
  }

  for (const f of typed) {
    if (UNSAFE_INCLUDE.test(f.content)) {
      return fail(
        `"${f.path}" includes a file outside the sketch. Use #include "file.h" for your own files or #include <Library.h> for libraries.`,
      );
    }
    if (UNSAFE_ASM.test(f.content)) return fail(`"${f.path}" uses .incbin, which isn’t allowed.`);
  }

  return {
    ok: true,
    job: {
      boardId,
      mode,
      toolchain: 'arduino-cli',
      fqbn: fqbnFor(board, mode),
      coreVersion: board.toolchain.coreVersion,
      sketch,
      files: typed.map(({ path, content }) => ({ path, content })),
    },
  };
}

const fail = (error: string): Validation => ({ ok: false, error });
