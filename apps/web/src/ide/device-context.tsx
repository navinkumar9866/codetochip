import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { SessionState } from '@codetochip/flasher';
import { createDevice } from '../device/create-device.ts';
import type { Device } from '../device/device.ts';

export interface SerialLine {
  id: number;
  at: Date;
  text: string;
}

const MAX_LINES = 5000;

/** Drops control bytes (e.g. the stray 0x19 the VEGA bootloader sends), keeping tabs. */
// eslint-disable-next-line no-control-regex
const printable = (line: string) => line.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');

/**
 * Board output, recorded all the time (not only while the serial monitor is visible), so the
 * first lines a freshly uploaded program prints are never lost.
 */
export class SerialBuffer {
  private lines: SerialLine[] = [];
  private listeners = new Set<() => void>();
  private decoder = new TextDecoder();
  private partial = '';
  private nextId = 0;
  private frame = 0;

  push(bytes: Uint8Array) {
    const parts = (this.partial + this.decoder.decode(bytes, { stream: true })).split('\n');
    this.partial = parts.pop() ?? '';
    if (!parts.length) return;
    const add = parts.map((p) => ({
      id: this.nextId++,
      at: new Date(),
      text: printable(p),
    }));
    this.lines = [...this.lines, ...add].slice(-MAX_LINES);
    // Batch renders: boards can print thousands of lines a second.
    this.frame ||= requestAnimationFrame(() => {
      this.frame = 0;
      for (const l of this.listeners) l();
    });
  }
  clear() {
    this.lines = [];
    for (const l of this.listeners) l();
  }
  readonly subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  readonly snapshot = () => this.lines;
}

const DeviceContext = createContext<{ device: Device | null; serial: SerialBuffer } | null>(null);

/** One board connection for the whole app (it survives moving between pages). */
export function DeviceProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<Device | null>(null);
  const [serial] = useState(() => new SerialBuffer());
  useEffect(() => {
    let cancelled = false;
    void createDevice().then((d) => !cancelled && setDevice(d));
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(
    () => device?.subscribe((e) => e.type === 'serial' && serial.push(e.data)),
    [device, serial],
  );
  return <DeviceContext.Provider value={{ device, serial }}>{children}</DeviceContext.Provider>;
}

export function useDevice(): Device | null {
  return useContext(DeviceContext)?.device ?? null;
}

export function useSerialLines(): { lines: SerialLine[]; clear: () => void } {
  const ctx = useContext(DeviceContext);
  const empty: SerialLine[] = [];
  const lines = useSyncExternalStore(
    ctx?.serial.subscribe ?? (() => () => {}),
    ctx?.serial.snapshot ?? (() => empty),
  );
  return { lines, clear: () => ctx?.serial.clear() };
}

export function useDeviceState(device: Device | null): SessionState {
  const [state, setState] = useState<SessionState>(device?.state ?? 'closed');
  useEffect(() => {
    if (!device) return;
    return device.subscribe((e) => {
      if (e.type === 'state') setState(e.state);
      if (e.type === 'disconnect') setState('closed');
    });
  }, [device]);
  return device ? state : 'closed';
}
