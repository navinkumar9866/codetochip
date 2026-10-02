import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { getBoard } from '@codetochip/boards';
import type { Share } from '@codetochip/data';
import { CodeEditor } from '../ide/CodeEditor.tsx';
import { useServices } from '../services.tsx';

/** A shared sketch, read-only, with "Make a copy" to edit and upload it. */
export function SharePage() {
  const { shareId } = useParams();
  const navigate = useNavigate();
  const { auth, projects, shares } = useServices();
  const [share, setShare] = useState<Share | null | undefined>(undefined);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    shares.get(shareId ?? '').then(
      (s) => !cancelled && setShare(s),
      () => !cancelled && setShare(null),
    );
    return () => {
      cancelled = true;
    };
  }, [shares, shareId]);

  const copy = async () => {
    if (!share) return;
    setError(null);
    try {
      await auth.ensureUser();
      const p = await projects.create({
        name: `${share.name} (copy)`.slice(0, 100),
        boardId: share.boardId,
        files: share.files,
      });
      navigate(`/ide/${p.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (share === undefined) return <p className="p-4 text-slate-400">Loading…</p>;
  if (share === null) {
    return (
      <div className="p-4">
        <p role="alert" className="text-red-400">
          This link doesn’t work. The sketch may have been unshared, or the link is incomplete.
        </p>
        <Link to="/" className="mt-2 inline-block text-sky-400 underline">
          Go to the home page
        </Link>
      </div>
    );
  }

  const file = share.files[active] ?? share.files[0]!;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-3 py-2">
        <div>
          <h1 className="font-medium">{share.name}</h1>
          <p className="text-xs text-slate-400">
            Shared sketch · {getBoard(share.boardId)?.name ?? share.boardId} · read-only
          </p>
        </div>
        <button
          className="ml-auto rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white"
          onClick={() => void copy()}
        >
          Make a copy
        </button>
      </div>
      {error && (
        <p role="alert" className="bg-red-950 px-4 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      <div
        className="flex gap-1 overflow-x-auto border-b border-slate-800 bg-slate-900 px-2 text-sm"
        role="tablist"
      >
        {share.files.map((f, i) => (
          <button
            key={f.path}
            role="tab"
            aria-selected={i === active}
            className={`px-3 py-1.5 ${i === active ? 'bg-slate-950 text-white' : 'text-slate-400'}`}
            onClick={() => setActive(i)}
          >
            {f.path}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <CodeEditor value={file.content} onChange={() => {}} diagnostics={[]} readOnly />
      </div>
    </div>
  );
}
