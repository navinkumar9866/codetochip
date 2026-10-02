import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { boards } from '@codetochip/boards';
import type { Example, Project } from '@codetochip/data';
import { builtinExamples } from '../examples/builtin.ts';
import { useCurrentUser, useServices } from '../services.tsx';

export function HomePage() {
  const { projects, content } = useServices();
  const user = useCurrentUser();
  const [boardId, setBoardId] = useState(boards[0]!.id);
  const [remote, setRemote] = useState<(Example & { id: string })[]>([]);
  const [mine, setMine] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    content.listExamples(boardId).then(
      (list) => !cancelled && setRemote(list),
      () => !cancelled && setRemote([]), // offline: bundled examples still work
    );
    return () => {
      cancelled = true;
    };
  }, [content, boardId]);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    projects.listMine().then(
      (list) => !cancelled && setMine(list),
      (e: Error) => !cancelled && setError(e.message),
    );
    return () => {
      cancelled = true;
    };
  }, [projects, user]);

  const refresh = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      setMine(await projects.listMine());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const examples = [...builtinExamples, ...remote];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Write code. Flash your board. From the browser.</h1>
      <p className="mt-2 text-slate-400">
        Plug in your board with a USB cable, pick an example, and press Upload.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-400">
          Your board
          <select
            className="mt-1 block rounded bg-slate-800 px-2 py-1.5 text-slate-100"
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.vendor})
              </option>
            ))}
          </select>
        </label>
        <Link
          to={`/ide?board=${boardId}`}
          className="rounded-md bg-sky-600 px-4 py-2 font-medium text-white"
        >
          New sketch
        </Link>
      </div>

      <h2 className="mt-10 text-sm font-medium tracking-wide text-slate-400 uppercase">Examples</h2>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2">
        {examples.map((e) => (
          <li key={e.id}>
            <Link
              to={`/ide?board=${boardId}&example=${e.id}`}
              className="block rounded-lg border border-slate-800 p-3 hover:border-slate-600"
            >
              <div className="font-medium">{e.title}</div>
              <div className="text-sm text-slate-400">{e.description}</div>
            </Link>
          </li>
        ))}
      </ul>

      {mine && mine.length > 0 && (
        <>
          <h2 className="mt-10 text-sm font-medium tracking-wide text-slate-400 uppercase">
            My projects
          </h2>
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {error}
            </p>
          )}
          <ul className="mt-2 space-y-2">
            {mine.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-lg border border-slate-800 p-3"
              >
                <Link to={`/ide/${p.id}`} className="font-medium hover:underline">
                  {p.name}
                </Link>
                <span className="text-xs text-slate-500">{p.updatedAt.toLocaleString()}</span>
                <button
                  className="ml-auto text-sm text-slate-400 hover:text-white"
                  onClick={() => {
                    const name = prompt('Rename project', p.name)?.trim();
                    if (name && name !== p.name)
                      void refresh(() => projects.update(p.id, { name }));
                  }}
                >
                  Rename
                </button>
                <button
                  className="text-sm text-slate-400 hover:text-red-400"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => {
                    if (confirm(`Delete "${p.name}"? This can't be undone.`)) {
                      void refresh(() => projects.remove(p.id));
                    }
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
