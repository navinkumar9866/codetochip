// Draft shape from docs/PLAN.md Appendix C. Phase 1.5 replaces this with a
// JSON Schema that is validated in CI; tighten string fields to unions then.

export interface BoardManifest {
  id: string;
  name: string;
  vendor: string;
  arch: string;
  family: string;
  toolchain: {
    kind: string;
    /** Base FQBN; a flash mode's buildOptions are appended as `:key=value,...`. */
    fqbn: string;
    core: string;
    coreVersion: string;
    indexUrl: string;
  };
  artifact: { format: string };
  usb: { vendorId: string; productId: string; bridge: string }[];
  serial: { baudRate: number };
  flash: {
    protocol: string;
    modes: {
      id: string;
      label: string;
      bootSel: string;
      /** Board menu options for this mode, e.g. a different linker script per mode. */
      buildOptions?: Record<string, string>;
      /** Largest image the bootloader accepts in this mode. */
      maxImageBytes?: number;
      helper?: string;
    }[];
    reset: { method: string };
  };
  memory: { ramBytes: number; flashBytes?: number };
  docsUrl: string;
}
