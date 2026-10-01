import { useCallback, useEffect, useState } from 'react';
import { boards } from '@codetochip/boards';
import type { Project } from '@codetochip/data';
import { useServices } from '../services.tsx';

const STARTER = 'void setup() {\n}\n\nvoid loop() {\n}\n';

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong. Check your connection and try again.';

export function MyProjects() {
  const { projects } = useServices();
  const [list, setList] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    projects.listMine().then(
      (l) => !cancelled && setList(l),
      (e: unknown) => !cancelled && setError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [projects]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setError(null);
      try {
        await action();
        setList(await projects.listMine());
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [projects],
  );

  const create = () => {
    const board = boards[0];
    if (!board) return;
    return run(() =>
      projects.create({
        name: `Untitled ${(list?.length ?? 0) + 1}`,
        boardId: board.id,
        files: [{ path: 'sketch.ino', content: STARTER }],
      }),
    );
  };

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium tracking-wide text-slate-400 uppercase">My projects</h2>
        <button className="text-sm text-sky-400" onClick={() => void create()}>
          + New project
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
      {list === null ? (
        <p className="mt-2 text-sm text-slate-500">Loading…</p>
      ) : list.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No projects yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {list.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-slate-800 p-3"
            >
              <span>{p.name}</span>
              <button
                className="text-sm text-slate-400"
                aria-label={`Delete ${p.name}`}
                onClick={() => void run(() => projects.remove(p.id))}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
