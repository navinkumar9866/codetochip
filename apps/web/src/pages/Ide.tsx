import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { boards, flashOptionsFor, getBoard, type BoardManifest } from '@codetochip/boards';
import { validateProjectInput, type AssignmentRef, type ProjectFile } from '@codetochip/data';
import { detectTransport, getProtocol, type FlashProgress } from '@codetochip/flasher';
import { compileOnServer, type CompileOutcome, type CompileProgress } from '../compile/client.ts';
import { builtinExamples, starterFiles } from '../examples/builtin.ts';
import { CodeEditor, type EditorApi } from '../ide/CodeEditor.tsx';
import { ShareButton } from '../ide/ShareButton.tsx';
import { SymbolBar } from '../ide/SymbolBar.tsx';
import { useMediaQuery } from '../ide/use-media-query.ts';
import { useDevice, useDeviceState } from '../ide/device-context.tsx';
import { SerialMonitor } from '../ide/SerialMonitor.tsx';
import { useServices } from '../services.tsx';
import { useTelemetry } from '../telemetry.ts';

interface Draft {
  id: string | null;
  name: string;
  boardId: string;
  files: ProjectFile[];
  assignment?: AssignmentRef;
}

type SaveState = 'idle' | 'saving' | 'saved' | { error: string };
type Busy = null | { kind: 'compile'; progress: CompileProgress } | { kind: 'upload' };

const AUTOSAVE_MS = 1200;

/** Milliseconds since `start`; `stopwatch()` to start. Used only from event handlers. */
const stopwatch = () => {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
};

export function IdePage() {
  const { projectId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { auth, projects, content, classroom } = useServices();
  const device = useDevice();
  const record = useTelemetry();
  const deviceState = useDeviceState(device);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [modeId, setModeId] = useState<string>('');
  const [save, setSave] = useState<SaveState>('idle');
  const [busy, setBusy] = useState<Busy>(null);
  const [outcome, setOutcome] = useState<CompileOutcome | null>(null);
  const [message, setMessage] = useState<{
    kind: 'error' | 'info' | 'success';
    text: string;
  } | null>(null);
  const [flash, setFlash] = useState<FlashProgress | null>(null);
  const [panel, setPanel] = useState<'output' | 'serial'>('output');
  // Phones (< 1024 px) show one view at a time, switched from a bottom bar.
  const wide = useMediaQuery('(min-width: 1024px)');
  const [phoneView, setPhoneView] = useState<'code' | 'output' | 'serial'>('code');
  const editorApi = useRef<EditorApi | null>(null);
  const show = (p: 'output' | 'serial') => {
    setPanel(p);
    setPhoneView(p);
  };
  // The binary from the last successful compile, and what it was built from.
  const built = useRef<{ key: string; binary: Uint8Array } | null>(null);

  const board: BoardManifest | undefined = draft ? getBoard(draft.boardId) : undefined;
  const protocol = board ? getProtocol(board.flash.protocol) : undefined;

  // Load the project, an example, or a blank sketch.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let next: Draft;
        if (projectId) {
          await auth.ensureUser();
          const p = await projects.get(projectId);
          if (!p) throw new Error('This project doesn’t exist, or belongs to another account.');
          next = {
            id: p.id,
            name: p.name,
            boardId: p.boardId,
            files: p.files,
            ...(p.assignment && { assignment: p.assignment }),
          };
        } else {
          const boardId = search.get('board') ?? boards[0]!.id;
          const exampleId = search.get('example');
          const builtin = builtinExamples.find((e) => e.id === exampleId);
          const remote =
            exampleId && !builtin
              ? (await content.listExamples(boardId)).find((e) => e.id === exampleId)
              : undefined;
          const example = builtin ?? remote;
          next = {
            id: null,
            name: example?.title ?? 'Untitled sketch',
            boardId,
            files: example?.files.map((f) => ({ ...f })) ?? starterFiles(),
          };
        }
        if (cancelled) return;
        setDraft(next);
        setActive(0);
        setModeId(getBoard(next.boardId)?.flash.modes[0]?.id ?? '');
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, search, auth, projects, content]);

  // Autosave: guests get an anonymous account, so work is never lost.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSave = useCallback(
    (next: Draft) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void (async () => {
          const invalid = validateProjectInput({
            name: next.name,
            boardId: next.boardId,
            files: next.files,
          });
          if (invalid) return setSave({ error: invalid });
          setSave('saving');
          try {
            await auth.ensureUser();
            if (next.id) {
              await projects.update(next.id, {
                name: next.name,
                boardId: next.boardId,
                files: next.files,
              });
            } else {
              const created = await projects.create({
                name: next.name,
                boardId: next.boardId,
                files: next.files,
              });
              setDraft((d) => (d ? { ...d, id: created.id } : d));
              navigate(`/ide/${created.id}`, { replace: true });
            }
            setSave('saved');
          } catch (e) {
            setSave({ error: e instanceof Error ? e.message : String(e) });
          }
        })();
      }, AUTOSAVE_MS);
    },
    [auth, projects, navigate],
  );
  useEffect(() => () => void (saveTimer.current && clearTimeout(saveTimer.current)), []);

  const edit = (change: Partial<Draft>) => {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...change };
      scheduleSave(next);
      return next;
    });
  };

  useEffect(() => {
    if (!device) return;
    return device.subscribe((e) => {
      if (e.type === 'progress') setFlash(e.progress);
      if (e.type === 'disconnect') {
        setMessage({
          kind: 'error',
          text: `${e.message} It will reconnect by itself when you plug it back in.`,
        });
      }
      if (e.type === 'reconnected') setMessage({ kind: 'info', text: 'Board reconnected.' });
    });
  }, [device]);

  const buildKey = draft ? JSON.stringify([draft.boardId, modeId, draft.files]) : '';
  const diagnosticsFor = useMemo(
    () => (path: string) => outcome?.diagnostics.filter((d) => d.file === path) ?? [],
    [outcome],
  );

  /** Compiles if the sources changed since the last successful build. */
  const ensureBuilt = async (): Promise<Uint8Array | null> => {
    if (!draft) return null;
    if (built.current?.key === buildKey) return built.current.binary;
    setBusy({ kind: 'compile', progress: { state: 'submitting' } });
    setPanel('output');
    const elapsed = stopwatch();
    const compileEvent = { kind: 'compile' as const, board: draft.boardId, mode: modeId };
    try {
      const r = await compileOnServer(
        { board: draft.boardId, mode: modeId, files: draft.files },
        { onProgress: (progress) => setBusy({ kind: 'compile', progress }) },
      );
      setOutcome(r.outcome);
      record({
        ...compileEvent,
        ok: r.outcome.ok,
        durationMs: elapsed(),
        cached: !!r.outcome.cached,
      });
      if (!r.binary) {
        const first = r.outcome.diagnostics.find((d) => d.severity === 'error');
        setMessage({
          kind: 'error',
          text: first
            ? `Fix the error in ${first.file} line ${first.line}: ${first.message}`
            : 'The build failed. See the output below.',
        });
        const file = first ? draft.files.findIndex((f) => f.path === first.file) : -1;
        if (file >= 0) setActive(file);
        setPhoneView('code');
        return null;
      }
      built.current = { key: buildKey, binary: r.binary };
      setMessage({ kind: 'success', text: `Compiled: ${r.binary.length.toLocaleString()} bytes.` });
      return r.binary;
    } catch (e) {
      record({
        ...compileEvent,
        ok: false,
        durationMs: elapsed(),
        cached: false,
        error: 'request-failed',
      });
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const connect = async () => {
    if (!device || !board) return;
    setMessage(null);
    try {
      await device.connect(board);
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const upload = async () => {
    if (!device || !board || !draft) return;
    setMessage(null);
    setFlash(null);
    // Connect first, while this click still counts as a user gesture (needed for the picker).
    if (deviceState === 'closed') {
      try {
        await device.connect(board);
      } catch (e) {
        return setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
      }
    }
    const binary = await ensureBuilt();
    if (!binary) return;
    setBusy({ kind: 'upload' });
    // Android freezes pages (and their workers) when the screen turns off; keep it on.
    const wakeLock = await navigator.wakeLock?.request('screen').catch(() => null);
    const elapsed = stopwatch();
    const flashEvent = {
      kind: 'flash' as const,
      board: board.id,
      protocol: board.flash.protocol,
      transport: detectTransport().kind,
      bytes: binary.length,
    };
    try {
      await device.flash(board.flash.protocol, binary, {
        ...flashOptionsFor(board, modeId),
        handshakeTimeoutMs: 60_000,
      });
      setMessage({ kind: 'success', text: 'Uploaded. Your program is running.' });
      show('serial');
      record({ ...flashEvent, ok: true, durationMs: elapsed() });
    } catch (e) {
      record({
        ...flashEvent,
        ok: false,
        durationMs: elapsed(),
        error: e instanceof Error ? e.name : 'Error',
      });
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      void wakeLock?.release();
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!draft?.assignment) return;
    setMessage(null);
    try {
      await classroom.submit(draft.assignment.classId, draft.assignment.assignmentId, draft.files);
      setMessage({
        kind: 'success',
        text: 'Submitted. Your teacher can see it now. You can submit again later.',
      });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const download = async () => {
    const binary = await ensureBuilt();
    if (!binary || !draft) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob([new Uint8Array(binary)], { type: 'application/octet-stream' }),
    );
    a.download = `${draft.name.replace(/[^\w-]+/g, '-') || 'sketch'}.bin`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loadError) {
    return (
      <p role="alert" className="p-4 text-red-400">
        {loadError}
      </p>
    );
  }
  if (!draft || !board) return <p className="p-4 text-slate-400">Loading…</p>;

  const file = draft.files[active] ?? draft.files[0]!;
  const connected = deviceState !== 'closed';
  const waitingForReset =
    busy?.kind === 'upload' &&
    flash?.stage === 'waiting-for-bootloader' &&
    board.flash.reset.method === 'manual' &&
    flash.message === board.flash.reset.prompt;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-3 py-2">
        <input
          aria-label="Project name"
          className="w-44 rounded bg-transparent px-1 font-medium hover:bg-slate-800 focus:bg-slate-800"
          value={draft.name}
          onChange={(e) => edit({ name: e.target.value })}
        />
        <SaveBadge state={save} />
        <div className="flex w-full items-center gap-2 lg:ml-auto lg:w-auto">
          <select
            aria-label="Board"
            className="min-w-0 flex-1 rounded bg-slate-800 px-2 py-1.5 text-sm lg:flex-none"
            value={draft.boardId}
            onChange={(e) => {
              const b = getBoard(e.target.value)!;
              edit({ boardId: b.id });
              setModeId(b.flash.modes[0]?.id ?? '');
            }}
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Upload mode"
            className="min-w-0 flex-1 rounded bg-slate-800 px-2 py-1.5 text-sm lg:flex-none"
            value={modeId}
            onChange={(e) => setModeId(e.target.value)}
          >
            {board.flash.modes.map((m) => {
              const supported = protocol?.targets.includes(m.target) ?? false;
              return (
                <option key={m.id} value={m.id} disabled={!supported}>
                  {m.label}
                  {supported ? '' : ' (coming soon)'}
                </option>
              );
            })}
          </select>
          {wide && (
            <>
              <button
                className="rounded bg-slate-700 px-3 py-1.5 text-sm font-medium disabled:opacity-40"
                disabled={!!busy}
                onClick={() => {
                  built.current = null;
                  void ensureBuilt();
                }}
              >
                {busy?.kind === 'compile' ? compileLabel(busy.progress) : 'Compile'}
              </button>
              <button
                className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                disabled={!!busy || !device}
                onClick={() => void upload()}
              >
                {busy?.kind === 'upload' ? 'Uploading…' : 'Upload'}
              </button>
              {busy?.kind === 'upload' && (
                <button
                  className="rounded px-2 py-1.5 text-sm text-slate-300"
                  onClick={() => device?.cancelFlash()}
                >
                  Cancel
                </button>
              )}
            </>
          )}
          {draft.assignment && (
            <button
              className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              disabled={!!busy}
              onClick={() => void submit()}
            >
              Submit to class
            </button>
          )}
          <ShareButton project={{ name: draft.name, boardId: draft.boardId, files: draft.files }} />
          <button
            className="rounded px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            disabled={!!busy}
            aria-label="Download .bin"
            onClick={() => void download()}
          >
            <span aria-hidden className="lg:hidden">
              ⬇ .bin
            </span>
            <span className="hidden lg:inline">Download .bin</span>
          </button>
        </div>
      </div>

      {waitingForReset && (
        <div role="status" className="bg-amber-500 px-4 py-3 text-center font-semibold text-black">
          {board.flash.reset.method === 'manual' ? board.flash.reset.prompt : ''}
          {!wide && (
            <span className="block text-sm font-normal">
              Keep this screen open until it finishes.
            </span>
          )}
        </div>
      )}
      {busy?.kind === 'upload' && flash?.stage === 'transferring' && flash.totalBytes ? (
        <progress
          aria-label="Upload progress"
          className="h-1 w-full"
          value={flash.bytesSent ?? 0}
          max={flash.totalBytes}
        />
      ) : null}
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`px-4 py-2 text-sm ${
            message.kind === 'error'
              ? 'bg-red-950 text-red-300'
              : message.kind === 'success'
                ? 'bg-emerald-950 text-emerald-300'
                : 'bg-slate-800'
          }`}
        >
          {message.text}
        </p>
      )}
      {!connected && detectTransport().kind === 'webusb' && (
        <p className="bg-slate-900 px-4 py-2 text-sm text-slate-300">
          Connecting with a phone?{' '}
          <Link to="/help/android" className="text-sky-400 underline">
            See what you need
          </Link>
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          className={`min-h-0 flex-1 flex-col ${wide || phoneView === 'code' ? 'flex' : 'hidden'}`}
        >
          <FileTabs
            files={draft.files}
            active={active}
            onSelect={setActive}
            onAdd={(path) => {
              edit({ files: [...draft.files, { path, content: '' }] });
              setActive(draft.files.length);
            }}
            onRemove={(i) => {
              edit({ files: draft.files.filter((_, j) => j !== i) });
              setActive(0);
            }}
          />
          <div className="min-h-0 flex-1">
            <CodeEditor
              apiRef={editorApi}
              value={file.content}
              diagnostics={diagnosticsFor(file.path)}
              onChange={(content) =>
                edit({ files: draft.files.map((f, i) => (i === active ? { ...f, content } : f)) })
              }
            />
          </div>
        </section>

        <section
          className={`min-h-0 flex-1 flex-col lg:w-[28rem] lg:flex-none lg:border-l lg:border-slate-800 ${
            wide || phoneView !== 'code' ? 'flex' : 'hidden'
          }`}
        >
          <div
            className="flex items-center gap-1 border-b border-slate-800 px-2 text-sm"
            role="tablist"
          >
            {(wide ? (['output', 'serial'] as const) : []).map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={panel === p}
                className={`px-3 py-2 ${panel === p ? 'border-b-2 border-sky-500 text-white' : 'text-slate-400'}`}
                onClick={() => show(p)}
              >
                {p === 'output' ? 'Output' : 'Serial monitor'}
              </button>
            ))}
            <span className="ml-auto pr-2 text-xs">
              {connected ? (
                <button className="text-emerald-400" onClick={() => void device?.disconnect()}>
                  ● Connected · Disconnect
                </button>
              ) : (
                <button
                  className="text-slate-400 hover:text-white"
                  onClick={() => void connect()}
                  disabled={!device}
                >
                  ○ Connect board
                </button>
              )}
            </span>
          </div>
          <div className="min-h-0 flex-1 p-2">
            {(wide ? panel : phoneView) === 'output' ? (
              <Output
                outcome={outcome}
                onJump={(path) => {
                  setActive(
                    Math.max(
                      0,
                      draft.files.findIndex((f) => f.path === path),
                    ),
                  );
                  setPhoneView('code');
                }}
              />
            ) : (
              <SerialMonitor
                device={device}
                connected={connected}
                defaultBaud={board.serial.baudRate}
                onConnect={() => void connect()}
              />
            )}
          </div>
        </section>
      </div>
      {!wide && phoneView === 'code' && <SymbolBar editor={editorApi} />}
      {!wide && (
        <nav
          aria-label="Editor"
          className="grid grid-cols-5 border-t border-slate-800 bg-slate-900 text-xs"
        >
          {(
            [
              ['code', 'Code'],
              ['output', 'Output'],
              ['serial', 'Monitor'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              aria-pressed={phoneView === v}
              className={`py-3 ${phoneView === v ? 'text-white' : 'text-slate-400'}`}
              onClick={() => (v === 'code' ? setPhoneView('code') : show(v))}
            >
              {label}
            </button>
          ))}
          <button
            className="m-1 rounded bg-slate-700 font-medium disabled:opacity-40"
            disabled={!!busy}
            onClick={() => {
              built.current = null;
              void ensureBuilt();
            }}
          >
            {busy?.kind === 'compile' ? '…' : 'Compile'}
          </button>
          {busy?.kind === 'upload' ? (
            <button
              className="m-1 rounded bg-slate-600 font-medium"
              onClick={() => device?.cancelFlash()}
            >
              Cancel
            </button>
          ) : (
            <button
              className="m-1 rounded bg-sky-600 font-medium text-white disabled:opacity-40"
              disabled={!!busy || !device}
              onClick={() => void upload()}
            >
              Upload
            </button>
          )}
        </nav>
      )}
    </div>
  );
}

const compileLabel = (p: CompileProgress) =>
  p.state === 'queued'
    ? p.position > 0
      ? `Queued (${p.position} ahead)…`
      : 'Starting…'
    : 'Compiling…';

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  if (state === 'saving') return <span className="text-xs text-slate-400">Saving…</span>;
  if (state === 'saved') return <span className="text-xs text-slate-500">Saved</span>;
  return (
    <span role="alert" className="text-xs text-red-400">
      Not saved: {state.error}
    </span>
  );
}

function FileTabs({
  files,
  active,
  onSelect,
  onAdd,
  onRemove,
}: {
  files: ProjectFile[];
  active: number;
  onSelect: (i: number) => void;
  onAdd: (path: string) => void;
  onRemove: (i: number) => void;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  return (
    <div
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-800 bg-slate-900 px-2 text-sm whitespace-nowrap"
      role="tablist"
    >
      {files.map((f, i) => (
        <span
          key={f.path}
          className={`flex items-center ${i === active ? 'bg-slate-950 text-white' : 'text-slate-400'}`}
        >
          <button
            role="tab"
            aria-selected={i === active}
            className="px-3 py-1.5"
            onClick={() => onSelect(i)}
          >
            {f.path}
          </button>
          {!f.path.endsWith('.ino') && (
            <button
              aria-label={`Remove ${f.path}`}
              className="pr-2 text-slate-500 hover:text-red-400"
              onClick={() => onRemove(i)}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {adding === null ? (
        <button
          className="px-2 py-1.5 text-slate-400 hover:text-white"
          onClick={() => setAdding('')}
        >
          + File
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
            className="w-28 rounded bg-slate-800 px-2 py-1"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onBlur={() => setAdding(null)}
          />
        </form>
      )}
    </div>
  );
}

function Output({
  outcome,
  onJump,
}: {
  outcome: CompileOutcome | null;
  onJump: (path: string) => void;
}) {
  if (!outcome) {
    return (
      <p className="text-sm text-slate-500">
        Press Compile or Upload. Errors and build output appear here.
      </p>
    );
  }
  return (
    <div className="flex h-full flex-col gap-2 text-sm">
      {outcome.diagnostics.length > 0 && (
        <ul className="space-y-1" aria-label="Problems">
          {outcome.diagnostics.map((d, i) => (
            <li key={i}>
              <button className="text-left hover:underline" onClick={() => onJump(d.file)}>
                <span className={d.severity === 'error' ? 'text-red-400' : 'text-amber-300'}>
                  {d.severity}
                </span>{' '}
                {d.file}:{d.line}:{d.column} {d.message}
              </button>
            </li>
          ))}
        </ul>
      )}
      <pre className="min-h-0 flex-1 overflow-auto rounded bg-black p-2 font-mono text-xs text-slate-300">
        {outcome.log || (outcome.ok ? 'Build succeeded.' : '')}
        {outcome.cached ? '\n(Reused an identical recent build.)' : ''}
      </pre>
    </div>
  );
}
