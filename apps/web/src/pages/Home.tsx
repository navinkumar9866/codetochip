import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import {
  ArrowRight,
  Copy,
  FileCode,
  FolderOpen,
  Lightbulb,
  Plus,
  Search,
  Terminal,
  Trash2,
} from 'lucide-react';
import { boards, getBoard } from '@codetochip/boards';
import type { Example, Project } from '@codetochip/data';
import { AccountBar } from '../account/AccountBar.tsx';
import { EmailLinkHandler } from '../account/EmailLinkHandler.tsx';
import { SettingsMenu } from '../app/SettingsMenu.tsx';
import { builtinExamples } from '../examples/builtin.ts';
import { useCurrentUser, useServices } from '../services.tsx';
import { LogoMark } from '../ui/Logo.tsx';
import './landing.css';

const ICONS: Record<string, typeof Lightbulb> = {
  'builtin-blink': Lightbulb,
  'builtin-hello-serial': Terminal,
};

/** "2 hours ago", "Yesterday", "28 Sept": when a project was last changed. */
export function edited(at: Date, now = new Date()) {
  const min = Math.round((now.getTime() - at.getTime()) / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) {
    const h = Math.round(min / 60);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (at.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return at.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(at.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  });
}

/** Workspace page, from the "CodeToChip Projects" design (Modernist look, like the homepage). */
export function HomePage() {
  const { projects, content } = useServices();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [boardId, setBoardId] = useState(boards[0]!.id);
  const [remote, setRemote] = useState<(Example & { id: string })[]>([]);
  const [mine, setMine] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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

  const all = mine ?? [];
  const q = query.trim().toLowerCase();
  const shown = all.filter((p) => !q || p.name.toLowerCase().includes(q));
  const examples = [...builtinExamples, ...remote];
  const newBlank = () => navigate(`/ide?board=${boardId}`);

  return (
    <div className="landing flex min-h-dvh flex-col">
      <SiteHeader />
      <EmailLinkHandler />
      <main
        id="projects"
        className="l-wrap box-border flex w-full flex-1 flex-col gap-14 pt-[clamp(40px,6vw,72px)] pb-24"
      >
        <section className="flex flex-col gap-7">
          <div className="flex flex-col gap-3">
            <span className="l-kicker">Workspace</span>
            <h1 className="m-0 -ml-[0.04em] text-[clamp(40px,5vw,64px)] leading-[1.04] font-extrabold tracking-[-0.025em]">
              Your projects
            </h1>
            <p className="m-0 max-w-[56ch] text-lg leading-relaxed">
              Write code, press Upload, and it runs on your board. Everything happens in the
              browser.
            </p>
          </div>
          <div className="l-rule flex flex-wrap items-stretch gap-3 pt-5">
            <label className="flex min-h-11 flex-[1_1_280px] items-center gap-2.5 border-2 border-[var(--l-text)] bg-[var(--l-surface)] px-3.5">
              <Search size={18} className="text-[var(--l-muted)]" />
              <input
                className="min-w-0 flex-1 border-0 bg-transparent text-[15px] outline-none"
                placeholder="Search projects"
                aria-label="Search projects"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button className="l-btn l-btn-primary min-w-[200px]" onClick={newBlank}>
              New project
              <Plus size={16} />
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="m-0 text-2xl font-extrabold tracking-[-0.01em]">Recent</h2>
            {all.length > 0 && (
              <span className="text-[13px] font-semibold text-[var(--l-muted)]">
                {shown.length} of {all.length}
              </span>
            )}
          </div>
          {error && (
            <p role="alert" className="m-0 text-sm text-[var(--err-ink)]">
              {error}
            </p>
          )}
          {all.length > 0 ? (
            <div className="border-y-2 border-[var(--l-text)]">
              <div className="hidden grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,1.2fr)_96px] gap-4 border-b-2 border-[var(--l-text)] py-2.5 text-[11px] font-bold tracking-[0.08em] text-[var(--l-muted)] uppercase md:grid">
                <span>Name</span>
                <span>Board</span>
                <span>Edited</span>
                <span />
              </div>
              <ul className="m-0 list-none p-0">
                {shown.map((p, i) => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    first={i === 0}
                    onDuplicate={() =>
                      void refresh(() =>
                        projects.create({
                          name: `${p.name} copy`,
                          boardId: p.boardId,
                          files: p.files,
                        }),
                      )
                    }
                    onDelete={() => {
                      if (confirm(`Delete "${p.name}"? This can't be undone.`)) {
                        void refresh(() => projects.remove(p.id));
                      }
                    }}
                  />
                ))}
              </ul>
              {shown.length === 0 && (
                <div className="py-6 text-[15px] text-[var(--l-muted)]">
                  No projects match “{query.trim()}”.
                </div>
              )}
            </div>
          ) : (
            // Loaded, or nobody signed in yet (a first visit): show how to start.
            (mine !== null || user === null) && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] border-2 border-[var(--l-text)]">
                <div className="flex flex-col gap-3 p-8">
                  <FolderOpen size={28} className="text-[var(--l-accent)]" />
                  <h3 className="m-0 text-2xl font-extrabold">No projects yet</h3>
                  <p className="m-0 max-w-[44ch] text-[15.5px] leading-relaxed">
                    Start blank, or pick an example below. It opens ready to run on the board you
                    chose.
                  </p>
                </div>
                <div className="flex items-end border-t-2 border-[var(--l-divider)] p-8 md:border-t-0 md:border-l-2">
                  <button className="l-btn l-btn-primary w-full" onClick={newBlank}>
                    Start a blank project
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            )
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="l-kicker">Start from an example</span>
              <h2 className="m-0 text-2xl font-extrabold tracking-[-0.01em]">
                Working code, one click away
              </h2>
            </div>
            <label className="flex flex-wrap items-center gap-3 text-[13px] font-bold tracking-[0.06em] uppercase">
              Your board
              <select
                className="min-h-11 min-w-[260px] border-2 border-[var(--l-text)] bg-[var(--l-surface)] px-2.5 text-[15px] font-semibold tracking-normal normal-case"
                value={boardId}
                onChange={(e) => setBoardId(e.target.value)}
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {b.vendor}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] border-y-2 border-[var(--l-text)] p-0">
            {examples.map((e, i) => {
              const Icon = ICONS[e.id] ?? FileCode;
              return (
                <li key={e.id} className="border-r-2 border-[var(--l-divider)] last:border-r-0">
                  <Link
                    to={`/ide?board=${boardId}&example=${e.id}`}
                    className="l-plain flex h-full flex-col gap-3.5 p-6 text-[var(--l-text)] no-underline hover:bg-[var(--l-accent-100)]"
                  >
                    <span className="flex items-center justify-between">
                      <span className="text-[15px] font-extrabold">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <Icon size={22} className="text-[var(--l-accent)]" />
                    </span>
                    <span className="text-[22px] font-extrabold">{e.title}</span>
                    <span className="text-[15px] leading-relaxed">{e.description}</span>
                    <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--l-accent-700)]">
                      Use example
                      <ArrowRight size={14} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}

function ProjectRow({
  project: p,
  first,
  onDuplicate,
  onDelete,
}: {
  project: Project;
  first: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const icon = 'flex size-8 items-center justify-center hover:bg-[var(--l-surface)]';
  return (
    <li
      className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-4 hover:bg-[var(--l-accent-100)] md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,1.2fr)_96px] ${first ? '' : 'border-t border-[#d7d3d3]'}`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <FileCode size={20} className="flex-none text-[var(--l-accent)]" />
        <span className="flex min-w-0 flex-col gap-0.5">
          {/* The whole row opens the project; the link's box is stretched over it. */}
          <Link
            to={`/ide/${p.id}`}
            aria-label={p.name}
            className="l-plain truncate text-base font-bold text-[var(--l-text)] no-underline after:absolute after:inset-0"
          >
            {p.name}
          </Link>
          <span className="l-mono truncate text-xs text-[var(--l-muted)]">
            {p.files[0]?.path}
            <span className="font-sans md:hidden">
              {' · '}
              {getBoard(p.boardId)?.name ?? p.boardId} · {edited(p.updatedAt)}
            </span>
          </span>
        </span>
      </span>
      <span className="hidden truncate text-sm font-semibold md:block">
        {getBoard(p.boardId)?.name ?? p.boardId}
      </span>
      <span className="hidden text-sm text-[var(--l-muted)] md:block">{edited(p.updatedAt)}</span>
      <span className="relative z-10 flex items-center justify-end gap-1">
        <button
          aria-label={`Duplicate ${p.name}`}
          title="Duplicate"
          className={icon}
          onClick={onDuplicate}
        >
          <Copy size={16} />
        </button>
        <button
          aria-label={`Delete ${p.name}`}
          title="Delete"
          className={`${icon} text-[var(--err-ink)]`}
          onClick={onDelete}
        >
          <Trash2 size={16} />
        </button>
        <ArrowRight size={18} aria-hidden className="ml-1" />
      </span>
    </li>
  );
}

/** Header for the Modernist pages inside the app (Projects): logo, sections, settings, account. */
function SiteHeader() {
  const user = useCurrentUser();
  const nav = ({ isActive }: { isActive: boolean }) =>
    `l-plain pb-0.5 text-[var(--l-text)] no-underline ${isActive ? 'shadow-[inset_0_-2px_0_var(--l-accent)]' : 'hover:text-[var(--l-accent)]'}`;
  return (
    <header className="border-b-2 border-[var(--l-text)]">
      <div className="l-wrap flex flex-wrap items-center gap-x-8 gap-y-3 py-4">
        <Link
          to="/"
          aria-label="CodeToChip home"
          className="l-plain flex items-center gap-2.5 text-[var(--l-text)] no-underline"
        >
          <LogoMark size={32} />
          <span className="text-[22px] leading-none font-bold tracking-[-0.02em]">
            Code<span className="text-[var(--l-accent)]">To</span>Chip
          </span>
        </Link>
        <nav
          aria-label="Main"
          className="flex flex-1 flex-wrap gap-x-6 gap-y-1 text-[15px] font-semibold"
        >
          <NavLink to="/projects" className={nav}>
            Projects
          </NavLink>
          <NavLink to="/classes" className={nav}>
            Classes
          </NavLink>
          <NavLink to="/help" className={nav}>
            Help
          </NavLink>
        </nav>
        <div className="flex items-center gap-2">
          <SettingsMenu />
          <AccountBar user={user} />
        </div>
      </div>
    </header>
  );
}
