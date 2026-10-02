// Mirrors schema/board-manifest.schema.json; test/registry.test.ts validates every manifest
// against the schema. Change both together.

export type ResetStrategy =
  | { method: 'manual'; prompt: string }
  | { method: 'dtr-rts'; sequence: { dtr?: boolean; rts?: boolean; delayMs: number }[] };

export interface FlashMode {
  id: string;
  label: string;
  target: 'ram' | 'persistent';
  bootSel?: string;
  /** Board menu options for this mode, e.g. a different linker script per mode. */
  buildOptions?: Record<string, string>;
  /** Largest image the bootloader accepts in this mode. */
  maxImageBytes?: number;
  helper?: string;
}

export interface UsbId {
  vendorId: string;
  productId: string;
  bridge: 'cp210x' | 'ch34x' | 'ftdi' | 'cdc-acm' | 'native';
}

export interface BoardManifest {
  id: string;
  name: string;
  vendor: string;
  arch: string;
  family: string;
  /** Hidden from users; proves nothing is hard-wired to one board. */
  testOnly?: boolean;
  toolchain: {
    kind: 'arduino-cli' | 'platformio' | 'vendor-sdk' | 'zephyr' | 'none';
    /** Base FQBN; a flash mode's buildOptions are appended as `:key=value,...`. */
    fqbn: string;
    core: string;
    coreVersion: string;
    indexUrl: string;
  };
  artifact: { format: 'bin' | 'hex' | 'uf2' | 'elf' };
  usb: UsbId[];
  serial: { baudRate: number };
  flash: {
    protocol: string;
    modes: FlashMode[];
    reset: ResetStrategy;
    afterCancel?: 'reset-required' | 'ready';
  };
  memory: { ramBytes: number; flashBytes?: number };
  docsUrl: string;
  photos?: string[];
  /** Board-specific guidance shown in the app. */
  help?: { setup?: string[]; troubleshooting?: string[] };
}
