import type { ResetStrategy, Transport } from './types.ts';

/**
 * Applies a DTR/RTS reset sequence. Manual strategies do nothing here: the protocol shows
 * their prompt only if the board isn't already waiting in its bootloader.
 */
export async function applyReset(
  transport: Transport,
  strategy: ResetStrategy,
  signal?: AbortSignal,
): Promise<void> {
  if (strategy.method !== 'dtr-rts') return;
  for (const step of strategy.sequence) {
    signal?.throwIfAborted();
    const signals: { dtr?: boolean; rts?: boolean } = {};
    if (step.dtr !== undefined) signals.dtr = step.dtr;
    if (step.rts !== undefined) signals.rts = step.rts;
    await transport.setSignals(signals);
    if (step.delayMs > 0) await new Promise((r) => setTimeout(r, step.delayMs));
  }
}
