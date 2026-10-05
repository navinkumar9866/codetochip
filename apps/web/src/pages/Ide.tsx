import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  Cpu,
  Download,
  FolderTree,
  ListChecks,
  LogIn,
  Send,
  Terminal,
  Upload,
  Usb,
  X,
} from 'lucide-react';
import { boards, flashOptionsFor, getBoard, type BoardManifest } from '@codetochip/boards';
import { validateProjectInput, type AssignmentRef, type ProjectFile } from '@codetochip/data';
import { detectTransport, getProtocol, type FlashProgress } from '@codetochip/flasher';
import { openSignIn } from '../account/AccountBar.tsx';
import {
  compileNeedsSignIn,
  compileOnServer,
  type CompileOutcome,
  type Diagnostic,
} from '../compile/client.ts';
import { TopBarEnd, TopBarModes, TopBarStart } from '../app/top-bar.tsx';
import { builtinExamples, starterFiles } from '../examples/builtin.ts';
import { CodeEditor, type EditorApi } from '../ide/CodeEditor.tsx';
import { ComingSoon, type IdeMode } from '../ide/ComingSoon.tsx';
import { Explorer } from '../ide/Explorer.tsx';
import { ProblemsPanel } from '../ide/ProblemsPanel.tsx';
import { ShareButton } from '../ide/ShareButton.tsx';
import { SymbolBar } from '../ide/SymbolBar.tsx';
import { useMediaQuery } from '../ide/use-media-query.ts';
import { useDevice, useDeviceState } from '../ide/device-context.tsx';
import { SerialMonitor } from '../ide/SerialMonitor.tsx';
import { useCurrentUser, useServices } from '../services.tsx';
import { useTelemetry } from '../telemetry.ts';
import { Info } from '../ui/Info.tsx';

interface Draft {
  id: string | null;
  name: string;
  boardId: string;
  files: ProjectFile[];
  assignment?: AssignmentRef;
}

type SaveState = 'idle' | 'saving' | 'saved' | { error: string };
type Busy = null | { kind: 'compile' } | { kind: 'upload' };

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
  const user = useCurrentUser();
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
  // What the last Compile was built from, to tell when its problems are out of date.
  const [checkedKey, setCheckedKey] = useState('');
  const [mode, setMode] = useState<IdeMode>('build');
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [message, setMessage] = useState<{
    kind: 'error' | 'info' | 'success';
    text: string;
  } | null>(null);
  const [flash, setFlash] = useState<FlashProgress | null>(null);
  const [panel, setPanel] = useState<'problems' | 'serial'>('problems');
  // Phones (< 760 px) show one view at a time, switched from a bottom bar.
  const wide = useMediaQuery('(min-width: 760px)');
  const [phoneView, setPhoneView] = useState<'code' | 'problems' | 'serial'>('code');
  const editorApi = useRef<EditorApi | null>(null);
  const show = (p: 'problems' | 'serial') => {
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
            name: search.get('name') || example?.title || 'Untitled sketch',
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
    setBusy({ kind: 'compile' });
    setPanel('problems');
    const elapsed = stopwatch();
    const compileEvent = { kind: 'compile' as const, board: draft.boardId, mode: modeId };
    try {
      const r = await compileOnServer(
        { board: draft.boardId, mode: modeId, files: draft.files },
        { token: await auth.idToken() },
      );
      setOutcome(r.outcome);
      setCheckedKey(buildKey);
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
      <p role="alert" className="p-4 text-err-ink">
        {loadError}
      </p>
    );
  }
  if (!draft || !board) return <p className="p-4 text-muted">Loading…</p>;

  const file = draft.files[active] ?? draft.files[0]!;
  const connected = deviceState !== 'closed';
  const waitingForReset =
    busy?.kind === 'upload' &&
    flash?.stage === 'waiting-for-bootloader' &&
    board.flash.reset.method === 'manual' &&
    flash.message === board.flash.reset.prompt;
  const stale = !!outcome && checkedKey !== buildKey;
  const problems = outcome?.diagnostics.filter((d) => d.severity !== 'note') ?? [];
  const errors = stale ? 0 : problems.filter((d) => d.severity === 'error').length;
  const suggestions = stale ? 0 : problems.length - errors;
  const errorFiles = new Set(
    stale ? [] : problems.filter((d) => d.severity === 'error').map((d) => d.file),
  );
  // Guests can't compile on the hosted server, so Compile, Upload and .bin wait for sign-in.
  const mustSignIn = compileNeedsSignIn && user !== undefined && (!user || user.isAnonymous);
  const uploadLocked = !!busy || !device || errors > 0 || mustSignIn;
  const check = () => {
    built.current = null;
    void ensureBuilt();
  };
  const jump = (d: Diagnostic) => {
    const i = draft.files.findIndex((f) => f.path === d.file);
    if (i >= 0) setActive(i);
    setPhoneView('code');
    // Wait for the editor to show that file before moving the cursor.
    requestAnimationFrame(() => editorApi.current?.goTo(d.line));
  };
  const addFile = (path: string) => {
    edit({ files: [...draft.files, { path, content: '' }] });
    setActive(draft.files.length);
  };
  const removeFile = (i: number) => {
    edit({ files: draft.files.filter((_, j) => j !== i) });
    setActive(0);
  };
  const stage = busy ? stageOf(busy, flash, board.name) : null;

  const problemsTab = (
    <>
      <ListChecks size={16} />
      Problems
      <span className={`tag ${errors ? 'tag-err' : outcome && !stale ? 'tag-ok' : 'tag-neutral'}`}>
        {stale || !outcome ? '–' : problems.length}
      </span>
    </>
  );
  const serialTab = (
    <>
      <Terminal size={16} />
      Serial monitor
      <span
        aria-hidden
        className={`size-2 rounded-full ${connected ? 'bg-ok' : 'bg-line-strong'}`}
      />
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBarStart>
        <ChevronRight size={16} className="text-muted" aria-hidden />
        <input
          aria-label="Project name"
          className="input w-40 font-semibold sm:w-48"
          value={draft.name}
          onChange={(e) => edit({ name: e.target.value })}
        />
        <SaveBadge state={save} />
      </TopBarStart>
      {wide && (
        <TopBarModes>
          <div
            role="group"
            aria-label="Mode"
            className="flex gap-0.5 rounded-lg border border-line bg-raised p-[3px]"
          >
            {(['learn', 'build', 'simulate', 'deploy'] as const).map((m) => (
              <button
                key={m}
                aria-pressed={mode === m}
                className={`rounded-md px-3.5 py-1 text-sm font-medium capitalize ${mode === m ? 'bg-sel text-ink' : 'text-muted hover:text-ink'}`}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </TopBarModes>
      )}
      <TopBarEnd>
        <label className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Cpu size={16} aria-hidden />
          <select
            aria-label="Board"
            className="input max-w-44"
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
          <Info
            title="Board"
            text="The board you are programming. Pick the one printed on your hardware: which pins and features you can use changes from board to board."
          />
        </label>
        <span className="flex items-center gap-1.5">
          <button
            disabled={!device}
            className={`flex max-w-56 items-center gap-2 rounded-full border border-line px-3 py-1 text-sm font-medium ${connected ? 'bg-ok-soft text-ok-ink' : 'bg-err-soft text-err-ink'}`}
            onClick={() => void (connected ? device?.disconnect() : connect())}
          >
            <Usb size={16} className="flex-none" aria-hidden />
            <span className="truncate">
              {connected ? `${board.name} · connected` : 'Connect board'}
            </span>
          </button>
          <Info
            align="right"
            title="Connection"
            text="Your board shows up as a USB serial port when plugged in. You need a data cable: charge-only cables won’t work. Click to connect or disconnect."
          />
        </span>
      </TopBarEnd>

      {mode !== 'build' ? (
        <ComingSoon mode={mode} onBuild={() => setMode('build')} />
      ) : (
        <>
          <div className="flex flex-none flex-wrap items-stretch border-b border-line">
            <Cell>
              <Usb size={16} aria-hidden />
              <div className="flex flex-col leading-tight">
                <span className="kicker text-[11px]">Port</span>
                <span className="font-semibold">
                  {connected ? 'USB · connected' : 'not connected'}
                </span>
              </div>
            </Cell>
            <Cell>
              <label className="flex flex-col leading-tight">
                <span className="kicker flex items-center gap-1.5 text-[11px]">
                  Upload to
                  <Info
                    title="Where the program goes"
                    text="Some boards can run a program from memory that is wiped when the power goes off (quick for trying things), or save it so it runs again after a restart."
                  />
                </span>
                <select
                  aria-label="Upload mode"
                  className="bg-transparent font-semibold"
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
              </label>
            </Cell>
            <Cell
              className={
                !outcome || stale
                  ? ''
                  : errors
                    ? 'bg-err-soft text-err-ink'
                    : 'bg-ok-soft text-ok-ink'
              }
            >
              {!outcome || stale ? (
                <CircleDashed size={16} className="text-muted" aria-hidden />
              ) : errors ? (
                <CircleX size={16} aria-hidden />
              ) : (
                <CircleCheck size={16} aria-hidden />
              )}
              <span className="font-semibold">
                {!outcome
                  ? 'Not compiled yet'
                  : stale
                    ? 'Changed since the last compile'
                    : errors
                      ? `${errors} error${errors > 1 ? 's' : ''} block upload`
                      : 'No errors'}
              </span>
            </Cell>
            <div className="flex-1" />
            <div className="flex flex-wrap items-center gap-2 px-4 py-2">
              {wide && (
                <>
                  {mustSignIn ? (
                    <span className="flex items-center gap-1.5">
                      <button className="btn btn-primary" onClick={() => openSignIn()}>
                        Sign in to compile
                        <LogIn size={16} />
                      </button>
                      <Info
                        title="Why sign in?"
                        text="Compiling and uploading run on our servers, so they need a free account. Sign in with Google or your email; your work comes with you."
                      />
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <button className="btn btn-primary" disabled={!!busy} onClick={check}>
                        {busy?.kind === 'compile' ? 'Compiling…' : 'Compile'}
                        <ListChecks size={16} />
                      </button>
                      <Info
                        title="Compile"
                        text="Compiles your program on our server to find mistakes. Nothing is sent to the board."
                      />
                    </span>
                  )}
                  {busy?.kind === 'upload' ? (
                    <button className="btn btn-secondary" onClick={() => device?.cancelFlash()}>
                      Cancel upload
                      <X size={16} />
                    </button>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <button
                        className="btn btn-secondary"
                        disabled={uploadLocked}
                        onClick={() => void upload()}
                      >
                        Upload
                        <Upload size={16} />
                      </button>
                      <Info
                        align="right"
                        title="Upload"
                        text="Turns your program into machine code and writes it to the board, which then runs it straight away. Locked while the last compile found errors."
                      />
                    </span>
                  )}
                </>
              )}
              {draft.assignment && (
                <button
                  className="btn btn-secondary"
                  disabled={!!busy}
                  onClick={() => void submit()}
                >
                  Submit to class
                  <Send size={16} />
                </button>
              )}
              <ShareButton
                project={{ name: draft.name, boardId: draft.boardId, files: draft.files }}
              />
              <button
                className="btn btn-ghost"
                disabled={!!busy || mustSignIn}
                aria-label="Download .bin"
                onClick={() => void download()}
              >
                <span className="hidden lg:inline">.bin</span>
                <Download size={16} />
              </button>
            </div>
          </div>

          {waitingForReset && (
            <div role="status" className="bg-led px-5 py-3 font-semibold text-[#1a1300]">
              {board.flash.reset.method === 'manual' ? board.flash.reset.prompt : ''}
              {!wide && (
                <span className="block text-sm font-normal">
                  Keep this screen open until it finishes.
                </span>
              )}
            </div>
          )}
          {stage && !waitingForReset && (
            <div className="flex flex-none flex-col gap-1.5 bg-accent-soft px-5 py-3 text-accent-ink">
              <span className="font-semibold">{stage.text}</span>
              <div className="h-2 bg-raised-2">
                <div
                  className="h-2 bg-accent transition-[width]"
                  style={{ width: `${stage.pct}%` }}
                />
              </div>
              {busy?.kind === 'upload' && flash?.stage === 'transferring' && flash.totalBytes ? (
                <progress
                  aria-label="Upload progress"
                  className="sr-only"
                  value={flash.bytesSent ?? 0}
                  max={flash.totalBytes}
                />
              ) : null}
            </div>
          )}
          {message && (
            <p
              role={message.kind === 'error' ? 'alert' : 'status'}
              className={`px-5 py-2 text-sm ${
                message.kind === 'error'
                  ? 'bg-err-soft text-err-ink'
                  : message.kind === 'success'
                    ? 'bg-ok-soft text-ok-ink'
                    : 'bg-raised-2'
              }`}
            >
              {message.text}
            </p>
          )}
          {!connected && detectTransport().kind === 'webusb' && (
            <p className="bg-panel px-5 py-2 text-sm">
              Connecting with a phone?{' '}
              <Link to="/help/android" className="text-accent-ink underline">
                See what you need
              </Link>
            </p>
          )}

          <div className="flex min-h-0 flex-1">
            {wide &&
              (explorerOpen ? (
                <Explorer
                  name={draft.name}
                  projectId={draft.id}
                  files={draft.files}
                  active={active}
                  errorFiles={errorFiles}
                  onSelect={setActive}
                  onAdd={addFile}
                  onRemove={removeFile}
                  onHide={() => setExplorerOpen(false)}
                />
              ) : (
                <div className="flex w-10 flex-none flex-col items-center border-r border-line bg-panel pt-2">
                  <button
                    aria-label="Show explorer"
                    title="Show explorer"
                    className="flex size-[30px] items-center justify-center rounded-sm text-muted hover:bg-raised-2"
                    onClick={() => setExplorerOpen(true)}
                  >
                    <FolderTree size={16} />
                  </button>
                </div>
              ))}
            <section
              aria-label="Code"
              className={`min-h-0 min-w-0 flex-1 flex-col bg-panel ${wide || phoneView === 'code' ? 'flex' : 'hidden'}`}
            >
              {wide ? (
                <div className="flex flex-none items-stretch border-b border-line">
                  <span className="flex items-center gap-1.5 bg-panel px-3.5 py-2 font-mono text-[13px] shadow-[inset_0_-2px_0_var(--accent)]">
                    {file.path}
                  </span>
                  <span className="ml-auto flex items-center px-3.5 text-xs text-muted">
                    C++ · Arduino
                  </span>
                </div>
              ) : (
                <FileTabs
                  files={draft.files}
                  active={active}
                  onSelect={setActive}
                  onAdd={addFile}
                  onRemove={removeFile}
                />
              )}
              <div className="min-h-0 flex-1">
                <CodeEditor
                  apiRef={editorApi}
                  value={file.content}
                  diagnostics={diagnosticsFor(file.path)}
                  onChange={(content) =>
                    edit({
                      files: draft.files.map((f, i) => (i === active ? { ...f, content } : f)),
                    })
                  }
                />
              </div>
            </section>
            {!wide && phoneView !== 'code' && (
              <section className="flex min-h-0 flex-1 flex-col overflow-auto">
                {phoneView === 'problems' ? (
                  <ProblemsPanel
                    outcome={outcome}
                    stale={stale}
                    onJump={jump}
                    mustSignIn={mustSignIn}
                  />
                ) : (
                  <SerialMonitor
                    device={device}
                    connected={connected}
                    boardName={board.name}
                    defaultBaud={board.serial.baudRate}
                    onConnect={() => void connect()}
                    tall
                  />
                )}
              </section>
            )}
          </div>

          {wide && (
            <div className="flex flex-none flex-col border-t border-line">
              <div
                role="tablist"
                aria-label="Bottom panel"
                className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-1.5"
              >
                {(
                  [
                    ['problems', problemsTab],
                    ['serial', serialTab],
                  ] as const
                ).map(([p, label]) => (
                  <button
                    key={p}
                    role="tab"
                    aria-selected={panel === p}
                    className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold ${panel === p ? 'bg-sel text-ink' : 'text-muted hover:text-ink'}`}
                    onClick={() => show(p)}
                  >
                    {label}
                  </button>
                ))}
                <Info
                  title="Problems and Serial monitor"
                  text="Problems lists mistakes in your program. The Serial monitor shows what your program prints while it runs on the board."
                />
              </div>
              <div className="max-h-72 overflow-auto">
                {panel === 'problems' ? (
                  <ProblemsPanel
                    outcome={outcome}
                    stale={stale}
                    onJump={jump}
                    mustSignIn={mustSignIn}
                  />
                ) : (
                  <SerialMonitor
                    device={device}
                    connected={connected}
                    boardName={board.name}
                    defaultBaud={board.serial.baudRate}
                    onConnect={() => void connect()}
                  />
                )}
              </div>
            </div>
          )}

          {wide ? (
            <div className="flex flex-none flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-line bg-raised-2 px-5 py-1.5 text-xs">
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={`size-2 ${errors ? 'bg-err' : outcome && !stale ? 'bg-ok' : 'bg-line-strong'}`}
                />
                {errors} error{errors === 1 ? '' : 's'} · {suggestions} suggestion
                {suggestions === 1 ? '' : 's'}
              </span>
              <span>{board.name}</span>
              <span>{connected ? 'USB · connected' : 'not connected'}</span>
              <button className="ml-auto flex items-center gap-1.5" onClick={() => show('serial')}>
                <Terminal size={13} />
                Serial monitor
                <span
                  aria-hidden
                  className={`size-1.5 rounded-full ${connected ? 'bg-ok' : 'bg-line-strong'}`}
                />
              </button>
            </div>
          ) : (
            <>
              {phoneView === 'code' && <SymbolBar editor={editorApi} />}
              <nav
                aria-label="Editor"
                className="grid flex-none grid-cols-5 border-t border-line bg-ground text-xs font-semibold"
              >
                {(
                  [
                    ['code', 'Code'],
                    ['problems', 'Problems'],
                    ['serial', 'Serial'],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    aria-pressed={phoneView === v}
                    className={`min-h-[52px] ${phoneView === v ? 'bg-sel text-ink' : 'text-muted'}`}
                    onClick={() => (v === 'code' ? setPhoneView('code') : show(v))}
                  >
                    {label}
                  </button>
                ))}
                {mustSignIn ? (
                  <button
                    className="btn btn-primary m-1 justify-center"
                    onClick={() => openSignIn()}
                  >
                    Sign in
                  </button>
                ) : (
                  <button
                    className="btn btn-primary m-1 justify-center"
                    disabled={!!busy}
                    onClick={check}
                  >
                    {busy?.kind === 'compile' ? '…' : 'Compile'}
                  </button>
                )}
                {busy?.kind === 'upload' ? (
                  <button
                    className="btn btn-secondary m-1 justify-center"
                    onClick={() => device?.cancelFlash()}
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    className="btn btn-secondary m-1 justify-center"
                    disabled={uploadLocked}
                    onClick={() => void upload()}
                  >
                    Upload
                  </button>
                )}
              </nav>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Cell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 border-r border-line px-5 py-2.5 ${className}`}>
      {children}
    </div>
  );
}

/** The banner under the toolbar while compiling or uploading: what's happening, how far along. */
function stageOf(busy: NonNullable<Busy>, flash: FlashProgress | null, boardName: string) {
  if (busy.kind === 'compile') return { text: 'Compiling your program…', pct: 10 };
  switch (flash?.stage) {
    case 'transferring': {
      const done = flash.totalBytes ? (flash.bytesSent ?? 0) / flash.totalBytes : 0;
      return { text: `Writing to the board… ${Math.round(done * 100)}%`, pct: 30 + done * 60 };
    }
    case 'finishing':
    case 'done':
      return { text: 'Starting your program…', pct: 95 };
    default:
      return { text: `Connecting to ${boardName}…`, pct: 25 };
  }
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  if (state === 'saving') return <span className="text-xs text-muted">Saving…</span>;
  if (state === 'saved') return <span className="text-xs text-muted">Saved</span>;
  return (
    <span role="alert" className="text-xs text-err-ink">
      Not saved: {state.error}
    </span>
  );
}

/** Phones: the files as a scrolling strip of tabs above the editor. */
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
      className="flex flex-none items-stretch overflow-x-auto border-b border-line bg-ground text-[13px] whitespace-nowrap"
      role="tablist"
    >
      {files.map((f, i) => (
        <span
          key={f.path}
          className={`flex items-center border-r border-line font-mono ${i === active ? 'bg-panel text-ink shadow-[inset_0_-2px_0_var(--accent)]' : 'text-muted'}`}
        >
          <button
            role="tab"
            aria-selected={i === active}
            className="px-3.5 py-2"
            onClick={() => onSelect(i)}
          >
            {f.path}
          </button>
          {!f.path.endsWith('.ino') && (
            <button
              aria-label={`Remove ${f.path}`}
              className="pr-2.5 text-muted hover:text-err"
              onClick={() => onRemove(i)}
            >
              <X size={13} />
            </button>
          )}
        </span>
      ))}
      {adding === null ? (
        <button className="px-3 text-muted hover:text-ink" onClick={() => setAdding('')}>
          + File
        </button>
      ) : (
        <form
          className="flex items-center px-1"
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
            className="input w-28"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onBlur={() => setAdding(null)}
          />
        </form>
      )}
    </div>
  );
}
