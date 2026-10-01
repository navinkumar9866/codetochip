import ariesV3 from '../manifests/aries-v3.json' with { type: 'json' };
import type { BoardManifest } from './types.ts';

export type { BoardManifest } from './types.ts';

export const boards: readonly BoardManifest[] = [ariesV3];

export function getBoard(id: string): BoardManifest | undefined {
  return boards.find((b) => b.id === id);
}

/** Full FQBN for a board's flash mode, including its board-menu options. */
export function fqbnFor(board: BoardManifest, modeId: string): string {
  const mode = board.flash.modes.find((m) => m.id === modeId);
  if (!mode) throw new Error(`Board ${board.id} has no flash mode "${modeId}"`);
  const opts = Object.entries(mode.buildOptions ?? {}).map(([k, v]) => `${k}=${v}`);
  return opts.length ? `${board.toolchain.fqbn}:${opts.join(',')}` : board.toolchain.fqbn;
}
