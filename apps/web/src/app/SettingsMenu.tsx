import { useState } from 'react';
import { Palette, Settings2, ZoomIn } from 'lucide-react';
import { Info } from '../ui/Info.tsx';
import { DENSITIES, setDisplay, THEMES, useDisplay, type ThemeId } from './display.ts';

/** The gear in the top bar: theme and text size, remembered on this device. */
export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const display = useDisplay();
  return (
    <div className="relative">
      <button
        aria-label="Display settings"
        aria-expanded={open}
        className={`flex size-[34px] items-center justify-center rounded-md border border-line ${open ? 'bg-raised-2' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Settings2 size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Display settings"
            className="absolute top-[calc(100%+8px)] right-0 z-41 flex w-64 flex-col gap-3 rounded-lg border border-line-strong bg-raised p-3.5 shadow-2xl"
          >
            <div className="kicker">Display</div>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
              <span className="flex items-center gap-1.5">
                <Palette size={16} />
                Theme
                <Info
                  align="right"
                  title="Theme"
                  text="Change how CodeToChip looks. Kids is big and colourful; Professional is compact and calm; Dark is easier on the eyes at night. Remembered on this device."
                />
              </span>
              <select
                className="input w-full"
                value={display.theme}
                onChange={(e) => setDisplay({ theme: e.target.value as ThemeId })}
              >
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1.5 text-[13px] font-semibold">
              <span className="flex items-center gap-1.5">
                <ZoomIn size={16} />
                Size
                <Info
                  align="right"
                  title="Size"
                  text="Compact fits more on screen for big projects. Large makes text and buttons bigger and easier to tap. Remembered on this device."
                />
              </span>
              <div className="grid grid-cols-3 gap-0.5 rounded-md bg-raised-2 p-[3px]" role="group">
                {DENSITIES.map((d) => (
                  <button
                    key={d.id}
                    aria-pressed={display.density === d.id}
                    className={`rounded-sm py-1 text-[13px] font-medium ${display.density === d.id ? 'bg-raised text-ink' : 'text-muted'}`}
                    onClick={() => setDisplay({ density: d.id })}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
