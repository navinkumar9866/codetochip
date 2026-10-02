import { useState } from 'react';
import type { ProjectInput } from '@codetochip/data';
import { useServices } from '../services.tsx';

/** Creates a read-only snapshot link of the current sketch. */
export function ShareButton({ project }: { project: ProjectInput }) {
  const { auth, shares } = useServices();
  const [link, setLink] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'working' | 'copied' | { error: string }>('idle');

  const share = async () => {
    setState('working');
    try {
      await auth.ensureUser();
      const s = await shares.create(project);
      const url = `${location.origin}/s/${s.id}`;
      setLink(url);
      await navigator.clipboard?.writeText(url).then(
        () => setState('copied'),
        () => setState('idle'),
      );
      if (!navigator.clipboard) setState('idle');
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="relative">
      <button
        className="rounded px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40"
        disabled={state === 'working'}
        onClick={() => void share()}
      >
        Share
      </button>
      {(link || typeof state === 'object') && (
        <div
          role="dialog"
          aria-label="Share link"
          className="absolute right-0 z-10 mt-1 w-72 rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm shadow-lg"
        >
          {typeof state === 'object' ? (
            <p role="alert" className="text-red-400">
              {state.error}
            </p>
          ) : (
            <>
              <p className="text-slate-300">
                Anyone with this link can see a copy of your sketch as it is now. Later changes
                aren’t shared.
              </p>
              <input
                readOnly
                aria-label="Link"
                className="mt-2 w-full rounded bg-slate-800 px-2 py-1 font-mono text-xs"
                value={link ?? ''}
                onFocus={(e) => e.target.select()}
              />
              <p className="mt-1 text-xs text-slate-400">
                {state === 'copied' ? 'Copied to the clipboard.' : 'Select the link to copy it.'}
              </p>
            </>
          )}
          <button
            className="mt-2 text-xs text-slate-400 underline"
            onClick={() => {
              setLink(null);
              setState('idle');
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
