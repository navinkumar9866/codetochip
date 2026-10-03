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

  if (share === undefined) return <p className="p-4 text-muted">Loading…</p>;
  if (share === null) {
    return (
      <div className="p-4">
        <p role="alert" className="text-err-ink">
          This link doesn’t work. The sketch may have been unshared, or the link is incomplete.
        </p>
        <Link to="/projects" className="mt-2 inline-block text-accent-ink underline">
          Go to your projects
        </Link>
      </div>
    );
  }

  const file = share.files[active] ?? share.files[0]!;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2">
        <div>
          <h1 className="font-medium">{share.name}</h1>
          <p className="text-xs text-muted">
            Shared sketch · {getBoard(share.boardId)?.name ?? share.boardId} · read-only
          </p>
        </div>
        <button
          className="ml-auto rounded bg-accent px-3 py-1.5 text-sm font-medium text-on-accent"
          onClick={() => void copy()}
        >
          Make a copy
        </button>
      </div>
      {error && (
        <p role="alert" className="bg-err-soft px-4 py-2 text-sm text-err-ink">
          {error}
        </p>
      )}
      <div
        className="flex gap-1 overflow-x-auto border-b border-line bg-panel px-2 text-sm"
        role="tablist"
      >
        {share.files.map((f, i) => (
          <button
            key={f.path}
            role="tab"
            aria-selected={i === active}
            className={`px-3 py-1.5 ${i === active ? 'bg-ground text-ink' : 'text-muted'}`}
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
