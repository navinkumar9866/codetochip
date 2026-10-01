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

export interface FlashOptions {
  /** Flash mode id from the board manifest, e.g. 'ram' or 'persistent'. */
  mode: string;
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
