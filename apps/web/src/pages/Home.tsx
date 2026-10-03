import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight,
  Copy,
  FileCode,
  FolderOpen,
  FolderPlus,
  Lightbulb,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { boards, getBoard } from '@codetochip/boards';
import type { Example, Project } from '@codetochip/data';
import { builtinExamples } from '../examples/builtin.ts';
import { useCurrentUser, useServices } from '../services.tsx';
import { Info } from '../ui/Info.tsx';

type Template = Pick<Example, 'title' | 'description'> & { id: string };

const ago = (at: Date) => {
  const m = Math.round((Date.now() - at.getTime()) / 60000);
  if (m < 1) return 'Edited just now';
  if (m < 60) return `Edited ${m} min ago`;
  if (m < 1440) return `Edited ${Math.round(m / 60)} h ago`;
  return `Edited ${Math.round(m / 1440)} d ago`;
};

export function HomePage() {
  const { projects, content } = useServices();
  const user = useCurrentUser();
  const [boardId, setBoardId] = useState(boards[0]!.id);
  const [remote, setRemote] = useState<(Example & { id: string })[]>([]);
  const [mine, setMine] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [newOpen, setNewOpen] = useState<{ template: string; name: string } | null>(null);

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

  const templates: Template[] = [...builtinExamples, ...remote];
  const q = query.trim().toLowerCase();
  const shown = (mine ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-7 px-4 py-8 md:px-12">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex-[1_1_300px]">
          <div className="kicker">Workspace</div>
          <h1 className="mt-1 text-[2rem] leading-tight font-semibold tracking-tight">
            Your projects
          </h1>
          <p className="mt-1 text-muted">
            Write code, press Upload, and it runs on your board. Everything happens in the browser.
          </p>
        </div>
        <input
          className="input w-full flex-[0_1_260px]"
          placeholder="Search projects…"
          aria-label="Search projects"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="btn btn-primary"
          onClick={() => setNewOpen({ template: 'blank', name: '' })}
        >
          New project
          <Plus size={16} />
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-err-ink">
          {error}
        </p>
      )}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {shown.map((p) => (
          <li
            key={p.id}
            className="flex flex-col overflow-hidden rounded-xl border border-line bg-raised"
          >
            <Link
              to={`/ide/${p.id}`}
              aria-label={p.name}
              className="flex flex-col gap-2.5 px-[18px] pt-[18px] pb-3.5 hover:bg-raised-2"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex size-9 flex-none items-center justify-center rounded-md bg-accent-soft text-accent-ink">
                  <FileCode size={18} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-base font-semibold">{p.name}</span>
                  <span className="text-[13px] text-muted">
                    {getBoard(p.boardId)?.name ?? p.boardId}
                  </span>
                </span>
              </span>
              <span className="text-[13px] text-muted">{ago(p.updatedAt)}</span>
            </Link>
            <div className="flex border-t border-line text-[13px] font-medium">
              <Link
                to={`/ide/${p.id}`}
                aria-label={`Open ${p.name}`}
                className="flex flex-1 items-center justify-center gap-1.5 p-2.5 hover:bg-raised-2"
              >
                <FolderOpen size={14} />
                Open
              </Link>
              <button
                aria-label={`Duplicate ${p.name}`}
                className="flex flex-1 items-center justify-center gap-1.5 border-l border-line p-2.5 hover:bg-raised-2"
                onClick={() =>
                  void refresh(() =>
                    projects.create({
                      name: `${p.name} copy`,
                      boardId: p.boardId,
                      files: p.files,
                    }),
                  )
                }
              >
                <Copy size={14} />
                Duplicate
              </button>
              <button
                aria-label={`Delete ${p.name}`}
                className="flex flex-1 items-center justify-center gap-1.5 border-l border-line p-2.5 text-err-ink hover:bg-err-soft"
                onClick={() => {
                  if (confirm(`Delete "${p.name}"? This can't be undone.`)) {
                    void refresh(() => projects.remove(p.id));
                  }
                }}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </li>
        ))}
        <li>
          <button
            className="flex h-full min-h-[150px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong font-medium text-muted hover:bg-raised hover:text-ink"
            onClick={() => setNewOpen({ template: 'blank', name: '' })}
          >
            <Plus size={22} />
            New project
          </button>
        </li>
      </ul>
      {q && shown.length === 0 && <p className="text-muted">No projects match “{query.trim()}”.</p>}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="kicker">Start from a template</h2>
          <label className="ml-auto flex items-center gap-2 text-[13px] font-semibold">
            Your board
            <select className="input" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.vendor})
                </option>
              ))}
            </select>
          </label>
        </div>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {templates.map((t) => (
            <li key={t.id}>
              <Link
                to={`/ide?board=${boardId}&example=${t.id}`}
                className="flex h-full gap-3 rounded-xl border border-line bg-panel px-[18px] py-4 hover:border-accent"
              >
                <Lightbulb size={20} className="mt-0.5 flex-none text-accent-ink" />
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{t.title}</span>
                  <span className="text-[13px] text-muted">{t.description}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {newOpen && (
        <NewProjectDialog
          initial={newOpen}
          boardId={boardId}
          templates={templates}
          onClose={() => setNewOpen(null)}
        />
      )}
    </div>
  );
}

function NewProjectDialog({
  initial,
  boardId: initialBoard,
  templates,
  onClose,
}: {
  initial: { template: string; name: string };
  boardId: string;
  templates: Template[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(initial.name);
  const [template, setTemplate] = useState(initial.template);
  const [boardId, setBoardId] = useState(initialBoard);
  const options: Template[] = [
    {
      id: 'blank',
      title: 'Empty sketch',
      description: 'Just setup() and loop(). Start from scratch.',
    },
    ...templates,
  ];
  const create = () => {
    const params = new URLSearchParams({ board: boardId, name: name.trim() });
    if (template !== 'blank') params.set('example', template);
    navigate(`/ide?${params}`);
  };
  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/55 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="New project"
        className="flex max-h-full w-[min(520px,100%)] flex-col overflow-auto rounded-2xl border border-line-strong bg-raised shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create();
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-[18px]">
          <FolderPlus size={18} className="text-accent-ink" />
          <span className="text-lg font-semibold">New project</span>
          <button type="button" aria-label="Close" className="ml-auto text-muted" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-5 py-[18px]">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            Name
            <input
              autoFocus
              className="input w-full"
              placeholder="e.g. Night light"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="flex flex-col gap-1.5 text-[13px] font-semibold">
            <span className="flex items-center gap-1.5">
              Start from
              <Info
                title="Templates"
                text="A template is a working starter program. Pick the one closest to what you want to build; you can change everything afterwards."
              />
            </span>
            <div
              className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2"
              role="radiogroup"
            >
              {options.map((o) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={template === o.id}
                  key={o.id}
                  className={`flex gap-2.5 rounded-md border p-3 text-left ${template === o.id ? 'border-accent bg-accent-soft' : 'border-line-strong'}`}
                  onClick={() => {
                    setTemplate(o.id);
                    if (!name.trim() && o.id !== 'blank') setName(o.title);
                  }}
                >
                  <Lightbulb size={18} className="flex-none text-accent-ink" />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-semibold">{o.title}</span>
                    <span className="text-xs font-normal text-muted">{o.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            Board
            <select
              className="input w-full"
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
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!name.trim()}>
            Create project
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
