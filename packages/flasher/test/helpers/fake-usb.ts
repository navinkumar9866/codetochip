/** Minimal USBDevice stand-in for a CP210x: records control transfers, scripts bulk IN data. */
export function createFakeUsbDevice(
  opts: {
    controlStatus?: USBTransferStatus;
    outStatus?: USBTransferStatus;
    stallFirstIn?: boolean;
    noBulk?: boolean;
    openError?: string;
    claimError?: string;
  } = {},
) {
  let stallNext = opts.stallFirstIn ?? false;
  let halts = 0;
  const controls: { setup: USBControlTransferParameters; data?: number[] }[] = [];
  const bulkOut: number[][] = [];
  const inbox: Uint8Array[] = [];
  let wake: (() => void) | null = null;
  let unplugged = false;
  const claimed = new Set<number>();

  const alt = {
    endpoints: opts.noBulk
      ? []
      : [
          { endpointNumber: 1, direction: 'in', type: 'bulk', packetSize: 64 },
          { endpointNumber: 1, direction: 'out', type: 'bulk', packetSize: 64 },
        ],
  };
  const configuration = {
    configurationValue: 1,
    interfaces: [{ interfaceNumber: 0, alternates: [alt] }],
  };

  const device = {
    opened: false,
    configuration: null as typeof configuration | null,
    async open() {
      if (opts.openError) throw new DOMException('Access denied.', opts.openError);
      device.opened = true;
    },
    async close() {
      device.opened = false;
    },
    async selectConfiguration() {
      device.configuration = configuration;
    },
    async claimInterface(n: number) {
      if (opts.claimError) throw new DOMException('Unable to claim interface.', opts.claimError);
      claimed.add(n);
    },
    async releaseInterface(n: number) {
      claimed.delete(n);
    },
    async controlTransferOut(setup: USBControlTransferParameters, data?: BufferSource) {
      const bytes = data ? [...new Uint8Array(data as ArrayBuffer)] : undefined;
      controls.push(bytes ? { setup, data: bytes } : { setup });
      return { status: opts.controlStatus ?? 'ok', bytesWritten: bytes?.length ?? 0 };
    },
    async transferOut(_ep: number, data: BufferSource) {
      if (unplugged) throw new DOMException('Device unavailable', 'NotFoundError');
      bulkOut.push([...new Uint8Array(data as ArrayBuffer)]);
      return { status: opts.outStatus ?? 'ok', bytesWritten: (data as ArrayBuffer).byteLength };
    },
    async transferIn() {
      if (stallNext) {
        stallNext = false;
        return { status: 'stall' };
      }
      while (!inbox.length) {
        if (unplugged) throw new DOMException('Device unavailable', 'NetworkError');
        await new Promise<void>((r) => (wake = r));
      }
      const chunk = inbox.shift()!;
      return { status: 'ok', data: new DataView(chunk.buffer) };
    },
    async clearHalt() {
      halts++;
    },
  };

  return {
    device: device as unknown as USBDevice,
    controls,
    bulkOut,
    claimed,
    halts: () => halts,
    receive(bytes: number[] | string) {
      inbox.push(
        typeof bytes === 'string' ? new TextEncoder().encode(bytes) : Uint8Array.from(bytes),
      );
      wake?.();
    },
    unplug() {
      unplugged = true;
      wake?.();
    },
  };
}
