import { Link } from 'react-router';

/** How the pieces connect: phone → OTG adapter → the board's USB cable → board. */
function OtgDiagram() {
  return (
    <svg viewBox="0 -10 640 230" role="img" aria-labelledby="otg-title" className="w-full max-w-xl">
      <title id="otg-title">
        Phone, then a USB OTG adapter, then the board’s USB cable, then the board
      </title>
      <g fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-300">
        {/* phone */}
        <rect x="20" y="30" width="80" height="140" rx="12" />
        <rect x="30" y="45" width="60" height="100" rx="4" className="text-slate-500" />
        <rect x="52" y="168" width="16" height="6" rx="2" className="text-sky-400" />
        {/* OTG adapter */}
        <path d="M60 174v10h70" />
        <rect x="130" y="172" width="70" height="24" rx="5" className="text-sky-400" />
        {/* cable */}
        <path d="M200 184h120c40 0 40-80 80-80h60" />
        {/* board */}
        <rect x="460" y="50" width="160" height="110" rx="8" />
        <rect x="460" y="92" width="16" height="24" className="text-sky-400" />
        <rect x="520" y="80" width="50" height="50" rx="4" className="text-slate-500" />
        <circle cx="600" cy="68" r="5" className="text-emerald-400" />
      </g>
      <g fill="currentColor" className="text-[22px] text-slate-400">
        <text x="60" y="18" textAnchor="middle">
          Phone
        </text>
        <text x="165" y="218" textAnchor="middle">
          OTG adapter
        </text>
        <text x="330" y="88" textAnchor="middle">
          USB cable
        </text>
        <text x="540" y="32" textAnchor="middle">
          Board
        </text>
        <text x="540" y="190" textAnchor="middle">
          Power light
        </text>
      </g>
    </svg>
  );
}

export function AndroidPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 text-slate-200">
      <h1 className="text-2xl font-semibold">Upload from an Android phone</h1>
      <OtgDiagram />

      <section>
        <h2 className="text-lg font-medium">What you need</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
          <li>An Android phone with the Chrome browser.</li>
          <li>
            A USB OTG adapter that fits your phone (usually USB-C to full-size USB), or one cable
            that goes straight from your phone’s port to the board’s port.
          </li>
          <li>The board’s USB cable. It must carry data, not only charge.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-medium">Steps</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-300">
          <li>Plug the OTG adapter into your phone, then the board’s cable into the adapter.</li>
          <li>The board’s power light should turn on: your phone powers it.</li>
          <li>Open CodeToChip in Chrome, open a sketch and tap Upload.</li>
          <li>Tap your board in the list, then tap Allow.</li>
          <li>Keep the screen on until the upload finishes.</li>
        </ol>
      </section>

      <section>
        <h2 className="text-lg font-medium">If it doesn’t work</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
          <li>
            No power light: your phone may not support OTG, or the adapter may be faulty. Try
            another adapter, or another phone.
          </li>
          <li>
            On some phones you must first turn on “OTG connection” in Settings, and it may switch
            itself off after a few minutes.
          </li>
          <li>
            If another app opens when you plug in the board, close it: only one app can use the
            board at a time.
          </li>
          <li>
            If the board stops responding, unplug it and plug it back in. CodeToChip reconnects by
            itself.
          </li>
        </ul>
      </section>

      <p className="text-sm">
        <Link to="/help" className="text-sky-400 underline">
          More help
        </Link>
      </p>
    </div>
  );
}
