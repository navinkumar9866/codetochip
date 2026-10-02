import { useEffect, useRef, useState } from 'react';
import type { Device } from '../device/device.ts';
import { useSerialLines } from './device-context.tsx';

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400];
/** Board output, with send box, baud rate, timestamps, autoscroll, clear and download. */
export function SerialMonitor({
  device,
  connected,
  defaultBaud,
  onConnect,
}: {
  device: Device | null;
  connected: boolean;
  defaultBaud: number;
  onConnect: () => void;
}) {
  const { lines, clear } = useSerialLines();
  const [timestamps, setTimestamps] = useState(false);
  const [autoscroll, setAutoscroll] = useState(true);
  const [baud, setBaud] = useState(defaultBaud);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (autoscroll && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines, autoscroll]);

  const send = async () => {
    if (!device || !input) return;
    try {
      await device.write(new TextEncoder().encode(`${input}\n`));
      setInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const changeBaud = async (value: number) => {
    setBaud(value);
    if (connected) await device?.setBaudRate(value).catch((e: Error) => setError(e.message));
  };

  const download = () => {
    const text = lines.map((l) => `${l.at.toISOString()} ${l.text}`).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = 'serial-log.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select
          aria-label="Baud rate"
          className="rounded bg-slate-800 px-2 py-1"
          value={baud}
          onChange={(e) => void changeBaud(Number(e.target.value))}
        >
          {[...new Set([defaultBaud, ...BAUD_RATES])]
            .sort((a, b) => a - b)
            .map((b) => (
              <option key={b} value={b}>
                {b} baud
              </option>
            ))}
        </select>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={timestamps}
            onChange={(e) => setTimestamps(e.target.checked)}
          />
          Timestamps
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={autoscroll}
            onChange={(e) => setAutoscroll(e.target.checked)}
          />
          Autoscroll
        </label>
        <button className="text-slate-400 hover:text-slate-200" onClick={clear}>
          Clear
        </button>
        <button
          className="text-slate-400 hover:text-slate-200"
          onClick={download}
          disabled={!lines.length}
        >
          Download log
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <pre
        ref={box}
        data-testid="serial-output"
        className="min-h-32 flex-1 overflow-auto rounded bg-black p-2 font-mono text-xs leading-5 text-green-300"
      >
        {!connected && !lines.length ? (
          <span className="text-slate-500">
            Not connected.{' '}
            <button className="text-sky-400 underline" onClick={onConnect}>
              Connect the board
            </button>{' '}
            to see its output.
          </span>
        ) : (
          lines.map((l) => (
            <div key={l.id}>
              {timestamps && <span className="text-slate-500">{l.at.toLocaleTimeString()} </span>}
              {l.text}
            </div>
          ))
        )}
      </pre>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          aria-label="Send to board"
          className="min-w-0 flex-1 rounded bg-slate-800 px-2 py-1 text-sm"
          placeholder={connected ? 'Type and press Enter to send' : 'Connect the board to send'}
          value={input}
          disabled={!connected}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          className="rounded bg-slate-700 px-3 py-1 text-sm disabled:opacity-40"
          disabled={!connected || !input}
        >
          Send
        </button>
      </form>
    </div>
  );
}
