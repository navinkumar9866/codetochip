import type { Protocol } from '../types.ts';
import { vegaXmodemProtocol } from './vega-xmodem.ts';

const registry = new Map<string, Protocol>([[vegaXmodemProtocol.id, vegaXmodemProtocol]]);

/** The protocol a board manifest names in `flash.protocol`. */
export function getProtocol(id: string): Protocol | undefined {
  return registry.get(id);
}

/** For tests and dev tools (e.g. the mock protocol used by the test board). */
export function registerProtocol(protocol: Protocol): void {
  registry.set(protocol.id, protocol);
}
