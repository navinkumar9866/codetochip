// Dev/e2e only (?device=mock): a simulated ARIES bootloader built from Gate 0 recordings.
// Presses RESET by itself when asked, so automated tests can run the whole flow.
import { createMockVegaBootloader } from '@codetochip/test-fixtures';
import { InPageDevice } from './device.ts';

export function createMockDevice() {
  const board = createMockVegaBootloader({
    initialState: 'running',
    handshakeIntervalMs: 190,
    programOutput: 'Hello from CodeToChip 0\r\nHello from CodeToChip 1\r\n',
  });
  const device = new InPageDevice(async () => board.transport);
  device.subscribe((e) => {
    if (e.type === 'progress' && e.progress.message?.includes('RESET')) {
      setTimeout(() => void board.pressReset(), 300);
    }
  });
  Object.assign(globalThis, { __mockBoard: board });
  return device;
}
