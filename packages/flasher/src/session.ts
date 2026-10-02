import { FlasherError } from './errors.ts';
import { getProtocol } from './protocols/registry.ts';
import type { FlashOptions, FlashProgress, SerialSignals, Transport } from './types.ts';

export type SessionState = 'closed' | 'open' | 'flashing';

export interface SessionEvents {
  /** Bytes from the board while the serial monitor is running. */
  onSerial(chunk: Uint8Array): void;
  onProgress(progress: FlashProgress): void;
  onState(state: SessionState): void;
  /** The connection was lost (unplugged, port closed by the OS). */
  onDisconnect(message: string): void;
}

/**
 * One connected board: the serial monitor runs whenever we're not flashing, and is paused
 * during a flash so the protocol owns the port (docs/PLAN.md Phase 3). Framework-free so it
 * can run in a Web Worker (not throttled like a background tab) or on the main thread.
 */
export class DeviceSession {
  private state: SessionState = 'closed';
  private monitor: AsyncIterator<Uint8Array> | null = null;
  private flashAbort: AbortController | null = null;

  constructor(
    private readonly transport: Transport,
    private baudRate: number,
    private readonly events: SessionEvents,
  ) {}

  get current(): SessionState {
    return this.state;
  }

  async open(): Promise<void> {
    await this.transport.open({ baudRate: this.baudRate });
    this.setState('open');
    this.startMonitor();
  }

  /** Reopens at a new baud rate (serial monitor setting). */
  async setBaudRate(baudRate: number): Promise<void> {
    if (this.state === 'flashing') throw new FlasherError('Wait for the upload to finish.');
    await this.stopMonitor();
    await this.transport.close();
    this.baudRate = baudRate;
    await this.open();
  }

  async write(data: Uint8Array): Promise<void> {
    if (this.state !== 'open') throw new FlasherError('Connect the board first.');
    await this.transport.write(data);
  }

  async setSignals(signals: SerialSignals): Promise<void> {
    await this.transport.setSignals(signals);
  }

  async flash(protocolId: string, image: Uint8Array, opts: FlashOptions): Promise<void> {
    if (this.state !== 'open') throw new FlasherError('Connect the board first.');
    const protocol = getProtocol(protocolId);
    if (!protocol)
      throw new FlasherError(`Uploading to this board isn’t supported yet (${protocolId}).`);
    this.flashAbort = new AbortController();
    this.setState('flashing');
    await this.stopMonitor();
    try {
      await protocol.flash(
        this.transport,
        image,
        opts,
        (p) => this.events.onProgress(p),
        this.flashAbort.signal,
      );
    } catch (e) {
      this.events.onProgress({
        stage: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
      throw e;
    } finally {
      this.flashAbort = null;
      // A disconnect during the flash may already have closed the session.
      if ((this.state as SessionState) === 'flashing') {
        this.setState('open');
        this.startMonitor();
      }
    }
  }

  cancelFlash(): void {
    this.flashAbort?.abort();
  }

  async close(): Promise<void> {
    this.flashAbort?.abort();
    await this.stopMonitor();
    await this.transport.close().catch(() => {});
    this.setState('closed');
  }

  private startMonitor() {
    if (this.monitor) return;
    const it = this.transport.readable[Symbol.asyncIterator]();
    this.monitor = it;
    void (async () => {
      try {
        for (;;) {
          const r = await it.next();
          if (r.done) break;
          this.events.onSerial(r.value);
        }
      } catch (e) {
        if (this.monitor === it) this.lost(e);
      } finally {
        if (this.monitor === it) this.monitor = null;
      }
    })();
  }

  private async stopMonitor() {
    const it = this.monitor;
    this.monitor = null;
    await it?.return?.();
  }

  private lost(e: unknown) {
    this.flashAbort?.abort();
    this.setState('closed');
    this.events.onDisconnect(e instanceof Error ? e.message : 'The board was disconnected.');
  }

  private setState(s: SessionState) {
    if (s === this.state) return;
    this.state = s;
    this.events.onState(s);
  }
}
