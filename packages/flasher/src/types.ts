export interface SerialSignals {
  dtr?: boolean;
  rts?: boolean;
}

/** Moves bytes and toggles control lines. Knows nothing about bootloaders. */
export interface Transport {
  readonly kind: TransportKind;
  open(opts: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  /**
   * Received chunks. One consumer at a time; a consumer that stops iterating detaches
   * and the next one continues from there.
   */
  readonly readable: AsyncIterable<Uint8Array>;
  setSignals(s: SerialSignals): Promise<void>;
}

export type TransportKind = 'webserial' | 'webusb-cp210x' | 'mock';

export type FlashStage =
  'waiting-for-bootloader' | 'handshake' | 'transferring' | 'finishing' | 'done' | 'error';

export interface FlashProgress {
  stage: FlashStage;
  bytesSent?: number;
  totalBytes?: number;
  message?: string;
}

/** How to put the board into its bootloader. Mirrors the board manifest's `flash.reset`. */
export type ResetStrategy =
  | { method: 'manual'; prompt: string }
  | { method: 'dtr-rts'; sequence: { dtr?: boolean; rts?: boolean; delayMs: number }[] };

/** Built by the app from the board manifest; protocols never read manifests themselves. */
export interface FlashOptions {
  /** Where the image goes: the flash mode's `target` in the manifest. */
  target: 'ram' | 'persistent';
  reset: ResetStrategy;
  /** Largest image the bootloader accepts in this mode. */
  maxImageBytes?: number;
  /** Whether the bootloader needs a reset after a cancelled upload. */
  afterCancel?: 'reset-required' | 'ready';
  /** How long to wait for the bootloader, e.g. while the user presses RESET. */
  handshakeTimeoutMs?: number;
}

/** Speaks one bootloader. Never knows which transport it runs on. */
export interface Protocol {
  readonly id: string;
  flash(
    transport: Transport,
    image: Uint8Array,
    opts: FlashOptions,
    onProgress: (p: FlashProgress) => void,
    signal: AbortSignal,
  ): Promise<void>;
}
