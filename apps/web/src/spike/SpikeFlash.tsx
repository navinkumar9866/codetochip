// Phase 0.3/0.4 spike: connect, watch the boot banner, try reset strategies, upload a .bin
// over XMODEM, and record transcripts for packages/test-fixtures. Throwaway UI; the flasher
// code it drives is the real thing. Everything board-specific comes from the manifest.
import { useEffect, useRef, useState } from 'react';
import { boards, type BoardManifest } from '@codetochip/boards';
import {
  createBridgeDriver,
  createRecorder,
  detectTransport,
  vegaXmodemProtocol,
  WebSerialTransport,
  WebUsbSerialTransport,
  type Cp210xDriver,
  type FlashProgress,
  type Protocol,
  type Transport,
} from '@codetochip/flasher';

const protocols: Record<string, Protocol> = { [vegaXmodemProtocol.id]: vegaXmodemProtocol };
const MAX_LINES = 1500;

type Recorder = ReturnType<typeof createRecorder>;
interface Line {
  id: number;
  t: string;
  dir: 'rx' | 'tx' | 'sig' | 'note' | 'err';
  text: string;
  hex?: string;
}

const printable = (bytes: Uint8Array) =>
  Array.from(bytes, (b) =>
    b === 0x0a ? '↵' : b === 0x0d ? '' : b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '·',
  ).join('');
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
const parseId = (s: string) => parseInt(s, 16);

export default function SpikeFlash() {
  const support = detectTransport();
  const [board, setBoard] = useState<BoardManifest>(boards[0]!);
  const [via, setVia] = useState<'webserial' | 'webusb'>(
    support.kind === 'webusb' ? 'webusb' : 'webserial',
  );
  const [connected, setConnected] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [showHex, setShowHex] = useState(true);
  const [signals, setSignals] = useState({ dtr: true, rts: true });
  const [gpioPin, setGpioPin] = useState(0);
  const [modeId, setModeId] = useState(board.flash.modes[0]?.id ?? '');
  const [image, setImage] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [progress, setProgress] = useState<FlashProgress | null>(null);
  const [recording, setRecording] = useState(false);
  const [scenario, setScenario] = useState('boot-banner');
  const [note, setNote] = useState('');

  const rec = useRef<Recorder | null>(null);
  const inner = useRef<Transport | null>(null);
  const cp210x = useRef<Cp210xDriver | null>(null);
  const monitor = useRef<AsyncIterator<Uint8Array> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const t0 = useRef(performance.now());
  const nextId = useRef(0);

  const log = (dir: Line['dir'], text: string, bytes?: Uint8Array) => {
    const t = ((performance.now() - t0.current) / 1000).toFixed(3);
    setLines((prev) => {
      const line: Line = { id: nextId.current++, t, dir, text };
      if (bytes) line.hex = hex(bytes);
      const next = [...prev, line];
      return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
    });
  };
  const fail = (e: unknown) => log('err', e instanceof Error ? e.message : String(e));

  const startMonitor = () => {
    const t = rec.current?.transport;
    if (!t || monitor.current) return;
    const it = t.readable[Symbol.asyncIterator]();
    monitor.current = it;
    void (async () => {
      try {
        for (;;) {
          const r = await it.next();
          if (r.done) break;
          log('rx', printable(r.value), r.value);
        }
      } catch (e) {
        fail(e);
        setConnected(false);
      }
    })();
  };
  const stopMonitor = async () => {
    const it = monitor.current;
    monitor.current = null;
    await it?.return?.();
  };

  const connect = async () => {
    try {
      let transport: Transport;
      if (via === 'webserial') {
        const port = await navigator.serial.requestPort({
          filters: board.usb.map((u) => ({
            usbVendorId: parseId(u.vendorId),
            usbProductId: parseId(u.productId),
          })),
        });
        transport = new WebSerialTransport(port);
        cp210x.current = null;
      } else {
        const device = await navigator.usb.requestDevice({
          filters: board.usb.map((u) => ({
            vendorId: parseId(u.vendorId),
            productId: parseId(u.productId),
          })),
        });
        const bridge = board.usb.find(
          (u) =>
            parseId(u.vendorId) === device.vendorId && parseId(u.productId) === device.productId,
        )?.bridge;
        const driver = bridge ? createBridgeDriver(bridge, device) : null;
        if (!driver) throw new Error(`No WebUSB driver yet for bridge "${bridge ?? 'unknown'}".`);
        transport = new WebUsbSerialTransport(device, driver, 'webusb-cp210x');
        cp210x.current = driver;
      }
      inner.current = transport;
      rec.current = createRecorder(transport);
      await transport.open({ baudRate: board.serial.baudRate });
      t0.current = performance.now();
      setConnected(true);
      setSignals({ dtr: true, rts: true });
      log('note', `Connected via ${transport.kind} at ${board.serial.baudRate} baud`);
      startMonitor();
    } catch (e) {
      fail(e);
    }
  };

  const disconnect = async () => {
    abort.current?.abort();
    await stopMonitor();
    await inner.current?.close().catch(fail);
    inner.current = null;
    rec.current = null;
    setConnected(false);
    log('note', 'Disconnected');
  };

  useEffect(
    () => () => {
      void inner.current?.close();
    },
    [],
  );

  const setSignal = async (s: { dtr?: boolean; rts?: boolean }) => {
    try {
      await rec.current?.transport.setSignals(s);
      setSignals((prev) => ({ ...prev, ...s }));
      log('sig', JSON.stringify(s));
    } catch (e) {
      fail(e);
    }
  };

  /** Drive the listed lines to `active` for `ms`, then restore them. */
  const pulse = async (label: string, s: { dtr?: boolean; rts?: boolean }, ms = 100) => {
    rec.current?.note(`pulse ${label}`);
    log('note', `Pulse ${label} (${ms} ms)`);
    const restore: { dtr?: boolean; rts?: boolean } = {};
    if (s.dtr !== undefined) restore.dtr = signals.dtr;
    if (s.rts !== undefined) restore.rts = signals.rts;
    await setSignal(s);
    await new Promise((r) => setTimeout(r, ms));
    await setSignal(restore);
  };

  const pulseGpio = async () => {
    const driver = cp210x.current;
    if (!driver) return;
    const mask = 1 << gpioPin;
    try {
      rec.current?.note(`gpio${gpioPin} low 100ms`);
      log('note', `GPIO${gpioPin} → low for 100 ms, then high`);
      await driver.writeGpioLatch(mask, 0);
      await new Promise((r) => setTimeout(r, 100));
      await driver.writeGpioLatch(mask, mask);
    } catch (e) {
      fail(e);
    }
  };

  const mode = board.flash.modes.find((m) => m.id === modeId);
  const tooBig = !!image && !!mode?.maxImageBytes && image.bytes.length > mode.maxImageBytes;

  const upload = async () => {
    const t = rec.current?.transport;
    const protocol = protocols[board.flash.protocol];
    if (!t || !image || !protocol) return;
    abort.current = new AbortController();
    await stopMonitor();
    rec.current?.note(`upload ${image.name} (${image.bytes.length} bytes, mode ${modeId})`);
    log('note', `Uploading ${image.name}…`);
    try {
      await protocol.flash(
        t,
        image.bytes,
        { mode: modeId, handshakeTimeoutMs: 60_000 },
        (p) => {
          setProgress(p);
          if (p.stage !== 'transferring')
            log('note', `${p.stage}${p.message ? `: ${p.message}` : ''}`);
        },
        abort.current.signal,
      );
    } catch (e) {
      setProgress({ stage: 'error', message: e instanceof Error ? e.message : String(e) });
      fail(e);
    } finally {
      abort.current = null;
      startMonitor();
    }
  };

  const toggleRecording = () => {
    const r = rec.current;
    if (!r) return;
    if (r.recording) {
      r.stop();
      setRecording(false);
      log('note', `Recording stopped (${r.entries.length} entries)`);
    } else {
      r.start();
      setRecording(true);
      log('note', `Recording "${scenario}"`);
    }
  };

  const download = () => {
    const r = rec.current;
    if (!r) return;
    const transcript = r.toTranscript({
      board: board.id,
      transport: inner.current?.kind ?? 'unknown',
      description: scenario,
    });
    const slug = scenario
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const blob = new Blob([JSON.stringify(transcript, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${board.id}-${slug || 'transcript'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const btn = 'rounded-md bg-slate-800 px-3 py-1.5 text-sm disabled:opacity-40';
  const primary =
    'rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40';
  const busy = !!abort.current;

  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-6 text-slate-100">
      <h1 className="text-xl font-semibold">Flash spike</h1>
      <p className="text-sm text-slate-400">
        Phase 0 hardware test page. See the Hardware Gate 0 checklist in docs/PLAN.md.
      </p>
      {support.kind === 'unsupported' && (
        <p role="alert" className="mt-3 rounded-md bg-amber-900/40 p-3 text-sm text-amber-200">
          {support.reason}
        </p>
      )}

      <section className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Board
          <select
            className="mt-1 block rounded-md bg-slate-800 px-2 py-1.5"
            value={board.id}
            disabled={connected}
            onChange={(e) => {
              const b = boards.find((x) => x.id === e.target.value)!;
              setBoard(b);
              setModeId(b.flash.modes[0]?.id ?? '');
            }}
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Transport
          <select
            className="mt-1 block rounded-md bg-slate-800 px-2 py-1.5"
            value={via}
            disabled={connected}
            onChange={(e) => setVia(e.target.value as 'webserial' | 'webusb')}
          >
            <option value="webserial">Web Serial (desktop)</option>
            <option value="webusb">WebUSB + bridge driver (Android)</option>
          </select>
        </label>
        {connected ? (
          <button className={btn} onClick={() => void disconnect()}>
            Disconnect
          </button>
        ) : (
          <button className={primary} onClick={() => void connect()}>
            Connect
          </button>
        )}
      </section>
      {via === 'webusb' && support.kind === 'webserial' && (
        <p className="mt-2 text-xs text-amber-300">
          WebUSB on desktop usually fails because the OS driver owns the device. Use Web Serial
          here.
        </p>
      )}

      <section className="mt-4 rounded-lg border border-slate-800 p-3">
        <h2 className="text-sm font-medium text-slate-300">Reset experiments</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={signals.dtr}
              disabled={!connected}
              onChange={(e) => void setSignal({ dtr: e.target.checked })}
            />
            DTR
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={signals.rts}
              disabled={!connected}
              onChange={(e) => void setSignal({ rts: e.target.checked })}
            />
            RTS
          </label>
          <button
            className={btn}
            disabled={!connected}
            onClick={() => void pulse('DTR low', { dtr: false })}
          >
            Pulse DTR low
          </button>
          <button
            className={btn}
            disabled={!connected}
            onClick={() => void pulse('RTS low', { rts: false })}
          >
            Pulse RTS low
          </button>
          <button
            className={btn}
            disabled={!connected}
            onClick={() => void pulse('DTR+RTS low', { dtr: false, rts: false })}
          >
            Pulse both low
          </button>
          <button
            className={btn}
            disabled={!connected}
            onClick={() => void pulse('DTR+RTS high', { dtr: true, rts: true })}
          >
            Pulse both high
          </button>
        </div>
        {cp210x.current && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-400">Bridge GPIO (experimental):</span>
            <select
              className="rounded-md bg-slate-800 px-2 py-1"
              value={gpioPin}
              onChange={(e) => setGpioPin(Number(e.target.value))}
            >
              {[0, 1, 2, 3, 4, 5, 6].map((p) => (
                <option key={p} value={p}>
                  GPIO{p}
                </option>
              ))}
            </select>
            <button className={btn} disabled={!connected} onClick={() => void pulseGpio()}>
              Pulse low
            </button>
          </div>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-slate-800 p-3">
        <h2 className="text-sm font-medium text-slate-300">Upload</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <select
            className="rounded-md bg-slate-800 px-2 py-1.5"
            value={modeId}
            onChange={(e) => setModeId(e.target.value)}
          >
            {board.flash.modes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <input
            type="file"
            accept=".bin"
            className="max-w-full text-xs"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                void f
                  .arrayBuffer()
                  .then((b) => setImage({ name: f.name, bytes: new Uint8Array(b) }));
            }}
          />
          <button
            className={primary}
            disabled={!connected || !image || tooBig || busy}
            onClick={() => void upload()}
          >
            Upload
          </button>
          {busy && (
            <button className={btn} onClick={() => abort.current?.abort()}>
              Cancel
            </button>
          )}
        </div>
        {tooBig && (
          <p className="mt-2 text-sm text-red-400">
            This file is larger than the board accepts in this mode ({mode?.maxImageBytes} bytes).
          </p>
        )}
        {progress && (
          <div className="mt-2 text-sm">
            <div className="text-slate-300">
              {progress.stage}
              {progress.message ? ` — ${progress.message}` : ''}
            </div>
            {progress.totalBytes ? (
              <progress
                className="mt-1 w-full"
                value={progress.bytesSent ?? 0}
                max={progress.totalBytes}
              />
            ) : null}
          </div>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-slate-800 p-3">
        <h2 className="text-sm font-medium text-slate-300">Transcript recorder</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <input
            className="w-48 rounded-md bg-slate-800 px-2 py-1.5"
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            placeholder="scenario, e.g. boot-banner"
            disabled={recording}
          />
          <button
            className={recording ? primary : btn}
            disabled={!connected}
            onClick={toggleRecording}
          >
            {recording ? 'Stop recording' : 'Start recording'}
          </button>
          <button className={btn} disabled={!connected || recording} onClick={download}>
            Download JSON
          </button>
          <input
            className="w-40 rounded-md bg-slate-800 px-2 py-1.5"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="note, e.g. pressed RESET"
          />
          <button
            className={btn}
            disabled={!recording || !note}
            onClick={() => {
              rec.current?.note(note);
              log('note', note);
              setNote('');
            }}
          >
            Add note
          </button>
        </div>
      </section>

      <section className="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">Console</h2>
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={showHex}
                onChange={(e) => setShowHex(e.target.checked)}
              />
              hex
            </label>
            <button className="text-slate-400" onClick={() => setLines([])}>
              Clear
            </button>
          </div>
        </div>
        <pre className="mt-2 h-80 overflow-auto rounded-lg bg-black p-2 font-mono text-xs leading-5">
          {lines.map((l) => (
            <div
              key={l.id}
              className={
                l.dir === 'err'
                  ? 'text-red-400'
                  : l.dir === 'rx'
                    ? 'text-green-300'
                    : 'text-slate-400'
              }
            >
              <span className="text-slate-600">{l.t} </span>
              {l.dir.padEnd(4)} {l.text}
              {showHex && l.hex ? <span className="text-slate-600"> | {l.hex}</span> : null}
            </div>
          ))}
        </pre>
      </section>
    </main>
  );
}
