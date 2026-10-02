import { Link } from 'react-router';
import { boards } from '@codetochip/boards';
import { detectTransport } from '@codetochip/flasher';

/** Help for USB-serial bridge chips (not board-specific: many boards share these chips). */
const bridgeHelp: Record<string, string[]> = {
  cp210x: [
    'Windows: if the board doesn’t appear in the list, install the Silicon Labs CP210x USB to UART driver, then unplug and replug the board.',
    'macOS and Linux include a driver for this chip.',
  ],
  ch34x: ['Windows and older macOS: install the WCH CH340 driver if the board doesn’t appear.'],
};

export function HelpPage() {
  const support = detectTransport();
  const bridges = [...new Set(boards.flatMap((b) => b.usb.map((u) => u.bridge)))];
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 text-slate-200">
      <h1 className="text-2xl font-semibold">Help</h1>

      <section>
        <h2 className="text-lg font-medium">Your browser</h2>
        <p className="mt-2 text-sm text-slate-400">
          {support.kind === 'unsupported'
            ? support.reason
            : 'This browser can connect to boards over USB.'}{' '}
          Supported: Chrome, Edge, Brave or Opera on Windows, macOS and Linux, and Chrome on
          Android. iPhones and iPads can write and compile code and download the .bin file.
        </p>
        <p className="mt-2 text-sm">
          <Link to="/help/android" className="text-sky-400 underline">
            Using an Android phone: what you need and how to connect
          </Link>
        </p>
      </section>

      <section>
        <h2 className="text-lg font-medium">If the board doesn’t appear when you click Connect</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
          <li>Try a different USB cable. Many cables only charge and can’t carry data.</li>
          <li>Try a different USB port, and avoid unpowered hubs.</li>
          <li>
            Close other programs that might be using the board (Arduino IDE, serial terminals).
          </li>
          <li>
            Linux: add yourself to the <code>dialout</code> group (
            <code>sudo usermod -aG dialout $USER</code>), then log out and back in.
          </li>
          {bridges.flatMap((b) => (bridgeHelp[b] ?? []).map((t) => <li key={t}>{t}</li>))}
        </ul>
      </section>

      {boards.map((b) =>
        b.help ? (
          <section key={b.id}>
            <h2 className="text-lg font-medium">{b.name}</h2>
            {b.help.setup && (
              <>
                <h3 className="mt-3 text-sm font-medium text-slate-400">
                  Before your first upload
                </h3>
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-300">
                  {b.help.setup.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </>
            )}
            {b.help.troubleshooting && (
              <>
                <h3 className="mt-3 text-sm font-medium text-slate-400">
                  If uploading doesn’t work
                </h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-300">
                  {b.help.troubleshooting.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-3 text-sm">
              <a
                className="text-sky-400 underline"
                href={b.docsUrl}
                target="_blank"
                rel="noreferrer"
              >
                {b.vendor} documentation
              </a>
            </p>
          </section>
        ) : null,
      )}
    </div>
  );
}
