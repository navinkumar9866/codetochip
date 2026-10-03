import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { FileCode, FolderCode, FolderTree, PanelLeftClose, Plus, X } from 'lucide-react';
import type { Project, ProjectFile } from '@codetochip/data';
import { useCurrentUser, useServices } from '../services.tsx';
import { Info } from '../ui/Info.tsx';

/** Left column on wide screens: this project's files, then the user's other projects. */
export function Explorer({
  name,
  projectId,
  files,
  active,
  errorFiles,
  onSelect,
  onAdd,
  onRemove,
  onHide,
}: {
  name: string;
  projectId: string | null;
  files: ProjectFile[];
  active: number;
  errorFiles: Set<string>;
  onSelect: (i: number) => void;
  onAdd: (path: string) => void;
  onRemove: (i: number) => void;
  onHide: () => void;
}) {
  const { projects } = useServices();
  const user = useCurrentUser();
  const [mine, setMine] = useState<Project[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    projects.listMine().then(
      (list) => !cancelled && setMine(list),
      () => !cancelled && setMine([]),
    );
    return () => {
      cancelled = true;
    };
  }, [projects, user, projectId]);

  const row = 'flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm';
  return (
    <aside
      aria-label="Explorer"
      className="flex w-[200px] flex-none flex-col overflow-auto border-r border-line bg-panel xl:w-[230px]"
    >
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5 font-semibold">
        <FolderTree size={16} />
        Explorer
        <Info
          title="Explorer"
          text="Every file in your project. Click a file to open it. The .ino file is where your program starts."
        />
        <button aria-label="Hide explorer" className="ml-auto text-muted" onClick={onHide}>
          <PanelLeftClose size={16} />
        </button>
      </div>
      <div className="kicker truncate px-3.5 pt-2.5 pb-1">{name}</div>
      <ul className="flex flex-col px-1.5 pb-2.5">
        {files.map((f, i) => (
          <li key={f.path} className="group flex items-center">
            <button
              aria-current={i === active ? 'true' : undefined}
              className={`${row} min-w-0 flex-1 ${i === active ? 'bg-sel font-semibold' : 'hover:bg-raised-2'}`}
              onClick={() => onSelect(i)}
            >
              <FileCode size={16} className={i === active ? 'text-accent-ink' : 'text-muted'} />
              <span className="min-w-0 flex-1 truncate">{f.path}</span>
              {errorFiles.has(f.path) && (
                <span aria-label="Has errors" className="size-[7px] rounded-full bg-err" />
              )}
            </button>
            {!f.path.endsWith('.ino') && (
              <button
                aria-label={`Remove ${f.path}`}
                className="px-1 text-muted opacity-0 group-hover:opacity-100 hover:text-err focus:opacity-100"
                onClick={() => onRemove(i)}
              >
                <X size={14} />
              </button>
            )}
          </li>
        ))}
        <li>
          {adding === null ? (
            <button className={`${row} text-muted hover:bg-raised-2`} onClick={() => setAdding('')}>
              <Plus size={16} />
              New file
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (adding && !files.some((f) => f.path === adding)) onAdd(adding);
                setAdding(null);
              }}
            >
              <input
                autoFocus
                aria-label="New file name"
                placeholder="helper.h"
                className="input w-full"
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                onBlur={() => setAdding(null)}
              />
            </form>
          )}
        </li>
      </ul>
      {mine.length > 0 && (
        <>
          <div className="kicker flex items-center border-t border-line px-3.5 pt-2.5 pb-1">
            Projects
            <Link to="/projects" aria-label="All projects" className="ml-auto text-muted">
              <Plus size={14} />
            </Link>
          </div>
          <ul className="flex flex-col px-1.5 pb-2.5">
            {mine.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/ide/${p.id}`}
                  className={`${row} ${p.id === projectId ? 'bg-sel' : 'hover:bg-raised-2'}`}
                >
                  <FolderCode size={16} className="text-muted" />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
