import ariesV3 from '../manifests/aries-v3.json' with { type: 'json' };
import testBoard from '../manifests/test-board.json' with { type: 'json' };
import type { BoardManifest } from './types.ts';

export type { BoardManifest, FlashMode, ResetStrategy, UsbId } from './types.ts';

// JSON imports widen literal types; every manifest is validated against the schema in tests.
const ALL: readonly BoardManifest[] = [ariesV3, testBoard] as BoardManifest[];

/** Every manifest, including test-only boards. For tests and dev tools. */
export const allBoards = ALL;

/** Boards shown to users. */
export const boards: readonly BoardManifest[] = ALL.filter((b) => !b.testOnly);

export function getBoard(id: string, { includeTest = false } = {}): BoardManifest | undefined {
  return (includeTest ? ALL : boards).find((b) => b.id === id);
}

/** Board picker data: families in display order, each with its boards. */
export function boardsByFamily(list: readonly BoardManifest[] = boards) {
  const families = new Map<string, BoardManifest[]>();
  for (const b of list) families.set(b.family, [...(families.get(b.family) ?? []), b]);
  return [...families].map(([family, members]) => ({ family, boards: members }));
}

/** Search over name, vendor, family and arch, ignoring case and punctuation ("cdac" finds "C-DAC"). */
export function searchBoards(query: string, list: readonly BoardManifest[] = boards) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const terms = query.split(/\s+/).map(norm).filter(Boolean);
  return list.filter((b) => {
    const haystack = [b.name, b.vendor, b.family, b.arch].map(norm).join(' ');
    return terms.every((t) => haystack.includes(t));
  });
}

/**
 * "Which board do I have?": boards whose USB IDs match a plugged-in device. Generic
 * USB-serial chips are shared by many boards, so this can return several; let the user pick.
 */
export function boardsForUsbDevice(
  vendorId: number,
  productId: number,
  list: readonly BoardManifest[] = boards,
) {
  return list.filter((b) =>
    b.usb.some(
      (u) => parseInt(u.vendorId, 16) === vendorId && parseInt(u.productId, 16) === productId,
    ),
  );
}

/** Full FQBN for a board's flash mode, including its board-menu options. */
export function fqbnFor(board: BoardManifest, modeId: string): string {
  const mode = board.flash.modes.find((m) => m.id === modeId);
  if (!mode) throw new Error(`Board ${board.id} has no flash mode "${modeId}"`);
  const opts = Object.entries(mode.buildOptions ?? {}).map(([k, v]) => `${k}=${v}`);
  return opts.length ? `${board.toolchain.fqbn}:${opts.join(',')}` : board.toolchain.fqbn;
}

/**
 * Options for a flasher Protocol, from a board's flash mode. Structurally matches
 * FlashOptions in @codetochip/flasher (boards stays independent of the flasher).
 */
export function flashOptionsFor(board: BoardManifest, modeId: string) {
  const mode = board.flash.modes.find((m) => m.id === modeId);
  if (!mode) throw new Error(`Board ${board.id} has no flash mode "${modeId}"`);
  return {
    target: mode.target,
    reset: board.flash.reset,
    ...(mode.maxImageBytes !== undefined && { maxImageBytes: mode.maxImageBytes }),
    ...(board.flash.afterCancel !== undefined && { afterCancel: board.flash.afterCancel }),
  };
}
