import { useEffect, useRef, useState } from 'react';
import { Download, Send, Trash2 } from 'lucide-react';
import type { Device } from '../device/device.ts';
import { Info } from '../ui/Info.tsx';
import { useSerialLines } from './device-context.tsx';

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400];
/** Board output, with send box, baud rate, timestamps, autoscroll, clear and download. */
export function SerialMonitor({
  device,
  connected,
  boardName,
  defaultBaud,
  onConnect,
  tall = false,
}: {
  device: Device | null;
  connected: boolean;
  boardName: string;
  defaultBaud: number;
  onConnect: () => void;
  /** Fill the screen (phones) instead of a fixed-height panel. */
  tall?: boolean;
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
    <div className={`flex flex-col ${tall ? 'h-full min-h-0' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-2 text-[13px]">
        <span className="flex items-center gap-2 font-semibold">
          <span
            aria-hidden
            className={`size-2 rounded-full ${connected ? 'bg-ok' : 'bg-line-strong'}`}
          />
          {connected ? `Listening · ${boardName}` : 'Not listening · no board connected'}
        </span>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 font-semibold">
          Baud
          <select
            aria-label="Baud rate"
            className="input py-0.5"
            value={baud}
            onChange={(e) => void changeBaud(Number(e.target.value))}
          >
            {[...new Set([defaultBaud, ...BAUD_RATES])]
              .sort((a, b) => a - b)
              .map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
          </select>
          <Info
            align="right"
            title="Baud rate"
            text="How fast the board and the computer talk. Both sides must use the same number, or the text comes out scrambled. Your program sets it with Serial.begin()."
          />
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 font-semibold">
          <input
            type="checkbox"
            checked={timestamps}
            onChange={(e) => setTimestamps(e.target.checked)}
          />
          Timestamps
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 font-semibold">
          <input
            type="checkbox"
            checked={autoscroll}
            onChange={(e) => setAutoscroll(e.target.checked)}
          />
          Autoscroll
        </label>
        <button className="btn btn-ghost px-2.5 py-1 text-[13px]" onClick={clear}>
          Clear
          <Trash2 size={14} />
        </button>
        <button
          className="btn btn-ghost px-2.5 py-1 text-[13px]"
          onClick={download}
          disabled={!lines.length}
        >
          Save log
          <Download size={14} />
        </button>
      </div>
      {error && (
        <p role="alert" className="bg-err-soft px-5 py-2 text-sm text-err-ink">
          {error}
        </p>
      )}
      <pre
        ref={box}
        data-testid="serial-output"
        className={`overflow-auto bg-panel px-5 py-2.5 font-mono text-[13px] leading-[1.7] whitespace-pre-wrap ${tall ? 'min-h-32 flex-1' : 'h-48'}`}
      >
        {!connected && !lines.length ? (
          <span className="font-sans text-sm text-muted">
            Nothing yet.{' '}
            <button className="text-accent-ink underline" onClick={onConnect}>
              Connect the board
            </button>{' '}
            or upload your program. Anything it prints with <code>Serial.println()</code> shows up
            here.
          </span>
        ) : (
          lines.map((l) => (
            <div key={l.id} className="flex gap-3.5">
              {timestamps && (
                <span className="flex-none text-muted">{l.at.toLocaleTimeString()}</span>
              )}
              <span>{l.text}</span>
            </div>
          ))
        )}
      </pre>
      <form
        className="flex items-center gap-2 border-t border-line px-5 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          aria-label="Send to board"
          className="input min-w-0 flex-1"
          placeholder={connected ? 'Type a message for the board…' : 'Connect the board to send'}
          value={input}
          disabled={!connected}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn btn-secondary" disabled={!connected || !input}>
          Send
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
