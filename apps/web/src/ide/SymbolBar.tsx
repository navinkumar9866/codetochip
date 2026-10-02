import type { RefObject } from 'react';
import type { EditorApi } from './CodeEditor.tsx';

const SYMBOLS = ['{', '}', '(', ')', '[', ']', ';', '<', '>', '=', '"', "'", '#', '/', '&'];

/**
 * Symbols that phone keyboards hide behind extra screens. Buttons don't take focus (pointer
 * down is cancelled), so the keyboard stays open while typing.
 */
export function SymbolBar({ editor }: { editor: RefObject<EditorApi | null> }) {
  const keep = (e: { preventDefault(): void }) => e.preventDefault();
  return (
    <div
      role="toolbar"
      aria-label="Symbols"
      className="flex gap-1 overflow-x-auto border-t border-slate-800 bg-slate-900 px-1 py-1"
    >
      <button
        className="rounded bg-slate-800 px-3 py-2 font-mono text-sm"
        onPointerDown={keep}
        onMouseDown={keep}
        onClick={() => editor.current?.tab()}
      >
        Tab
      </button>
      {SYMBOLS.map((s) => (
        <button
          key={s}
          aria-label={`Insert ${s}`}
          className="min-w-10 rounded bg-slate-800 px-2 py-2 font-mono text-base"
          onPointerDown={keep}
          onMouseDown={keep}
          onClick={() => editor.current?.insert(s)}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
